// ASTRA original story still candidates. No fonts, raster inputs or platform canvas.
// Native 480x270 pixels; the last 95 rows remain quiet for the DialogueBox.
// This module is self-contained so moving it from drafts/ to source/story/ is safe.
const idle = { idle: { frames: [0], fps: 4, loop: true } };
function asset(id, draw) {
  return { meta: { id, category: 'scene', kind: 'procedural', size: [480, 270], anchor: [0, 0], frames: 1, animations: idle }, draw };
}

function fourPoint(g, x, y, horizontal, vertical, color) {
  g.polygon([[x, y - vertical], [x + 3, y - 3], [x + horizontal, y], [x + 3, y + 3],
    [x, y + vertical], [x - 3, y + 3], [x - horizontal, y], [x - 3, y - 3]], color);
}

function farStars(g) {
  // A few authored clusters leave broad empty sky; no random speckling.
  for (const [x, y] of [[42, 28], [111, 53], [177, 21], [215, 91], [282, 18], [407, 32], [443, 76]]) {
    g.px(x, y, 'metal1').px(x + 1, y, 'metal1');
  }
  for (const [x, y] of [[82, 79], [155, 46], [389, 96]]) {
    g.line(x - 1, y, x + 1, y, 'metal2').px(x, y - 1, 'metal1');
  }
  g.line(303, 89, 305, 89, 'water1').px(307, 88, 'water1');
}

function quietGround(g) {
  // These broad, low-contrast ground planes are deliberate dialogue backing.
  g.rect(0, 175, 480, 95, 'ink');
  g.polygon([[0, 175], [123, 175], [157, 180], [244, 181], [294, 175], [480, 175], [480, 184], [358, 184], [295, 188], [101, 184], [0, 186]], 'inkWarm');
  for (const [x, y, width] of [[18, 199, 24], [77, 203, 11], [393, 197, 29], [433, 218, 16], [25, 239, 19], [100, 249, 12], [367, 250, 26]]) {
    g.line(x, y, x + width, y, 'inkWarm');
    g.line(x + 5, y + 2, x + width - 2, y + 2, 'inkWarm');
  }
}

function distantVillage(g) {
  // Three houses are individually composed, with roof planes larger than windows.
  g.polygon([[12, 147], [30, 135], [47, 147], [47, 169], [12, 169]], 'ink');
  g.polygon([[10, 147], [29, 132], [49, 146], [43, 149], [29, 139], [15, 151]], 'inkWarm');
  g.line(15, 146, 29, 136, 'inkLight').rect(19, 153, 6, 6, 'earth1').rect(20, 154, 3, 4, 'earth3');
  g.polygon([[364, 154], [389, 137], [415, 153], [413, 173], [366, 173]], 'ink');
  g.polygon([[360, 153], [389, 132], [418, 151], [412, 157], [389, 140], [365, 158]], 'inkWarm');
  g.line(368, 150, 389, 136, 'inkLight').rect(403, 136, 5, 10, 'inkWarm');
  g.rect(379, 157, 6, 7, 'earth0').line(380, 158, 383, 158, 'earth2');
  g.polygon([[425, 158], [447, 142], [472, 158], [472, 175], [425, 175]], 'ink');
  g.line(427, 156, 447, 145, 'inkWarm').line(447, 145, 469, 158, 'inkWarm');
}

function smallLamp(g, x, y) {
  // The same square window, copper roof and handle recur in the close-up.
  g.line(x + 3, y + 3, x + 3, y, 'ink').line(x + 3, y, x + 7, y, 'ink').line(x + 7, y, x + 7, y + 3, 'ink');
  g.polygon([[x, y + 5], [x + 3, y + 2], [x + 7, y + 2], [x + 10, y + 5]], 'ink');
  g.line(x + 2, y + 4, x + 8, y + 4, 'earth2');
  g.rect(x + 1, y + 5, 9, 10, 'ink').rect(x + 2, y + 6, 7, 7, 'gold1');
  g.rect(x + 3, y + 7, 4, 4, 'gold2').line(x + 4, y + 7, x + 4, y + 10, 'gold4');
  g.line(x + 5, y + 6, x + 5, y + 12, 'earth0').line(x + 2, y + 11, x + 8, y + 11, 'earth0');
  g.line(x + 2, y + 14, x + 8, y + 14, 'earth1');
}

