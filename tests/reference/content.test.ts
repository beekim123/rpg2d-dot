import {expect,it} from 'vitest';
import {validateContent} from '../../reference/web/src/systems/content-check.ts';
import {maps,scripts,words} from '../../reference/web/src/content.ts';
import manifest from '../../resources/art/export/manifest.json';
const ids=new Set(manifest.assets.map(a=>a.id));
it('accepts the complete M0 world and rejects broken dialogue assets',()=>{
  expect(validateContent(maps,scripts,words,ids)).toEqual([]);
  const broken=structuredClone(scripts);broken.hob!.splice(1,0,{op:'say',text:'missing',speaker:'name.hob',portrait:'missing'});
  expect(validateContent(maps,broken,words,ids).join(' ')).toMatch(/missing/);
});
it('rejects unreachable objectives and invalid jump targets even on untaken branches',()=>{
  const broken=structuredClone(maps);broken['lantern.test']!.entities.find(e=>e.id==='hob')!.x=29;broken['lantern.test']!.entities.find(e=>e.id==='hob')!.y=20;
  expect(validateContent(broken,scripts,words,ids).join(' ')).toMatch(/unreachable/);
  const bad=structuredClone(scripts);bad.hob![0]={op:'if',flag:'absent',equals:true,goto:999};
  expect(validateContent(maps,bad,words,ids).join(' ')).toMatch(/jump/);
});
