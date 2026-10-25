import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { renderAll, validatePixels } from '../tools/art.mjs';

// These tests inspect the pixels consumed by the game, not the drawing helpers.
const rendered = renderAll();
const characters = ['char.ella', 'char.shade', 'char.faux_sword'];
const astrals = ['astral.morning_star', 'astral.laurel', 'astral.ash_hand', 'astral.faux_sword'];
async function asset(id) {
  const found = (await rendered).rendered.find(item => item.meta.id === id);
  assert.ok(found, `${id} must be exported for the two prologue battles`);
  return found;
}
function pixels(item, frame, region = [0, 0, ...item.meta.size]) {
  const [x, y, width, height] = region, bytes = [];
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
    const offset = (py * item.image.width + frame * item.meta.size[0] + px) * 4;
    bytes.push(...item.image.data.subarray(offset, offset + 4));
  }
  return bytes;
}
const alpha = bytes => bytes.filter((_, index) => index % 4 === 3);
const signature = bytes => createHash('sha256').update(new Uint8Array(bytes)).digest('hex');

test('prologue battle assets export native-size horizontal PNG strips and palette pixels', async () => {
  const sizes = {
    'char.ella': [16, 24], 'char.shade': [24, 32], 'char.faux_sword': [16, 24],
    'portrait.ella': [48, 48], 'portrait.shade': [48, 48],
    'astral.morning_star': [24, 32], 'astral.laurel': [24, 32],
    'astral.ash_hand': [32, 32], 'astral.faux_sword': [24, 32],
    'fx.hit': [16, 16], 'fx.heal': [24, 24], 'fx.summon': [32, 32],
  };
  for (const [id, size] of Object.entries(sizes)) {
    const item = await asset(id);
    assert.deepEqual(item.meta.size, size);
    assert.equal(item.image.width, size[0] * item.meta.frames);
    assert.equal(item.image.height, size[1]);
    assert.ok(item.bytes.length < 2_000_000);
    validatePixels(item.image, (await rendered).colors);
  }
});

test('human bodies have four-direction walks and six-second idles with stable feet', async () => {
  for (const id of characters) {
    const item = await asset(id), [width, height] = item.meta.size;
    assert.deepEqual(item.meta.anchor, [width / 2, height]);
    for (const direction of ['down', 'up', 'left', 'right']) {
      const idle = item.meta.animations[`idle_${direction}`];
      assert.ok(idle, `${id} has a ${direction} idle`);
      assert.equal(idle.frames.length / idle.fps, 6);
      assert.equal(idle.loop, true);
      assert.equal(idle.frames[0], idle.frames.at(-1));
      const poses = [...new Set(idle.frames)];
      assert.ok(new Set(poses.map(frame => signature(pixels(item, frame)))).size >= 3, `${id} ${direction} breathes and moves its clothing`);
      for (const frame of poses) assert.deepEqual(pixels(item, frame, [0, height - 5, width, 5]), pixels(item, poses[0], [0, height - 5, width, 5]), `${id} idle feet stay planted`);
      const walk = item.meta.animations[`walk_${direction}`];
      assert.equal(walk.frames.length, 4);
      assert.equal(walk.fps, 8);
      assert.equal(walk.loop, true);
      assert.ok(new Set(walk.frames.map(frame => signature(pixels(item, frame)))).size >= 3, `${id} ${direction} has visible alternating steps`);
    }
    assert.deepEqual(item.meta.animations.idle, item.meta.animations.idle_down);
  }
});

