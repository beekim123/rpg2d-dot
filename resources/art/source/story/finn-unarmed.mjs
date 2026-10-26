import {readFileSync} from 'node:fs';
// Reuse our own authored pixel maps, preserving the character and every animation
// index. Before the player takes the pole, its exact two-column silhouette is absent.
const source=JSON.parse(readFileSync(new URL('../characters/finn.json',import.meta.url),'utf8'));
const rightFrames=new Set([...source.animations.idle_right.frames,...source.animations.walk_right.frames]);
export const assets=[{
  meta:{id:'char.finn_unarmed',category:'character',kind:'procedural',size:[16,24],anchor:[8,24],frames:source.frames.length,animations:structuredClone(source.animations)},
  draw(g,{frame}){
    const pole=rightFrames.has(frame)?1:13;
    source.frames[frame].forEach((row,y)=>[...row].forEach((color,x)=>{
      if(y<=20&&(x===pole||x===pole+1))return;
      g.px(x,y,color);
    }));
  },
}];