function watchers(g) {
  // Ordinary people, seen from behind: rounded caps, an apron and a small child.
  // Each silhouette is newly drawn at this illustration's native pixel scale.
  g.polygon([[79, 174], [82, 151], [88, 146], [99, 148], [105, 161], [106, 174]], 'ink');
  g.ellipse(84, 132, 16, 18, 'ink').ellipse(85, 134, 14, 15, 'inkWarm');
  g.polygon([[82, 137], [86, 131], [96, 130], [101, 136], [99, 139], [84, 140]], 'metal0');
  g.line(85, 135, 95, 133, 'metal1').line(88, 150, 84, 166, 'metal0');
  g.line(102, 158, 112, 149, 'ink').line(103, 159, 113, 150, 'inkWarm');
  g.line(111, 145, 111, 173, 'earth0').px(111, 145, 'earth2');
  g.polygon([[114, 174], [116, 148], [123, 143], [135, 146], [141, 157], [143, 174]], 'ink');
  g.ellipse(119, 126, 17, 20, 'ink').ellipse(120, 128, 15, 17, 'earth0');
  g.polygon([[118, 135], [119, 129], [125, 126], [133, 128], [137, 134], [132, 136]], 'inkWarm');
  g.line(122, 128, 128, 127, 'earth1').line(134, 137, 135, 141, 'skin1');
  g.polygon([[119, 148], [130, 147], [135, 154], [134, 171], [116, 171]], 'metal0');
  g.line(119, 151, 117, 164, 'metal1').line(136, 151, 144, 155, 'inkWarm');
  g.line(144, 155, 145, 159, 'skin1');
  g.polygon([[151, 174], [152, 160], [157, 157], [163, 159], [168, 171], [168, 174]], 'ink');
  g.ellipse(153, 147, 12, 13, 'ink').ellipse(154, 149, 10, 10, 'earth0');
  g.line(155, 148, 160, 148, 'earth1').px(164, 153, 'skin1');
  g.polygon([[154, 161], [160, 160], [163, 170], [152, 172]], 'night0');
  g.line(153, 163, 145, 162, 'ink').line(153, 164, 146, 163, 'skin1');
  g.polygon([[180, 174], [180, 150], [185, 143], [195, 143], [203, 153], [207, 174]], 'ink');
  g.ellipse(181, 126, 18, 20, 'ink').ellipse(182, 127, 16, 18, 'inkWarm');
  g.line(183, 130, 184, 137, 'stone0').ellipse(192, 141, 6, 8, 'earth0');
  g.polygon([[183, 150], [193, 147], [200, 156], [199, 173], [181, 173]], 'leaf0');
  g.line(185, 150, 190, 148, 'stone0').line(196, 153, 200, 166, 'inkWarm');
  smallLamp(g, 140, 158);
  g.line(135, 166, 137, 169, 'earth1').px(152, 170, 'earth1');
}

function sky(g) {
  g.fill('water0');
  g.polygon([[0, 103], [44, 109], [81, 103], [126, 117], [187, 107], [235, 113], [282, 99], [335, 108], [390, 97], [438, 108], [479, 104], [479, 175], [0, 175]], 'night0');
  g.polygon([[0, 134], [67, 120], [133, 126], [190, 119], [257, 136], [319, 122], [378, 128], [440, 118], [479, 130], [479, 175], [0, 175]], 'metal0');
  g.polygon([[0, 155], [59, 148], [116, 158], [192, 145], [259, 150], [316, 143], [392, 155], [479, 145], [479, 175], [0, 175]], 'inkWarm');
  farStars(g);
  fourPoint(g, 337, 52, 22, 32, 'water1');
  fourPoint(g, 337, 52, 14, 24, 'gold3');
  fourPoint(g, 337, 52, 8, 17, 'gold4');
  g.rect(335, 50, 5, 5, 'stone4');
  distantVillage(g);
  watchers(g);
  quietGround(g);
}