test('battle humans are distinct silhouettes and remain visibly human beside their astrals', async () => {
  const silhouettes = [];
  for (const id of characters) {
    const item = await asset(id), frame = item.meta.animations.idle.frames[0];
    silhouettes.push(signature(alpha(pixels(item, frame))));
    const ink = pixels(item, frame).some((_, index, bytes) => index % 4 === 0 && bytes[index] === 26 && bytes[index + 1] === 18 && bytes[index + 2] === 32 && bytes[index + 3] === 255);
    assert.ok(ink, `${id} uses the human ink outline`);
  }
  assert.equal(new Set(silhouettes).size, characters.length);
  const soldier = await asset('char.faux_sword');
  const colored = pixels(soldier, 0).some((_, index, bytes) => index % 4 === 0 && bytes[index] === 74 && bytes[index + 1] === 42 && bytes[index + 2] === 106 && bytes[index + 3] === 255);
  assert.ok(colored, 'the masked human soldier has purple cloth, unlike the cold-grey faceless astral');
});

test('astrals float over sparse ground rings and animate four distinct poses without human ink', async () => {
  for (const id of astrals) {
    const item = await asset(id), [width, height] = item.meta.size;
    assert.deepEqual(item.meta.anchor, [width / 2, height]);
    const idle = item.meta.animations.idle;
    assert.equal(idle.loop, true);
    assert.equal(new Set(idle.frames).size, 4);
    assert.equal(new Set(idle.frames.map(frame => signature(pixels(item, frame)))).size, 4);
    for (const frame of idle.frames) {
      const ring = alpha(pixels(item, frame, [0, height - 4, width, 4]));
      assert.ok(ring.filter(Boolean).length > 0 && ring.filter(Boolean).length < width, `${id} has a sparse light ring, not a solid shadow`);
      assert.ok(alpha(pixels(item, frame, [width / 2 - 2, height - 4, 4, 4])).every(value => value === 0), `${id} ring centre remains transparent`);
      const image = pixels(item, frame);
      assert.equal(image.some((_, index) => index % 4 === 0 && image[index] === 26 && image[index + 1] === 18 && image[index + 2] === 32 && image[index + 3] === 255), false, `${id} uses its own darkest hue rather than human ink`);
    }
  }
  const faux = await asset('astral.faux_sword');
  const allowed = new Set(['58,64,80', '90,100,120', '138,150,170', '196,204,216', '255,255,255']);
  const bytes = pixels(faux, 0);
  for (let index = 0; index < bytes.length; index += 4) if (bytes[index + 3]) assert.ok(allowed.has(bytes.slice(index, index + 3).join(',')), 'faux astral uses only cold-grey metal ramp');
});

test('hit, heal and summon clips are non-looping and end in an empty frame', async () => {
  for (const id of ['fx.hit', 'fx.heal', 'fx.summon']) {
    const item = await asset(id), clip = item.meta.animations.once;
    assert.ok(clip, `${id} exports the once tag`);
    assert.equal(clip.loop, false);
    assert.ok(clip.frames.length >= 4);
    assert.deepEqual(item.meta.anchor, item.meta.size.map(value => value / 2));
    assert.ok(alpha(pixels(item, clip.frames[0])).some(Boolean));
    assert.ok(alpha(pixels(item, clip.frames.at(-1))).every(value => value === 0), `${id} clears its final frame`);
    assert.equal(new Set(clip.frames.map(frame => signature(pixels(item, frame)))).size, clip.frames.length);
  }
});

test('new battle art preserves the accepted character and environment PNG bytes', async () => {
  const accepted = {
    'char.finn': '67adc4e6245e0b7225cd2a351e5922640e0e616f3bae6db179142aa2b8133dd1',
    'char.hob': '2e48effcf01490ce08ac189ab0159a8f78b63a4c76060fd8ec4906993bdf3d91',
    'prop.tree': '9e003ca1a2c052ad2d35c13266eb8f27af12e5f407b554aa09fe45f3832e64ad',
    'prop.flower': '3551df98f72b889e67e816277a896f33dc3adbebf5f1a1eb5cf6e3406f8c4ab6',
    'prop.hedge': '1e1358be9fe5fa8e280bf9d8e4ec7f4a418c6904cff580561b5629ce9a816938',
    'prop.lamp': 'b2f58e3e4a41863da177913505ac975d0c837ad3862e98595f57511bc50a63e1',
  };
  for (const [id, expected] of Object.entries(accepted)) assert.equal(signature((await asset(id)).bytes), expected, `${id} must keep the user's accepted idle artwork`);
});

