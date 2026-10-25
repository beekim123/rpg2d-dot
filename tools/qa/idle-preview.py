"""Create a nearest-neighbour GIF from the real-browser idle QA frames.

Capture first with ASTRA_CAPTURE_IDLE=1 npm run test:e2e, then run this file.
Optional development dependency: Pillow (HPND), never part of the game runtime.
"""
from pathlib import Path
import argparse
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--frames', default='build/captures/idle-frames')
parser.add_argument('--output', default='artifacts/screenshots/scene-idle.gif')
parser.add_argument('--duration', type=int, default=250)
args = parser.parse_args()
sources = sorted(Path(args.frames).glob('frame-*.png'))
if not sources:
    raise SystemExit('No QA frames. Run ASTRA_CAPTURE_IDLE=1 npm run test:e2e first.')
frames = []
for source in sources:
    with Image.open(source) as image:
        frames.append(image.convert('RGB').resize((960, 540), Image.Resampling.NEAREST))
output = Path(args.output)
frames[0].save(output, save_all=True, append_images=frames[1:], duration=args.duration, loop=0, optimize=True, disposal=1)
with Image.open(output) as preview:
    print(f'{output}: {preview.n_frames} frames, {output.stat().st_size} bytes, {preview.size}')
if output.stat().st_size >= 2 * 1024 * 1024:
    raise SystemExit('Preview exceeds repository size limit.')