function shatter(g) {
  g.fill('water0');
  farStars(g);
  // Four separated points retain Tianxin's shape. Their gaps are dark sky,
  // not an explosion, a deity, a figure, or an explanation of its choice.
  g.polygon([[242, 24], [246, 49], [240, 57], [238, 45]], 'gold3');
  g.polygon([[241, 28], [243, 49], [240, 52]], 'gold4');
  g.polygon([[250, 57], [274, 61], [253, 65], [245, 62]], 'gold3');
  g.line(251, 59, 266, 61, 'gold4');
  g.polygon([[242, 68], [247, 75], [242, 98], [238, 76]], 'earth3');
  g.polygon([[242, 72], [244, 77], [242, 91], [240, 77]], 'gold3');
  g.polygon([[231, 57], [238, 61], [232, 66], [209, 62]], 'gold3');
  g.line(217, 61, 231, 59, 'gold4');
  g.polygon([[239, 59], [243, 56], [246, 61], [242, 66], [237, 64]], 'gold4');
  g.line(241, 58, 239, 62, 'water0').line(239, 62, 243, 65, 'water0');
  // Seven small, deliberately different slivers continue the fracture outward.
  const shards = [
    { points: [[193, 44], [196, 47], [202, 49], [198, 45]], color: 'earth3' },
    { points: [[284, 42], [290, 39], [286, 46]], color: 'gold3' },
    { points: [[286, 82], [291, 85], [293, 90], [288, 87]], color: 'earth3' },
    { points: [[203, 91], [207, 87], [209, 84], [208, 91]], color: 'gold2' },
    { points: [[224, 111], [226, 107], [227, 114]], color: 'earth3' },
    { points: [[263, 116], [265, 121], [267, 123], [266, 117]], color: 'gold2' },
    { points: [[319, 66], [323, 65], [321, 68]], color: 'stone3' },
  ];
  for (const shard of shards) g.polygon(shard.points, shard.color);
  g.line(192, 48, 186, 45, 'water1').line(294, 36, 300, 32, 'water1');
  g.line(297, 94, 300, 99, 'water1').line(199, 96, 196, 100, 'water1');
  g.polygon([[0, 133], [42, 123], [91, 129], [139, 116], [192, 135], [250, 127], [306, 139], [365, 120], [413, 128], [479, 118], [479, 175], [0, 175]], 'night0');
  g.polygon([[0, 154], [71, 144], [128, 151], [182, 142], [231, 154], [286, 147], [361, 156], [425, 143], [479, 153], [479, 175], [0, 175]], 'inkWarm');
  distantVillage(g);
  g.polygon([[80, 174], [82, 158], [88, 154], [94, 158], [97, 174]], 'ink');
  g.ellipse(82, 143, 12, 14, 'ink').line(84, 146, 87, 145, 'metal0');
  g.polygon([[100, 174], [101, 164], [105, 161], [111, 164], [113, 174]], 'ink');
  g.ellipse(101, 153, 10, 11, 'ink');
  smallLamp(g, 120, 155);
  quietGround(g);
}

function wheatClump(g, x, y) {
  g.line(x, y + 13, x - 1, y + 2, 'earth1').line(x + 5, y + 13, x + 7, y + 1, 'earth1');
  g.line(x + 2, y + 14, x + 2, y + 5, 'earth0');
  g.line(x - 2, y + 2, x - 2, y + 6, 'earth2').line(x - 1, y + 1, x - 1, y + 5, 'earth3');
  g.line(x + 7, y, x + 7, y + 5, 'earth2').line(x + 8, y + 2, x + 8, y + 4, 'earth1');
  g.line(x, y + 10, x - 4, y + 7, 'earth1').line(x + 4, y + 10, x + 9, y + 7, 'earth1');
}

