// Original village landmarks, festival objects and wheat-road scenery.
// All motion is baked into integer PNG poses; no runtime sprite rotation.
const still = { idle: { frames: [0], fps: 4, loop: true } };
const breeze = { idle: { frames: [0, 0, 1, 1, 2, 2, 0, 0, 3, 3, 0, 0], fps: 3, loop: true } };
function asset(id, size, draw, frames = 1, animations = still) {
  return { meta: { id, size, anchor: [size[0] / 2, size[1]], frames, animations, kind: 'procedural' }, draw };
}

function wheat(g, { frame }) {
  g.fill('earth1').rect(0, 11, 16, 5, 'earth0');
  const sway = [0, 1, 0, -1][frame];
  // Three separated clumps, with stalks anchored independently of the heads.
  for (const [x, top] of [[3, 3], [8, 1], [12, 5]]) {
    const lean = x === 12 && frame === 2 ? 1 : sway;
    const dip = frame === 2 && x === 8 ? 1 : 0;
    const headX = x + lean, headY = top + dip;
    g.line(x, 13, headX, headY + 4, 'earth2');
    g.line(x, 12, x - 2, 9, 'earth2').line(x, 11, x + 2, 8, 'earth2');
    g.line(headX, headY, headX, headY + 5, 'earth4');
    g.line(headX - 1, headY + 1, headX - 1, headY + 3, 'earth3');
    g.line(headX + 1, headY + 2, headX + 1, headY + 4, 'earth2');
    g.px(headX - 2, headY + 1, 'earth2').px(headX + 2, headY + 2, 'earth3');
  }
  // Root pixels are the same in all four frames, including tile boundaries.
  g.rect(0, 13, 16, 3, 'earth0');
  for (const x of [3, 8, 12]) g.line(x, 13, x, 15, 'earth2').px(x - 1, 15, 'earth1');
}

function sign(g) {
  g.rect(7, 10, 3, 14, 'ink').line(8, 12, 8, 22, 'earth1');
  g.polygon([[1, 3], [11, 3], [15, 7], [11, 12], [1, 12]], 'ink');
  g.polygon([[2, 4], [10, 4], [13, 7], [10, 10], [2, 10]], 'earth1');
  g.line(2, 4, 10, 4, 'earth3').line(2, 10, 10, 10, 'earth0');
  // Carved direction arrow, readable by shape even with a night palette.
  g.line(4, 7, 10, 7, 'stone3').line(8, 5, 10, 7, 'stone3').line(8, 9, 10, 7, 'stone3');
  g.px(2, 6, 'metal0').px(2, 9, 'metal0');
}

function well(g) {
  // Timber frame behind the ring, a dark oval water opening, and warm masonry.
  g.rect(5, 2, 3, 20, 'ink').rect(24, 2, 3, 20, 'ink');
  g.line(6, 3, 6, 20, 'earth2').line(25, 3, 25, 20, 'earth0');
  g.rect(3, 1, 26, 4, 'ink').line(4, 2, 27, 2, 'earth3').line(4, 3, 27, 3, 'earth1');
  g.rect(7, 8, 18, 3, 'ink').line(8, 8, 23, 8, 'earth2');
  g.line(16, 9, 16, 20, 'earth3').line(25, 9, 28, 9, 'metal0').line(28, 9, 28, 13, 'metal0');
  g.ellipse(2, 17, 28, 14, 'ink').rect(2, 21, 28, 4, 'ink');
  g.ellipse(3, 18, 26, 12, 'stone1').rect(3, 21, 26, 4, 'stone2');
  g.ellipse(2, 15, 28, 12, 'ink').ellipse(3, 16, 26, 10, 'stone3');
  g.ellipse(7, 18, 18, 6, 'ink').ellipse(8, 19, 16, 4, 'water0');
  g.line(10, 20, 15, 20, 'water1').line(11, 20, 13, 20, 'water2');
  g.line(6, 17, 11, 17, 'stone4').line(3, 22, 6, 23, 'stone2');
  g.line(6, 26, 6, 28, 'stone0').line(14, 27, 14, 29, 'stone0').line(23, 26, 23, 28, 'stone0');
  g.line(8, 27, 12, 27, 'stone3').line(17, 27, 21, 27, 'stone2');
}

