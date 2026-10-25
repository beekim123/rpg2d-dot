// Original short stone practice obstacle, built in native map pixels.
export const assets = [{
  meta: { id: 'prop.pillar', category: 'prop', size: [16, 24], anchor: [8, 24], frames: 1, animations: { idle: { frames: [0], fps: 4, loop: true } } },
  draw(g) {
    g.ellipse(1, 18, 14, 6, 'ink').ellipse(2, 19, 12, 4, 'stone1');
    g.rect(3, 7, 10, 14, 'ink').rect(4, 7, 8, 13, 'stone2');
    g.rect(4, 8, 3, 11, 'stone3').rect(10, 8, 2, 12, 'stone1');
    g.line(4, 14, 11, 14, 'stone1').line(7, 8, 7, 13, 'stone1');
    g.line(6, 15, 6, 19, 'stone1').px(8, 17, 'stone3');
    g.ellipse(1, 2, 14, 8, 'ink').ellipse(2, 3, 12, 6, 'stone2');
    g.ellipse(3, 3, 10, 4, 'stone3').line(4, 4, 8, 4, 'stone4');
    g.line(3, 20, 10, 21, 'stone2').px(3, 19, 'stone3');
  },
}];
