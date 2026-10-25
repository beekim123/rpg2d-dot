import { PixelCanvas } from '../../lib/pixel.mjs';

// Original native-resolution companions. Bodies have their own dark hue;
// alternating exterior pixels form a one-pixel star rim, never alpha glow.
function core(g, x, y, color, radius = 3) {
  g.line(x, y - radius, x, y + radius, color).line(x - radius, y, x + radius, y, color);
  g.rect(x - 1, y - 1, 3, 3, color);
}
function morningStar(g) {
  // The chimney, lamp-shade helmet, wide gauntlets and lantern chest read as
  // a short powerful humanoid rather than a generic glowing human silhouette.
  g.rect(10, 2, 4, 3, 'gold0').rect(11, 2, 2, 2, 'gold2');
  g.polygon([[8, 4], [16, 4], [18, 7], [18, 9], [6, 9], [6, 7]], 'gold0');
  g.polygon([[9, 5], [15, 5], [16, 7], [7, 7]], 'gold3');
  g.line(8, 8, 16, 8, 'gold2');
  g.rect(8, 9, 8, 3, 'gold0').px(10, 10, 'gold4').px(14, 10, 'gold4');
  g.polygon([[7, 11], [17, 11], [19, 15], [17, 21], [7, 21], [5, 15]], 'gold0');
  g.polygon([[8, 12], [16, 12], [17, 15], [16, 19], [8, 19], [7, 15]], 'gold3');
  g.rect(9, 12, 7, 8, 'gold0').rect(10, 13, 5, 6, 'gold1');
  core(g, 12, 16, 'gold4', 2);
  g.px(9, 12, 'gold4').line(8, 20, 16, 20, 'gold2');
  g.polygon([[3, 12], [6, 11], [7, 14], [6, 20], [3, 21], [2, 17]], 'gold0');
  g.polygon([[4, 12], [5, 12], [6, 14], [5, 18], [3, 18], [3, 15]], 'gold4');
  g.rect(3, 19, 3, 2, 'gold2').px(3, 19, 'gold4');
  g.polygon([[18, 11], [21, 12], [22, 17], [21, 21], [18, 20], [17, 14]], 'gold0');
  g.polygon([[19, 12], [20, 13], [21, 17], [20, 18], [18, 18]], 'gold2');
  g.line(18, 13, 19, 16, 'gold4').rect(18, 19, 3, 2, 'gold3');
  g.polygon([[7, 21], [11, 21], [10, 25], [6, 26], [6, 24]], 'gold0');
  g.line(8, 22, 7, 25, 'gold4').px(9, 22, 'gold2');
  g.polygon([[13, 21], [17, 21], [18, 25], [18, 26], [14, 25]], 'gold0');
  g.line(14, 22, 15, 25, 'gold2').px(14, 22, 'gold4');
}

function laurel(g) {
  // Leaf crown, narrow waist and two open branch-arms give a distinct outline.
  g.polygon([[7, 7], [4, 4], [5, 2], [8, 4], [10, 2], [12, 5], [15, 2], [17, 3], [19, 2], [18, 6], [15, 8]], 'leaf0');
  g.line(6, 3, 8, 5, 'leaf3').line(10, 3, 11, 5, 'leaf4').line(15, 3, 15, 5, 'leaf3').px(18, 3, 'leaf4');
  g.ellipse(8, 5, 9, 7, 'leaf0').ellipse(9, 6, 7, 5, 'leaf3');
  g.px(10, 7, 'leaf4').px(11, 8, 'leaf0').px(14, 8, 'leaf0');
  g.polygon([[8, 11], [16, 11], [15, 16], [14, 18], [17, 22], [19, 25], [14, 26], [12, 24], [9, 26], [5, 25], [9, 19], [10, 17]], 'leaf0');
  g.polygon([[9, 12], [15, 12], [13, 17], [14, 21], [17, 24], [14, 24], [12, 22], [9, 24], [7, 24], [11, 18]], 'leaf2');
  g.line(10, 12, 11, 17, 'leaf3').line(11, 18, 9, 23, 'leaf4');
  g.line(13, 19, 15, 23, 'leaf3').px(16, 24, 'leaf3');
  core(g, 12, 14, 'gold4', 2);
  g.line(8, 12, 5, 15, 'leaf0').line(5, 15, 3, 12, 'leaf0');
  g.polygon([[3, 12], [2, 8], [5, 10], [5, 12]], 'leaf0');
  g.line(3, 9, 4, 11, 'leaf3').px(5, 14, 'leaf3');
  g.line(16, 12, 19, 15, 'leaf0').line(19, 15, 21, 12, 'leaf0');
  g.polygon([[19, 11], [21, 8], [22, 9], [21, 12]], 'leaf0');
  g.line(21, 9, 20, 11, 'leaf4').px(18, 14, 'leaf3');
  g.polygon([[6, 19], [4, 16], [7, 16], [8, 18]], 'leaf0').px(6, 17, 'leaf3');
  g.polygon([[17, 19], [17, 16], [20, 17], [18, 20]], 'leaf0').px(18, 18, 'leaf3');
}