test('the practice obstacle is a grounded static pillar with its own manifest anchor', async () => {
  const item = await asset('prop.pillar');
  assert.deepEqual(item.meta.size, [16, 24]);
  assert.deepEqual(item.meta.anchor, [8, 24]);
  assert.equal(item.meta.frames, 1);
  assert.deepEqual(item.meta.animations.idle.frames, [0]);
  assert.ok(alpha(pixels(item, 0, [0, 21, 16, 3])).some(Boolean), 'the stone base visibly contacts its collision cell');
});

test('companion attacks append six visible articulated poses in both directions', async () => {
  for (const id of astrals) {
    const item = await asset(id), [width, height] = item.meta.size;
    assert.deepEqual(item.meta.animations.idle.frames, [0, 1, 2, 3], `${id} retains idle indices`);
    for (const direction of ['right', 'left']) {
      const clip = item.meta.animations[`attack_${direction}`];
      assert.ok(clip, `${id} needs an authored attack_${direction}, not a translated idle`);
      assert.equal(clip.frames.length, 6);
      assert.equal(clip.loop, false);
      assert.equal(clip.fps, 12);
      assert.ok(clip.frames.every(frame => frame >= 4));
      const silhouettes = clip.frames.map(frame => alpha(pixels(item, frame)));
      assert.ok(new Set(silhouettes.map(signature)).size >= 5, `${id} attack visibly changes limb shape`);
      const areas = silhouettes.map(silhouette => silhouette.filter(Boolean).length);
      assert.ok(Math.max(...areas) - Math.min(...areas) >= 10, `${id} attack is not just whole-image movement`);
      for (const frame of clip.frames) {
        assert.ok(alpha(pixels(item, frame, [0, 0, width, 1])).every(value => value === 0), `${id} attack keeps its top safety border`);
        assert.ok(alpha(pixels(item, frame, [0, 0, 1, height - 4])).every(value => value === 0), `${id} attack keeps its left safety border`);
        assert.ok(alpha(pixels(item, frame, [width - 1, 0, 1, height - 4])).every(value => value === 0), `${id} attack keeps its right safety border`);
      }
    }
  }
});

test('human and companion hurt clips change the pose while human feet remain planted', async () => {
  for (const id of [...characters, ...astrals]) {
    const item = await asset(id), [width, height] = item.meta.size, clip = item.meta.animations.hurt;
    assert.ok(clip, `${id} has a visible hurt pose`);
    assert.equal(clip.frames.length, 2);
    assert.equal(clip.loop, false);
    assert.notEqual(signature(pixels(item, clip.frames[0])), signature(pixels(item, 0)));
    assert.notEqual(signature(pixels(item, clip.frames[0])), signature(pixels(item, clip.frames[1])));
    if (id.startsWith('char.')) for (const frame of clip.frames) assert.deepEqual(pixels(item, frame, [0, height - 5, width, 5]), pixels(item, 0, [0, height - 5, width, 5]), `${id} hurt does not slide the feet`);
  }
});

test('distinct leaf, ash and directional fist effects are authored six-frame once clips', async () => {
  for (const [id, size] of [['fx.leaf_hit', [24, 24]], ['fx.ash_hit', [24, 24]], ['fx.strike', [32, 24]]]) {
    const item = await asset(id);
    assert.deepEqual(item.meta.size, size);
    assert.deepEqual(item.meta.anchor, size.map(value => value / 2));
    for (const tag of id === 'fx.strike' ? ['once', 'left', 'right'] : ['once']) {
      const clip = item.meta.animations[tag];
      assert.ok(clip, `${id} exports ${tag}`);
      assert.equal(clip.frames.length, 6);
      assert.equal(clip.loop, false);
      assert.equal(new Set(clip.frames.map(frame => signature(pixels(item, frame)))).size, 6);
      assert.ok(alpha(pixels(item, clip.frames.at(-1))).every(value => value === 0));
    }
  }
});
