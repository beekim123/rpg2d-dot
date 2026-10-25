// Original 48px portraits, drawn natively rather than scaling map characters.
function ella(g) {
  g.polygon([[3, 47], [5, 39], [14, 34], [32, 34], [43, 39], [46, 47]], 'ink');
  g.polygon([[5, 47], [7, 40], [15, 36], [31, 36], [41, 40], [44, 47]], 'leaf1');
  g.polygon([[8, 47], [9, 41], [16, 37], [20, 40], [18, 47]], 'leaf2');
  g.polygon([[20, 39], [27, 38], [32, 47], [19, 47]], 'earth0');
  g.line(23, 40, 25, 47, 'earth1').line(30, 40, 34, 46, 'leaf0');
  // One steel shoulder and leaf-edged cape are her identity from any scale.
  g.polygon([[4, 38], [13, 34], [19, 38], [17, 44], [5, 44], [2, 41]], 'ink');
  g.polygon([[5, 38], [13, 35], [17, 38], [16, 42], [5, 42], [3, 40]], 'metal1');
  g.polygon([[5, 38], [12, 36], [16, 38], [14, 40], [4, 40]], 'metal3');
  g.line(5, 41, 14, 41, 'metal2');
  g.ellipse(9, 3, 29, 33, 'ink').ellipse(10, 4, 27, 31, 'earth0');
  g.ellipse(12, 9, 23, 25, 'skin1').ellipse(12, 9, 19, 22, 'skin2');
  g.ellipse(14, 11, 14, 17, 'skin3');
  g.ellipse(8, 19, 5, 8, 'ink').ellipse(9, 20, 4, 6, 'skin2');
  g.polygon([[9, 17], [10, 9], [15, 4], [24, 2], [33, 5], [38, 12], [36, 24], [32, 23], [31, 13], [26, 11], [19, 16], [13, 14], [12, 23], [9, 23]], 'ink');
  g.polygon([[11, 16], [12, 10], [16, 6], [24, 4], [31, 6], [35, 12], [34, 21], [33, 13], [26, 8], [19, 13], [13, 12]], 'earth0');
  g.line(14, 9, 23, 5, 'earth1').line(15, 10, 20, 8, 'earth1');
  g.line(14, 18, 18, 17, 'earth0').line(27, 17, 31, 18, 'earth0');
  g.rect(15, 20, 2, 3, 'ink').px(15, 20, 'stone4');
  g.rect(28, 20, 2, 3, 'ink').px(28, 20, 'stone4');
  g.px(22, 25, 'skin1').line(20, 28, 26, 28, 'skin0').line(22, 29, 25, 29, 'skin2');
  // Broad, interleaved single braid hangs outside the cape silhouette.
  for (let y = 24; y <= 42; y += 5) {
    g.ellipse(32, y, 8, 7, 'ink').ellipse(33, y + 1, 6, 5, 'earth0');
    g.line(34, y + 1, 37, y + 4, 'earth1');
  }
  g.rect(34, 43, 4, 2, 'leaf3').polygon([[34, 45], [37, 45], [36, 47], [33, 47]], 'earth0');
  g.line(32, 39, 30, 45, 'leaf3').line(31, 41, 28, 40, 'leaf3').line(30, 43, 33, 42, 'leaf3');
}

function shade(g) {
  g.polygon([[2, 47], [5, 38], [13, 32], [34, 32], [43, 38], [46, 47]], 'ink');
  g.polygon([[4, 47], [7, 39], [14, 34], [33, 34], [41, 39], [44, 47]], 'inkWarm');
  g.polygon([[7, 46], [10, 39], [17, 35], [20, 47]], 'night0');
  g.line(13, 40, 11, 46, 'inkLight').line(32, 38, 37, 46, 'night0');
  g.polygon([[7, 23], [8, 13], [14, 5], [23, 1], [31, 4], [38, 13], [41, 25], [35, 35], [12, 34]], 'ink');
  g.polygon([[9, 22], [10, 14], [15, 7], [23, 3], [30, 6], [36, 14], [39, 25], [34, 33], [13, 32]], 'night0');
  g.polygon([[13, 17], [18, 10], [26, 7], [32, 13], [35, 24], [30, 32], [17, 31], [11, 24]], 'inkWarm');
  // Black crescent mask: the cool rim curves around a visibly dark face plane.
  g.polygon([[16, 12], [22, 10], [18, 15], [17, 21], [20, 28], [26, 31], [19, 31], [13, 25], [12, 19]], 'metal0');
  g.line(16, 13, 13, 19, 'metal2').line(13, 19, 15, 25, 'metal1');
  g.line(15, 25, 20, 29, 'metal2').line(20, 29, 25, 30, 'metal1');
  g.polygon([[20, 14], [28, 13], [32, 19], [30, 28], [25, 30], [20, 26], [18, 20]], 'ink');
  g.line(21, 19, 23, 18, 'stone1').line(28, 18, 30, 19, 'stone1');
  g.line(24, 32, 24, 36, 'inkLight').rect(21, 36, 7, 2, 'gold0').px(22, 36, 'gold2');
  // His single grey glove reaches into the foreground; the other hand is hidden.
  g.polygon([[33, 47], [31, 40], [32, 35], [35, 35], [36, 39], [38, 35], [41, 36], [41, 41], [44, 42], [42, 47]], 'ink');
  g.polygon([[34, 46], [33, 40], [33, 36], [34, 36], [35, 41], [38, 37], [40, 37], [39, 42], [42, 43], [41, 46]], 'metal1');
  g.line(34, 37, 35, 42, 'metal3').line(38, 38, 37, 42, 'metal2').line(35, 44, 39, 44, 'metal0');
}

export const assets = [
  { meta: { id: 'portrait.ella', category: 'portrait', size: [48, 48], anchor: [24, 48], frames: 1, animations: { idle: { frames: [0], fps: 4, loop: true } } }, draw: ella },
  { meta: { id: 'portrait.shade', category: 'portrait', size: [48, 48], anchor: [24, 48], frames: 1, animations: { idle: { frames: [0], fps: 4, loop: true } } }, draw: shade },
];
