import { PixelCanvas } from '../../lib/pixel.mjs';

// ASTRA original paper dolls, authored at map resolution. Clothes and tools
// define the silhouette; a shared skeleton only supplies joints and foot poses.
// Animation is baked into frames, never produced by stretching a runtime PNG.
const idleTicks = [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 0, 0, 0, 0, 0, 1, 1, 3, 1, 2, 2, 2, 0, 0];
const people = [
  { id: 'brio', size: [24, 32], head: 3, shoulder: 16, hair: 'earth0', shirt: 'red1', light: 'red2', leg: 'earth0' },
  { id: 'mayor_tolan', size: [24, 32], head: 8, shoulder: 18, hair: 'stone1', shirt: 'water0', light: 'water1', leg: 'metal0' },
  { id: 'mili', size: [16, 24], head: 6, shoulder: 14, hair: 'earth0', shirt: 'stone3', light: 'stone4', leg: 'earth0', child: true },
  { id: 'hedo', size: [16, 24], head: 6, shoulder: 14, hair: 'earth0', shirt: 'earth2', light: 'earth3', leg: 'leaf1', child: true },
  { id: 'teya', size: [16, 24], head: 2, shoulder: 12, hair: 'inkWarm', shirt: 'stone2', light: 'stone3', leg: 'metal0' },
  { id: 'sela', size: [16, 24], head: 2, shoulder: 12, hair: 'earth0', shirt: 'water1', light: 'water2', leg: 'water0' },
  { id: 'oren', size: [16, 24], head: 2, shoulder: 12, hair: 'stone1', shirt: 'earth0', light: 'earth1', leg: 'metal0' },
  { id: 'nemi', size: [16, 24], head: 2, shoulder: 12, hair: 'earth0', shirt: 'stone2', light: 'stone3', leg: 'earth0' },
];

function legs(g, p, direction, phase) {
  const [width, height] = p.size, cx = width / 2;
  const walking = phase >= 4, step = walking ? phase - 4 : -1;
  const side = direction === 'left';
  let left = cx - (width === 24 ? 4 : 3), right = cx + 1;
  if (side) { left = cx - 2; right = cx + 1; }
  if (step === 0) { left--; right++; }
  if (step === 2) { left++; right--; }
  const knee = height - 6;
  g.rect(left, knee, 2, 4, p.child ? 'skin2' : p.leg).rect(right, knee, 2, 4, p.child ? 'skin1' : p.leg);
  if (p.id === 'hedo') g.rect(left, knee, 2, 2, 'leaf2').rect(right, knee, 2, 2, 'leaf1');
  const leftToe = step === 1 ? left : left - 1, rightToe = step === 3 ? right : right + 1;
  g.rect(leftToe, height - 3, 3, 2, 'earth0').px(leftToe, height - 3, 'earth1');
  g.rect(rightToe, height - 3, 3, 2, 'earth0').px(rightToe, height - 3, 'earth1');
  if (step === 1) g.px(right, height - 4, 'skin1');
  if (step === 3) g.px(left, height - 4, 'skin2');
}

