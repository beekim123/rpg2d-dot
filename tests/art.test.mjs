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

function framePixels(asset, frame, region = [0, 0, ...asset.meta.size]) {
  const [x, y, width, height] = region, bytes = [];
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
    const offset = (py * asset.image.width + frame * asset.meta.size[0] + px) * 4;
    bytes.push(...asset.image.data.subarray(offset, offset + 4));
  }
  return bytes;
}

test('characters and foliage have visible held idle poses with fixed feet and roots', async () => {
  const { rendered } = await art.renderAll();
  for (const id of ['char.finn', 'char.hob', 'prop.tree', 'prop.flower', 'prop.hedge']) {
    const asset = rendered.find(asset => asset.meta.id === id);
    const idleNames = id === 'char.finn' ? ['idle_down', 'idle_up', 'idle_left', 'idle_right'] : ['idle'];
    for (const name of idleNames) {
      const animation = asset.meta.animations[name];
      const poses = [...new Set(animation.frames)];
      const uniqueImages = new Set(poses.map(frame => framePixels(asset, frame).join(',')));
      assert.ok(uniqueImages.size >= 2, `${id}/${name} must actually move`);
      assert.ok(animation.fps >= 2 && animation.fps <= 4, `${id}/${name} has a calm idle cadence`);
      assert.equal(animation.loop, true);
      assert.ok(animation.frames.length / animation.fps >= 2, `${id}/${name} holds its poses`);
      assert.equal(animation.frames[0], animation.frames.at(-1), `${id}/${name} returns to its rest pose`);
      const fixedRegion = id === 'prop.tree' ? [0, 34, 32, 14] : id === 'prop.flower' ? [0, 12, 16, 4] : id === 'prop.hedge' ? [0, 12, 16, 4] : [0, 19, 16, 5];
      for (const frame of poses) assert.deepEqual(framePixels(asset, frame, fixedRegion), framePixels(asset, poses[0], fixedRegion), `${id}/${name} keeps its ground contact fixed`);
    }
  }
});

test('Finn keeps his lamp pole fixed and only blinks briefly every several seconds', async () => {
  const { rendered } = await art.renderAll();
  const finn = rendered.find(asset => asset.meta.id === 'char.finn');
  for (const direction of ['down', 'up', 'left', 'right']) {
    const animation = finn.meta.animations[`idle_${direction}`];
    const pole = direction === 'right' ? [1, 0, 2, 21] : [13, 0, 2, 21];
    for (const frame of animation.frames) assert.deepEqual(framePixels(finn, frame, pole), framePixels(finn, animation.frames[0], pole), `lamp pole ${direction} must not drift`);
    assert.ok(animation.frames.length / animation.fps >= 5, `Finn ${direction} breathing/blink cycle is at least five seconds`);
    if (direction === 'up') continue;
    const blinkTicks = animation.frames.filter(frame => {
      const face = framePixels(finn, frame, [2, 6, 11, 4]);
      for (let i = 0; i < face.length; i += 4) if (face[i] === 138 && face[i + 1] === 74 && face[i + 2] === 58 && face[i + 3] === 255) return true;
      return false;
    });
    assert.ok(blinkTicks.length > 0, `${direction} includes a closed eyelid pose`);
    assert.ok(blinkTicks.length / animation.frames.length <= 0.1, `${direction} keeps eyes open at least 90% of the time`);
  }
  const hob = rendered.find(asset => asset.meta.id === 'char.hob');
  assert.ok(hob.meta.animations.idle.frames.length / hob.meta.animations.idle.fps >= 5, 'Hob does not blink twice a second');
  const hobBlinkTicks = hob.meta.animations.idle.frames.filter(frame => {
    const face = framePixels(hob, frame, [2, 3, 11, 3]);
    for (let i = 0; i < face.length; i += 4) if (face[i] === 138 && face[i + 1] === 74 && face[i + 2] === 58 && face[i + 3] === 255) return true;
    return false;
  });
  assert.ok(hobBlinkTicks.length > 0 && hobBlinkTicks.length / hob.meta.animations.idle.frames.length <= 0.1, 'Hob briefly closes both eyelids');
});

test('wind poses fit inside the tree canvas and keep all palette pixels binary alpha', async () => {
  const { rendered, colors: palette } = await art.renderAll();
  for (const asset of rendered.filter(asset => ['prop.tree', 'prop.flower', 'prop.hedge'].includes(asset.meta.id))) {
    art.validatePixels(asset.image, palette);
    assert.ok(asset.meta.frames >= 3, `${asset.meta.id} has multiple wind poses`);
    assert.deepEqual(asset.meta.anchor, [asset.meta.size[0] / 2, asset.meta.size[1]]);
  }
  const tree = rendered.find(asset => asset.meta.id === 'prop.tree');
  const restingSilhouette = framePixels(tree, 0).filter((_, index) => index % 4 === 3);
  assert.notDeepEqual(framePixels(tree, 1).filter((_, index) => index % 4 === 3), restingSilhouette, 'wind changes the canopy silhouette, not just its colors');
  for (let frame = 0; frame < tree.meta.frames; frame++) {
    for (const region of [[0, 0, 32, 1], [0, 0, 1, 34], [31, 0, 1, 34]]) {
      assert.ok(framePixels(tree, frame, region).every((value, index) => index % 4 !== 3 || value === 0), `tree ${frame} has a transparent safety border`);
    }
  }
});
