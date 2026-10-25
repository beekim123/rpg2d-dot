import { PixelCanvas } from '../../lib/pixel.mjs';

// Original hard-edged, once-only pixel effects. The empty terminal frame lets
// a consumer hold completion without leaving a stale burst on the battlefield.
function star(g, x, y, radius, color) {
  g.line(x, y - radius, x, y + radius, color).line(x - radius, y, x + radius, y, color);
  if (radius >= 2) g.rect(x - 1, y - 1, 3, 3, color);
}
function hit(g, { frame }) {
  if (frame === 4) return;
  if (frame === 0) { star(g, 8, 8, 2, 'gold4'); return; }
  if (frame === 1) {
    star(g, 8, 8, 6, 'gold2'); star(g, 8, 8, 4, 'gold4');
    g.line(3, 3, 5, 5, 'gold3').line(11, 11, 13, 13, 'gold3').px(12, 4, 'white');
  } else if (frame === 2) {
    g.line(8, 1, 8, 4, 'gold3').line(8, 12, 8, 14, 'gold2').line(1, 8, 4, 8, 'gold4').line(12, 8, 14, 8, 'gold2');
    g.line(2, 2, 4, 4, 'gold3').line(12, 12, 14, 14, 'gold2').px(13, 2, 'gold4').px(2, 13, 'gold3');
  } else {
    for (const [x, y] of [[7, 1], [14, 7], [8, 14], [1, 8], [2, 2], [13, 13]]) g.px(x, y, 'gold2');
  }
}
function heal(g, { frame }) {
  if (frame === 5) return;
  const rise = frame * 2;
  for (const [x, y] of [[5, 18], [12, 15], [18, 20]]) {
    const py = y - rise;
    if (frame === 4) g.px(x, py, 'leaf4');
    else {
      star(g, x, py, frame === 2 ? 2 : 1, 'leaf4');
      g.px(x, py + 2, 'leaf2');
    }
  }
  if (frame < 3) {
    for (const [x, y] of [[3, 18], [6, 21], [10, 22], [15, 22], [19, 20], [21, 17]]) g.px(x, y, frame % 2 ? 'leaf4' : 'leaf3');
    g.line(8, 19, 10, 17, 'leaf2').line(16, 19, 18, 16, 'leaf3');
  }
}
function summon(g, { frame }) {
  if (frame === 5) return;
  const radius = [1, 4, 9, 6, 2][frame];
  star(g, 16, 14, radius, frame % 2 ? 'gold3' : 'gold4');
  if (frame === 2) star(g, 16, 14, 5, 'white');
  const distance = [12, 9, 6, 10, 13][frame];
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = 16 + dx * distance, y = 14 + dy * distance;
    g.px(x, y, 'star3');
    if (frame < 3) g.px(x - dx, y - dy, 'gold2');
  }
  if (frame < 4) for (const [x, y] of [[8, 26], [12, 28], [20, 28], [24, 26], [6, 24], [26, 24]]) g.px(x, y, frame % 2 ? 'gold4' : 'star2');
}
function effect(id, size, frames, fps, draw) {
  const dimensions = Array.isArray(size) ? size : [size, size];
  return { meta: { id, category: 'effect', size: dimensions, anchor: dimensions.map(value => value / 2), frames, animations: { once: { frames: Array.from({ length: frames }, (_, i) => i), fps, loop: false } } }, draw };
}

function leafHit(g, { frame }) {
  if (frame === 5) return;
  if (frame === 0) {
    g.polygon([[12, 7], [15, 11], [12, 16], [9, 12]], 'leaf0');
    g.polygon([[12, 8], [14, 11], [12, 14], [10, 12]], 'leaf4');
    return;
  }
  const reach = [0, 4, 7, 9, 10][frame];
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = 12 + dx * reach, y = 12 + dy * reach;
    if (frame === 4) {
      g.px(x, y, 'leaf3').px(x - dx, y, 'leaf4');
    } else {
      g.polygon([[x - dx * 2, y - dy], [x, y - dy * 2], [x + dx, y + dy], [x - dx, y + dy]], 'leaf0');
      g.line(x - dx, y - dy, x, y, frame === 1 ? 'leaf4' : 'leaf3');
    }
  }
  if (frame === 1) { star(g, 12, 12, 5, 'leaf3'); star(g, 12, 12, 3, 'gold4'); }
  if (frame === 2) {
    g.line(12, 3, 12, 6, 'leaf4').line(12, 18, 12, 21, 'leaf3');
    g.line(3, 12, 6, 12, 'leaf4').line(18, 12, 21, 12, 'leaf3');
  }
  if (frame === 3) g.px(12, 2, 'leaf4').px(21, 12, 'leaf3').px(12, 21, 'leaf4').px(2, 12, 'leaf3');
}

