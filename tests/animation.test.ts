import {expect,it} from 'vitest';
import {frameAt,phaseFor} from '../src/render/animation.ts';
it('honors repeated hold frames, clip speed and loop boundaries',()=>{
  const clip={frames:[0,0,1,2,0],fps:4,loop:true};
  expect([0,14,15,29,30,45,60,75].map(t=>frameAt(clip,t))).toEqual([0,0,0,0,1,2,0,0]);
});
it('stops a non-looping animation on its final frame',()=>{
  expect(frameAt({frames:[3,4,5],fps:4,loop:false},900)).toBe(5);
});
it('uses stable per-object offsets instead of synchronizing every plant',()=>{
  const phase=phaseFor('tree1');expect(phaseFor('tree1')).toBe(phase);
  expect(phaseFor('tree2')).not.toBe(phase);
  expect(Number.isInteger(phase)&&phase>=0&&phase<360).toBe(true);
  const clip={frames:[0,1,2,3],fps:3,loop:true};
  expect(Array.from({length:12},(_,i)=>frameAt(clip,i*20,phase))).not.toEqual(Array.from({length:12},(_,i)=>frameAt(clip,i*20,phaseFor('tree2'))));
});
