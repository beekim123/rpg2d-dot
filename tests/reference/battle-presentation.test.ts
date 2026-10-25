import {expect,it} from 'vitest';
import {battles} from '../../reference/web/src/battle/content.ts';
import {maps,words} from '../../reference/web/src/content.ts';
import manifest from '../../resources/art/export/manifest.json';
import {validateBattlePresentation} from '../../reference/web/src/scenes/battle-catalog.ts';
import {commandAt} from '../../reference/web/src/scenes/battle-layout.ts';
const ids=new Set(manifest.assets.map(a=>a.id));
it('requires visible assets and map obstacles matching the tactical arena',()=>{
  expect(validateBattlePresentation(battles,maps,ids,words)).toEqual([]);
  const broken=structuredClone(maps);broken['lantern.yard']!.entities=broken['lantern.yard']!.entities.filter(e=>e.id!=='pillar_north');
  expect(validateBattlePresentation(battles,broken,ids,words).join(' ')).toMatch(/obstacle/);
  const missing=new Set(ids);missing.delete('astral.morning_star');expect(validateBattlePresentation(battles,maps,missing,words).join(' ')).toMatch(/astral.morning_star/);
});
it('does not turn the portrait, blank last cell or dock padding into commands',()=>{
  expect(commandAt(182,215,7)).toBe(0);expect(commandAt(330,241,7)).toBe(6);
  for(const p of [[100,220],[330,255],[180,263],[167,215]])expect(commandAt(p[0]!,p[1]!,7)).toBeUndefined();
});
