import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { PixelCanvas, rgba } from '../art/lib/pixel.mjs';
import { encodePNG, decodePNG } from '../art/lib/png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOutput = path.join(root, 'art/export');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function loadPalette() {
  const definition = JSON.parse(await readFile(path.join(root, 'art/palette.json'), 'utf8'));
  const colors = { '.': '#00000000' }, used = new Set();
  if (definition.format !== 'astra.palette/1' || definition.colors.length > 64) throw new Error('invalid palette');
  for (const color of definition.colors) {
    if (color.char.length !== 1 || color.char === '.' || colors[color.char] || colors[color.name] || used.has(color.hex)) throw new Error('duplicate palette color');
    if (rgba(color.hex)[3] !== 255) throw new Error('palette alpha must be opaque');
    colors[color.char] = color.hex; colors[color.name] = color.hex; used.add(color.hex);
  }
  return { definition, colors };
}

export function validateMeta(meta) {
  if (!/^[a-z][a-z0-9]*(\.[a-z0-9_]+)+$/.test(meta.id)) throw new Error(`invalid asset id ${meta.id}`);
  if (!Array.isArray(meta.size) || meta.size.length !== 2 || meta.size.some(n => !Number.isInteger(n) || n < 1 || n > 480)) throw new Error(`${meta.id}: invalid frame size`);
  if (!Number.isInteger(meta.frames) || meta.frames < 1 || meta.frames > 256) throw new Error(`${meta.id}: invalid frames`);
  if (!Array.isArray(meta.anchor) || meta.anchor.length !== 2 || meta.anchor.some((n, i) => !Number.isInteger(n) || n < 0 || n > meta.size[i])) throw new Error(`${meta.id}: invalid anchor`);
  if (!meta.animations || Object.keys(meta.animations).length === 0) throw new Error(`${meta.id}: missing animations`);
  for (const [name, animation] of Object.entries(meta.animations)) {
    if (!Array.isArray(animation.frames) || !animation.frames.length || animation.frames.some(n => !Number.isInteger(n) || n < 0 || n >= meta.frames)) throw new Error(`${meta.id}/${name}: invalid animation frame`);
    if (!Number.isFinite(animation.fps) || animation.fps <= 0 || animation.fps > 60 || typeof animation.loop !== 'boolean') throw new Error(`${meta.id}/${name}: invalid animation timing`);
  }
  if (meta.nineSlice && (meta.nineSlice.length !== 4 || meta.nineSlice.some(n => !Number.isInteger(n) || n < 0) || meta.nineSlice[0] + meta.nineSlice[2] >= meta.size[0] || meta.nineSlice[1] + meta.nineSlice[3] >= meta.size[1])) throw new Error(`${meta.id}: invalid nineSlice`);
}

export function validatePixels(image, colors) {
  if (image.data.length !== image.width * image.height * 4) throw new Error('invalid pixel size');
  const allowed = new Set(Object.values(colors).map(rgba).filter(color => color[3] === 255).map(color => color.slice(0, 3).join(',')));
  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = image.data[i + 3];
    if (alpha !== 0 && alpha !== 255) throw new Error(`pixel ${i / 4}: alpha must be 0 or 255`);
    if (alpha && !allowed.has([...image.data.subarray(i, i + 3)].join(','))) throw new Error(`pixel ${i / 4}: color outside palette`);
    if (!alpha && image.data.subarray(i, i + 3).some(Boolean)) throw new Error(`pixel ${i / 4}: transparent pixel must be canonical zero`);
  }
}

export function renderPixelSource(source, colors) {
  const meta = { ...source, frames: source.frames.length };
  validateMeta(meta);
  const [width, height] = source.size, output = new PixelCanvas(width * meta.frames, height, colors);
  source.frames.forEach((frame, index) => {
    if (frame.length !== height || frame.some(row => row.length !== width)) throw new Error(`${source.id}: pixel frame width/height differs from size`);
    frame.forEach((row, y) => [...row].forEach((color, x) => output.px(index * width + x, y, color)));
  });
  return output;
}

