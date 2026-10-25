export interface Animation {frames:number[];fps:number;loop:boolean}
/** Animation runs on the game's fixed 60 Hz clock; repeated frame IDs are intentional holds. */
export function frameAt(clip:Animation|undefined,tick:number,phase=0):number {
  if(!clip?.frames.length||!Number.isFinite(tick)||!Number.isFinite(phase)||clip.fps<=0)return 0;
  const sample=Math.floor(Math.max(0,tick+(clip.loop?phase:0))*clip.fps/60);
  const index=clip.loop?sample%clip.frames.length:Math.min(sample,clip.frames.length-1);
  return clip.frames[index]??0;
}
/** Stable phase per object, never random or tied to changing world position. */
export function phaseFor(identity:string):number {
  let hash=2166136261;
  for(const char of identity){hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;}
  return hash%360;
}
