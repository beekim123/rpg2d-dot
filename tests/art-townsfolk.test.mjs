import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadPalette, validateMeta, validatePixels } from '../tools/art.mjs';
import { PixelCanvas } from '../art/lib/pixel.mjs';
import { encodePNG, decodePNG } from '../art/lib/png.mjs';

const ids = ['brio', 'mayor_tolan', 'mili', 'hedo', 'teya', 'sela', 'oren', 'nemi'];
const directions = ['down', 'up', 'left', 'right'];
const { colors } = await loadPalette();
const hash = bytes => createHash('sha256').update(Buffer.from(bytes)).digest('hex');
async function sources(path) {
  try { return (await import(path)).assets; }
  catch (error) { if (error.code === 'ERR_MODULE_NOT_FOUND') return []; throw error; }
}
const characters = await sources('../art/source/characters/townsfolk.mjs');
const portraits = await sources('../art/source/portraits/townsfolk.mjs');
const companions = await sources('../art/source/astrals/daily-life.mjs');
function find(assets, id) {
  const asset = assets.find(item => item.meta.id === id);
  assert.ok(asset, `missing source asset ${id}`);
  return asset;
}
function frame(asset, index) {
  const [width, height] = asset.meta.size;
  const canvas = new PixelCanvas(width, height, colors);
  asset.draw(canvas, { frame: index, seed: 71025 + index });
  return canvas;
}
function region(image, x, y, width, height) {
  const bytes = [];
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
    const offset = (py * image.width + px) * 4;
    bytes.push(...image.data.slice(offset, offset + 4));
  }
  return bytes;
}
const alpha = bytes => Array.from(bytes).filter((_, index) => index % 4 === 3);

test('all named townsfolk have grounded four-direction clips and native portrait assets', () => {
  for (const id of ids) {
    const asset = find(characters, `char.${id}`), large = ['brio', 'mayor_tolan'].includes(id);
    assert.deepEqual(asset.meta.size, large ? [24, 32] : [16, 24]);
    assert.deepEqual(asset.meta.anchor, large ? [12, 32] : [8, 24]);
    validateMeta(asset.meta);
    for (const direction of directions) {
      const idle = asset.meta.animations[`idle_${direction}`];
      const walk = asset.meta.animations[`walk_${direction}`];
      assert.ok(idle && walk, `${id}/${direction} has both map clips`);
      assert.equal(idle.fps, 4); assert.equal(idle.frames.length, 24); assert.equal(idle.loop, true);
      assert.equal(idle.frames[0], idle.frames.at(-1), 'idle closes on its resting pose');
      assert.equal(walk.fps, 8); assert.equal(walk.frames.length, 4); assert.equal(walk.loop, true);
    }
    const portrait = find(portraits, `portrait.${id}`);
    assert.deepEqual(portrait.meta.size, [48, 48]);
    assert.deepEqual(portrait.meta.anchor, [24, 48]);
  }
});

test('townsfolk breathe and blink within the PNG while every idle foot stays fixed', () => {
  for (const id of ids) {
    const asset = find(characters, `char.${id}`), [width, height] = asset.meta.size;
    for (const direction of directions) {
      const idle = asset.meta.animations[`idle_${direction}`];
      const poses = [...new Set(idle.frames)].map(index => frame(asset, index));
      assert.equal(new Set(poses.map(image => hash(image.data))).size, 4, `${id}/${direction} has rest, inhale, exhale and blink poses`);
      for (const image of poses) {
        assert.deepEqual(region(image, 0, height - 5, width, 5), region(poses[0], 0, height - 5, width, 5), `${id}/${direction} does not slide its feet`);
        assert.ok(alpha(region(image, 0, 0, width, 1)).every(value => !value), `${id} keeps a top safety border`);
      }
      if (direction !== 'up') {
        // A blink is a short, face-only change; breathing changes shoulders.
        const blinkFrame = [...new Set(idle.frames)].find(index => idle.frames.filter(value => value === index).length === 1);
        assert.ok(blinkFrame !== undefined, `${id}/${direction} closes its eyes for one 250ms tick`);
        const blink = frame(asset, blinkFrame), rest = poses[0], faceBottom = height === 32 ? 18 : id === 'mili' || id === 'hedo' ? 14 : 12;
        assert.notDeepEqual(region(blink, 0, 0, width, faceBottom), region(rest, 0, 0, width, faceBottom), 'blink visibly changes the face');
        assert.deepEqual(region(blink, 0, faceBottom, width, height - faceBottom), region(rest, 0, faceBottom, width, height - faceBottom), 'blink does not move the body');
      }
      const walk = asset.meta.animations[`walk_${direction}`].frames.map(index => frame(asset, index));
      assert.equal(new Set(walk.map(image => hash(image.data))).size, 4, `${id}/${direction} has four visible walk poses`);
      assert.ok(walk.every(image => alpha(region(image, 0, height - 1, width, 1)).some(Boolean)), 'each step retains contact with the anchor row');
    }
  }
});

