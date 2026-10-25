// Original Lantern Vale interior furniture, drawn on the shared 16px map scale.
// Wide quiet floor planes keep faces, hands and interactive objects readable.
const still = { idle: { frames: [0], fps: 4, loop: true } };
function asset(id, size, draw, frames = 1) {
  return { meta: { id, size, anchor: [size[0] / 2, size[1]], frames, animations: still, kind: 'procedural' }, draw };
}

function woodFloor(g, { frame }) {
  g.fill('earth1');
  g.line(0, 7, 15, 7, 'earth0').line(0, 15, 15, 15, 'earth0');
  g.line(4, 0, 4, 6, 'earth0').line(12, 8, 12, 14, 'earth0');
  // Grain is a few short marks, never a field of seeded noise.
  const grain = [[], [[8, 3]], [[2, 11]], [[9, 3], [2, 12]]][frame];
  for (const [x, y] of grain) g.line(x, y, x + 2, y, 'earth2').px(x + 3, y + 1, 'earth0');
}

function woodWall(g) {
  g.fill('earth1').rect(0, 0, 16, 4, 'earth2');
  g.line(0, 0, 15, 0, 'earth3').line(0, 4, 15, 4, 'inkWarm');
  g.line(0, 5, 15, 5, 'earth0').line(0, 15, 15, 15, 'ink');
  // Horizontal cap reads as a top plane; upright boards read as the front.
  for (const x of [0, 8]) g.line(x, 6, x, 14, 'earth0').line(x + 1, 6, x + 1, 13, 'earth2');
  g.line(3, 10, 3, 12, 'earth0').line(11, 7, 11, 9, 'earth0');
}

function rug(g) {
  g.rect(1, 1, 14, 14, 'red0').rect(2, 2, 12, 12, 'red1');
  g.line(3, 3, 12, 3, 'stone2').line(3, 12, 12, 12, 'stone2');
  g.line(3, 4, 3, 11, 'stone2').line(12, 4, 12, 11, 'stone2');
  for (const x of [2, 5, 8, 11, 14]) g.px(x, 0, 'stone2').px(x, 15, 'stone1');
  g.line(6, 7, 9, 7, 'red2').line(7, 6, 7, 9, 'red2');
}

function stoneFloor(g) {
  g.fill('stone2');
  g.line(0, 7, 15, 7, 'stone1').line(0, 15, 15, 15, 'stone1');
  g.line(5, 0, 5, 6, 'stone1').line(13, 8, 13, 14, 'stone1');
  g.line(1, 0, 3, 0, 'stone3').line(7, 8, 10, 8, 'stone3');
}

function bed(g) {
  // Tall headboard, pale pillow and a draped cover give a clear sleeping shape.
  g.rect(4, 1, 24, 8, 'ink').rect(5, 2, 22, 6, 'earth0');
  g.line(6, 2, 25, 2, 'earth2').rect(3, 1, 3, 28, 'ink').rect(26, 1, 3, 28, 'ink');
  g.line(4, 2, 4, 27, 'earth2').line(27, 2, 27, 27, 'earth0');
  g.rect(6, 7, 20, 21, 'stone1').rect(7, 7, 18, 18, 'stone3');
  g.rect(8, 8, 15, 6, 'stone2').rect(8, 8, 14, 5, 'stone4');
  g.px(8, 8, 'stone3').px(21, 12, 'stone3');
  g.rect(6, 15, 20, 13, 'red0').rect(7, 15, 17, 12, 'red1');
  g.line(7, 15, 23, 15, 'red3').line(7, 16, 7, 24, 'red2');
  g.line(8, 24, 23, 24, 'stone2').line(22, 18, 22, 22, 'red0');
  g.rect(4, 27, 24, 3, 'ink').line(5, 27, 26, 27, 'earth2').line(5, 28, 26, 28, 'earth0');
  g.rect(4, 30, 3, 2, 'ink').rect(25, 30, 3, 2, 'ink');
}

function table(g) {
  for (const x of [5, 24]) g.rect(x, 10, 3, 13, 'ink').line(x + 1, 12, x + 1, 21, 'earth0');
  g.line(7, 18, 24, 18, 'ink').line(8, 18, 23, 18, 'earth0');
  g.polygon([[3, 3], [27, 3], [30, 8], [30, 13], [1, 13], [1, 8]], 'ink');
  g.polygon([[4, 4], [26, 4], [28, 8], [3, 8]], 'earth2');
  g.rect(2, 9, 28, 3, 'earth0').line(3, 9, 28, 9, 'earth1');
  g.line(5, 4, 25, 4, 'earth3').line(12, 4, 12, 8, 'earth1');
  g.line(5, 7, 9, 7, 'earth3').line(21, 6, 25, 6, 'earth1');
}

