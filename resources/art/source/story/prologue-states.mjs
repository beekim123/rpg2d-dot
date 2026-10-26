// ASTRA original story-state candidates. All poses are authored in native pixels.
// No raster imports: the copied Shade portrait below comes from our own drawing
// in source/portraits/prologue.mjs, so this module can move to source/story/ unchanged.
const idle = { idle: { frames: [0], fps: 4, loop: true } };
function asset(id, size, anchor, category, draw) {
  return { meta: { id, category, kind: 'procedural', size, anchor, frames: 1, animations: idle }, draw };
}

function ellaFallen(g) {
  // A genuinely horizontal side-lying pose: head, shoulder, bent knees and boots
  // have their own contours. This is not a transformed standing character.
  g.polygon([[10, 4], [17, 3], [23, 5], [27, 9], [27, 13], [22, 14], [14, 12], [10, 11]], 'ink');
  g.polygon([[12, 5], [17, 4], [22, 6], [25, 10], [24, 12], [21, 13], [15, 11], [12, 10]], 'leaf1');
  g.polygon([[13, 5], [17, 5], [21, 7], [22, 10], [17, 10], [13, 8]], 'leaf2');
  g.line(18, 6, 22, 9, 'leaf3').line(19, 11, 23, 12, 'leaf0');
  g.polygon([[22, 8], [26, 7], [29, 10], [28, 13], [24, 13], [23, 11]], 'ink');
  g.line(25, 8, 28, 10, 'metal0').line(25, 10, 27, 12, 'metal1');
  g.polygon([[27, 11], [30, 10], [31, 12], [30, 14], [27, 14]], 'ink');
  g.line(28, 12, 30, 12, 'earth0').px(28, 11, 'earth1');
  g.ellipse(1, 3, 13, 10, 'ink').ellipse(2, 4, 11, 8, 'earth0');
  g.ellipse(3, 6, 9, 6, 'skin1').ellipse(3, 6, 7, 4, 'skin2');
  g.line(4, 6, 7, 6, 'skin3');
  g.polygon([[2, 6], [3, 4], [8, 3], [12, 5], [11, 8], [8, 6], [5, 6], [3, 8]], 'earth0');
  g.line(4, 4, 8, 4, 'earth1').line(5, 8, 7, 8, 'ink').px(4, 9, 'skin1');
  g.line(5, 10, 7, 10, 'skin0');
  // Single thick braid curls along the lower edge, separate from the face.
  for (const [x, y] of [[10, 9], [9, 11], [12, 12], [15, 12]]) {
    g.ellipse(x, y, 5, 3, 'ink').line(x + 1, y + 1, x + 3, y + 1, 'earth0').px(x + 1, y, 'earth1');
  }
  g.line(18, 13, 19, 13, 'leaf3').px(20, 13, 'earth0');
  g.polygon([[12, 4], [16, 4], [18, 6], [16, 9], [12, 8], [11, 6]], 'ink');
  g.polygon([[12, 5], [16, 5], [17, 6], [15, 8], [12, 7]], 'metal1');
  g.line(12, 5, 15, 5, 'metal3').line(12, 6, 14, 6, 'metal2');
  g.polygon([[12, 9], [16, 8], [19, 9], [19, 11], [16, 12], [12, 11]], 'ink');
  g.line(13, 9, 17, 9, 'earth0').line(15, 10, 18, 10, 'skin2').px(18, 9, 'skin3');
}

function ellaSleeping(g) {
  // Same bottom-centre anchor as a bed overlay: the face sits over the pillow,
  // and a short green cape covers the torso without painting another mattress.
  g.polygon([[5, 12], [12, 10], [19, 12], [21, 16], [21, 18], [3, 18], [3, 16]], 'ink');
  g.polygon([[6, 13], [12, 12], [18, 13], [19, 16], [19, 17], [5, 17], [4, 16]], 'leaf1');
  g.polygon([[6, 14], [11, 13], [15, 15], [14, 17], [5, 17]], 'leaf2');
  g.line(6, 15, 5, 17, 'leaf3').line(16, 15, 18, 17, 'leaf0');
  g.ellipse(5, 1, 13, 13, 'ink').ellipse(6, 2, 11, 11, 'earth0');
  g.ellipse(6, 4, 10, 9, 'skin1').ellipse(6, 4, 8, 7, 'skin2');
  g.polygon([[5, 6], [6, 3], [10, 1], [15, 3], [18, 6], [17, 11], [14, 10], [14, 6], [10, 5], [7, 7]], 'earth0');
  g.line(7, 3, 11, 2, 'earth1').line(8, 4, 10, 3, 'earth1');
  g.line(7, 8, 9, 8, 'ink').px(6, 9, 'skin1').line(8, 11, 10, 11, 'skin0');
  for (const [x, y] of [[15, 8], [16, 11], [17, 13]]) {
    g.ellipse(x, y, 5, 5, 'ink').ellipse(x + 1, y + 1, 3, 3, 'earth0');
    g.line(x + 1, y + 1, x + 3, y + 2, 'earth1');
  }
  g.line(18, 18, 20, 18, 'leaf3');
  g.polygon([[4, 13], [8, 12], [11, 14], [9, 17], [4, 16]], 'ink');
  g.polygon([[5, 13], [8, 13], [10, 14], [8, 16], [5, 15]], 'metal1');
  g.line(5, 13, 8, 13, 'metal3').px(5, 14, 'metal2');
  g.line(10, 17, 14, 18, 'ink').line(10, 16, 14, 17, 'skin2').px(11, 16, 'skin3');
}

