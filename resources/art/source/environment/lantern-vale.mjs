// Original Lantern Vale props and terrain; every shape is drawn with integer pixels.
import { seededRandom } from '../../lib/pixel.mjs';

const idle = { idle: { frames: [0], fps: 4, loop: true } };
const windIdle = { idle: { frames: [0, 0, 1, 1, 2, 2, 0, 0, 3, 3, 0, 0], fps: 3, loop: true } };
function asset(id, size, frames, draw, animations = idle, extras = {}) {
  return { meta: { id, size, anchor: [size[0] / 2, size[1]], frames, animations, kind: 'procedural', ...extras }, draw };
}
function ground(g, { seed, frame }, grass) {
  g.fill(grass ? 'leaf2' : 'earth3');
  if (grass) {
    // Quiet base plus deliberately separated clusters; the map mostly uses frame 0.
    const clusters = [[], [[3, 11]], [[11, 5]], [[4, 4], [11, 12]]][frame];
    for (const [x, y] of clusters) {
      g.line(x, y, x + 1, y, 'leaf3').px(x + 1, y - 1, 'leaf3').px(x - 1, y + 1, 'leaf1');
    }
    return;
  }
  const random = seededRandom(seed);
  // Compact sand patches with broad quiet areas between them.
  for (let n = 0; n < 3; n++) {
    const x = 1 + Math.floor(random() * 12), y = 1 + Math.floor(random() * 12);
    g.rect(x, y, 3, 1, 'earth4').px(x + 2, y + 1, 'earth2');
  }
}
function water(g, { frame }) {
  g.fill('water2');
  for (const [x, y] of [[1, 3], [9, 10], [1, 15]]) {
    const shift = frame ? 2 : 0;
    g.line((x + shift) % 16, y, Math.min(15, x + shift + 4), y, 'water3');
    g.px((x + shift + 4) % 16, (y + 1) % 16, 'water1');
  }
}
function bridge(g) {
  g.fill('earth0');
  for (let x = 0; x < 16; x += 4) {
    g.rect(x, 2, 3, 12, 'earth2').line(x, 2, x, 13, 'earth3');
    g.line(x + 1, 5, x + 1, 8, 'earth1');
    g.px(x + 1, 3, 'metal0').px(x + 1, 12, 'metal0');
  }
  g.line(0, 0, 15, 0, 'inkWarm').line(0, 1, 15, 1, 'earth3');
  g.line(0, 14, 15, 14, 'earth1').line(0, 15, 15, 15, 'inkWarm');
}
function edge(g, { frame: mask }) {
  // Set bits identify neighbouring dirt: N1, E2, S4, W8. Draw over grass.
  const scallop = [3, 2, 1, 1, 1, 2, 3, 3, 2, 1, 1, 1, 2, 3, 3, 3];
  for (let side = 0; side < 4; side++) {
    if (!(mask & 1 << side)) continue;
    for (let along = 0; along < 16; along++) for (let depth = 0; depth <= scallop[along]; depth++) {
      const color = depth < scallop[along] - 1 ? 'earth3' : depth < scallop[along] ? 'leaf1' : 'leaf3';
      const [x, y] = side === 0 ? [along, depth] : side === 1 ? [15 - depth, along] : side === 2 ? [along, 15 - depth] : [depth, along];
      g.px(x, y, color);
    }
  }
}
function lamp(g, { frame }) {
  g.ellipse(3, 28, 11, 4, 'leaf1').rect(5, 28, 6, 3, 'ink').rect(6, 27, 4, 3, 'stone2');
  g.rect(7, 11, 3, 17, 'ink').rect(8, 11, 1, 16, 'earth2');
  g.rect(3, 3, 10, 10, 'ink').rect(4, 4, 8, 8, 'earth0');
  g.rect(5, 5, 6, 6, frame ? 'gold2' : 'water0');
  if (frame) {
    g.rect(6, 5, 3, 4, 'gold3').px(6, 5, 'gold4').px(9, frame === 2 ? 6 : 8, 'gold4');
    if (frame === 3) g.px(8, 6, 'gold4').px(6, 8, 'gold2');
  }
  else g.line(5, 5, 5, 8, 'water1').px(6, 5, 'metal1');
  g.line(7, 4, 7, 11, 'earth0').line(4, 9, 11, 9, 'earth0');
  g.polygon([[2, 4], [5, 1], [10, 1], [13, 4]], 'ink');
  g.line(4, 3, 11, 3, 'earth2').line(5, 2, 9, 2, 'gold2');
  g.rect(4, 12, 8, 2, 'ink').line(5, 12, 10, 12, 'earth2').px(7, 0, 'ink');
}
function tree(g, { frame }) {
  g.ellipse(3, 40, 27, 7, 'leaf1');
  g.polygon([[13, 22], [20, 22], [21, 42], [25, 45], [10, 45], [13, 40]], 'ink');
  g.polygon([[14, 25], [19, 25], [19, 42], [22, 44], [12, 44], [15, 39]], 'earth0');
  g.line(15, 30, 15, 40, 'earth2').line(16, 39, 14, 43, 'earth1');
  g.line(18, 34, 18, 43, 'inkWarm');
  g.line(15, 32, 9, 25, 'earth0').line(19, 34, 25, 27, 'earth0');
  const sway = [0, 1, 0, -1][frame];
  const crown = [[3, 15, 17, 18], [12, 15, 18, 18], [2, 6, 19, 21], [11, 5, 19, 21], [7, 2, 19, 21]];
  for (const [index, leaf] of crown.entries()) {
    const [baseX, y, w, h] = leaf;
    const x = baseX + (index < 2 && frame === 2 ? 1 : sway);
    g.ellipse(x, y, w, h, 'ink');
    g.ellipse(x + 1, y + 1, w - 2, h - 2, 'leaf1');
    g.ellipse(x + 1, y + 1, w - 4, h - 5, 'leaf2');
    g.ellipse(x + 2, y + 2, w - 7, h - 9, 'leaf3');
  }
  for (const [x, y] of [[10, 5], [17, 5], [5, 11], [22, 11], [4, 21], [17, 23]]) g.line(x + sway, y, x + 2 + sway, y, 'leaf4');
  g.line(10 + sway, 29, 13 + sway, 29, 'leaf0').line(22 + sway, 27, 25 + sway, 27, 'leaf0');
}
function hedge(g, { frame }) {
  // A low, uneven hedge fits one map cell; no tall overlapping tree crowns.
  g.ellipse(0, 12, 16, 4, 'leaf1');
  const sway = [0, 1, 0, -1][frame];
  const leftTop = frame === 2 ? 1 : 0;
  g.polygon([[0, 7], [1, 7], [1, 5], [3 + leftTop, 5], [3 + leftTop, 3], [6 + leftTop, 3], [6 + leftTop, 4], [8 + sway, 4], [8 + sway, 2], [11 + sway, 2], [11 + sway, 4], [14, 4], [14, 6], [15, 6], [15, 13], [13, 14], [2, 14], [0, 12]], 'ink');
  g.polygon([[1, 8], [2, 6], [4 + leftTop, 6], [4 + leftTop, 4], [5 + leftTop, 4], [7, 6], [9 + sway, 5], [9 + sway, 3], [10 + sway, 3], [12, 5], [13, 5], [14, 7], [14, 12], [12, 13], [2, 13], [1, 11]], 'leaf0');
  g.ellipse(2 + leftTop, 5, 6, 6, 'leaf1').ellipse(7 + sway, 4, 6, 7, 'leaf1').ellipse(10, 7, 5, 5, 'leaf1');
  g.line(4 + leftTop, 5, 5 + leftTop, 5, 'leaf2').line(9 + sway, 4, 10 + sway, 4, 'leaf2').line(12, 7, 13, 7, 'leaf2');
  g.line(3, 11, 5, 12, 'leaf0').line(8, 10, 8, 12, 'leaf0').px(12, 12, 'leaf0');
}
function house(g) {
  g.ellipse(5, 69, 70, 10, 'leaf1');
  // Raised stone footing, timber facade, and rounded clay roof all read at 1x.
  g.rect(10, 41, 60, 33, 'ink').rect(11, 42, 58, 29, 'earth2');
  g.rect(11, 70, 58, 5, 'stone0').line(12, 70, 68, 70, 'stone3');
  for (let x = 12; x < 67; x += 10) {
    g.line(x, 71, x + 7, 71, 'stone2'); g.line(x + 8, 72, x + 8, 74, 'stone0');
  }
  for (let y = 46; y < 69; y += 6) g.line(12, y, 67, y, 'earth0').line(12, y + 1, 66, y + 1, 'earth3');
  g.rect(12, 40, 4, 30, 'earth0').line(13, 43, 13, 69, 'earth3');
  g.rect(64, 40, 4, 30, 'earth0').line(64, 43, 64, 69, 'earth3');
  // Chimney behind the roof.
  g.rect(56, 7, 10, 23, 'ink').rect(57, 8, 8, 19, 'stone2');
  for (let y = 10; y < 26; y += 5) g.line(57, y, 64, y, 'stone0').px(60 + (y % 2), y + 2, 'stone3');
  g.rect(54, 5, 14, 5, 'ink').rect(55, 6, 12, 2, 'stone3');
  g.polygon([[5, 39], [12, 18], [38, 5], [65, 18], [75, 39], [72, 43], [8, 43]], 'ink');
  g.polygon([[8, 38], [14, 19], [38, 8], [63, 19], [71, 39], [9, 40]], 'red1');
  g.polygon([[9, 35], [15, 20], [38, 9], [60, 19], [64, 35]], 'red2');
  for (let y = 21; y <= 35; y += 7) {
    const inset = y === 21 ? 18 : y === 28 ? 14 : 11;
    g.line(inset, y, 75 - inset, y, 'red0');
    g.line(inset + 1, y + 1, 73 - inset, y + 1, 'red3');
    for (let x = inset + (y % 2 ? 5 : 10); x < 68 - inset; x += 12) g.line(x, y + 2, x - 1, y + 5, 'red1');
  }
  g.line(13, 18, 37, 7, 'earth3').line(9, 39, 70, 39, 'earth0');
  // Front gable and the attic oculus.
  g.polygon([[28, 38], [39, 24], [52, 38]], 'ink');
  g.polygon([[31, 37], [39, 28], [49, 37]], 'earth2');
  g.ellipse(36, 31, 7, 7, 'ink').ellipse(37, 32, 5, 5, 'water1').px(38, 32, 'water3');
  // Deep arch-shaped door with golden knob and stone doorstep.
  g.ellipse(31, 46, 18, 21, 'ink').rect(31, 55, 18, 17, 'ink');
  g.ellipse(33, 48, 14, 18, 'earth0').rect(33, 55, 14, 16, 'earth0');
  g.line(35, 52, 35, 69, 'earth1').line(39, 50, 39, 69, 'earth1').line(43, 52, 43, 69, 'inkWarm');
  g.line(34, 58, 45, 58, 'inkWarm').px(43, 62, 'gold3');
  g.rect(29, 72, 22, 3, 'stone1').line(30, 72, 49, 72, 'stone4');
  for (const x of [18, 53]) {
    g.rect(x, 48, 11, 13, 'ink').rect(x + 1, 49, 9, 10, 'water0');
    g.rect(x + 2, 49, 3, 8, 'water2').line(x + 2, 50, x + 4, 50, 'water3');
    g.line(x + 5, 49, x + 5, 59, 'earth0').line(x + 1, 54, x + 9, 54, 'earth0');
    g.rect(x - 1, 60, 13, 3, 'earth0').line(x, 60, x + 10, 60, 'earth3');
  }
  g.rect(20, 63, 8, 3, 'leaf1').px(21, 62, 'red3').px(25, 62, 'gold3');
}
function flower(g, { frame }) {
  const sway = [0, 1, 0, -1][frame], dip = frame === 2 ? 1 : 0;
  g.ellipse(3, 12, 11, 3, 'leaf1').line(8, 9, 8, 13, 'leaf0').line(8 + sway, 5 + dip, 8, 10, 'leaf0');
  g.line(8, 11, 5 + sway, 8, 'leaf2').px(5 + sway, 9, 'leaf3').line(8, 12, 12, 9, 'leaf2');
  for (const [x, y] of [[6, 3], [9, 3], [5, 6], [10, 6], [7, 8]]) g.rect(x + sway, y + dip, 2, 2, 'stone4');
  g.rect(7 + sway, 5 + dip, 3, 3, 'gold2').px(7 + sway, 5 + dip, 'gold4');
}
function panel(g) {
  g.rect(1, 0, 14, 16, 'ink').rect(0, 1, 16, 14, 'ink');
  g.rect(1, 1, 14, 14, 'earth2').rect(2, 2, 12, 12, 'water0');
  g.line(3, 2, 12, 2, 'ink').line(2, 3, 2, 12, 'ink');
  g.line(3, 13, 12, 13, 'ink').line(13, 3, 13, 12, 'ink');
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) {
    g.px(x, y, 'gold4').px(x - 1, y, 'gold2').px(x + 1, y, 'gold2');
    g.px(x, y - 1, 'gold2').px(x, y + 1, 'gold2');
  }
}
export const assets = [
  asset('tile.grass', [16, 16], 4, (g, options) => ground(g, options, true)),
  asset('tile.path', [16, 16], 4, (g, options) => ground(g, options, false)),
  asset('tile.water', [16, 16], 2, water, { idle: { frames: [0, 1], fps: 4, loop: true } }),
  asset('tile.bridge', [16, 16], 1, bridge),
  asset('tile.edge', [16, 16], 16, edge),
  asset('prop.lamp', [16, 32], 4, lamp, { unlit: { frames: [0], fps: 4, loop: true }, lit: { frames: [1, 1, 2, 1, 3, 1], fps: 4, loop: true }, idle: { frames: [0], fps: 4, loop: true } }),
  asset('prop.tree', [32, 48], 4, tree, windIdle),
  asset('prop.hedge', [16, 16], 4, hedge, windIdle),
  asset('prop.house', [80, 80], 1, house),
  asset('prop.flower', [16, 16], 4, flower, windIdle),
  asset('prop.shadow', [16, 8], 1, g => g.ellipse(1, 3, 14, 5, 'leaf1')),
  asset('ui.panel', [16, 16], 1, panel, idle, { nineSlice: [4, 4, 4, 4] }),
];
