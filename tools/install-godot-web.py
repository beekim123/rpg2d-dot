"""Install only the two Web ZIPs from Godot's official versioned template archive.

Uses verified HTTP ranges rather than downloading the full multi-platform TPZ.
No archive paths are extracted: only an explicit filename allowlist is written.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import ssl
import sys
import tempfile
import urllib.request
import zipfile

try:
    import certifi
    TLS_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    TLS_CONTEXT = ssl.create_default_context()

class RemoteZip(io.RawIOBase):
    def __init__(self, url):
        self.url, self.position, self.transferred = url, 0, 0
        with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=30, context=TLS_CONTEXT) as response:
            self.length = int(response.headers['Content-Length'])
            self.etag = response.headers.get('ETag')
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.position
    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else self.position + offset if whence == 1 else self.length + offset
        if not 0 <= self.position <= self.length: raise ValueError('Invalid remote seek')
        return self.position
    def read(self, count=-1):
        size = self.length - self.position if count < 0 else min(count, self.length-self.position)
        if not size: return b''
        if size > 128*1024*1024: raise ValueError('Refusing an unbounded archive read')
        start, end = self.position, self.position+size-1
        headers = {'Range': f'bytes={start}-{end}'}
        if self.etag: headers['If-Match'] = self.etag
        with urllib.request.urlopen(urllib.request.Request(self.url, headers=headers), timeout=60, context=TLS_CONTEXT) as response:
            expected = f'bytes {start}-{end}/{self.length}'
            if response.status != 206 or response.headers.get('Content-Range') != expected:
                raise ValueError('Server did not honor the requested verified byte range')
            data = response.read(size+1)
        if len(data) != size: raise ValueError('Incomplete archive range')
        self.position += size
        self.transferred += size
        return data

parser = argparse.ArgumentParser()
parser.add_argument('--version', default='4.7.2')
parser.add_argument('--target', type=Path)
parser.add_argument('--list', action='store_true')
args = parser.parse_args()
if not re.fullmatch(r'\d+\.\d+\.\d+', args.version): raise SystemExit('Invalid version')
url = f'https://godot-releases.nbg1.your-objectstorage.com/{args.version}-stable/Godot_v{args.version}-stable_export_templates.tpz'
remote = RemoteZip(url)
allowed = ['web_nothreads_debug.zip','web_nothreads_release.zip']
with zipfile.ZipFile(remote) as archive:
    entries = {Path(info.filename).name: info for info in archive.infolist()}
    version = archive.read(entries['version.txt']).decode().strip()
    if version != f'{args.version}.stable': raise SystemExit(f'Version mismatch: {version}')
    print(json.dumps({'version':version,'archive_bytes':remote.length,'selected':{name:entries[name].file_size for name in allowed}}), flush=True)
    if args.list: raise SystemExit(0)
    if args.target is not None: target = args.target
    elif sys.platform == 'darwin': target = Path.home()/'Library/Application Support/Godot/export_templates'/version
    elif sys.platform == 'win32': target = Path(os.environ['APPDATA'])/'Godot/export_templates'/version
    else: target = Path.home()/'.local/share/godot/export_templates'/version
    records = {}
    with tempfile.TemporaryDirectory(prefix='astra-godot-web-') as staging:
        for name in allowed:
            data = archive.read(entries[name])  # zipfile verifies the outer CRC.
            with zipfile.ZipFile(io.BytesIO(data)) as template:
                if sum(item.file_size for item in template.infolist()) > 512*1024*1024:
                    raise SystemExit('Unexpected template expansion size')
                if template.testzip() is not None: raise SystemExit('Template inner CRC failed')
            digest = hashlib.sha256(data).hexdigest()
            staged = Path(staging)/name; staged.write_bytes(data)
            destination = target/name
            if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() != digest:
                raise SystemExit(f'Refusing to replace a different existing template: {name}')
            records[name] = {'bytes':len(data),'sha256':digest}
            print(f'Verified {name}: {len(data)} bytes', flush=True)
        target.mkdir(parents=True,exist_ok=True)
        for name in allowed:
            if not (target/name).exists(): shutil.copyfile(Path(staging)/name,target/name)
    print(json.dumps({'installed':records,'downloaded_bytes':remote.transferred,'source':url}), flush=True)
