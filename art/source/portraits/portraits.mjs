// Original portraits, drawn at their own native 48px resolution (never enlarged map sprites).
function shoulders(g, old) {
  g.polygon([[4, 47], [6, 39], [16, 34], [32, 34], [42, 39], [44, 47]], 'ink');
  g.polygon([[7, 47], [8, 40], [18, 36], [31, 36], [40, 40], [42, 47]], 'water0');
  g.polygon([[8, 46], [10, 40], [19, 37], [19, 47]], 'water1');
  g.line(12, 42, 11, 46, 'water2').line(34, 40, 37, 46, 'inkWarm');
  if (old) g.line(24, 38, 24, 47, 'earth2').px(26, 42, 'gold2').px(26, 46, 'gold2');
}
function hob(g) {
  shoulders(g, true);
  g.ellipse(9, 2, 30, 33, 'ink').ellipse(10, 3, 28, 31, 'skin1');
  g.ellipse(11, 3, 23, 27, 'skin2').ellipse(14, 4, 15, 9, 'skin3');
  // Bald scalp, sideburns, brows and a two-wing white moustache make the silhouette.
  g.ellipse(6, 17, 7, 10, 'ink').ellipse(7, 18, 5, 8, 'skin1');
  g.ellipse(35, 17, 7, 10, 'ink').ellipse(36, 18, 5, 8, 'skin1');
  g.line(10, 14, 10, 23, 'metal3').line(11, 15, 11, 22, 'stone4');
  g.line(37, 14, 37, 24, 'metal2').line(36, 15, 36, 24, 'stone4');
  g.line(14, 16, 19, 15, 'stone4').line(28, 15, 33, 16, 'stone4');
  g.rect(16, 18, 2, 3, 'ink').px(16, 18, 'stone4');
  g.rect(29, 18, 2, 3, 'ink').px(29, 18, 'stone4');
  g.ellipse(21, 19, 7, 7, 'skin1').ellipse(21, 19, 5, 5, 'skin3');
  g.line(19, 13, 28, 13, 'skin1').line(21, 10, 27, 10, 'skin2');
  g.polygon([[22, 24], [19, 23], [14, 24], [11, 29], [8, 29], [13, 34], [19, 33], [24, 28]], 'ink');
  g.polygon([[23, 25], [19, 24], [15, 25], [13, 29], [10, 30], [14, 32], [18, 31]], 'stone4');
  g.polygon([[25, 24], [28, 23], [33, 24], [35, 29], [39, 29], [34, 34], [28, 33], [23, 28]], 'ink');
  g.polygon([[25, 25], [28, 24], [32, 25], [34, 30], [37, 30], [33, 32], [29, 31]], 'stone3');
  g.line(28, 25, 32, 27, 'stone4').line(14, 30, 18, 27, 'metal3');
  g.line(22, 31, 25, 31, 'skin0').line(21, 34, 26, 34, 'skin1');
  g.polygon([[13, 36], [21, 35], [23, 39], [19, 43], [16, 39]], 'gold2');
  g.polygon([[26, 35], [33, 36], [30, 41], [26, 39]], 'earth2');
  g.line(16, 37, 20, 37, 'gold3');
}
function finn(g) {
  shoulders(g, false);
  g.ellipse(9, 5, 29, 31, 'ink').ellipse(10, 6, 27, 29, 'skin1');
  g.ellipse(11, 7, 22, 25, 'skin2').ellipse(13, 10, 16, 17, 'skin3');
  g.ellipse(6, 19, 7, 9, 'ink').ellipse(7, 20, 5, 7, 'skin2');
  g.ellipse(35, 19, 7, 9, 'ink').ellipse(36, 20, 5, 7, 'skin1');
  g.polygon([[6, 16], [8, 9], [13, 5], [12, 1], [20, 5], [24, 0], [29, 5], [36, 4], [35, 8], [40, 15], [38, 23], [33, 24], [33, 15], [28, 17], [26, 12], [22, 17], [19, 12], [15, 18], [12, 21], [9, 20]], 'ink');
  g.polygon([[8, 15], [10, 10], [16, 6], [15, 4], [21, 7], [24, 3], [28, 7], [33, 6], [33, 10], [37, 15], [36, 21], [34, 20], [34, 12], [28, 14], [26, 9], [22, 13], [19, 9], [14, 16], [11, 18]], 'earth0');
  g.polygon([[10, 11], [17, 7], [21, 9], [24, 6], [29, 9], [24, 9], [22, 12], [18, 9], [14, 13]], 'earth1');
  g.line(14, 19, 18, 18, 'earth0').line(28, 18, 31, 19, 'earth0');
  g.rect(15, 21, 3, 4, 'ink').px(15, 21, 'white');
  g.rect(28, 21, 3, 4, 'ink').px(28, 21, 'white');
  g.px(21, 26, 'skin1').line(22, 29, 27, 28, 'skin0').px(25, 29, 'stone4');
  g.polygon([[12, 34], [23, 36], [34, 33], [35, 38], [28, 42], [15, 40]], 'ink');
  g.polygon([[13, 35], [23, 37], [33, 34], [33, 38], [27, 40], [16, 39]], 'gold3');
  g.line(16, 39, 26, 41, 'gold2');
  g.polygon([[28, 40], [33, 38], [36, 46], [28, 47]], 'gold2').line(29, 41, 30, 46, 'gold3');
}
export const assets = [
  { meta: { id: 'portrait.hob', category: 'portrait', size: [48, 48], anchor: [24, 48], frames: 1, animations: { idle: { frames: [0], fps: 4, loop: true } } }, draw: hob },
  { meta: { id: 'portrait.finn', category: 'portrait', size: [48, 48], anchor: [24, 48], frames: 1, animations: { idle: { frames: [0], fps: 4, loop: true } } }, draw: finn },
];