function torso(g, p, direction, phase) {
  const [width, height] = p.size, cx = width / 2, side = direction === 'left', back = direction === 'up';
  const inhale = phase === 1 || phase === 4, exhale = phase === 2 || phase === 6;
  const top = p.shoulder - Number(inhale), bottom = height - 7;
  const fat = width === 24, half = fat ? 7 : p.child ? 3 : 4;
  const left = cx - half + Number(side), right = cx + half - 1 - Number(side);
  g.polygon([[left + 1, top], [right - 1, top], [right, top + 3], [right - 1, bottom], [left + 1, bottom], [left, top + 3]], p.shirt);
  g.polygon([[left + 1, top], [cx - 1, top], [cx, bottom - 1], [left + 1, bottom]], p.light);
  const hands = p.child ? 16 : top + 4;
  if (fat) {
    g.ellipse(left - 2, p.shoulder + 1, 4, 6, p.light).ellipse(right - 1, p.shoulder + 1, 4, 6, p.shirt);
    g.rect(left - 1, p.shoulder + 5, 2, 3, 'skin2').rect(right, p.shoulder + 5, 2, 3, 'skin1');
  } else {
    g.rect(left - 1, top + 1, 2, hands - top, p.light).rect(right, top + 1, 2, hands - top, p.shirt);
    g.rect(left - 1, hands, 2, 2, 'skin2').rect(right, hands, 2, 2, 'skin1');
  }
  if (p.id === 'brio') {
    if (back) {
      g.line(left + 1, top + 3, right - 1, top + 3, 'stone4');
      g.polygon([[cx, top + 2], [cx + 3, top + 4], [cx, top + 5], [cx - 2, top + 4]], 'stone3');
    } else {
      g.polygon([[cx - 3, top], [cx + 3, top], [cx + 5, bottom], [cx - 5, bottom]], 'stone3');
      g.polygon([[cx - 2, top], [cx + 1, top], [cx + 2, bottom - 1], [cx - 4, bottom - 1]], 'stone4');
      g.line(cx - 2, top + 4, cx + 2, top + 4, 'stone2');
      g.px(cx - 4, top + 2, 'white').px(cx + 3, top + 6, 'white').px(cx - 1, bottom - 1, 'white');
      if (exhale) g.px(cx + 2, top + 3, 'stone2');
    }
  } else if (p.id === 'mayor_tolan') {
    if (!back) {
      g.polygon([[cx - 3, top], [cx + 2, top], [cx + 3, top + 6], [cx, bottom], [cx - 3, top + 5]], 'stone4');
      g.polygon([[cx - 1, top + 1], [cx + 1, top + 1], [cx + 1, top + 4], [cx, top + 5]], 'red1');
      g.line(cx - 4, top + 1, cx - 2, top + 5, 'metal2').line(cx + 3, top + 1, cx + 2, top + 5, 'metal1');
      g.px(cx + 4, top + 5, 'earth3');
    } else g.line(cx, top + 3, cx, bottom, 'metal0');
    if (exhale) g.px(left + 1, top + 4, 'water0');
  } else if (p.id === 'mili') {
    g.rect(left - 1, 15, 2, 2, 'gold1').rect(right, 15, 2, 2, 'gold1');
    g.polygon([[cx - 2, top], [cx + 2, top], [cx + 3, bottom], [cx - 3, bottom]], 'red1');
    g.line(cx - 1, top + 1, cx - 1, bottom - 1, 'red2');
    if (exhale) g.px(cx + 1, top + 1, 'red0');
  } else if (p.id === 'hedo') {
    g.line(left + 1, top + 1, cx, top + 1, 'stone3');
    g.rect(cx - 3, bottom - 1, 6, 2, 'leaf1').line(cx - 2, bottom - 1, cx, bottom - 1, 'leaf2');
    if (exhale) g.px(cx + 1, top + 1, 'earth0');
  } else if (p.id === 'teya') {
    if (back) g.line(cx - 3, top + 3, cx + 3, top + 3, 'star1');
    else {
      g.polygon([[cx - 2, top], [cx + 1, top], [cx + 3, bottom], [cx - 3, bottom]], 'star0');
      g.polygon([[cx - 1, top], [cx + 1, top], [cx + 2, bottom - 1], [cx - 2, bottom - 1]], 'star1');
      g.line(cx - 1, top + 4, cx + 1, top + 4, 'stone3').px(cx - 1, top + 1, 'star2');
    }
    if (exhale) g.px(cx + 1, top + 2, 'star0');
  } else if (p.id === 'sela') {
    g.polygon([[cx - 3, top], [cx + 3, top], [cx + 5, top + 3], [cx + 2, top + 4], [cx, top + 2], [cx - 2, top + 4], [cx - 5, top + 3]], 'stone3');
    g.polygon([[cx - 3, top], [cx + 1, top], [cx, top + 2], [cx - 2, top + 3], [cx - 4, top + 2]], 'stone4');
    if (!back) g.line(cx - 2, top + 2, cx + 3, 18, 'earth0');
    // Medicine satchel remains on the hip while the shoulders breathe.
    g.rect(cx + 3, 16, 3, 4, 'earth0').rect(cx + 3, 17, 2, 2, 'earth1').px(cx + 4, 17, 'stone3');
    if (exhale) g.px(cx - 2, top + 2, 'stone2');
  } else if (p.id === 'oren') {
    g.line(cx - 2, top, cx - 2, bottom, 'metal1').line(cx + 1, top, cx + 1, bottom, 'metal0');
    // Short working mallet, not a weapon: the handle ends beside his hand.
    g.rect(cx + 5, 14, 1, 6, 'earth0').rect(cx + 3, 13, 4, 3, 'earth0');
    g.rect(cx + 3, 13, 3, 2, 'earth2').px(cx + 3, 13, 'earth3');
    if (exhale) g.px(cx, top + 2, 'earth0');
  } else if (p.id === 'nemi') {
    g.polygon([[cx - 3, top], [cx - 1, top + 1], [cx - 1, bottom], [cx - 3, bottom]], 'earth0');
    g.polygon([[cx + 1, top + 1], [cx + 3, top], [cx + 3, bottom], [cx + 1, bottom]], 'inkWarm');
    g.line(cx - 3, top + 1, cx - 3, bottom - 1, 'earth1');
    if (exhale) g.px(cx, top + 2, 'stone1');
  }
  // Passing poses swing one cuff by one pixel, while the opposite knee passes.
  if (exhale) g.px(left - 1, p.child ? 15 : top + 2, p.shirt);
  if (phase === 5) g.px(left - 1, hands - 1, p.shirt);
  if (phase === 7) g.px(right, hands - 1, p.light);
}

