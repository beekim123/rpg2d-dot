import {afterEach,expect,it,vi} from 'vitest';
import {Input} from '../../reference/web/src/core/input.ts';
afterEach(()=>vi.unstubAllGlobals());
function fixture(){
  const canvas=new EventTarget(),root=new EventTarget(),document=new EventTarget();
  vi.stubGlobal('addEventListener',root.addEventListener.bind(root));vi.stubGlobal('document',document);
  const input=new Input(canvas as unknown as HTMLCanvasElement,()=>{});
  const down=(code:string)=>canvas.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{code,repeat:false}));
  const up=(code:string)=>root.dispatchEvent(Object.assign(new Event('keyup'),{code}));
  return {input,down,up,root};
}
it('held movement cannot jump ahead of queued menu transitions on a slow frame',()=>{
  const {input,down,up}=fixture();
  down('Escape');up('Escape');down('KeyC');up('KeyC');down('ArrowDown');
  expect(input.consume()).toBe('cancel');
  expect(input.direction()).toBeUndefined();
  expect(input.consume()).toBe('menu');
  expect(input.direction()).toBeUndefined();
  expect(input.consume()).toBe('down');
  expect(input.direction()).toBe('down');
  up('ArrowDown');expect(input.direction()).toBeUndefined();
});
it('a quick press remains one queued step after release and a held key resumes when ordered actions finish',()=>{
  const {input,down,up}=fixture();
  down('ArrowRight');up('ArrowRight');expect(input.consume()).toBe('right');expect(input.consume()).toBeUndefined();expect(input.direction()).toBeUndefined();
  down('ArrowLeft');expect(input.consume()).toBe('left');expect(input.direction()).toBe('left');
});
it('losing focus clears both held movement and pending commands',()=>{
  const {input,down,root}=fixture();down('KeyC');down('ArrowDown');root.dispatchEvent(new Event('blur'));
  expect(input.consume()).toBeUndefined();expect(input.direction()).toBeUndefined();
});
