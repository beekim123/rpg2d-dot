// Original 48x48 portraits. The face planes, seams and accessories are drawn
// directly at this resolution and never sampled from a map character frame.
function shoulders(g, main, light, broad = false) {
  const left = broad ? 2 : 5, right = broad ? 45 : 42;
  g.polygon([[left, 47], [left + 2, 39], [15, 34], [32, 34], [right - 2, 39], [right, 47]], 'ink');
  g.polygon([[left + 2, 47], [left + 4, 40], [16, 36], [31, 36], [right - 4, 40], [right - 2, 47]], main);
  g.polygon([[left + 4, 46], [left + 5, 40], [15, 37], [20, 38], [18, 47]], light);
  g.line(right - 8, 41, right - 6, 46, main);
  g.rect(20, 31, 8, 7, 'skin1').rect(20, 31, 5, 6, 'skin2');
}

function face(g, { hair = 'earth0', x = 11, y = 6, width = 26, height = 29, child = false } = {}) {
  g.ellipse(x - 1, y - 1, width + 2, height + 2, 'ink').ellipse(x, y, width, height, hair);
  g.ellipse(x + 2, y + 4, width - 4, height - 4, 'skin1').ellipse(x + 2, y + 4, width - 7, height - 6, 'skin2');
  g.ellipse(x + 4, y + 6, width - 12, height - 12, 'skin3');
  g.ellipse(x - 2, y + 12, 5, 7, 'ink').ellipse(x - 1, y + 13, 4, 5, 'skin2');
  g.ellipse(x + width - 3, y + 12, 5, 7, 'ink').ellipse(x + width - 3, y + 13, 4, 5, 'skin1');
  const eyeY = y + 14, leftEye = x + 6, rightEye = x + width - 9;
  g.line(leftEye - 1, eyeY - 3, leftEye + 2, eyeY - 3, hair).line(rightEye - 1, eyeY - 3, rightEye + 2, eyeY - 3, hair);
  g.rect(leftEye, eyeY, 2, child ? 4 : 3, 'ink').px(leftEye, eyeY, 'stone4');
  g.rect(rightEye, eyeY, 2, child ? 4 : 3, 'ink').px(rightEye, eyeY, 'stone4');
  g.px(x + Math.floor(width / 2), eyeY + 5, 'skin1');
  g.line(x + 10, y + height - 5, x + width - 10, y + height - 5, 'skin0');
  g.line(x + 11, y + height - 4, x + width - 11, y + height - 4, 'skin2');
}

function shortHair(g, main = 'earth0', highlight = 'earth1') {
  g.polygon([[10, 18], [10, 11], [14, 6], [23, 3], [31, 5], [37, 12], [37, 22], [33, 20], [31, 12], [26, 10], [20, 14], [15, 13], [13, 20]], 'ink');
  g.polygon([[12, 16], [12, 11], [16, 7], [23, 5], [30, 7], [35, 12], [35, 19], [33, 12], [26, 8], [20, 12], [15, 11]], main);
  g.line(15, 9, 22, 6, highlight).line(16, 10, 20, 8, highlight);
}

function brio(g) {
  shoulders(g, 'red1', 'red2', true);
  g.polygon([[14, 35], [18, 35], [19, 38], [29, 38], [30, 35], [34, 36], [35, 47], [12, 47]], 'ink');
  g.polygon([[15, 36], [17, 36], [18, 40], [30, 40], [31, 36], [33, 37], [34, 47], [13, 47]], 'stone3');
  g.rect(16, 40, 11, 8, 'stone4').line(19, 43, 28, 43, 'stone2').line(20, 44, 20, 46, 'stone3');
  g.rect(12, 42, 2, 2, 'white').px(29, 45, 'white').px(7, 42, 'stone4').px(38, 44, 'stone4');
  face(g, { x: 8, y: 7, width: 32, height: 28 });
  // A tied red kerchief, not a chef's hat, preserves her broad round head.
  g.polygon([[7, 18], [7, 11], [12, 4], [22, 2], [31, 3], [38, 9], [41, 17], [36, 16], [30, 12], [18, 11], [12, 17]], 'ink');
  g.polygon([[9, 15], [9, 11], [14, 6], [22, 4], [31, 5], [36, 10], [38, 15], [30, 10], [18, 9], [12, 14]], 'red1');
  g.polygon([[11, 11], [15, 7], [22, 5], [30, 6], [33, 9], [20, 8]], 'red2');
  g.line(16, 6, 23, 4, 'red3').px(28, 6, 'red3');
  g.polygon([[38, 12], [44, 10], [43, 16], [46, 20], [40, 20], [37, 16]], 'ink');
  g.polygon([[39, 13], [42, 12], [41, 16], [44, 19], [40, 18], [39, 16]], 'red2');
  g.px(23, 25, 'stone4').px(24, 25, 'stone4').px(32, 28, 'stone4').px(12, 26, 'skin1');
}