function brokenLamp(g) {
  // The roof and window are readable despite the fallen pole and splintered joint.
  g.line(3, 22, 12, 13, 'ink').line(4, 22, 13, 13, 'earth0').line(4, 21, 11, 14, 'earth2');
  g.line(6, 22, 11, 17, 'ink').line(7, 21, 11, 17, 'earth1');
  g.line(11, 14, 13, 15, 'earth3').px(12, 16, 'ink');
  g.polygon([[8, 9], [12, 4], [18, 3], [22, 7], [18, 9], [11, 12]], 'ink');
  g.polygon([[10, 9], [13, 5], [18, 5], [20, 7], [17, 8], [12, 10]], 'earth0');
  g.line(13, 5, 17, 4, 'earth2').line(11, 8, 13, 6, 'earth3');
  g.polygon([[10, 11], [18, 8], [22, 14], [16, 19], [11, 17]], 'ink');
  g.polygon([[12, 11], [17, 10], [20, 14], [16, 17], [12, 15]], 'water0');
  g.line(12, 11, 16, 10, 'metal1').line(12, 12, 12, 14, 'water1');
  g.line(15, 10, 18, 16, 'earth0').line(12, 15, 19, 12, 'earth0');
  g.line(13, 17, 16, 19, 'earth2').line(16, 19, 20, 16, 'earth0');
  g.line(15, 2, 17, 1, 'ink').line(17, 1, 19, 2, 'ink');
  g.px(14, 3, 'earth2').line(2, 23, 5, 23, 'ink');
}

function travelLamp(g) {
  // This is the one borrowed, returned and entrusted lamp: square glazing,
  // a copper roof, arched carry handle and two wooden window bars.
  g.line(5, 4, 5, 1, 'ink').line(5, 1, 10, 1, 'ink').line(10, 1, 10, 4, 'ink');
  g.line(6, 2, 9, 2, 'earth2');
  g.polygon([[2, 7], [5, 4], [10, 4], [13, 7]], 'ink');
  g.line(4, 6, 11, 6, 'earth2').line(5, 5, 9, 5, 'earth3');
  g.rect(3, 7, 10, 10, 'ink').rect(4, 8, 8, 8, 'earth0');
  g.rect(5, 8, 6, 7, 'gold1').rect(5, 9, 4, 5, 'gold2');
  g.line(7, 9, 6, 12, 'gold3').px(7, 10, 'gold4');
  g.line(8, 8, 8, 15, 'earth0').line(4, 13, 11, 13, 'earth0');
  g.px(4, 8, 'earth3').line(2, 17, 13, 17, 'ink').line(3, 18, 12, 18, 'earth0').line(3, 19, 12, 19, 'ink');
  g.line(4, 17, 10, 17, 'earth2');
}

function starCasket(g) {
  // A sealed, physical metal-and-wood case. No visible captive silhouette.
  g.polygon([[2, 7], [6, 3], [14, 3], [18, 7], [18, 16], [15, 18], [4, 18], [1, 15]], 'ink');
  g.polygon([[3, 7], [7, 4], [14, 4], [16, 7], [13, 10], [5, 10]], 'metal1');
  g.line(7, 4, 13, 4, 'metal3').line(4, 7, 7, 5, 'metal2');
  g.polygon([[3, 9], [6, 11], [14, 11], [17, 8], [17, 15], [14, 17], [4, 17], [2, 14]], 'metal0');
  g.line(4, 11, 4, 15, 'stone1').line(14, 12, 14, 16, 'stone0');
  g.line(6, 11, 12, 11, 'ink').line(7, 10, 10, 10, 'leaf2').px(8, 10, 'leaf3');
  g.rect(8, 12, 4, 4, 'ink').line(9, 12, 10, 12, 'earth2').line(9, 13, 9, 14, 'earth0');
  g.px(4, 16, 'earth2').px(15, 15, 'earth1').px(16, 7, 'earth2');
}