async function sources(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sources(file));
    else if (/\.(json|mjs)$/.test(entry.name)) files.push(file);
  }
  return files.sort();
}

export async function renderAll() {
  const { definition, colors } = await loadPalette(), rendered = [], ids = new Set();
  for (const file of await sources(path.join(root, 'art/source'))) {
    let assets;
    if (file.endsWith('.json')) {
      const source = JSON.parse(await readFile(file, 'utf8'));
      assets = [{ meta: { ...source, frames: source.frames.length }, image: renderPixelSource(source, colors) }];
    } else {
      const source = await import(pathToFileURL(file).href);
      assets = source.assets.map(asset => {
        validateMeta(asset.meta);
        const [width, height] = asset.meta.size, image = new PixelCanvas(width * asset.meta.frames, height, colors);
        for (let frame = 0; frame < asset.meta.frames; frame++) {
          const canvas = new PixelCanvas(width, height, colors);
          asset.draw(canvas, { frame, seed: 71025 + frame });
          validatePixels(canvas, colors); image.stamp(canvas, frame * width, 0);
        }
        return { meta: asset.meta, image };
      });
    }
    for (const asset of assets) {
      validateMeta(asset.meta); validatePixels(asset.image, colors);
      if (ids.has(asset.meta.id)) throw new Error(`duplicate id ${asset.meta.id}`);
      ids.add(asset.meta.id);
      const bytes = encodePNG(asset.image);
      if (bytes.length >= 2_000_000) throw new Error(`${asset.meta.id}: PNG exceeds size budget`);
      rendered.push({ ...asset, bytes });
    }
  }
  rendered.sort((a, b) => a.meta.id.localeCompare(b.meta.id, 'en'));
  return { rendered, colors, definition };
}

function manifestFor(rendered) {
  return { format: 'astra.art/1', assets: rendered.map(({ meta, bytes }) => ({
    id: meta.id, file: `${meta.id}.png`, category: meta.category ?? meta.id.split('.')[0], kind: meta.kind ?? 'procedural',
    size: meta.size, anchor: meta.anchor, frames: meta.frames, animations: meta.animations,
    ...(meta.nineSlice ? { nineSlice: meta.nineSlice } : {}), hash: hash(bytes),
  })) };
}

export async function build({ outDir = defaultOutput } = {}) {
  const { rendered } = await renderAll(), manifest = manifestFor(rendered);
  await mkdir(outDir, { recursive: true });
  for (const asset of rendered) await writeFile(path.join(outDir, `${asset.meta.id}.png`), asset.bytes);
  await writeFile(path.join(outDir, 'manifest.json'), json(manifest));
  return manifest;
}

export async function verify({ outDir = defaultOutput } = {}) {
  const { rendered, colors } = await renderAll(), expected = manifestFor(rendered);
  const manifest = JSON.parse(await readFile(path.join(outDir, 'manifest.json'), 'utf8'));
  if (json(manifest) !== json(expected)) throw new Error('manifest mismatch with source metadata');
  for (const asset of rendered) {
    const bytes = await readFile(path.join(outDir, `${asset.meta.id}.png`));
    const image = decodePNG(bytes); validatePixels(image, colors);
    if (image.width !== asset.meta.size[0] * asset.meta.frames || image.height !== asset.meta.size[1]) throw new Error(`${asset.meta.id}: PNG dimension mismatch`);
    if (!bytes.equals(asset.bytes)) throw new Error(`${asset.meta.id}: PNG mismatch with deterministic source`);
  }
  return { assets: rendered.length, frames: rendered.reduce((sum, asset) => sum + asset.meta.frames, 0) };
}