function mayor(g) {
  shoulders(g, 'water0', 'water1', true);
  g.polygon([[16, 35], [31, 35], [30, 46], [24, 47], [18, 45]], 'stone4');
  g.polygon([[22, 37], [26, 37], [28, 43], [24, 46], [21, 42]], 'red1').line(23, 38, 24, 43, 'red2');
  g.line(14, 36, 18, 43, 'metal2').line(18, 43, 16, 46, 'metal1');
  g.line(33, 37, 29, 43, 'metal1').px(35, 43, 'earth3');
  face(g, { x: 10, y: 11, width: 29, height: 25, hair: 'stone1' });
  g.ellipse(12, 27, 11, 4, 'stone1').ellipse(25, 27, 11, 4, 'stone1');
  g.line(14, 27, 20, 27, 'stone3').line(27, 27, 32, 27, 'stone2');
  // Flat crown, deep band and broad oval brim distinguish the top hat.
  g.rect(12, 1, 25, 14, 'ink').rect(14, 2, 21, 12, 'metal0').rect(15, 3, 5, 9, 'metal1');
  g.rect(14, 11, 21, 4, 'red1').line(15, 11, 32, 11, 'red2');
  g.ellipse(5, 13, 39, 7, 'ink').ellipse(7, 14, 35, 4, 'metal0').line(10, 14, 29, 14, 'metal1');
}

function mili(g) {
  shoulders(g, 'stone3', 'stone4');
  g.polygon([[15, 36], [20, 37], [24, 41], [29, 37], [33, 36], [35, 47], [13, 47]], 'red1');
  g.polygon([[16, 38], [19, 39], [21, 47], [15, 47]], 'red2');
  g.rect(6, 42, 7, 6, 'gold1').rect(35, 42, 7, 6, 'gold1').line(7, 42, 11, 42, 'gold2');
  face(g, { x: 11, y: 7, width: 26, height: 28, child: true });
  shortHair(g);
  for (const [x, tilt] of [[5, -1], [37, 1]]) {
    g.polygon([[x + 1, 16], [x + 5, 17], [x + 6, 25], [x + 3, 31], [x - 1, 28], [x, 22]], 'ink');
    g.polygon([[x + 1, 18], [x + 4, 18], [x + 4, 25], [x + 2, 28], [x, 27], [x + 1, 23]], 'earth0');
    g.line(x + 1, 19, x + 3, 22, 'earth1').line(x + 1, 23, x + 3, 25, 'earth1');
    g.line(x, 28, x + 4, 28, 'gold1').px(x + 2 + tilt, 30, 'earth1');
  }
}

function hedo(g) {
  shoulders(g, 'earth2', 'earth3');
  g.polygon([[16, 35], [21, 38], [23, 47], [14, 47]], 'leaf1');
  g.polygon([[30, 35], [26, 38], [25, 47], [34, 47]], 'leaf2');
  g.line(18, 39, 20, 46, 'leaf3').px(28, 41, 'earth4');
  face(g, { x: 11, y: 8, width: 26, height: 27, child: true });
  g.polygon([[9, 17], [9, 10], [15, 4], [25, 3], [34, 6], [38, 12], [37, 18]], 'ink');
  g.polygon([[11, 15], [11, 10], [16, 6], [25, 5], [33, 8], [35, 12], [35, 16]], 'stone1');
  g.polygon([[12, 12], [17, 7], [24, 6], [22, 13]], 'stone2');
  g.line(25, 6, 28, 14, 'earth0').line(12, 14, 34, 15, 'earth0');
  g.polygon([[8, 16], [34, 16], [39, 18], [36, 20], [12, 19], [7, 18]], 'ink');
  g.line(10, 17, 34, 17, 'earth0');
  g.rect(29, 9, 4, 3, 'stone3').px(29, 9, 'earth0').px(32, 11, 'earth0');
}

function teya(g) {
  shoulders(g, 'stone2', 'stone3');
  g.polygon([[16, 35], [19, 36], [20, 40], [28, 40], [29, 36], [32, 35], [35, 47], [13, 47]], 'star0');
  g.polygon([[17, 37], [18, 37], [19, 42], [29, 42], [30, 37], [31, 37], [33, 47], [15, 47]], 'star1');
  g.line(18, 44, 28, 44, 'stone3').px(18, 42, 'star2');
  face(g, { hair: 'inkWarm' });
  shortHair(g, 'inkWarm', 'inkLight');
  g.ellipse(34, 10, 9, 11, 'ink').ellipse(35, 11, 7, 9, 'inkWarm').line(37, 12, 39, 14, 'inkLight');
  g.line(38, 4, 38, 21, 'ink').line(39, 4, 39, 21, 'earth3').line(40, 5, 40, 20, 'earth4');
  for (const y of [7, 10, 13, 16, 19]) g.px(39, y, 'earth0');
  g.px(40, 13, 'earth1');
}