function fall(g) {
  g.fill('water0');
  g.polygon([[0, 81], [51, 74], [100, 81], [149, 70], [206, 82], [253, 75], [296, 85], [343, 72], [402, 80], [444, 71], [479, 77], [479, 175], [0, 175]], 'night0');
  g.polygon([[0, 101], [55, 90], [112, 99], [175, 88], [234, 96], [282, 91], [339, 104], [394, 91], [479, 100], [479, 175], [0, 175]], 'metal0');
  g.polygon([[0, 123], [65, 107], [136, 115], [195, 104], [242, 112], [215, 131], [142, 152], [0, 161]], 'leaf0');
  g.polygon([[279, 107], [349, 109], [402, 102], [479, 118], [479, 175], [291, 175], [254, 148], [263, 128]], 'leaf0');
  g.polygon([[0, 146], [89, 127], [174, 135], [218, 147], [189, 174], [0, 174]], 'earth0');
  g.polygon([[0, 164], [72, 148], [153, 151], [192, 165], [186, 174], [0, 174]], 'inkWarm');
  g.polygon([[316, 144], [388, 126], [479, 140], [479, 174], [296, 174]], 'inkWarm');
  // A narrow far channel broadens toward the viewer, leaving both banks legible.
  g.polygon([[234, 91], [239, 92], [249, 105], [270, 115], [272, 125], [254, 138], [248, 149], [266, 164], [272, 174], [214, 174], [227, 158], [226, 149], [239, 131], [258, 122], [259, 117], [242, 108]], 'ink');
  g.polygon([[236, 93], [238, 94], [246, 106], [267, 116], [268, 124], [249, 137], [244, 150], [262, 166], [264, 174], [220, 174], [232, 159], [231, 149], [242, 134], [262, 123], [263, 116], [243, 107]], 'water1');
  g.line(241, 107, 245, 110, 'water2').line(258, 124, 264, 121, 'water2');
  g.line(239, 142, 245, 139, 'water0').line(230, 167, 248, 167, 'water2');
  g.line(235, 172, 257, 172, 'water0');
  // Small timber crossing; it is a human landmark, not a magical structure.
  g.polygon([[239, 121], [268, 119], [270, 124], [241, 127]], 'ink');
  g.line(241, 122, 267, 120, 'earth1').line(242, 124, 268, 122, 'earth0');
  for (const x of [243, 251, 260, 267]) g.line(x, 119, x, 124, 'inkWarm');
  g.line(242, 119, 266, 117, 'earth0');
  g.polygon([[341, 117], [352, 107], [365, 117], [365, 132], [341, 132]], 'ink');
  g.polygon([[338, 117], [352, 104], [368, 116], [365, 119], [352, 110], [342, 121]], 'inkWarm');
  g.line(343, 115, 352, 108, 'stone0').rect(347, 120, 4, 5, 'earth1').px(348, 121, 'earth3');
  g.polygon([[383, 122], [391, 115], [403, 123], [403, 133], [383, 133]], 'ink');
  g.line(382, 122, 391, 114, 'inkWarm').line(391, 114, 404, 123, 'inkWarm');
  wheatClump(g, 50, 143); wheatClump(g, 80, 151); wheatClump(g, 134, 145);
  // Fragments cross different depths, without uniform trails or noisy particles.
  g.line(133, 21, 126, 41, 'water1');
  g.polygon([[126, 37], [128, 41], [123, 48], [124, 41]], 'gold3').px(125, 43, 'gold4');
  g.line(290, 12, 281, 37, 'water1');
  g.polygon([[281, 32], [284, 36], [279, 43], [278, 39]], 'earth3');
  g.line(342, 52, 337, 63, 'water1').line(336, 63, 334, 68, 'gold2');
  g.line(198, 61, 193, 75, 'metal0').line(193, 74, 191, 79, 'earth3');
  g.polygon([[109, 112], [113, 117], [110, 125], [106, 121]], 'gold3').line(109, 117, 109, 121, 'gold4');
  g.line(115, 98, 112, 109, 'water1').line(107, 130, 111, 130, 'earth2');
  g.line(254, 99, 251, 110, 'metal1').line(251, 110, 250, 114, 'gold3');
  g.line(248, 133, 254, 133, 'gold3').line(245, 135, 258, 135, 'earth2');
  g.line(251, 137, 255, 137, 'water3');
  g.px(400, 87, 'earth3').line(407, 143, 408, 146, 'gold2');
  g.line(397, 151, 405, 151, 'earth1').px(408, 148, 'earth3');
  quietGround(g);
}