function starPendant(g) {
  g.line(10, 5, 10, 2, 'ink').line(10, 2, 13, 1, 'ink').line(13, 1, 14, 4, 'ink');
  g.line(11, 3, 12, 2, 'earth2').px(13, 3, 'gold2');
  g.polygon([[12, 4], [15, 9], [22, 12], [16, 15], [12, 22], [8, 16], [2, 12], [8, 9]], 'ink');
  g.polygon([[12, 6], [14, 10], [19, 12], [14, 14], [12, 19], [10, 14], [5, 12], [10, 10]], 'earth1');
  g.line(12, 6, 10, 10, 'gold3').line(5, 12, 9, 11, 'earth3');
  g.line(15, 13, 12, 19, 'earth0').px(17, 12, 'earth2');
  g.polygon([[10, 10], [13, 9], [15, 12], [13, 15], [10, 14], [9, 12]], 'inkWarm');
  g.polygon([[11, 10], [13, 10], [14, 12], [12, 14], [10, 12]], 'water0');
  g.px(11, 11, 'gold4').px(12, 11, 'gold3').px(12, 12, 'earth2');
  g.px(13, 13, 'water1');
}

function lightingRod(g) {
  g.line(7, 6, 7, 23, 'ink').line(8, 6, 8, 23, 'earth0').line(9, 7, 9, 22, 'ink');
  g.line(8, 8, 8, 17, 'earth2').line(7, 18, 9, 18, 'earth0');
  g.line(7, 4, 7, 1, 'ink').line(7, 1, 12, 1, 'ink').line(12, 1, 14, 4, 'ink');
  g.line(8, 2, 11, 2, 'metal2').line(12, 3, 13, 4, 'metal1');
  g.polygon([[10, 4], [15, 4], [14, 7], [11, 7]], 'ink');
  g.line(11, 5, 14, 5, 'earth2').line(12, 6, 13, 6, 'earth0');
  g.line(7, 11, 9, 11, 'earth0').px(8, 11, 'earth3').line(7, 22, 9, 22, 'inkWarm');
}

function leafCrown(g) {
  // Real overlapping leaves and a curved twig; no hovering star body is baked in.
  g.line(2, 7, 6, 9, 'ink').line(6, 9, 17, 9, 'ink').line(17, 9, 21, 7, 'ink');
  g.line(3, 7, 7, 8, 'earth0').line(7, 8, 16, 8, 'earth1').line(17, 8, 20, 7, 'earth0');
  const leaves = [
    { edge: [[1, 6], [1, 2], [5, 3], [7, 7], [4, 8]], mid: [[2, 3], [4, 4], [5, 6], [3, 6]], vein: [2, 3, 5, 7] },
    { edge: [[5, 5], [7, 1], [10, 2], [10, 7], [8, 8]], mid: [[7, 3], [8, 2], [9, 4], [8, 6]], vein: [8, 3, 8, 7] },
    { edge: [[10, 6], [10, 2], [12, 0], [15, 3], [14, 7], [12, 8]], mid: [[11, 3], [12, 2], [13, 4], [12, 6]], vein: [12, 3, 12, 7] },
    { edge: [[15, 7], [15, 3], [18, 1], [20, 3], [18, 7]], mid: [[16, 4], [18, 2], [18, 5], [16, 6]], vein: [18, 3, 16, 7] },
    { edge: [[19, 7], [20, 3], [23, 2], [23, 6], [21, 9]], mid: [[21, 4], [22, 3], [22, 6], [20, 7]], vein: [22, 4, 20, 7] },
  ];
  for (const leaf of leaves) {
    g.polygon(leaf.edge, 'ink').polygon(leaf.mid, 'leaf2').line(...leaf.vein, 'leaf3');
  }
  g.line(8, 10, 15, 10, 'leaf0');
}