function sela(g) {
  shoulders(g, 'water1', 'water2');
  g.polygon([[13, 34], [19, 35], [24, 39], [29, 35], [35, 34], [43, 42], [35, 45], [26, 41], [24, 43], [21, 41], [12, 45], [4, 42]], 'ink');
  g.polygon([[13, 36], [19, 37], [24, 41], [29, 37], [34, 36], [40, 41], [34, 43], [26, 39], [24, 41], [21, 39], [12, 43], [7, 41]], 'stone3');
  g.polygon([[13, 36], [18, 37], [21, 39], [12, 42], [8, 41]], 'stone4');
  g.line(28, 40, 36, 47, 'earth0').line(29, 40, 37, 47, 'earth1');
  g.rect(34, 43, 10, 5, 'ink').rect(35, 44, 8, 4, 'earth0').line(36, 44, 41, 44, 'earth1').px(39, 45, 'stone3');
  face(g);
  shortHair(g);
  g.ellipse(33, 24, 8, 10, 'ink').ellipse(34, 25, 6, 8, 'earth0').line(35, 26, 37, 28, 'earth1');
  g.line(13, 15, 18, 12, 'earth1').line(30, 9, 34, 13, 'earth1');
}

function oren(g) {
  shoulders(g, 'earth0', 'earth1', true);
  g.polygon([[14, 35], [18, 36], [19, 47], [13, 47]], 'metal1').line(15, 38, 15, 46, 'metal2');
  g.polygon([[30, 36], [34, 35], [35, 47], [29, 47]], 'metal0');
  face(g, { hair: 'stone1', x: 10, y: 7, width: 28, height: 29 });
  g.line(15, 28, 21, 29, 'stone1').line(26, 29, 32, 28, 'stone1').px(14, 26, 'skin1');
  g.polygon([[8, 16], [9, 8], [15, 3], [31, 3], [38, 8], [39, 16]], 'ink');
  g.polygon([[10, 14], [11, 9], [16, 5], [30, 5], [36, 9], [37, 14]], 'metal1');
  g.polygon([[12, 12], [13, 9], [17, 6], [24, 6], [22, 13]], 'metal2');
  g.line(25, 6, 28, 13, 'metal0');
  g.rect(7, 15, 34, 4, 'ink').rect(9, 15, 30, 2, 'metal0').line(10, 15, 29, 15, 'metal1');
  // The short mallet enters the portrait from the shoulder and ends in-frame.
  g.rect(38, 32, 4, 16, 'ink').rect(39, 33, 2, 15, 'earth0').line(39, 35, 39, 44, 'earth1');
  g.rect(33, 29, 13, 7, 'ink').rect(34, 30, 11, 5, 'earth1').rect(34, 30, 7, 2, 'earth3');
  g.line(42, 31, 42, 34, 'earth0');
}

function nemi(g) {
  shoulders(g, 'stone2', 'stone3');
  g.polygon([[14, 35], [20, 38], [21, 47], [12, 47]], 'earth0').line(14, 38, 14, 46, 'earth1');
  g.polygon([[29, 38], [34, 35], [37, 47], [27, 47]], 'inkWarm').line(31, 39, 29, 46, 'earth0');
  g.px(28, 42, 'earth3').px(28, 46, 'earth3');
  face(g);
  shortHair(g);
  g.polygon([[10, 11], [15, 8], [25, 8], [34, 10], [37, 14], [34, 16], [29, 12], [18, 11], [11, 15]], 'ink');
  g.polygon([[12, 11], [16, 9], [25, 9], [33, 11], [35, 14], [33, 14], [29, 11], [18, 10], [12, 13]], 'earth3');
  g.line(15, 10, 23, 10, 'earth4');
  g.polygon([[35, 12], [42, 10], [41, 16], [44, 22], [39, 24], [36, 17]], 'ink');
  g.polygon([[37, 13], [40, 12], [39, 16], [42, 21], [40, 22], [38, 17]], 'earth3').px(39, 13, 'earth4');
}

export const assets = Object.entries({ brio, mayor_tolan: mayor, mili, hedo, teya, sela, oren, nemi }).map(([id, draw]) => ({
  meta: { id: `portrait.${id}`, category: 'portrait', size: [48, 48], anchor: [24, 48], frames: 1, animations: { idle: { frames: [0], fps: 4, loop: true } } },
  draw,
}));