function festivalLantern(g, { frame }) {
  // The post and cap stay still. Warm paper panels flicker without bloom/alpha.
  g.rect(7, 15, 3, 8, 'ink').line(8, 16, 8, 22, 'earth1');
  g.rect(5, 22, 7, 2, 'ink').line(6, 22, 10, 22, 'earth2');
  g.line(7, 1, 7, 3, 'ink').line(8, 1, 8, 3, 'ink');
  g.ellipse(2, 4, 12, 14, 'ink').ellipse(3, 5, 10, 12, 'gold0');
  g.ellipse(3, 5, 8, 10, 'gold1').ellipse(4, 6, 6, 8, 'gold2');
  g.line(4, 7, 4, 11, 'gold3').line(10, 7, 10, 14, 'gold0');
  g.rect(4, 3, 8, 3, 'ink').line(5, 4, 10, 4, 'red2');
  g.rect(4, 16, 8, 3, 'ink').line(5, 16, 10, 16, 'red1');
  const glints = [[[6, 8], [7, 9]], [[6, 7], [6, 8], [7, 10]], [[6, 9], [7, 10]], [[5, 8], [6, 9], [7, 9]]][frame];
  for (const [x, y] of glints) g.px(x, y, 'gold4');
  g.line(7, 5, 7, 7, 'gold0').line(7, 11, 7, 15, 'gold0');
}

// Hand-drawn sail quadrilaterals for four turn positions. Quarter copies use
// exact coordinate swaps at export time; their edges never rely on resampling.
const sailPoses = [
  { edge: [[-2, -5], [-6, -24], [1, -27], [5, -6]], cloth: [[-1, -7], [-4, -23], [0, -25], [3, -7]], spar: [[0, -5], [-2, -25]], rib: [[-3, -17], [1, -18]] },
  { edge: [[0, -6], [5, -27], [13, -24], [5, -3]], cloth: [[2, -7], [6, -25], [11, -23], [5, -6]], spar: [[2, -4], [9, -25]], rib: [[5, -18], [9, -16]] },
  { edge: [[2, -5], [15, -23], [22, -17], [6, -1]], cloth: [[4, -6], [15, -21], [20, -17], [6, -4]], spar: [[3, -3], [18, -20]], rib: [[12, -16], [16, -13]] },
  { edge: [[5, -4], [24, -13], [27, -5], [6, 1]], cloth: [[7, -3], [23, -11], [25, -6], [8, -1]], spar: [[5, -1], [25, -9]], rib: [[16, -8], [18, -4]] },
];
function quarterPoint([x, y], quarter) {
  const point = quarter === 0 ? [x, y] : quarter === 1 ? [-y, x] : quarter === 2 ? [-x, -y] : [y, -x];
  return [point[0] + 32, point[1] + 32];
}