function bookshelf(g) {
  g.rect(3, 2, 26, 28, 'ink').rect(5, 5, 22, 22, 'earth0');
  g.rect(2, 1, 28, 4, 'ink').line(3, 2, 28, 2, 'earth3').line(3, 3, 28, 3, 'earth1');
  for (const x of [3, 27]) g.rect(x, 5, 2, 24, 'earth1').line(x, 5, x, 28, 'earth2');
  const books = [[6, 7, 3, 7, 'red1'], [10, 6, 3, 8, 'water1'], [14, 8, 4, 6, 'leaf1'], [19, 7, 3, 7, 'stone2'], [23, 6, 3, 8, 'red0'],
    [6, 19, 4, 7, 'stone2'], [11, 18, 3, 8, 'leaf1'], [15, 20, 3, 6, 'red1']];
  for (const [x, y, width, height, color] of books) {
    g.rect(x, y, width, height, color).line(x, y + 1, x + width - 1, y + 1, 'stone3');
    g.line(x + width - 1, y + 2, x + width - 1, y + height - 1, 'inkWarm');
  }
  g.rect(20, 23, 6, 3, 'water1').line(20, 23, 25, 23, 'stone2');
  for (const y of [14, 26]) g.rect(4, y, 24, 3, 'ink').line(5, y, 26, y, 'earth2').line(5, y + 1, 26, y + 1, 'earth0');
  g.rect(3, 29, 3, 3, 'ink').rect(26, 29, 3, 3, 'ink');
}

function stove(g) {
  g.rect(9, 0, 7, 9, 'ink').rect(10, 1, 5, 7, 'stone0').line(10, 1, 10, 7, 'stone2');
  g.polygon([[5, 7], [18, 7], [21, 12], [21, 28], [2, 28], [2, 12]], 'ink');
  g.polygon([[6, 8], [17, 8], [19, 12], [4, 12]], 'stone3');
  g.rect(3, 13, 17, 15, 'stone2').rect(18, 13, 2, 15, 'stone1');
  g.ellipse(6, 15, 12, 12, 'ink').rect(6, 20, 12, 7, 'ink');
  g.ellipse(8, 17, 8, 9, 'red0').rect(8, 21, 8, 5, 'red0');
  g.line(8, 25, 15, 25, 'gold0').line(10, 24, 14, 24, 'gold1').px(11, 23, 'gold2');
  g.line(3, 18, 5, 18, 'stone0').line(18, 21, 19, 21, 'stone0');
  g.rect(1, 28, 22, 3, 'ink').line(2, 28, 21, 28, 'stone3').line(3, 29, 20, 29, 'stone1');
}

function loaf(g, x, y, width) {
  g.ellipse(x, y, width, 7, 'ink').ellipse(x + 1, y + 1, width - 2, 5, 'earth1');
  g.ellipse(x + 1, y + 1, width - 3, 3, 'earth3');
  g.line(x + 3, y + 1, x + 2, y + 3, 'earth0');
  if (width > 9) g.line(x + 7, y + 1, x + 6, y + 3, 'earth0');
}

function breadCounter(g) {
  g.rect(3, 13, 42, 17, 'ink').rect(4, 14, 40, 14, 'earth0');
  g.rect(7, 16, 34, 11, 'red0').rect(8, 16, 32, 9, 'red1');
  g.rect(10, 15, 4, 11, 'stone3').rect(34, 15, 4, 11, 'stone2');
  g.rect(2, 10, 44, 5, 'ink').rect(3, 10, 42, 3, 'earth2');
  g.line(3, 10, 43, 10, 'earth3').line(4, 13, 44, 13, 'earth0');
  loaf(g, 5, 5, 12); loaf(g, 19, 4, 12); loaf(g, 33, 6, 10);
  // One small bread-shaped plaque reinforces the shop's purpose without text.
  g.ellipse(20, 18, 10, 6, 'earth0').line(22, 19, 26, 19, 'earth2').line(24, 19, 23, 21, 'stone3');
  g.rect(3, 29, 4, 3, 'ink').rect(41, 29, 4, 3, 'ink');
}