function ashHand(g) {
  // Four separated fingers and a broad angled thumb identify a glove at 1x.
  g.polygon([[9, 10], [9, 6], [11, 5], [13, 7], [13, 3], [15, 2], [17, 4], [17, 8], [18, 5], [20, 4], [22, 6], [22, 11], [23, 9], [25, 9], [27, 11], [26, 19], [23, 24], [11, 26], [7, 22], [4, 18], [3, 14], [5, 12], [7, 13], [9, 16]], 'metal0');
  g.polygon([[10, 11], [10, 7], [11, 6], [12, 8], [12, 14], [14, 14], [14, 4], [15, 3], [16, 5], [16, 13], [18, 13], [19, 6], [20, 5], [21, 7], [21, 15], [23, 15], [24, 10], [25, 11], [25, 18], [22, 23], [12, 24], [8, 21], [5, 17], [4, 14], [5, 13], [6, 14], [10, 19], [11, 17]], 'metal1');
  g.line(10, 8, 10, 13, 'metal3').line(14, 5, 14, 12, 'metal3').line(19, 7, 19, 13, 'metal2');
  g.line(24, 12, 23, 17, 'metal2').line(5, 14, 8, 18, 'metal3');
  g.polygon([[11, 15], [20, 14], [22, 18], [20, 22], [12, 22], [10, 19]], 'metal2');
  g.line(12, 16, 17, 15, 'metal3');
  core(g, 16, 18, 'white', 3);
  g.line(11, 24, 22, 23, 'metal0').line(12, 25, 21, 24, 'metal2');
  // Dithered smoke lifts from the finger gaps, never translucent clouds.
  g.px(8, 4, 'metal1').px(7, 2, 'metal2').px(18, 2, 'metal1').px(23, 5, 'metal2');
}

function fauxSword(g) {
  // Faceless split helmet and long blade. No eye pixels or warm body colors.
  g.polygon([[8, 3], [14, 3], [17, 6], [16, 10], [9, 11], [6, 7]], 'metal0');
  g.polygon([[9, 4], [13, 4], [15, 6], [14, 9], [9, 9], [8, 7]], 'metal2');
  g.line(9, 5, 12, 4, 'metal3').line(14, 6, 14, 8, 'metal1');
  g.polygon([[7, 11], [16, 11], [18, 16], [15, 20], [8, 20], [5, 16]], 'metal0');
  g.polygon([[8, 12], [15, 12], [16, 16], [14, 19], [9, 19], [7, 16]], 'metal1');
  g.line(8, 13, 8, 16, 'metal3');
  core(g, 12, 15, 'metal3', 3);
  // The dark stepped fissure visibly interrupts all four bright core arms.
  g.px(12, 12, 'metal0').px(12, 13, 'metal0').px(11, 14, 'metal0').px(12, 15, 'metal0').px(13, 16, 'metal0').px(12, 17, 'metal0').px(12, 18, 'metal0');
  g.polygon([[4, 12], [6, 12], [6, 17], [4, 20], [2, 18]], 'metal0');
  g.line(4, 13, 3, 17, 'metal2').px(4, 18, 'metal3');
  g.polygon([[17, 12], [19, 13], [20, 17], [18, 18], [16, 15]], 'metal0');
  g.line(17, 13, 18, 16, 'metal2');
  g.line(20, 7, 20, 23, 'metal0').line(21, 7, 21, 21, 'metal2').px(21, 6, 'metal3');
  g.line(18, 20, 22, 20, 'metal3').px(20, 23, 'metal2');
  g.polygon([[8, 20], [11, 20], [10, 25], [6, 26], [7, 23]], 'metal0');
  g.line(9, 21, 8, 24, 'metal2');
  g.polygon([[13, 20], [15, 20], [17, 25], [14, 26], [13, 24]], 'metal0');
  g.line(14, 21, 15, 24, 'metal1');
}

