import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PixelCanvas } from '../art/lib/pixel.mjs';
import { encodePNG } from '../art/lib/png.mjs';
import { loadPalette, validateMeta, validatePixels } from '../tools/art.mjs';

// Render only this batch: no build writes and no unrelated NPC module dependency.
const palette = await loadPalette();
async function batch(file) {
  try { return (await import(file)).assets; }
  catch (error) { if (error.code === 'ERR_MODULE_NOT_FOUND') return []; throw error; }
}
const sources = [
  ...await batch('../art/source/environment/prologue-interiors.mjs'),
  ...await batch('../art/source/environment/prologue-outdoors.mjs'),
];
const expectedSizes = {
  'tile.wood_floor': [16, 16], 'tile.wood_wall': [16, 16], 'tile.rug': [16, 16],
  'tile.stone_floor': [16, 16], 'tile.wheat': [16, 16],
  'prop.bed': [32, 32], 'prop.table': [32, 24], 'prop.bookshelf': [32, 32],
  'prop.stove': [24, 32], 'prop.bread_counter': [48, 32], 'prop.workbench': [48, 32],
  'prop.barrel': [16, 24], 'prop.crate': [16, 16], 'prop.dough_cart': [16, 24],
  'prop.cooling_mat': [16, 16], 'prop.sign': [16, 24], 'prop.well': [32, 32],
  'prop.festival_lantern': [16, 24], 'prop.windmill': [64, 96],
  'prop.paper_boat': [16, 16], 'prop.pendant': [16, 16],
};
function source(id) {
  const found = sources.find(item => item.meta.id === id);
  assert.ok(found, `${id} must be available to the five prologue maps`);
  return found;
}
function draw(item, frame) {
  const canvas = new PixelCanvas(...item.meta.size, palette.colors);
  item.draw(canvas, { frame, seed: 71025 + frame });
  return canvas;
}
function pixels(image, region = [0, 0, image.width, image.height]) {
  const [x, y, width, height] = region, bytes = [];
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
    const offset = (py * image.width + px) * 4;
    bytes.push(...image.data.subarray(offset, offset + 4));
  }
  return bytes;
}
const signature = image => createHash('sha256').update(image.data).digest('hex');
const alpha = (image, x, y) => image.data[(y * image.width + x) * 4 + 3];

test('five-map environment assets produce deterministic native-scale palette PNGs', () => {
  assert.equal(new Set(sources.map(item => item.meta.id)).size, sources.length, 'IDs are unique');
  for (const [id, size] of Object.entries(expectedSizes)) {
    const item = source(id);
    validateMeta(item.meta);
    assert.deepEqual(item.meta.size, size);
    assert.deepEqual(item.meta.anchor, [size[0] / 2, size[1]], `${id} uses its fixed ground contact`);
    for (let frame = 0; frame < item.meta.frames; frame++) {
      const image = draw(item, frame);
      validatePixels(image, palette.colors);
      assert.deepEqual(encodePNG(image), encodePNG(draw(item, frame)), `${id}/${frame} is reproducible`);
      assert.ok(encodePNG(image).length < 2_000_000);
      assert.ok(image.data.some((value, index) => index % 4 === 3 && value === 255), `${id}/${frame} is visible`);
    }
  }
});

test('wood floor offers four quiet opaque variants without object outlines', () => {
  const item = source('tile.wood_floor'), images = Array.from({ length: item.meta.frames }, (_, frame) => draw(item, frame));
  assert.equal(images.length, 4);
  assert.equal(new Set(images.map(signature)).size, 4);
  const ink = palette.colors.ink;
  for (const image of images) {
    const counts = new Map();
    for (let index = 0; index < image.data.length; index += 4) {
      assert.equal(image.data[index + 3], 255, 'floor tiles cannot expose gaps');
      const key = `#${[...image.data.subarray(index, index + 3)].map(value => value.toString(16).padStart(2, '0')).join('')}`;
      assert.notEqual(key, ink, 'ground texture cannot compete with dark prop outlines');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    assert.ok(Math.max(...counts.values()) >= 192, 'at least three quarters of a floor tile stays visually quiet');
  }
});

test('wall top and front read separately while stone floor covers its entire map cell', () => {
  const wall = draw(source('tile.wood_wall'), 0), floor = draw(source('tile.stone_floor'), 0);
  assert.notDeepEqual(pixels(wall, [2, 1, 12, 2]), pixels(wall, [2, 8, 12, 2]), 'a blocking wall needs a visible top plane and front');
  for (const image of [wall, floor]) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) assert.equal(alpha(image, x, y), 255);
});

test('wheat and festival lanterns visibly idle while their roots and base remain fixed', () => {
  for (const [id, fixed] of [['tile.wheat', [0, 13, 16, 3]], ['prop.festival_lantern', [0, 20, 16, 4]]]) {
    const item = source(id), animation = item.meta.animations.idle;
    assert.equal(item.meta.frames, 4);
    assert.equal(animation.loop, true);
    assert.ok(animation.frames.length / animation.fps >= 2, `${id} has a gentle cadence`);
    assert.equal(animation.frames[0], animation.frames.at(-1), `${id} settles back into its rest pose`);
    const images = Array.from({ length: 4 }, (_, frame) => draw(item, frame));
    assert.equal(new Set(images.map(signature)).size, 4, `${id} must actually animate`);
    for (const image of images) assert.deepEqual(pixels(image, fixed), pixels(images[0], fixed), `${id} ground contact does not slide`);
  }
});

test('windmill has four pre-drawn blade poses without clipped edges or moving foundations', () => {
  const item = source('prop.windmill'), images = Array.from({ length: item.meta.frames }, (_, frame) => draw(item, frame));
  assert.equal(images.length, 4);
  assert.equal(new Set(images.map(signature)).size, 4);
  assert.equal(item.meta.animations.idle.loop, true);
  for (const image of images) {
    assert.deepEqual(pixels(image, [0, 64, 64, 32]), pixels(images[0], [0, 64, 64, 32]), 'foundation and doorway are stationary');
    for (let x = 0; x < 64; x++) assert.equal(alpha(image, x, 0), 0, 'blade tips have a top margin');
    for (let y = 0; y < 96; y++) {
      assert.equal(alpha(image, 0, y), 0, 'blade tips have a left margin');
      assert.equal(alpha(image, 63, y), 0, 'blade tips have a right margin');
    }
  }
});

test('pushable dough cart, cooling pad and keepsakes have distinct visible silhouettes', () => {
  const silhouettes = ['prop.dough_cart', 'prop.cooling_mat', 'prop.paper_boat', 'prop.pendant'].map(id => {
    const image = draw(source(id), 0);
    const occupied = [];
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (alpha(image, x, y)) occupied.push(`${x},${y}`);
    assert.ok(occupied.length >= 20, `${id} remains legible at native size`);
    return occupied.join(';');
  });
  assert.equal(new Set(silhouettes).size, 4, 'interactive items can be distinguished by shape as well as color');
});
