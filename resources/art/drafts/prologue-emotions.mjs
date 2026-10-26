// ASTRA expression candidates. Move this module to resources/art/source/story/
// before building: every relative import/URL below targets that final location.
// Only this project's native portrait functions and original Hob pixel source
// are reused. No exported PNG, game module, external asset or resampling is used.
import { readFileSync } from 'node:fs';
import { assets as homePortraits } from '../portraits/portraits.mjs';
import { assets as prologuePortraits } from '../portraits/prologue.mjs';

const idle = { idle: { frames: [0], fps: 4, loop: true } };
const originals = [...homePortraits, ...prologuePortraits];
const hobSource = JSON.parse(readFileSync(new URL('../characters/hob.json', import.meta.url), 'utf8'));
const hobRows = hobSource.frames[hobSource.animations.idle_down.frames[0]];

function portrait(id, originalId, redraw) {
  const original = originals.find(entry => entry.meta.id === originalId);
  if (!original) throw new Error(`Missing original portrait for ${id}: ${originalId}`);
  return {
    meta: { id, category: 'portrait', kind: 'procedural', size: [48, 48], anchor: [24, 48], frames: 1, animations: idle },
    draw(g, ctx) {
      original.draw(g, ctx);
      redraw(g);
    },
  };
}

function clearFinnBrows(g) {
  // Restore only the old brow strokes, keeping the fringe and face shading.
  g.line(14, 19, 18, 18, 'skin3');
  g.line(28, 18, 31, 19, 'skin2').px(28, 18, 'skin3');
}

function clearFinnEyes(g) {
  // The left eye lies in the warm highlight; the right is in the middle tone.
  g.rect(15, 21, 3, 4, 'skin3').rect(28, 21, 3, 4, 'skin2');
}

function clearFinnSmile(g) {
  g.line(22, 29, 27, 28, 'skin2').px(25, 29, 'skin2');
}

function finnWorried(g) {
  clearFinnBrows(g);
  clearFinnEyes(g);
  clearFinnSmile(g);
  // Inner brow ends lift slightly; the mouth is closed and has no tooth glint.
  g.line(14, 19, 18, 17, 'earth0').line(27, 17, 31, 19, 'earth0');
  g.rect(15, 22, 2, 3, 'ink').px(15, 22, 'white');
  g.rect(28, 22, 2, 3, 'ink').px(28, 22, 'white');
  g.line(22, 30, 26, 30, 'skin0').px(21, 31, 'skin1');
}

function finnResolve(g) {
  clearFinnBrows(g);
  clearFinnEyes(g);
  clearFinnSmile(g);
  // Downward inner brows and focused pupils support the spoken vow.
  g.line(14, 18, 19, 20, 'earth0').line(27, 20, 31, 18, 'earth0');
  g.line(14, 21, 18, 22, 'earth0').line(27, 22, 31, 21, 'earth0');
  g.rect(15, 22, 3, 3, 'ink').px(15, 22, 'white');
  g.rect(28, 22, 3, 3, 'ink').px(28, 22, 'white');
  // A small native-resolution open mouth, not a broad comic grin.
  g.ellipse(21, 27, 8, 6, 'ink').rect(22, 28, 6, 3, 'inkWarm');
  g.line(22, 28, 27, 28, 'stone4').line(23, 31, 26, 31, 'skin0');
}

function finnDetermined(g) {
  clearFinnBrows(g);
  clearFinnEyes(g);
  clearFinnSmile(g);
  // The quieter promise uses a smaller brow angle and a closed, level mouth.
  g.line(14, 18, 18, 19, 'earth0').line(28, 19, 31, 18, 'earth0');
  g.rect(15, 22, 3, 3, 'ink').px(15, 22, 'white');
  g.rect(28, 22, 3, 3, 'ink').px(28, 22, 'white');
  g.line(21, 29, 27, 29, 'skin0').line(23, 30, 25, 30, 'skin1');
}

function ellaHurt(g) {
  // Remove the relaxed brows and open eyes without changing her head or braid.
  g.line(14, 18, 18, 17, 'skin3');
  g.line(27, 17, 31, 18, 'skin2').px(27, 17, 'skin3').px(31, 18, 'skin1');
  g.rect(15, 20, 2, 3, 'skin3').rect(28, 20, 2, 3, 'skin2');
  g.line(20, 28, 26, 28, 'skin2');
  g.line(14, 18, 19, 19, 'earth0').line(27, 19, 31, 17, 'earth0');
  // Briefly squeezed lids and a small caught breath: no tear or wound pixels.
  g.line(15, 20, 17, 21, 'ink').line(17, 21, 15, 22, 'ink');
  g.line(29, 20, 27, 21, 'ink').line(27, 21, 29, 22, 'ink');
  g.ellipse(22, 27, 5, 4, 'skin0').rect(23, 28, 3, 2, 'inkWarm');
}

function hobWorried(g) {
  // Preserve the two-wing moustache, bald scalp and warm face planes.
  g.line(14, 16, 19, 15, 'skin2').line(28, 15, 33, 16, 'skin2');
  g.rect(16, 18, 2, 3, 'skin2').rect(29, 18, 2, 3, 'skin2');
  g.line(14, 16, 20, 14, 'stone4').line(27, 14, 33, 16, 'stone4');
  g.px(21, 16, 'skin1').px(26, 16, 'skin1');
  g.rect(16, 19, 2, 2, 'ink').px(16, 19, 'stone4');
  g.rect(29, 19, 2, 2, 'ink').px(29, 19, 'stone4');
  g.line(22, 31, 25, 31, 'inkWarm');
}

function hobLamp(g) {
  hobRows.forEach((row, y) => [...row].forEach((color, x) => g.px(x, y, color)));
  // Lift his right arm from the existing coat; no changes at or below row 16.
  // In particular the original coat hem, both boots and all foot pixels remain.
  g.px(10, 14, 'water0').px(10, 15, 'water0');
  g.polygon([[9, 12], [11, 11], [12, 9], [12, 5], [13, 3], [15, 3], [15, 10], [14, 13], [12, 15], [10, 15]], 'ink');
  g.polygon([[10, 12], [12, 11], [13, 9], [13, 6], [14, 6], [14, 10], [13, 12], [11, 14], [10, 14]], 'water1');
  g.line(11, 12, 13, 9, 'water2').line(14, 7, 14, 10, 'water0');
  g.polygon([[13, 2], [15, 2], [15, 5], [13, 6], [12, 4]], 'ink');
  g.rect(13, 3, 2, 3, 'skin2').px(13, 3, 'skin3').px(14, 4, 'skin3');
  // Grip pixel: (14,4). Keep prop.travel_lamp as a separate, unique object.
  // Align its handle pixel (7,1) here: lamp top-left relative to Hob = (7,3).
  // With lamp anchor (8,20) and Hob anchor (8,24), lamp anchor offset = (+7,-1).
  // Draw the lamp behind this arm/hand so the fingers close over the handle.
}

export const assets = [
  portrait('portrait.finn_worried', 'portrait.finn', finnWorried),
  portrait('portrait.finn_resolve', 'portrait.finn', finnResolve),
  portrait('portrait.finn_determined', 'portrait.finn', finnDetermined),
  portrait('portrait.ella_hurt', 'portrait.ella', ellaHurt),
  portrait('portrait.hob_worried', 'portrait.hob', hobWorried),
  {
    meta: { id: 'char.hob_lamp', category: 'character', kind: 'procedural', size: [16, 24], anchor: [8, 24], frames: 1, animations: idle },
    draw: hobLamp,
  },
];