function paperLantern(g) {
  // Free-standing paper walls on a low folded tray, with the candle protected.
  g.polygon([[3, 5], [5, 2], [7, 4], [10, 2], [12, 5], [13, 13], [10, 17], [5, 17], [2, 13]], 'ink');
  g.polygon([[4, 5], [5, 4], [7, 6], [10, 4], [11, 6], [12, 12], [9, 15], [5, 15], [3, 12]], 'earth3');
  g.polygon([[5, 6], [7, 7], [9, 6], [10, 12], [8, 14], [5, 13]], 'gold2');
  g.line(4, 6, 4, 11, 'stone4').line(10, 5, 11, 11, 'earth1');
  g.line(7, 7, 7, 13, 'earth2').px(6, 10, 'gold4').px(6, 11, 'gold3');
  g.polygon([[1, 14], [6, 16], [10, 16], [14, 14], [12, 18], [8, 19], [3, 18]], 'ink');
  g.polygon([[3, 15], [6, 17], [10, 17], [12, 16], [10, 18], [5, 18]], 'stone2');
  g.line(4, 16, 6, 17, 'stone4').line(7, 17, 10, 17, 'stone3');
}

function shadeCracked(g) {
  // Native portrait geometry copied from this project's portrait.shade source.
  g.polygon([[2, 47], [5, 38], [13, 32], [34, 32], [43, 38], [46, 47]], 'ink');
  g.polygon([[4, 47], [7, 39], [14, 34], [33, 34], [41, 39], [44, 47]], 'inkWarm');
  g.polygon([[7, 46], [10, 39], [17, 35], [20, 47]], 'night0');
  g.line(13, 40, 11, 46, 'inkLight').line(32, 38, 37, 46, 'night0');
  g.polygon([[7, 23], [8, 13], [14, 5], [23, 1], [31, 4], [38, 13], [41, 25], [35, 35], [12, 34]], 'ink');
  g.polygon([[9, 22], [10, 14], [15, 7], [23, 3], [30, 6], [36, 14], [39, 25], [34, 33], [13, 32]], 'night0');
  g.polygon([[13, 17], [18, 10], [26, 7], [32, 13], [35, 24], [30, 32], [17, 31], [11, 24]], 'inkWarm');
  g.polygon([[16, 12], [22, 10], [18, 15], [17, 21], [20, 28], [26, 31], [19, 31], [13, 25], [12, 19]], 'metal0');
  g.line(16, 13, 13, 19, 'metal2').line(13, 19, 15, 25, 'metal1');
  g.line(15, 25, 20, 29, 'metal2').line(20, 29, 25, 30, 'metal1');
  g.polygon([[20, 14], [28, 13], [32, 19], [30, 28], [25, 30], [20, 26], [18, 20]], 'ink');
  g.line(21, 19, 23, 18, 'stone1').line(28, 18, 30, 19, 'stone1');
  g.line(24, 32, 24, 36, 'inkLight').rect(21, 36, 7, 2, 'gold0').px(22, 36, 'gold2');
  g.polygon([[33, 47], [31, 40], [32, 35], [35, 35], [36, 39], [38, 35], [41, 36], [41, 41], [44, 42], [42, 47]], 'ink');
  g.polygon([[34, 46], [33, 40], [33, 36], [34, 36], [35, 41], [38, 37], [40, 37], [39, 42], [42, 43], [41, 46]], 'metal1');
  g.line(34, 37, 35, 42, 'metal3').line(38, 38, 37, 42, 'metal2').line(35, 44, 39, 44, 'metal0');
  // One-pixel fracture and one small missing corner. Everything beneath is dark.
  g.line(14, 23, 16, 25, 'ink').line(16, 25, 16, 27, 'ink').line(16, 27, 19, 29, 'ink');
  g.polygon([[18, 29], [21, 29], [22, 31], [19, 31]], 'ink');
  g.px(13, 23, 'metal2').px(15, 26, 'metal3').px(17, 28, 'metal2').px(22, 30, 'metal1');
}

export const assets = [
  asset('char.ella_fallen', [32, 16], [16, 16], 'character', ellaFallen),
  asset('char.ella_sleeping', [24, 24], [12, 24], 'character', ellaSleeping),
  asset('prop.broken_lamp', [24, 24], [12, 24], 'prop', brokenLamp),
  asset('prop.travel_lamp', [16, 20], [8, 20], 'prop', travelLamp),
  asset('prop.star_casket', [20, 20], [10, 20], 'prop', starCasket),
  asset('prop.star_pendant', [24, 24], [12, 12], 'prop', starPendant),
  asset('prop.lighting_rod', [16, 24], [8, 24], 'prop', lightingRod),
  asset('prop.leaf_crown', [24, 12], [12, 12], 'prop', leafCrown),
  asset('prop.paper_lantern', [16, 20], [8, 20], 'prop', paperLantern),
  asset('portrait.shade_cracked', [48, 48], [24, 48], 'portrait', shadeCracked),
];
