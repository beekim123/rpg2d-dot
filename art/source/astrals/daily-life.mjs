import { PixelCanvas } from '../../lib/pixel.mjs';

// Two original non-combat companions. No extra arms, carried objects or combat
// tags imply abilities beyond swelling dough and pressing one curled paper corner.
function core(g, x, y, color, radius) {
  g.line(x - radius, y, x + radius, y, color).line(x, y - radius, x, y + radius, color);
  if (radius > 1) g.rect(x - 1, y - 1, 3, 3, color);
}

function rise(g, phase) {
  const puff = phase >= 2 ? 1 : 0;
  // Irregular three-lobed crown and puffed cheeks, with no arm-like appendages.
  g.ellipse(5, 6, 14, 12, 'earth0');
  g.ellipse(6, 5, 6, 7, 'earth0').ellipse(10, 3, 7, 8, 'earth0').ellipse(15, 6, 4, 6, 'earth0');
  g.ellipse(6, 7, 12, 9, 'earth3').ellipse(7, 6, 5, 6, 'earth4').ellipse(11, 4, 5, 7, 'earth4');
  g.ellipse(5 - puff, 10, 6 + puff, 6, 'earth0').ellipse(14, 10, 5 + puff, 6, 'earth0');
  g.ellipse(6 - puff, 10, 5 + puff, 5, 'earth4').ellipse(14, 10, 4 + puff, 5, 'earth3');
  g.px(9, 9, 'earth0').px(15, 9, 'earth0').px(11, 12, 'earth0').px(12, 12, 'earth0');
  g.px(7 - puff, 12, 'stone4').px(16 + puff, 12, 'earth4');
  // The clear forehead star ties a flour-soft body to the astral visual system.
  core(g, 12, 7, 'gold4', 2);
  g.line(10, 16, 14, 16, 'earth2').px(8, 15, 'earth4');
}

function cornerpress(g, phase) {
  const raised = phase === 1 || phase === 2;
  // Three separated broad feet. Only the left foot lifts; the short cylinder
  // never becomes an arm or a heavy stamp that could crush living things.
  g.ellipse(2, raised ? 8 : 10, 4, 3, 'star0').line(3, raised ? 9 : 11, 4, raised ? 9 : 11, 'earth4');
  g.ellipse(10, 10, 4, 3, 'star0').line(11, 11, 12, 11, 'earth3');
  g.ellipse(6, 10, 4, 3, 'star0').line(7, 11, 8, 11, 'earth4');
  g.rect(4, 4, 8, 7, 'star0').ellipse(4, 2, 8, 5, 'star0');
  g.rect(5, 5, 6, 5, 'metal1').rect(5, 4, 3, 5, 'metal2');
  g.ellipse(5, 3, 6, 3, 'earth3').line(6, 3, 9, 3, 'earth4');
  g.line(5, 9, 10, 9, 'star0');
  core(g, 8, 7, 'star3', 1);
}

function companion(id, size, rim, drawBody) {
  const [width, height] = size;
  return {
    meta: { id, category: 'astral', size, anchor: [width / 2, height], frames: 4, animations: { idle: { frames: [0, 1, 2, 3], fps: 4, loop: true } } },
    draw(g, { frame }) {
      // The last three rows belong only to the sparse ground ring. The body
      // floats by one native pixel; alternate frames add a one-pixel light rim.
      const body = new PixelCanvas(width, height - 3, g.palette);
      drawBody(body, frame);
      if (frame % 2) body.outline(rim);
      g.stamp(body, 0, frame >= 2 ? -1 : 0);
      const cx = width / 2, spread = width === 24 ? 7 : 5;
      for (const [dx, dy] of [[-spread, 1], [spread, 1], [-spread + 2, 0], [spread - 2, 0], [-spread + 1, 2], [spread - 1, 2]]) {
        g.px(cx + dx, height - 3 + dy, rim);
      }
    },
  };
}

export const assets = [
  companion('astral.rise', [24, 24], 'gold4', rise),
  companion('astral.cornerpress', [16, 16], 'star3', cornerpress),
];
