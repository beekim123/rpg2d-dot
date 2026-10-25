import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function moduleAt(file) {
  try { return await import(file); }
  catch (error) { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; }
}
const pixel = await moduleAt('../art/lib/pixel.mjs');
const png = await moduleAt('../art/lib/png.mjs');
const art = await moduleAt('../tools/art.mjs');
const colors = { '.': '#00000000', a: '#1a1220', b: '#ffe36b', c: '#4d9a3b' };

test('pixel drawing has integer coordinates, clipping, and exact opaque palette colors', () => {
  assert.equal(typeof pixel.PixelCanvas, 'function', 'PixelCanvas must exist');
  const g = new pixel.PixelCanvas(3, 3, colors);
  g.rect(-1, -1, 3, 3, 'b').line(0, 2, 2, 2, 'a');
  assert.deepEqual([...g.data.slice(0, 4)], [255, 227, 107, 255]);
  assert.deepEqual([...g.data.slice(8, 12)], [0, 0, 0, 0]);
  assert.deepEqual([...g.data.slice(24, 28)], [26, 18, 32, 255]);
  assert.throws(() => g.px(0.5, 1, 'a'), /integer/);
  assert.throws(() => g.px(0, 0, 'unknown'), /color/);
});

test('outline, mirror, and palette replacement preserve deliberate pixel geometry', () => {
  assert.equal(typeof pixel.PixelCanvas, 'function');
  const g = new pixel.PixelCanvas(5, 5, colors).px(1, 2, 'b');
  g.outline('a');
  assert.equal(g.data[(2 * 5 + 0) * 4 + 3], 255);
  assert.equal(g.data[(1 * 5 + 0) * 4 + 3], 0, 'outline uses four neighbours');
  const mirrored = g.mirror().recolor({ b: 'c' });
  assert.deepEqual([...mirrored.data.slice((2 * 5 + 3) * 4, (2 * 5 + 3) * 4 + 4)], [77, 154, 59, 255]);
});

test('ellipse, polygon, stamp, and seeded drawing keep clipped shapes reproducible', () => {
  const g = new pixel.PixelCanvas(5, 5, colors).ellipse(0, 0, 3, 3, 'b');
  assert.equal(g.data[(1 * 5 + 1) * 4 + 3], 255);
  assert.equal(g.data[(4 * 5 + 4) * 4 + 3], 0);
  g.polygon([[2, 2], [4, 2], [4, 4]], 'a');
  assert.deepEqual([...g.data.slice((2 * 5 + 3) * 4, (2 * 5 + 3) * 4 + 4)], [26, 18, 32, 255]);
  const destination = new pixel.PixelCanvas(2, 2, colors).stamp(g, -2, -2);
  assert.deepEqual([...destination.data.slice(4, 8)], [26, 18, 32, 255]);
  const first = pixel.seededRandom(42), second = pixel.seededRandom(42), other = pixel.seededRandom(43);
  const values = Array.from({ length: 4 }, first);
  assert.deepEqual(values, Array.from({ length: 4 }, second));
  assert.notDeepEqual(values, Array.from({ length: 4 }, other));
});

test('PNG roundtrip preserves RGBA pixels and detects altered chunks', () => {
  assert.equal(typeof png.encodePNG, 'function', 'PNG encoder must exist');
  const fixture = { width: 2, height: 1, data: new Uint8Array([26, 18, 32, 255, 0, 0, 0, 0]) };
  const encoded = png.encodePNG(fixture);
  const decoded = png.decodePNG(encoded);
  assert.equal(decoded.width, 2); assert.equal(decoded.height, 1);
  assert.deepEqual([...decoded.data], [...fixture.data]);
  assert.deepEqual(png.encodePNG(fixture), encoded);
  const damaged = Buffer.from(encoded); damaged[45] ^= 1;
  assert.throws(() => png.decodePNG(damaged), /CRC|chunk|data/i);
});