function head(g, p, direction, phase) {
  const width = p.size[0], cx = width / 2, big = width === 24;
  const side = direction === 'left', back = direction === 'up', y = p.head;
  const x = big ? cx - 6 : cx - 4, w = big ? 12 : 8, h = big ? 11 : 9;
  // Hair is a solid cap behind the face; front bangs are drawn afterwards.
  g.ellipse(x, y, w, h, p.hair).ellipse(x + 1, y, w - 3, 3, p.id === 'teya' ? 'inkLight' : 'earth1');
  if (!back) {
    const fx = side ? x - 1 : x + 1, fw = side ? w - 3 : w - 2;
    g.ellipse(fx, y + 3, fw, h - 3, 'skin1').ellipse(fx, y + 3, fw - 1, h - 4, 'skin2');
    g.line(fx + 1, y + 3, fx + Math.max(2, fw - 3), y + 3, 'skin3');
    if (side) g.px(x - 1, y + 6, 'skin2');
    const eyeY = y + 5, eyeColor = phase === 3 ? 'skin0' : 'ink';
    g.px(side ? x + 1 : x + 2, eyeY, eyeColor);
    if (!side) g.px(x + w - 3, eyeY, eyeColor);
    g.px(side ? x + 1 : cx, y + h - 2, 'skin0');
  } else {
    g.line(x + 2, y + 3, x + 1, y + h - 2, p.id === 'teya' ? 'inkLight' : 'earth1');
    if (phase === 3) g.px(cx + 1, y + 6, p.id === 'teya' ? 'inkLight' : 'earth1');
  }
  if (p.id === 'brio') {
    g.polygon([[cx - 6, y + 3], [cx - 5, y], [cx - 2, y - 1], [cx + 3, y - 1], [cx + 6, y + 2], [cx + 5, y + 4]], 'red1');
    g.polygon([[cx - 5, y + 2], [cx - 3, y], [cx + 2, y], [cx + 4, y + 2]], 'red2');
    g.line(cx - 3, y, cx, y, 'red3');
    g.polygon([[cx + 6, y + 3], [cx + 8, y + 2], [cx + 8, y + 5], [cx + 6, y + 6]], 'red2');
    if (!back) g.px(cx - 1, y + 6, 'stone4').px(cx + 3, y + 7, 'stone4');
  } else if (p.id === 'mayor_tolan') {
    g.rect(cx - 5, 2, 10, 5, 'metal0').rect(cx - 4, 2, 3, 4, 'metal1');
    g.rect(cx - 5, 6, 10, 2, 'red1').rect(cx - 7, 8, 14, 2, 'metal0').line(cx - 6, 8, cx + 3, 8, 'metal1');
    if (!back) { g.line(cx - 3, y + 7, cx - 1, y + 7, 'stone1').line(cx + 1, y + 7, cx + 3, y + 7, 'stone1'); }
  } else if (p.id === 'mili') {
    g.polygon([[x, y + 2], [x + 3, y], [cx + 2, y + 1], [cx + 3, y + 3], [cx, y + 2], [cx - 1, y + 3]], 'earth0');
    for (const bx of [cx - 6, cx + 4]) {
      g.rect(bx, y + 3, 2, 5, 'earth0').px(bx, y + 3, 'earth1').px(bx + 1, y + 5, 'earth1');
      g.rect(bx, y + 7, 2, 1, 'gold1');
    }
  } else if (p.id === 'hedo') {
    g.ellipse(cx - 4, y - 1, 8, 4, 'earth0').ellipse(cx - 3, y - 1, 6, 3, 'stone1');
    g.rect(side ? cx - 5 : cx - 4, y + 2, 9, 1, 'earth0').px(cx + 1, y, 'stone3');
  } else if (p.id === 'teya') {
    g.ellipse(cx + 3, y + 1, 3, 4, 'inkWarm').px(cx + 3, y + 1, 'inkLight');
    g.polygon([[x, y + 1], [cx, y], [cx + 2, y + 2], [cx - 1, y + 3], [x, y + 4]], 'inkWarm');
    // Hinged measuring rule tucked above the right ear.
    g.line(cx + 4, y, cx + 4, y + 6, 'earth3').px(cx + 4, y + 2, 'earth0').px(cx + 4, y + 4, 'earth0');
  } else if (p.id === 'sela') {
    g.polygon([[x, y + 1], [cx + 1, y], [cx + 3, y + 2], [cx + 2, y + 3], [cx - 2, y + 2], [x, y + 5]], 'earth0');
    g.ellipse(cx + 2, y + 5, 3, 5, 'earth0').line(cx + 3, y + 5, cx + 3, y + 7, 'earth1');
  } else if (p.id === 'oren') {
    g.polygon([[cx - 4, y + 3], [cx - 4, y + 1], [cx - 2, y], [cx + 3, y], [cx + 4, y + 3]], 'metal1');
    g.line(cx - 3, y + 1, cx + 1, y + 1, 'metal2').rect(cx - 5, y + 3, 10, 1, 'metal0');
    if (!back) g.line(cx - 2, y + 7, cx + 2, y + 7, 'stone1');
  } else if (p.id === 'nemi') {
    g.polygon([[x, y + 1], [cx - 1, y], [cx + 2, y + 1], [cx + 4, y + 4], [cx + 3, y + 6], [cx + 1, y + 2], [cx - 2, y + 3]], 'earth0');
    g.line(cx - 4, y + 2, cx + 3, y + 2, 'earth3').px(cx - 2, y + 2, 'earth4');
    g.polygon([[cx + 4, y + 2], [cx + 5, y + 1], [cx + 5, y + 4], [cx + 3, y + 5]], 'earth3');
  }
}

function drawPerson(g, p, direction, phase) {
  const body = new PixelCanvas(...p.size, g.palette);
  // Each left-facing pose is composed before mirroring; its accessories stay
  // attached to the same authored side and animation never changes the anchor.
  const facing = direction === 'right' ? 'left' : direction;
  legs(body, p, facing, phase);
  torso(body, p, facing, phase);
  head(body, p, facing, phase);
  body.outline('ink');
  g.stamp(direction === 'right' ? body.mirror() : body, 0, 0);
}

export const assets = people.map(person => {
  const directions = ['down', 'up', 'left', 'right'], animations = {};
  directions.forEach((direction, index) => {
    const offset = index * 8;
    animations[`idle_${direction}`] = { frames: idleTicks.map(frame => offset + frame), fps: 4, loop: true };
    animations[`walk_${direction}`] = { frames: [4, 5, 6, 7].map(frame => offset + frame), fps: 8, loop: true };
  });
  animations.idle = animations.idle_down;
  return {
    meta: { id: `char.${person.id}`, category: 'character', size: person.size, anchor: [person.size[0] / 2, person.size[1]], frames: 32, animations },
    draw(g, { frame }) { drawPerson(g, person, directions[Math.floor(frame / 8)], frame % 8); },
  };
});