// A tiny original 3x5 audit-label alphabet; no platform fonts enter the PNG build.
const glyphs = Object.fromEntries(Object.entries({
  A:'010101111101101', B:'110101110101110', C:'011100100100011', D:'110101101101110',
  E:'111100110100111', F:'111100110100100', G:'011100101101011', H:'101101111101101',
  I:'111010010010111', J:'001001001101010', K:'101101110101101', L:'100100100100111',
  M:'101111111101101', N:'101111111111101', O:'010101101101010', P:'110101110100100',
  Q:'010101101111011', R:'110101110101101', S:'011100010001110', T:'111010010010010',
  U:'101101101101111', V:'101101101101010', W:'101101111111101', X:'101101010101101',
  Y:'101101010010010', Z:'111001010100111', 0:'111101101101111', 1:'010110010010111',
  2:'110001010100111', 3:'110001010001110', 4:'101101111001001', 5:'111100110001110',
  6:'011100111101111', 7:'111001010010010', 8:'111101111101111', 9:'111101111001110',
  '.':'000000000000010', '-':'000000111000000', ' ':'000000000000000',
}).map(([key, bits]) => [key, bits]));
function label(g, text, x, y) {
  [...text.toUpperCase()].forEach((letter, index) => {
    const glyph = glyphs[letter] ?? glyphs[' '];
    [...glyph].forEach((value, i) => { if (value === '1') g.px(x + index * 4 + i % 3, y + Math.floor(i / 3), 'inkWarm'); });
  });
}
function paintFrame(canvas, asset, frame, x, y, silhouette = false) {
  const [width, height] = asset.meta.size;
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const source = (py * asset.image.width + frame * width + px) * 4;
    if (!asset.image.data[source + 3]) continue;
    if (silhouette) canvas.px(x + px, y + py, 'ink');
    else canvas.data.set(asset.image.data.subarray(source, source + 4), ((y + py) * canvas.width + x + px) * 4);
  }
}
function upscale(canvas, scale, colors) {
  const large = new PixelCanvas(canvas.width * scale, canvas.height * scale, colors);
  for (let y = 0; y < large.height; y++) for (let x = 0; x < large.width; x++) {
    const source = (Math.floor(y / scale) * canvas.width + Math.floor(x / scale)) * 4;
    large.data.set(canvas.data.subarray(source, source + 4), (y * large.width + x) * 4);
  }
  return large;
}

