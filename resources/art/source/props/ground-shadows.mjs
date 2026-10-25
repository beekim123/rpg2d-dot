// Opaque palette shadows match their supporting surface; no runtime color tint.
export const assets = [
  ['prop.shadow_wood', 'earth0'],
  ['prop.shadow_path', 'earth2'],
].map(([id, color]) => ({
  meta: {id,category:'prop',size:[16,8],anchor:[8,8],frames:1,animations:{idle:{frames:[0],fps:4,loop:true}}},
  draw(g) {g.ellipse(1,3,14,5,color);},
}));