function windmill(g, { frame }) {
  g.ellipse(8, 88, 49, 7, 'leaf1');
  // A tapered plaster mill on a broad stone foundation; all of this is fixed.
  g.polygon([[21, 29], [43, 29], [48, 88], [16, 88]], 'ink');
  g.polygon([[22, 31], [42, 31], [46, 87], [18, 87]], 'stone2');
  g.polygon([[22, 31], [28, 31], [25, 87], [18, 87]], 'stone3');
  g.polygon([[40, 31], [42, 31], [46, 87], [41, 87]], 'stone1');
  g.line(21, 46, 43, 46, 'earth0').line(20, 63, 44, 63, 'earth0');
  g.line(22, 47, 42, 47, 'earth2').line(21, 64, 43, 64, 'earth2');
  g.line(25, 33, 21, 85, 'earth0').line(38, 33, 42, 85, 'earth0');
  g.polygon([[14, 34], [19, 25], [31, 16], [44, 24], [50, 34]], 'ink');
  g.polygon([[17, 33], [21, 26], [31, 19], [42, 26], [47, 33]], 'red1');
  g.polygon([[18, 32], [22, 26], [31, 20], [39, 26], [41, 32]], 'red2');
  g.line(22, 26, 31, 19, 'red3').line(17, 33, 47, 33, 'earth0');
  g.rect(28, 49, 9, 10, 'ink').rect(29, 50, 7, 8, 'water0');
  g.rect(29, 50, 3, 6, 'water1').px(29, 50, 'water3');
  g.line(32, 50, 32, 57, 'earth0').line(29, 54, 35, 54, 'earth0');
  g.ellipse(26, 69, 13, 15, 'ink').rect(26, 76, 13, 12, 'ink');
  g.ellipse(28, 71, 9, 11, 'earth0').rect(28, 77, 9, 10, 'earth0');
  g.line(29, 74, 29, 85, 'earth2').line(32, 72, 32, 86, 'earth1').px(35, 80, 'gold2');
  g.rect(14, 87, 36, 6, 'ink').rect(15, 88, 34, 4, 'stone1');
  g.line(16, 88, 47, 88, 'stone3').line(23, 89, 23, 91, 'stone0').line(40, 89, 40, 91, 'stone0');
  g.rect(25, 90, 15, 4, 'stone0').line(26, 90, 38, 90, 'stone3').line(25, 93, 39, 93, 'ink');
  const pose = sailPoses[frame];
  for (let quarter = 0; quarter < 4; quarter++) {
    const transform = point => quarterPoint(point, quarter);
    g.polygon(pose.edge.map(transform), 'ink');
    g.polygon(pose.cloth.map(transform), quarter < 2 ? 'stone3' : 'stone2');
    g.line(...transform(pose.spar[0]), ...transform(pose.spar[1]), 'earth1');
    g.line(...transform(pose.rib[0]), ...transform(pose.rib[1]), 'earth0');
  }
  g.ellipse(27, 27, 11, 11, 'ink').ellipse(28, 28, 9, 9, 'earth0');
  g.ellipse(29, 29, 6, 6, 'earth2').line(30, 29, 33, 29, 'earth3').px(32, 32, 'metal0');
}

function paperBoat(g) {
  g.polygon([[1, 8], [7, 4], [14, 8], [11, 13], [4, 13]], 'ink');
  g.polygon([[3, 8], [7, 5], [12, 8], [8, 10]], 'stone4');
  g.polygon([[2, 9], [7, 11], [13, 9], [10, 12], [5, 12]], 'stone2');
  g.line(3, 9, 7, 11, 'stone3').line(7, 5, 7, 9, 'stone1');
}

function pendant(g) {
  g.ellipse(6, 1, 4, 5, 'ink').ellipse(7, 2, 2, 3, 'earth2');
  g.polygon([[8, 4], [10, 7], [14, 9], [10, 11], [8, 15], [6, 11], [2, 9], [6, 7]], 'ink');
  g.polygon([[8, 6], [9, 8], [12, 9], [9, 10], [8, 13], [7, 10], [4, 9], [7, 8]], 'earth2');
  g.line(8, 6, 8, 10, 'gold3').line(6, 9, 9, 9, 'gold3').px(8, 8, 'stone4');
  g.px(9, 10, 'earth0').px(8, 12, 'earth0');
}

export const assets = [
  asset('tile.wheat', [16, 16], wheat, 4, breeze),
  asset('prop.sign', [16, 24], sign),
  asset('prop.well', [32, 32], well),
  asset('prop.festival_lantern', [16, 24], festivalLantern, 4, breeze),
  asset('prop.windmill', [64, 96], windmill, 4, { idle: { frames: [0, 0, 1, 1, 2, 2, 3, 3], fps: 4, loop: true } }),
  asset('prop.paper_boat', [16, 16], paperBoat),
  asset('prop.pendant', [16, 16], pendant),
];