test('townsfolk retain distinct black silhouettes and children stand shorter than adults', () => {
  const silhouettes = ids.map(id => {
    const asset = find(characters, `char.${id}`);
    return hash(alpha(frame(asset, asset.meta.animations.idle_down.frames[0]).data));
  });
  assert.equal(new Set(silhouettes).size, ids.length, 'costume and body shapes identify all eight residents without color');
  for (const id of ['mili', 'hedo']) {
    const image = frame(find(characters, `char.${id}`), 0);
    assert.ok(alpha(region(image, 0, 0, 16, 4)).every(value => !value), 'child stature is shorter within the shared 16x24 frame');
  }
});

test('portraits are detailed native pixel faces with character-specific clothing colors', () => {
  const keys = { brio: 'red2', mayor_tolan: 'metal0', mili: 'gold1', hedo: 'leaf2', teya: 'star1', sela: 'stone4', oren: 'metal1', nemi: 'earth3' };
  for (const [id, key] of Object.entries(keys)) {
    const image = frame(find(portraits, `portrait.${id}`), 0), expected = image.color(key);
    assert.ok(alpha(image.data).filter(Boolean).length > 700, `${id} is a complete 48px bust`);
    let count = 0;
    for (let i = 0; i < image.data.length; i += 4) if (expected.every((channel, c) => image.data[i + c] === channel)) count++;
    assert.ok(count >= 8, `${id} retains its identifying ${key} clothing`);
    // Native eyes and seams must contain isolated one-pixel detail, which a 2x/3x map enlargement cannot produce.
    let fineBlocks = 0;
    for (let y = 6; y < 36; y += 2) for (let x = 6; x < 40; x += 2) {
      const block = region(image, x, y, 2, 2);
      if (new Set([0, 4, 8, 12].map(i => block.slice(i, i + 4).join(','))).size > 1) fineBlocks++;
    }
    assert.ok(fineBlocks > 35, `${id} is drawn at the portrait's native scale`);
  }
});

test('life companions have four animated poses, colored edges, four-point cores and sparse ground rings', () => {
  for (const [id, size] of [['astral.rise', [24, 24]], ['astral.cornerpress', [16, 16]]]) {
    const asset = find(companions, id), [width, height] = size;
    assert.deepEqual(asset.meta.size, size); assert.deepEqual(asset.meta.anchor, [width / 2, height]);
    assert.deepEqual(asset.meta.animations.idle, { frames: [0, 1, 2, 3], fps: 4, loop: true });
    const images = [0, 1, 2, 3].map(index => frame(asset, index));
    assert.equal(new Set(images.map(image => hash(image.data))).size, 4);
    for (const image of images) {
      const ring = alpha(region(image, 0, height - 3, width, 3)).filter(Boolean).length;
      assert.ok(ring > 0 && ring < width, `${id} has sparse ring pixels`);
      assert.ok(alpha(region(image, width / 2 - 2, height - 3, 4, 3)).every(value => !value), 'the ring centre is transparent');
      const ink = image.color('ink');
      assert.equal(Array.from({ length: image.data.length / 4 }, (_, i) => ink.every((channel, c) => image.data[i * 4 + c] === channel)).some(Boolean), false, `${id} does not use human ink`);
      // The common cross core is visible in all poses, regardless of its location.
      const bright = image.color(id === 'astral.rise' ? 'gold4' : 'star3');
      const brightAt = (x, y) => bright.every((channel, c) => image.data[(y * width + x) * 4 + c] === channel);
      let starFound = false;
      for (let y = 2; y < height - 4; y++) for (let x = 2; x < width - 2; x++) {
        if ([[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dy]) => brightAt(x + dx, y + dy))) starFound = true;
      }
      assert.ok(starFound, `${id} retains a four-point core`);
    }
  }
});

test('new source frames export deterministic palette-only PNGs without writing shared outputs', () => {
  for (const asset of [...characters, ...portraits, ...companions]) {
    validateMeta(asset.meta);
    const [width, height] = asset.meta.size, strip = new PixelCanvas(width * asset.meta.frames, height, colors);
    for (let i = 0; i < asset.meta.frames; i++) {
      const image = frame(asset, i); validatePixels(image, colors);
      assert.deepEqual(frame(asset, i).data, image.data, `${asset.meta.id}/${i} is reproducible`);
      strip.stamp(image, width * i, 0);
    }
    const png = encodePNG(strip);
    assert.ok(png.length < 2_000_000);
    assert.deepEqual(decodePNG(png).data, strip.data);
  }
  assert.equal(characters.length + portraits.length + companions.length, 18);
});