function limb(g, x0, y0, x1, y1, dark, light) {
  g.line(x0 - 1, y0, x1 - 1, y1, dark).line(x0 + 1, y0, x1 + 1, y1, dark);
  g.line(x0, y0 - 1, x1, y1 - 1, dark).line(x0, y0 + 1, x1, y1 + 1, dark);
  g.line(x0, y0, x1, y1, light);
}

function morningAttack(g, phase) {
  const cx = [10, 9, 10, 10, 11, 12][phase], cy = [15, 16, 15, 15, 15, 15][phase];
  // Weight settles into the back leg; the lantern torso turns while the fist
  // folds inward, cocks back, extends and recoils independently of the feet.
  g.polygon([[7, 21], [11, 21], [10, 24], [6, 26], [5, 25]], 'gold0');
  g.line(8, 22, 7, 25, 'gold3');
  g.polygon([[13, 21], [16, 21], [18, 25], [17, 26], [14, 24]], 'gold0');
  g.line(14, 22, 16, 25, 'gold2');
  g.polygon([[cx - 4, 11], [cx + 4, 11], [cx + 5, 16], [cx + 3, 22], [cx - 4, 21], [cx - 5, 16]], 'gold0');
  g.polygon([[cx - 3, 12], [cx + 3, 12], [cx + 3, 19], [cx - 3, 20]], 'gold3');
  g.rect(cx - 2, cy - 3, 5, 7, 'gold0').rect(cx - 1, cy - 2, 3, 5, 'gold1');
  core(g, cx, cy, 'gold4', 2);
  g.rect(cx - 1, 2, 3, 3, 'gold0').rect(cx, 2, 1, 2, 'gold3');
  g.polygon([[cx - 4, 4], [cx + 3, 4], [cx + 5, 7], [cx + 4, 9], [cx - 5, 9], [cx - 5, 7]], 'gold0');
  g.polygon([[cx - 3, 5], [cx + 2, 5], [cx + 3, 7], [cx - 4, 7]], 'gold3');
  g.rect(cx - 2, 9, 6, 2, 'gold0').px(cx + 2, 9, 'gold4');
  const [hx, hy] = [[14, 15], [6, 14], [20, 13], [20, 15], [17, 18], [18, 19]][phase];
  limb(g, cx + 3, 13, hx - 1, hy + 1, 'gold0', 'gold2');
  g.rect(hx - 2, hy - 2, phase === 2 || phase === 3 ? 5 : 4, 5, 'gold0');
  g.rect(hx - 1, hy - 1, phase === 2 || phase === 3 ? 3 : 2, 3, 'gold4');
  g.line(hx - 1, hy + 2, hx + 1, hy + 2, 'gold2');
  limb(g, cx - 4, 13, cx - 5, 18, 'gold0', 'gold3');
  g.rect(cx - 6, 18, 4, 4, 'gold0').rect(cx - 5, 19, 2, 2, 'gold4');
  if (phase === 2) g.line(15, 10, 18, 10, 'gold4');
  if (phase === 3) g.line(16, 20, 20, 20, 'gold3');
}

