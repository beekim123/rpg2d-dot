import { mkdir, readdir, readFile, lstat, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { repoRoot } from '../lib/paths.mjs';

// Generated copies only. The authoritative inputs are resources/, content/, and third_party/.
const defaultRoot = repoRoot;
const FONT_ROOT = 'third_party/fonts/fusion-pixel-12px';
const MAX_FILE_BYTES = 2_000_000;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const serialize = value => `${JSON.stringify(value, null, 2)}\n`;
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function validRelative(relative) {
  return typeof relative === 'string' && relative.length > 0 &&
    relative.split('/').every(segment => /^[A-Za-z0-9_.-]+$/.test(segment) && segment !== '.' && segment !== '..');
}
function destinationFor(source) {
  if (!validRelative(source)) throw new Error(`Unsafe source path: ${source}`);
  if (/^resources\/art\/export\/(?:manifest\.json|[\w.-]+\.png)$/.test(source)) {
    return `res://resources/art/${source.split('/').at(-1)}`;
  }
  if (source.startsWith(`${FONT_ROOT}/`) && /\.(?:txt|md|woff2?|otf|ttf)$/i.test(source)) {
    return `res://resources/fonts/${source.slice('third_party/fonts/'.length)}`;
  }
  if (/^content\/maps\/(?:[\w.-]+\/)*[\w.-]+\.json$/.test(source)) {
    return `res://data/maps/${source.slice('content/maps/'.length)}`;
  }
  const locale = /^content\/i18n\/([\w-]+)\/ui\.json$/.exec(source);
  if (locale) return `res://data/i18n/${locale[1]}.json`;
  throw new Error(`Invalid managed source: ${source}`);
}
function resourceRelative(resourcePath) {
  if (typeof resourcePath !== 'string' || !resourcePath.startsWith('res://') || !validRelative(resourcePath.slice(6))) {
    throw new Error(`Unsafe resource path: ${resourcePath}`);
  }
  return resourcePath.slice(6);
}

// Refuse symlink components rather than following an output directory into unrelated files.
async function safePath(root, relative) {
  if (!validRelative(relative)) throw new Error(`Unsafe relative path: ${relative}`);
  let cursor = resolve(root);
  for (const segment of [null, ...relative.split('/')]) {
    if (segment !== null) cursor = join(cursor, segment);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) throw new Error(`Symbolic link is not a managed resource: ${cursor}`);
      if (cursor !== join(resolve(root), relative) && !info.isDirectory()) throw new Error(`Resource parent is not a directory: ${cursor}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return cursor;
}
async function readOptional(file) {
  try { return await readFile(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function readSource(root, source) {
  const bytes = await readFile(await safePath(root, source));
  if (bytes.length > MAX_FILE_BYTES) throw new Error(`Resource exceeds repository file budget: ${source}`);
  return bytes;
}
async function fontSources(root, relative = FONT_ROOT) {
  const directory = await safePath(root, relative), result = [];
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => order(a.name, b.name));
  for (const entry of entries) {
    const source = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Symbolic link is not a font source: ${source}`);
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) result.push(...await fontSources(root, source));
    else if (entry.isFile()) { destinationFor(source); result.push(source); }
    else throw new Error(`Unsupported font source: ${source}`);
  }
  return result;
}
function validatePrevious(pack) {
  if (pack.format !== 'astra.resource-pack/1' || !Array.isArray(pack.files)) throw new Error('Invalid resource pack index');
  const seen = new Set();
  for (const file of pack.files) {
    if (!file || typeof file !== 'object' || destinationFor(file.source) !== file.path ||
      !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_FILE_BYTES || seen.has(file.path)) {
      throw new Error(`Invalid managed file index: ${file?.path}`);
    }
    resourceRelative(file.path); seen.add(file.path);
  }
}
async function atomicWrite(file, bytes) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.astra-${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

/** Build/verify an explicit resource package. Tests can supply isolated source and target roots. */
export async function syncResources({ sourceRoot = defaultRoot, targetRoot = join(sourceRoot, 'godot'), verify = false } = {}) {
  const manifestSource = 'resources/art/export/manifest.json';
  const manifestBytes = await readSource(sourceRoot, manifestSource);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.format !== 'astra.art/1' || !Array.isArray(manifest.assets)) throw new Error('Invalid art manifest');
  const sources = [manifestSource, 'content/maps/lantern-test.json', 'content/i18n/zh-Hans/ui.json'];
  const ids = new Set();
  for (const asset of manifest.assets) {
    if (!asset || !/^[\w.-]+\.png$/.test(asset.file)) throw new Error(`Unsafe asset path: ${asset?.file}`);
    if (typeof asset.id !== 'string' || ids.has(asset.id)) throw new Error(`Invalid or duplicate asset ID: ${asset.id}`);
    ids.add(asset.id); sources.push(`resources/art/export/${asset.file}`);
  }
  for (const id of ['char.finn', 'prop.shadow', 'ui.panel']) if (!ids.has(id)) throw new Error(`Missing bootstrap asset: ${id}`);
  sources.push(...await fontSources(sourceRoot));
  const fontSource = `${FONT_ROOT}/fusion-pixel-12px-proportional-zh_hans.otf.woff2`;
  if (!sources.includes(fontSource)) throw new Error('Missing bootstrap font');

  const prepared = [], destinations = new Set();
  for (const source of sources.sort(order)) {
    const resourcePath = destinationFor(source);
    if (destinations.has(resourcePath)) throw new Error(`Duplicate resource destination: ${resourcePath}`);
    destinations.add(resourcePath);
    const bytes = source === manifestSource ? manifestBytes : await readSource(sourceRoot, source);
    const file = await safePath(targetRoot, resourceRelative(resourcePath));
    prepared.push({ file, bytes, record: { source, path: resourcePath, sha256: hash(bytes), bytes: bytes.length } });
  }
  const pack = {
    format: 'astra.resource-pack/1',
    art_manifest: 'res://resources/art/manifest.json',
    font: destinationFor(fontSource),
    maps: { 'lantern-test': 'res://data/maps/lantern-test.json' },
    locales: { 'zh-Hans': 'res://data/i18n/zh-Hans.json' },
    bootstrap: { map: 'lantern-test', locale: 'zh-Hans', player: 'char.finn', shadow: 'prop.shadow', panel: 'ui.panel' },
    files: prepared.map(item => item.record),
  };
  const indexPath = await safePath(targetRoot, 'resource-pack.json');
  const previousBytes = await readOptional(indexPath), expectedIndex = Buffer.from(serialize(pack));
  const previous = previousBytes ? JSON.parse(previousBytes.toString('utf8')) : null;
  if (previous) validatePrevious(previous);
  const stale = [];
  for (const record of previous?.files ?? []) {
    if (destinations.has(record.path)) continue;
    const file = await safePath(targetRoot, resourceRelative(record.path));
    const bytes = await readOptional(file);
    if (bytes && (bytes.length !== record.bytes || hash(bytes) !== record.sha256)) {
      throw new Error(`Modified stale resource; preserve and resolve manually: ${record.path}`);
    }
    stale.push({ file, path: record.path, exists: bytes !== null });
  }

  const mismatches = [], removed = [];
  if (verify) {
    if (!previousBytes?.equals(expectedIndex)) mismatches.push('Resource pack index missing or stale: resource-pack.json');
    for (const item of prepared) {
      const actual = await readOptional(item.file);
      if (!actual?.equals(item.bytes)) mismatches.push(`Godot resource copy differs: ${item.record.path}`);
    }
  } else {
    // All sources, output paths and old ownership records are validated before the first mutation.
    for (const item of prepared) {
      const actual = await readOptional(item.file);
      if (!actual?.equals(item.bytes)) await atomicWrite(item.file, item.bytes);
    }
    for (const item of stale) {
      if (item.exists) await unlink(item.file);
      removed.push(item.path);
    }
    if (!previousBytes?.equals(expectedIndex)) await atomicWrite(indexPath, expectedIndex);
  }
  return { files: prepared.length, pngs: manifest.assets.length, mismatches, removed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const verify = process.argv.includes('--verify');
  try {
    if (process.argv.slice(2).some(argument => argument !== '--verify')) throw new Error('Usage: sync-godot-assets.mjs [--verify]');
    const result = await syncResources({ verify });
    for (const mismatch of result.mismatches) console.error(mismatch);
    console.log(`Godot assets ${verify ? 'verify' : 'sync'}: ${result.files} files, ${result.pngs} PNGs, ${result.mismatches.length} mismatches, ${result.removed.length} stale files removed`);
    if (result.mismatches.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