function workbench(g) {
  for (const x of [4, 40]) g.rect(x, 15, 4, 17, 'ink').line(x + 1, 18, x + 1, 30, 'earth1');
  g.rect(7, 25, 34, 3, 'ink').line(8, 25, 39, 25, 'earth0');
  g.rect(2, 12, 44, 6, 'ink').rect(3, 12, 42, 4, 'earth2').line(3, 12, 43, 12, 'earth3');
  g.line(3, 16, 44, 16, 'earth0').line(17, 12, 17, 15, 'earth1');
  // Unfinished travel lamp: a strong little handle and an open brass frame.
  g.line(9, 3, 9, 1, 'ink').line(9, 1, 14, 1, 'ink').line(14, 1, 14, 3, 'ink');
  g.rect(7, 4, 10, 9, 'ink').rect(8, 5, 8, 7, 'earth0');
  g.rect(9, 5, 6, 6, 'stone1').line(10, 5, 10, 10, 'gold2');
  g.line(8, 11, 15, 11, 'gold1').line(8, 4, 15, 4, 'earth3');
  // Hammer and coiled wire, kept apart so the surface stays readable.
  g.line(26, 10, 32, 5, 'ink').line(27, 10, 32, 6, 'earth0');
  g.polygon([[29, 3], [31, 2], [36, 7], [34, 9]], 'ink');
  g.line(31, 3, 35, 7, 'metal2').line(30, 4, 34, 8, 'metal0');
  g.ellipse(37, 9, 6, 4, 'earth0').ellipse(38, 10, 4, 2, 'earth3');
  g.rect(24, 18, 15, 5, 'earth0').line(25, 18, 37, 18, 'earth1').px(31, 20, 'gold2');
}

function barrel(g) {
  g.ellipse(1, 2, 14, 21, 'ink').rect(2, 6, 12, 12, 'ink');
  g.ellipse(2, 3, 12, 19, 'earth0').rect(3, 7, 10, 11, 'earth1');
  g.line(4, 7, 4, 19, 'earth2').line(8, 7, 8, 20, 'earth0').line(11, 7, 11, 19, 'earth0');
  g.ellipse(2, 2, 12, 6, 'ink').ellipse(3, 3, 10, 4, 'earth2');
  g.line(4, 4, 11, 4, 'earth3').line(8, 3, 8, 6, 'earth0');
  for (const y of [8, 17]) g.rect(2, y, 12, 2, 'metal0').line(3, y, 11, y, 'metal1').px(4, y, 'metal2');
}

function crate(g) {
  g.rect(1, 1, 14, 14, 'ink').rect(2, 2, 12, 12, 'earth0');
  g.rect(3, 3, 10, 9, 'earth1').line(3, 3, 12, 3, 'earth3');
  g.line(7, 4, 7, 11, 'earth0').line(11, 4, 11, 11, 'earth0');
  g.line(3, 12, 12, 3, 'earth0').line(3, 11, 11, 3, 'earth2');
  g.line(2, 13, 13, 13, 'earth2').line(2, 2, 2, 12, 'earth2');
  for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) g.px(x, y, 'metal0');
}

function doughCart(g) {
  // Wheels are intentionally exposed: this is the movable puzzle object.
  for (const x of [2, 10]) g.ellipse(x, 19, 4, 5, 'ink').px(x + 1, 21, 'metal2');
  g.rect(1, 14, 14, 6, 'ink').rect(2, 15, 12, 3, 'earth2').line(2, 15, 12, 15, 'earth3');
  g.ellipse(2, 5, 12, 12, 'ink').ellipse(3, 6, 10, 9, 'stone2');
  g.ellipse(3, 6, 9, 7, 'stone3').ellipse(4, 6, 6, 4, 'stone4');
  g.line(5, 11, 7, 12, 'stone2').px(10, 9, 'stone2');
  g.rect(13, 9, 2, 7, 'ink').px(13, 9, 'earth3');
}

function coolingMat(g) {
  // A low blue cloth with four corner ties differs from both dough and crates.
  g.polygon([[3, 4], [12, 4], [15, 12], [13, 14], [2, 14], [0, 12]], 'ink');
  g.polygon([[3, 5], [11, 5], [13, 12], [2, 12]], 'water1');
  g.line(3, 5, 11, 5, 'water3').line(2, 12, 13, 12, 'water0');
  g.line(5, 7, 9, 7, 'stone3').line(5, 10, 10, 10, 'stone2');
  g.line(5, 7, 4, 10, 'stone2').line(9, 7, 10, 10, 'stone2');
  g.px(2, 4, 'stone3').px(12, 4, 'stone3').px(1, 14, 'stone2').px(14, 14, 'stone2');
}

export const assets = [
  asset('tile.wood_floor', [16, 16], woodFloor, 4),
  asset('tile.wood_wall', [16, 16], woodWall),
  asset('tile.rug', [16, 16], rug),
  asset('tile.stone_floor', [16, 16], stoneFloor),
  asset('prop.bed', [32, 32], bed),
  asset('prop.table', [32, 24], table),
  asset('prop.bookshelf', [32, 32], bookshelf),
  asset('prop.stove', [24, 32], stove),
  asset('prop.bread_counter', [48, 32], breadCounter),
  asset('prop.workbench', [48, 32], workbench),
  asset('prop.barrel', [16, 24], barrel),
  asset('prop.crate', [16, 16], crate),
  asset('prop.dough_cart', [16, 24], doughCart),
  asset('prop.cooling_mat', [16, 16], coolingMat),
];