test('source validation rejects unknown colors, wrong rows, alpha, and nonexistent animation frames', () => {
  assert.equal(typeof art.renderPixelSource, 'function', 'source renderer must exist');
  const source = { id: 'test.dot', size: [2, 1], anchor: [1, 1], frames: [['a.']], animations: { idle: { frames: [0], fps: 4, loop: true } } };
  assert.deepEqual([...art.renderPixelSource(source, colors).data], [26, 18, 32, 255, 0, 0, 0, 0]);
  assert.throws(() => art.renderPixelSource({ ...source, frames: [['az']] }, colors), /color/);
  assert.throws(() => art.renderPixelSource({ ...source, frames: [['a']] }, colors), /width|size/);
  assert.throws(() => art.validateMeta({ ...source, frames: 1, animations: { idle: { frames: [1], fps: 4, loop: true } } }), /frame/);
  assert.throws(() => art.validateMeta({ ...source, frames: 1, anchor: [3, 1] }), /anchor/);
  assert.throws(() => art.validateMeta({ ...source, frames: 1, id: '../outside' }), /id/);
  assert.throws(() => art.validateMeta({ ...source, frames: 1, size: [0, 1] }), /size/);
  assert.throws(() => art.validateMeta({ ...source, frames: 1, animations: { idle: { frames: [0], fps: 0, loop: true } } }), /timing/);
  assert.throws(() => art.validatePixels({ width: 1, height: 1, data: new Uint8Array([26, 18, 32, 128]) }, colors), /alpha/);
  assert.throws(() => art.validatePixels({ width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) }, colors), /palette/);
  assert.throws(() => art.validatePixels({ width: 1, height: 1, data: new Uint8Array([0, 0, 0, 255]) }, colors), /palette/, 'transparent black does not grant an extra opaque color');
});

test('build emits usable deterministic assets and verification catches changed output or metadata', async () => {
  assert.equal(typeof art.build, 'function', 'asset builder must exist');
  const output = await mkdtemp(path.join(tmpdir(), 'astra-art-test-'));
  try {
    const manifest = await art.build({ outDir: output });
    const finn = manifest.assets.find(asset => asset.id === 'char.finn');
    assert.deepEqual(finn.size, [16, 24]); assert.deepEqual(finn.anchor, [8, 24]);
    for (const direction of ['down', 'up', 'left', 'right']) {
      assert.ok(finn.animations[`idle_${direction}`]);
      assert.equal(finn.animations[`walk_${direction}`].frames.length, 4);
      assert.equal(finn.animations[`walk_${direction}`].fps, 8);
    }
    for (const id of ['char.hob', 'portrait.hob', 'portrait.finn', 'tile.grass', 'tile.path', 'tile.water', 'tile.edge', 'tile.bridge', 'prop.lamp', 'prop.tree', 'prop.hedge', 'prop.house', 'prop.flower', 'prop.shadow', 'ui.panel']) {
      assert.ok(manifest.assets.some(asset => asset.id === id), `missing ${id}`);
    }
    const original = await readFile(path.join(output, finn.file));
    const image = png.decodePNG(original);
    assert.equal(image.width, finn.size[0] * finn.frames);
    assert.equal(image.height, finn.size[1]);
    await art.verify({ outDir: output });
    await art.build({ outDir: output });
    assert.deepEqual(await readFile(path.join(output, finn.file)), original);
    const bad = Buffer.from(original); bad[bad.length - 1] ^= 1;
    await writeFile(path.join(output, finn.file), bad);
    await assert.rejects(art.verify({ outDir: output }), /mismatch|CRC/);
    await writeFile(path.join(output, finn.file), original);
    manifest.assets[0].anchor = [-1, 0];
    await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(art.verify({ outDir: output }), /manifest|anchor/);
  } finally { await rm(output, { recursive: true, force: true }); }
});

test('grass transition masks are transparent at zero and cover only selected edges', async () => {
  assert.equal(typeof art.renderAll, 'function');
  const { rendered } = await art.renderAll();
  const edge = rendered.find(asset => asset.meta.id === 'tile.edge');
  assert.equal(edge.meta.frames, 16);
  const alphaAt = (frame, x, y) => edge.image.data[(y * 256 + frame * 16 + x) * 4 + 3];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) assert.equal(alphaAt(0, x, y), 0);
  assert.equal(alphaAt(1, 8, 0), 255); assert.equal(alphaAt(1, 8, 15), 0);
  assert.equal(alphaAt(2, 15, 8), 255); assert.equal(alphaAt(2, 0, 8), 0);
  assert.equal(alphaAt(4, 8, 15), 255); assert.equal(alphaAt(8, 0, 8), 255);
});