function ashHit(g, { frame }) {
  if (frame === 5) return;
  if (frame === 0) { star(g, 12, 12, 2, 'metal3'); return; }
  if (frame === 1) {
    g.polygon([[3, 12], [8, 10], [6, 6], [11, 9], [13, 3], [15, 9], [20, 6], [17, 12], [22, 14], [16, 16], [18, 20], [12, 18], [7, 21], [8, 16], [2, 16]], 'metal0');
    g.polygon([[6, 13], [10, 12], [11, 8], [13, 11], [17, 10], [15, 14], [18, 15], [13, 16], [10, 18], [10, 15]], 'metal2');
    star(g, 12, 13, 3, 'white');
  } else if (frame === 2) {
    g.line(2, 12, 7, 11, 'metal2').line(18, 13, 22, 12, 'metal3');
    g.line(5, 4, 8, 8, 'metal1').line(17, 17, 21, 21, 'metal2');
    g.line(13, 2, 13, 6, 'metal3').line(9, 18, 6, 22, 'metal1');
    g.rect(4, 16, 3, 2, 'metal1').rect(18, 5, 2, 3, 'metal2');
  } else if (frame === 3) {
    for (const [x, y] of [[3, 9], [5, 3], [14, 2], [21, 5], [21, 17], [17, 21], [5, 20], [2, 16]]) g.rect(x, y, 2, 2, 'metal1');
  } else {
    for (const [x, y] of [[2, 7], [6, 2], [21, 3], [22, 18], [18, 22], [3, 21]]) g.px(x, y, 'metal2');
  }
}

function strikeRight(g, phase) {
  if (phase === 5) return;
  if (phase === 0) {
    g.line(3, 12, 8, 12, 'gold2').line(6, 10, 9, 10, 'gold3').px(7, 14, 'gold3');
    return;
  }
  if (phase === 4) {
    for (const [x, y] of [[22, 7], [27, 9], [30, 12], [27, 17], [21, 18]]) g.px(x, y, 'gold3');
    g.line(12, 12, 18, 12, 'gold2');
    return;
  }
  const fist = [0, 13, 23, 28][phase];
  const tail = [0, 4, 3, 12][phase];
  g.line(tail, 12, fist - 3, 12, 'gold0');
  g.line(tail + 2, 11, fist - 3, 11, 'gold3').line(tail + 3, 13, fist - 3, 13, 'gold2');
  g.polygon([[fist - 3, 9], [fist + 1, 9], [fist + 2, 11], [fist + 2, 14], [fist - 1, 15], [fist - 4, 13]], 'gold0');
  g.polygon([[fist - 2, 10], [fist + 1, 10], [fist + 1, 13], [fist - 1, 14], [fist - 3, 12]], 'gold4');
  g.line(fist - 2, 14, fist, 14, 'gold2');
  g.line(tail + 3, 7, fist - 5, 8, 'gold3').line(tail + 1, 17, fist - 6, 16, 'gold2');
}
const strike = {
  meta: { id: 'fx.strike', category: 'effect', size: [32, 24], anchor: [16, 12], frames: 12, animations: {
    once: { frames: [0, 1, 2, 3, 4, 5], fps: 12, loop: false },
    right: { frames: [0, 1, 2, 3, 4, 5], fps: 12, loop: false },
    left: { frames: [6, 7, 8, 9, 10, 11], fps: 12, loop: false },
  } },
  draw(g, { frame }) {
    const pose = new PixelCanvas(32, 24, g.palette);
    strikeRight(pose, frame % 6);
    g.stamp(frame >= 6 ? pose.mirror() : pose, 0, 0);
  },
};
export const assets = [
  effect('fx.hit', 16, 5, 12, hit), effect('fx.heal', 24, 6, 8, heal), effect('fx.summon', 32, 6, 10, summon),
  effect('fx.leaf_hit', 24, 6, 12, leafHit), effect('fx.ash_hit', 24, 6, 12, ashHit), strike,
];