export async function sheet({ outDir = defaultOutput } = {}) {
  const { rendered, colors, definition } = await renderAll();
  const width = 480, rowHeight = 112, height = 24 + Math.ceil(rendered.length / 4) * rowHeight;
  const canvas = new PixelCanvas(width, height, colors).fill('stone4');
  definition.colors.forEach((color, i) => canvas.rect(8 + i * 9, 6, 8, 10, color.char));
  const labels = [];
  rendered.forEach((asset, index) => {
    const cellX = (index % 4) * 120, cellY = 24 + Math.floor(index / 4) * rowHeight;
    canvas.rect(cellX + 4, cellY + 4, 112, 104, 'stone3');
    const [w, h] = asset.meta.size;
    const shown = Math.min(asset.meta.frames, w <= 16 ? 4 : 1);
    const offsetX = cellX + Math.floor((120 - shown * w) / 2), offsetY = cellY + 10;
    for (let frame = 0; frame < shown; frame++) paintFrame(canvas, asset, frame, offsetX + frame * w, offsetY);
    label(canvas, asset.meta.id, cellX + 9, cellY + 96);
    label(canvas, `${w}X${h} - ${asset.meta.frames}F`, cellX + 9, cellY + 103);
    labels.push({ id: asset.meta.id, cell: [cellX, cellY, 120, rowHeight], frames: asset.meta.frames });
  });
  const scale = 3, large = upscale(canvas, scale, colors);
  await mkdir(path.join(outDir, 'sheets'), { recursive: true });
  await writeFile(path.join(outDir, 'sheets/m0.png'), encodePNG(large));
  await writeFile(path.join(outDir, 'sheets/m0.json'), json({ image: 'm0.png', scale, labels }));
  const characters = new PixelCanvas(336, 200, colors).fill('stone4');
  const finn = rendered.find(asset => asset.meta.id === 'char.finn');
  ['down', 'up', 'left', 'right'].forEach((direction, index) => {
    const y = index * 40;
    label(characters, `FINN ${direction} IDLE`, 5, y + 3);
    label(characters, 'WALK', 125, y + 3); label(characters, 'SILHOUETTE', 251, y + 3);
    characters.rect(4, y + 11, 230, 27, 'leaf2').rect(244, y + 11, 88, 27, 'earth3');
    const idleFrames = [...new Set(finn.meta.animations[`idle_${direction}`].frames)];
    idleFrames.forEach((frame, pose) => paintFrame(characters, finn, frame, 9 + pose * 24, y + 13));
    finn.meta.animations[`walk_${direction}`].frames.forEach((frame, pose) => paintFrame(characters, finn, frame, 125 + pose * 24, y + 13));
    paintFrame(characters, finn, idleFrames[0], 260, y + 13, true);
    paintFrame(characters, finn, idleFrames[1], 300, y + 13, true);
  });
  const hob = rendered.find(asset => asset.meta.id === 'char.hob');
  label(characters, 'HOB - IDLE AND SILHOUETTE', 5, 163);
  characters.rect(4, 171, 230, 27, 'leaf2').rect(244, 171, 88, 27, 'earth3');
  [...new Set(hob.meta.animations.idle.frames)].forEach((frame, pose) => paintFrame(characters, hob, frame, 9 + pose * 24, 173));
  paintFrame(characters, hob, 0, 260, 173, true); paintFrame(characters, hob, 1, 300, 173, true);
  await writeFile(path.join(outDir, 'sheets/m0-characters.png'), encodePNG(upscale(characters, 3, colors)));
  const wind = new PixelCanvas(288, 216, colors).fill('stone4');
  for (const [id, y, rowHeight] of [['prop.tree', 0, 72], ['prop.hedge', 72, 40], ['prop.flower', 112, 40], ['prop.lamp', 152, 56]]) {
    const asset = rendered.find(item => item.meta.id === id);
    label(wind, `${id} - ALL POSES`, 5, y + 3);
    wind.rect(4, y + 12, 280, rowHeight - 14, 'leaf2');
    for (let frame = 0; frame < asset.meta.frames; frame++) paintFrame(wind, asset, frame, 14 + frame * 68, y + rowHeight - asset.meta.size[1] - 3);
  }
  await writeFile(path.join(outDir, 'sheets/idle-environment.png'), encodePNG(upscale(wind, 3, colors)));
  // Same native-pixel garden at four times, with deterministic per-object phase offsets.
  const composite = new PixelCanvas(480, 272, colors).fill('stone4');
  const byId = Object.fromEntries(rendered.map(asset => [asset.meta.id, asset]));
  const sampleTimes = [0, 0.75, 1.5, 2.75];
  sampleTimes.forEach((time, sample) => {
    const garden = new PixelCanvas(240, 128, colors);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 15; x++) {
      const coordinate = (x * 17 + y * 31) % 10;
      paintFrame(garden, byId['tile.grass'], coordinate < 7 ? 0 : coordinate - 6, x * 16, y * 16);
      if (y === 7 || (x > 8 && y === 6)) paintFrame(garden, byId['tile.path'], (x + y) % 4, x * 16, y * 16);
    }
    const place = (id, x, y, animation = 'idle') => {
      const asset = byId[id], clip = asset.meta.animations[animation];
      const phase = (x * 7 + y * 11) % clip.frames.length;
      const frame = clip.frames[(Math.floor(time * clip.fps) + phase) % clip.frames.length];
      paintFrame(garden, asset, frame, x - asset.meta.anchor[0], y - asset.meta.anchor[1]);
    };
    for (let x = 8; x < 240; x += 16) place('prop.hedge', x, 16);
    place('prop.tree', 24, 83); place('prop.tree', 64, 74); place('prop.house', 192, 96);
    place('prop.flower', 80, 96); place('prop.flower', 56, 117); place('prop.flower', 144, 76);
    place('prop.lamp', 128, 112, 'lit');
    place('prop.shadow', 101, 114); place('char.finn', 101, 114, 'idle_down');
    place('prop.shadow', 150, 116); place('char.hob', 150, 116);
    const x = sample % 2 * 240, y = Math.floor(sample / 2) * 136;
    label(composite, `IDLE GARDEN T ${String(time).replace('.', '-')} SEC`, x + 4, y + 1);
    composite.stamp(garden, x, y + 8);
  });
  await writeFile(path.join(outDir, 'sheets/idle-garden.png'), encodePNG(upscale(composite, 3, colors)));
  // M1 battle audit is separate from the accepted M0 character/environment
  // sheets. It shows every new pose and preserves the game's native scale.
  const battle = new PixelCanvas(480, 390, colors).fill('stone4');
  ['char.ella', 'char.shade', 'char.faux_sword'].forEach((id, index) => {
    const asset = byId[id], x = index * 160;
    if (!asset) return;
    label(battle, id, x + 5, 4);
    battle.rect(x + 4, 13, 152, 37, 'leaf2');
    [...new Set(asset.meta.animations.idle.frames)].forEach((frame, pose) => paintFrame(battle, asset, frame, x + 12 + pose * 36, 48 - asset.meta.size[1]));
    label(battle, 'IDLE - 6 SEC', x + 5, 55);
  });
  ['portrait.ella', 'portrait.shade'].forEach((id, index) => {
    const asset = byId[id], x = index * 160;
    if (!asset) return;
    label(battle, id, x + 5, 69);
    battle.rect(x + 4, 78, 152, 52, 'stone3');
    paintFrame(battle, asset, 0, x + 54, 80);
  });
  if (byId['prop.pillar']) {
    label(battle, 'PROP.PILLAR', 325, 69);
    battle.rect(324, 78, 152, 52, 'leaf2');
    paintFrame(battle, byId['prop.pillar'], 0, 392, 103);
  }
  ['astral.morning_star', 'astral.laurel', 'astral.ash_hand', 'astral.faux_sword'].forEach((id, index) => {
    const asset = byId[id], x = index % 2 * 240, y = 138 + Math.floor(index / 2) * 54;
    if (!asset) return;
    label(battle, id, x + 5, y);
    battle.rect(x + 4, y + 9, 232, 40, 'earth3');
    [...new Set(asset.meta.animations.idle.frames)].forEach((frame, pose) => paintFrame(battle, asset, frame, x + 16 + pose * 56, y + 13));
  });
  ['fx.hit', 'fx.heal', 'fx.summon'].forEach((id, index) => {
    const asset = byId[id], y = 248 + index * 46;
    if (!asset) return;
    label(battle, `${id} - ONCE`, 5, y);
    battle.rect(4, y + 9, 472, 35, 'water0');
    for (let frame = 0; frame < asset.meta.frames; frame++) paintFrame(battle, asset, frame, 24 + frame * 72, y + 42 - asset.meta.size[1]);
  });
  await writeFile(path.join(outDir, 'sheets/m1-battle.png'), encodePNG(upscale(battle, 3, colors)));

  const battleCharacters = new PixelCanvas(384, 528, colors).fill('stone4');
  ['char.ella', 'char.shade', 'char.faux_sword'].forEach((id, character) => {
    const asset = byId[id];
    if (!asset) return;
    ['down', 'up', 'left', 'right'].forEach((direction, index) => {
      const y = (character * 4 + index) * 44;
      label(battleCharacters, `${id} ${direction}`, 5, y + 1);
      label(battleCharacters, 'IDLE', 118, y + 1); label(battleCharacters, 'WALK', 253, y + 1);
      battleCharacters.rect(4, y + 9, 376, 34, 'leaf2');
      const top = y + 42 - asset.meta.size[1];
      [...new Set(asset.meta.animations[`idle_${direction}`].frames)].forEach((frame, pose) => paintFrame(battleCharacters, asset, frame, 9 + pose * 44, top));
      asset.meta.animations[`walk_${direction}`].frames.forEach((frame, pose) => paintFrame(battleCharacters, asset, frame, 202 + pose * 44, top));
    });
  });
  await writeFile(path.join(outDir, 'sheets/m1-battle-characters.png'), encodePNG(upscale(battleCharacters, 3, colors)));

  const silhouettes = new PixelCanvas(480, 172, colors).fill('stone4');
  const cast = ['char.finn', 'char.ella', 'char.shade', 'char.faux_sword', 'astral.morning_star', 'astral.laurel', 'astral.ash_hand', 'astral.faux_sword'];
  label(silhouettes, 'BATTLE CAST - SHARED NATIVE PIXEL SCALE', 5, 4);
  silhouettes.rect(4, 21, 472, 64, 'earth3').rect(4, 99, 472, 64, 'leaf2');
  cast.forEach((id, index) => {
    const asset = byId[id];
    if (!asset) return;
    const x = 30 + index * 59 - asset.meta.anchor[0];
    paintFrame(silhouettes, asset, 0, x, 76 - asset.meta.anchor[1], true);
    paintFrame(silhouettes, asset, 0, x, 154 - asset.meta.anchor[1]);
    label(silhouettes, String(index + 1), 27 + index * 59, 88);
  });
  await writeFile(path.join(outDir, 'sheets/m1-battle-silhouettes.png'), encodePNG(upscale(silhouettes, 3, colors)));
  const actions = new PixelCanvas(480, 752, colors).fill('stone4');
  ['astral.morning_star', 'astral.laurel', 'astral.ash_hand', 'astral.faux_sword'].forEach((id, index) => {
    const asset = byId[id], top = index * 124;
    if (!asset) return;
    label(actions, `${id} - ATTACK 12 FPS 500MS`, 5, top + 2);
    ['attack_right', 'attack_left', 'hurt'].forEach((tag, row) => {
      const clip = asset.meta.animations[tag], y = top + 12 + row * 36;
      if (!clip) return;
      label(actions, tag === 'hurt' ? 'HURT' : row === 0 ? 'ATTACK R' : 'ATTACK L', 5, y + 13);
      actions.rect(64, y, 412, 34, 'earth3');
      clip.frames.forEach((frame, pose) => paintFrame(actions, asset, frame, 76 + pose * 64, y + 1));
    });
  });
  ['char.ella', 'char.shade', 'char.faux_sword'].forEach((id, index) => {
    const asset = byId[id], x = index * 160;
    if (!asset?.meta.animations.hurt) return;
    label(actions, `${id} HURT`, x + 5, 504);
    actions.rect(x + 4, 515, 152, 40, 'leaf2');
    asset.meta.animations.hurt.frames.forEach((frame, pose) => paintFrame(actions, asset, frame, x + 25 + pose * 68, 551 - asset.meta.size[1]));
  });
  ['fx.leaf_hit', 'fx.ash_hit', 'fx.strike'].forEach((id, index) => {
    const asset = byId[id], y = 568 + index * 60;
    if (!asset) return;
    label(actions, `${id} - ONCE 12 FPS 500MS`, 5, y);
    actions.rect(4, y + 10, 472, 43, 'water0');
    asset.meta.animations.once.frames.forEach((frame, pose) => paintFrame(actions, asset, frame, 20 + pose * 76, y + 46 - asset.meta.size[1]));
  });
  await writeFile(path.join(outDir, 'sheets/m1-battle-actions.png'), encodePNG(upscale(actions, 3, colors)));
  return path.join(outDir, 'sheets/m0.png');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (!['build', 'verify', 'sheet'].includes(command)) { console.error('Usage: node tools/art.mjs build|verify|sheet'); process.exitCode = 1; }
  else {
    try { const result = await ({ build, verify, sheet })[command](); console.log(`art ${command}:`, command === 'build' ? `${result.assets.length} assets` : result); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