function laurelAttack(g, phase) {
  const opening = [0, 1, 3, 4, 2, 0][phase];
  // The crown opens in a fan while two branch arms gather and release leaves.
  g.polygon([[9, 11], [15, 11], [14, 17], [17, 22], [19, 25], [14, 26], [12, 23], [9, 26], [5, 25], [10, 18]], 'leaf0');
  g.polygon([[10, 12], [14, 12], [12, 17], [15, 23], [17, 24], [14, 24], [12, 21], [8, 24], [7, 24], [11, 18]], 'leaf2');
  g.line(11, 18, 9, 23, 'leaf4').line(13, 19, 15, 23, 'leaf3');
  core(g, 12, 14, 'gold4', 2);
  g.ellipse(8, 6, 9, 6, 'leaf0').ellipse(9, 7, 7, 4, 'leaf3');
  g.px(12, 8, 'leaf0').px(15, 8, 'leaf0');
  g.line(9, 6, 6 - opening, 3 + Math.floor(opening / 2), 'leaf0');
  g.line(14, 6, 17 + opening, 3 + Math.floor(opening / 2), 'leaf0');
  g.polygon([[6 - opening, 3 + Math.floor(opening / 2)], [8 - opening, 2], [9 - opening, 5], [7, 7]], 'leaf0');
  g.polygon([[17 + opening, 3 + Math.floor(opening / 2)], [16 + opening, 2], [14 + opening, 5], [16, 7]], 'leaf0');
  g.line(7 - opening, 3, 8 - opening, 5, 'leaf4').line(16 + opening, 3, 15 + opening, 5, 'leaf3');
  g.line(11, 5, 10, 2 + (phase % 2), 'leaf0').px(10, 3, 'leaf4');
  g.line(13, 5, 14, 2, 'leaf0').px(14, 3, 'leaf3');
  const [hx, hy] = [[14, 11], [12, 8], [20, 11], [20, 14], [18, 17], [17, 15]][phase];
  limb(g, 16, 12, hx, hy, 'leaf0', 'leaf3');
  g.polygon([[hx - 1, hy], [hx, hy - 3], [hx + 2, hy - 2], [hx + 1, hy + 1]], 'leaf0').px(hx, hy - 1, 'leaf4');
  const ly = [15, 11, 15, 17, 18, 15][phase];
  limb(g, 8, 12, 4, ly, 'leaf0', 'leaf2');
  g.polygon([[3, ly], [2, ly - 3], [5, ly - 2], [5, ly]], 'leaf0').px(3, ly - 2, 'leaf4');
  if (phase === 2 || phase === 3) {
    g.polygon([[19, 18], [22, 16], [21, 19]], 'leaf3');
    g.polygon([[17, 7], [20, 6], [19, 8]], 'leaf4');
  }
}

const ashPoses = [
  { palm: [[10, 12], [20, 11], [23, 16], [21, 23], [11, 25], [7, 20]], fingers: [[10, 14, 9, 8], [14, 13, 14, 5], [18, 13, 19, 6], [21, 16, 24, 11]], thumb: [10, 21, 5, 16], center: [15, 18] },
  { palm: [[8, 15], [16, 12], [21, 15], [20, 22], [12, 24], [7, 21]], fingers: [[9, 16, 8, 11], [12, 14, 11, 9], [15, 14, 15, 9], [18, 15, 19, 11]], thumb: [9, 21, 5, 18], center: [13, 18] },
  { palm: [[12, 13], [19, 10], [24, 13], [25, 20], [20, 24], [11, 23], [8, 19]], fingers: [[18, 12, 24, 6], [21, 14, 28, 10], [23, 17, 29, 16], [22, 20, 28, 22]], thumb: [12, 20, 6, 16], center: [17, 17] },
  { palm: [[12, 15], [21, 12], [25, 14], [26, 20], [21, 24], [12, 23], [9, 20]], fingers: [[21, 14, 29, 12], [22, 16, 29, 15], [23, 18, 29, 18], [23, 20, 29, 21]], thumb: [13, 21, 9, 15], center: [18, 18] },
  { palm: [[10, 12], [19, 11], [23, 15], [23, 22], [17, 25], [10, 23], [7, 18]], fingers: [[14, 13, 15, 6], [18, 13, 22, 6], [21, 16, 26, 11], [22, 19, 27, 17]], thumb: [11, 20, 5, 15], center: [15, 18] },
  { palm: [[10, 13], [19, 12], [23, 16], [21, 24], [12, 25], [8, 21]], fingers: [[11, 14, 10, 7], [15, 14, 15, 4], [18, 14, 20, 7], [21, 16, 24, 12]], thumb: [10, 21, 5, 17], center: [15, 19] },
];
function ashAttack(g, phase) {
  const pose = ashPoses[phase];
  for (const finger of [...pose.fingers, pose.thumb]) limb(g, ...finger, 'metal0', 'metal2');
  g.polygon(pose.palm, 'metal0');
  const [cx, cy] = pose.center;
  g.ellipse(cx - 5, cy - 4, 10, 10, 'metal1').ellipse(cx - 4, cy - 4, 7, 7, 'metal2');
  g.line(cx - 4, cy - 3, cx, cy - 4, 'metal3');
  core(g, cx, cy, 'white', 3);
  g.line(cx - 4, 24, cx + 4, 23, 'metal0');
  if (phase === 2 || phase === 3) {
    g.px(6, 9 + phase, 'metal2').px(4, 14 + phase, 'metal1').px(8, 24, 'metal3');
  }
}