function lamp(g) {
  g.fill('water0');
  // A quiet interior silhouette keeps the hands and ordinary crafted lamp central.
  g.polygon([[0, 57], [61, 53], [98, 72], [122, 117], [113, 175], [0, 175]], 'night0');
  g.polygon([[371, 67], [421, 49], [479, 62], [479, 175], [362, 175]], 'night0');
  g.line(36, 64, 37, 144, 'inkWarm').line(432, 61, 429, 139, 'inkWarm');
  // Hands cradle the base from below; the two palms are drawn independently.
  g.polygon([[119, 158], [157, 144], [177, 130], [198, 126], [217, 134], [232, 135], [237, 140], [234, 150], [223, 156], [202, 159], [178, 174], [129, 174]], 'ink');
  g.polygon([[133, 159], [161, 148], [179, 134], [197, 130], [214, 137], [230, 138], [233, 141], [230, 147], [220, 152], [200, 155], [176, 173], [139, 173]], 'skin1');
  g.polygon([[162, 150], [179, 136], [195, 133], [211, 139], [226, 140], [225, 144], [208, 143], [191, 146], [179, 155]], 'skin2');
  g.line(181, 137, 192, 134, 'skin3').line(187, 145, 202, 140, 'skin3');
  g.line(197, 149, 218, 145, 'skin0').line(201, 153, 222, 149, 'skin0');
  g.polygon([[359, 159], [326, 148], [302, 131], [283, 125], [266, 132], [249, 135], [244, 141], [248, 151], [261, 157], [280, 160], [304, 174], [351, 174]], 'ink');
  g.polygon([[347, 160], [323, 152], [301, 136], [283, 130], [268, 136], [252, 139], [249, 142], [252, 148], [263, 153], [282, 157], [306, 173], [343, 173]], 'skin1');
  g.polygon([[299, 139], [283, 134], [269, 140], [254, 142], [255, 145], [274, 145], [290, 149], [306, 157]], 'skin2');
  g.line(279, 135, 285, 134, 'skin3').line(269, 148, 284, 152, 'skin0');
  g.line(260, 150, 278, 155, 'skin0');
  // Cuffs close the lower silhouette without introducing any named hero emblem.
  g.polygon([[111, 157], [146, 147], [161, 170], [160, 174], [118, 174]], 'ink');
  g.polygon([[115, 159], [144, 151], [157, 173], [121, 173]], 'metal0');
  g.line(117, 160, 140, 153, 'metal1');
  g.polygon([[332, 149], [367, 160], [361, 174], [321, 174], [320, 168]], 'ink');
  g.polygon([[334, 153], [362, 162], [357, 173], [325, 173], [324, 169]], 'metal0');
  g.line(335, 154, 356, 161, 'metal1');
  // A native-resolution close-up of the travel lamp's square copper-and-wood frame.
  g.polygon([[222, 56], [222, 40], [228, 33], [249, 33], [257, 40], [257, 56], [252, 56], [252, 42], [247, 38], [231, 38], [227, 42], [227, 56]], 'ink');
  g.line(224, 42, 224, 53, 'earth2').line(229, 35, 248, 35, 'earth2').line(254, 42, 254, 53, 'earth0');
  g.polygon([[205, 69], [218, 54], [261, 54], [275, 69], [271, 74], [209, 74]], 'ink');
  g.polygon([[210, 67], [220, 58], [258, 58], [269, 67]], 'earth0');
  g.line(217, 61, 260, 61, 'earth2').line(222, 58, 254, 58, 'earth3');
  g.rect(211, 72, 58, 62, 'ink').rect(216, 76, 48, 52, 'earth0');
  g.rect(220, 79, 39, 44, 'water0');
  g.polygon([[222, 81], [226, 81], [223, 112], [222, 115]], 'water1');
  g.line(227, 82, 229, 82, 'metal1').line(254, 91, 254, 107, 'inkWarm');
  g.line(214, 76, 214, 127, 'earth2').line(265, 77, 265, 128, 'inkWarm');
  g.rect(237, 77, 4, 47, 'earth0').line(237, 78, 237, 122, 'earth2');
  g.rect(217, 113, 46, 4, 'earth0').line(219, 113, 260, 113, 'earth2');
  // The wick is unmistakably unlit. Only one tiny mote catches the glass.
  g.ellipse(229, 120, 21, 5, 'inkWarm').line(240, 118, 240, 121, 'earth0');
  g.px(247, 99, 'gold3').px(247, 100, 'earth3').px(246, 99, 'stone3');
  g.polygon([[207, 130], [273, 130], [277, 138], [271, 143], [210, 143], [203, 138]], 'ink');
  g.polygon([[210, 132], [270, 132], [273, 137], [268, 140], [212, 140], [207, 137]], 'earth0');
  g.line(212, 132, 267, 132, 'earth3').line(211, 138, 269, 138, 'earth1');
  g.px(215, 135, 'metal2').px(266, 135, 'metal0');
  quietGround(g);
}

export const assets = [
  asset('scene.legend.sky', sky),
  asset('scene.legend.shatter', shatter),
  asset('scene.legend.fall', fall),
  asset('scene.legend.lamp', lamp),
];
