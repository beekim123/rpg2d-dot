import {describe,expect,it} from 'vitest';
import {battles} from '../src/battle/content.ts';
import {advanceEnemy,commandEncounter,createEncounter} from '../src/battle/encounter.ts';
import {runBattleRoute} from '../tools/battle-playthrough.ts';

describe('real prologue battle routes',()=>{
  it.each(['prologue_ella','prologue_shade'])('wins %s using only accepted normal commands and reproduces its exact replay',id=>{
    const definition=battles[id]!,before=structuredClone(definition),route=runBattleRoute(definition);
    expect(route.encounter.battle.phase).toBe('won');expect(route.steps.length).toBeGreaterThan(3);
    expect(runBattleRoute(definition)).toEqual(route);expect(definition).toEqual(before);
    let replay=createEncounter(definition);
    for(const step of route.steps){
      const result=step.kind==='enemy'?advanceEnemy(replay):commandEncounter(replay,step.command);
      expect(result.ok,JSON.stringify(result.events)).toBe(true);replay=result.encounter;
    }
    expect(replay).toEqual(route.encounter);
    expect(route.events.some(e=>e.type==='damage'&&e.damage>0&&e.sourceId===definition.actors[0]!.id)).toBe(true);
    expect(route.events.some(e=>e.type==='damage'&&e.damage>0&&e.sourceId===definition.actors[1]!.id)).toBe(true);
  });
  it('requires three genuine enemy actions and an effective Finn hit before the shade victory',()=>{
    const route=runBattleRoute(battles.prologue_shade!);
    expect(route.encounter.battle.enemyActions.shade).toBe(3);
    expect(route.encounter.battle.hitEnemy.finn).toContain('shade');
    expect(route.encounter.battle.actors.find(a=>a.id==='finn')!.hp).toBeGreaterThan(0);
    expect(route.steps.filter(s=>s.kind==='enemy')).toHaveLength(3);
    expect(route.events.filter(e=>e.type==='outcome')).toEqual([{type:'outcome',phase:'won'}]);
  });
  it.each(['prologue_ella','prologue_shade'])('loses %s through real incoming damage and retries without carrying state',id=>{
    const definition=battles[id]!,initial=createEncounter(definition),failed=runBattleRoute(definition,'wait');
    expect(failed.encounter.battle.phase).toBe('lost');
    expect(failed.encounter.battle.actors[0]!.hp).toBe(0);expect(failed.encounter.battle.actors[0]!.astral).toBeNull();
    expect(createEncounter(definition)).toEqual(initial);
    const retry=runBattleRoute(definition);expect(retry.encounter.battle.phase).toBe('won');
    expect(retry.encounter.battle.turnNumber).toBeLessThan(failed.encounter.battle.turnNumber);
    expect(failed.encounter.battle.phase).toBe('lost');
  });
});