function fauxAttack(g, phase) {
  const cx = [10, 9, 10, 11, 11, 12][phase];
  g.polygon([[7, 21], [11, 20], [10, 24], [6, 26], [5, 25]], 'metal0');
  g.line(8, 22, 7, 25, 'metal2');
  g.polygon([[13, 20], [16, 21], [18, 25], [16, 26], [13, 23]], 'metal0');
  g.line(14, 22, 16, 25, 'metal1');
  g.polygon([[cx - 4, 11], [cx + 4, 11], [cx + 5, 16], [cx + 2, 21], [cx - 4, 20], [cx - 5, 15]], 'metal0');
  g.polygon([[cx - 3, 12], [cx + 3, 12], [cx + 3, 16], [cx + 1, 19], [cx - 3, 18]], 'metal1');
  core(g, cx, 15, 'metal3', 3);
  g.line(cx, 12, cx - 1, 14, 'metal0').line(cx - 1, 14, cx + 1, 16, 'metal0').line(cx + 1, 16, cx, 18, 'metal0');
  g.polygon([[cx - 3, 3], [cx + 3, 3], [cx + 5, 6], [cx + 3, 10], [cx - 3, 10], [cx - 5, 7]], 'metal0');
  g.polygon([[cx - 2, 4], [cx + 2, 4], [cx + 3, 6], [cx + 2, 9], [cx - 3, 8]], 'metal2').line(cx - 2, 5, cx + 1, 4, 'metal3');
  limb(g, cx - 4, 13, cx - 5, 18, 'metal0', 'metal2');
  const [hx, hy, tx, ty] = [[17, 16, 15, 4], [14, 13, 7, 3], [17, 14, 21, 4], [14, 15, 21, 22], [17, 18, 21, 24], [18, 17, 20, 5]][phase];
  limb(g, cx + 4, 13, hx, hy, 'metal0', 'metal2');
  limb(g, hx, hy, tx, ty, 'metal0', 'metal3');
  g.line(hx - 2, hy + 1, hx + 2, hy - 1, 'metal3').px(hx, hy + 2, 'metal1');
  if (phase === 2) g.line(18, 5, 21, 8, 'metal3');
  if (phase === 3) g.line(18, 22, 21, 19, 'metal3');
}

function companion(id, width, rim, bodyDraw, attackDraw) {
  return {
    meta: { id, category: 'astral', size: [width, 32], anchor: [width / 2, 32], frames: 18, animations: {
      idle: { frames: [0, 1, 2, 3], fps: 4, loop: true },
      attack_right: { frames: [4, 5, 6, 7, 8, 9], fps: 12, loop: false },
      attack_left: { frames: [10, 11, 12, 13, 14, 15], fps: 12, loop: false },
      hurt: { frames: [16, 17], fps: 10, loop: false },
    } },
    draw(g, { frame }) {
      const body = new PixelCanvas(width, 28, g.palette);
      if (frame < 4) {
        bodyDraw(body);
        if (frame % 2 === 1) body.outline(rim);
        g.stamp(body, 0, frame >= 2 ? -1 : 0);
      } else if (frame < 16) {
        attackDraw(body, (frame - 4) % 6);
        g.stamp(frame >= 10 ? body.mirror() : body, 0, 0);
      } else {
        // Recoil closes the attacking limb across the core, with a separate
        // recovering pose. Neither is an idle frame plus a position offset.
        attackDraw(body, frame === 16 ? 1 : 0);
        const cx = width / 2;
        body.line(cx - 2, 12, cx + 2, 16, rim).line(cx - 1, 12, cx + 3, 16, rim);
        g.stamp(body, 0, 0);
      }
      const cx = width / 2;
      for (const [dx, y] of [[-5, 28], [5, 28], [-8, 29], [8, 29], [-6, 30], [6, 30], [-4, 31], [4, 31]]) g.px(cx + dx, y, rim);
    },
  };
}
export const assets = [
  companion('astral.morning_star', 24, 'gold4', morningStar, morningAttack),
  companion('astral.laurel', 24, 'leaf4', laurel, laurelAttack),
  companion('astral.ash_hand', 32, 'metal3', ashHand, ashAttack),
  companion('astral.faux_sword', 24, 'metal3', fauxSword, fauxAttack),
];
