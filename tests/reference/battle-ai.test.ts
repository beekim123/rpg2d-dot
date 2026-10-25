import {describe,expect,it} from 'vitest';
import {applyBattleCommand,createBattle,type BattleCommand,type BattleDefinition} from '../../reference/web/src/battle/engine.ts';
import type {BattleActor} from '../../reference/web/src/battle/model.ts';
import {advanceEnemy,commandEncounter,createEncounter,type Encounter} from '../../reference/web/src/battle/encounter.ts';
import {forecastIntentDamage,planPlayerTurn,type EnemyIntent} from '../../reference/web/src/battle/ai.ts';

function fighter(id:string,team:'player'|'enemy',x:number):BattleActor {
  return {id,team,order:0,body:{x,y:2},astral:{x:x+(team==='player'?0:-1),y:team==='player'?3:2},kind:'remote',mode:'manifested',hp:100,maxHp:100,will:8,maxWill:12,shield:0,chart:{pow:40,spd:50,rch:50,end:50,prc:50,pot:50},reach:3,readyAt:0,skillIds:team==='player'?['lamp_punch','rush']:['laurel_bolt']};
}
function fixture():BattleDefinition {
  return {id:'intents',width:9,height:6,blocked:[],actors:[fighter('hero','player',1),fighter('foe','enemy',4)]};
}

describe('cancelled committed skills',()=>{
  it('charges the original heavy skill cost and interval and counts one enemy action',()=>{
    const def=fixture();def.actors[1]!.skillIds=['rush'];
    let state=createBattle(def);state=applyBattleCommand(state,{actorId:'hero',type:'wait'}).state;
    const before=structuredClone(state);
    const result=applyBattleCommand(state,{actorId:'foe',type:'cancelled_skill',skillId:'rush',outcome:'interrupted',reason:'actor_displaced'} as BattleCommand);
    expect(result.ok).toBe(true);
    expect(result.state.actors[1]!.readyAt).toBe(143);
    expect(result.state.actors[1]!.will).toBe(6);
    expect(result.state.enemyActions.foe).toBe(1);
    expect(result.events).toContainEqual({type:'cancelled_skill',actorId:'foe',skillId:'rush',cost:4,outcome:'interrupted',reason:'actor_displaced'});
    expect(state).toEqual(before);
  });
  it('rejects unknown, unlearned, unaffordable and player cancellation without spending the turn',()=>{
    let state=createBattle(fixture());
    expect(applyBattleCommand(state,{actorId:'hero',type:'cancelled_skill',skillId:'rush',outcome:'miss',reason:'empty_cell'}).ok).toBe(false);
    state=applyBattleCommand(state,{actorId:'hero',type:'wait'}).state;
    for(const skillId of ['missing','rush'])expect(applyBattleCommand(state,{actorId:'foe',type:'cancelled_skill',skillId,outcome:'miss',reason:'empty_cell'}).ok).toBe(false);
    state.actors[1]!.skillIds=['rush'];state.actors[1]!.will=3;
    const result=applyBattleCommand(state,{actorId:'foe',type:'cancelled_skill',skillId:'rush',outcome:'miss',reason:'empty_cell'});
    expect(result.ok).toBe(false);expect(result.state).toBe(state);expect(state.enemyActions).toEqual({});
  });
});

function play(enc:Encounter,command:BattleCommand):Encounter {
  const result=commandEncounter(enc,command);expect(result.ok,JSON.stringify(result.events)).toBe(true);return result.encounter;
}
function enemyTurn(enc:Encounter):Encounter {return play(enc,{actorId:'hero',type:'wait'});}

describe('public deterministic enemy plans',()=>{
  it('announces a reproducible plan before the first player move without changing source data',()=>{
    const def=fixture(),before=structuredClone(def),enc=createEncounter(def);
    expect(enc.intents.foe!.mode).toBe('unit');expect(enc.intents.foe!.targetId).toBe('hero');
    expect(enc.intents.foe!.target).toBe('body');expect(enc.intents.foe!.cell).toEqual({x:1,y:2});
    expect(enc.intents.foe!.expectedDamage).toBe(14);expect(enc.intents.foe!.status).toBe('ready');
    expect(createEncounter(def)).toEqual(enc);expect(def).toEqual(before);
  });
  it('keeps point aim fixed when the target moves and misses at normal weight',()=>{
    const def=fixture();def.intentModes={foe:'point'};
    let enc=createEncounter(def);const before=structuredClone(enc.intents.foe);
    enc=play(enc,{actorId:'hero',type:'move_body',to:{x:0,y:2}});
    expect(enc.intents.foe).toEqual({...before,expectedDamage:0});enc=enemyTurn(enc);
    const result=advanceEnemy(enc);expect(result.ok).toBe(true);
    expect(result.encounter.battle.actors[0]!.hp).toBe(100);
    expect(result.encounter.battle.actors[1]!.readyAt).toBe(110);
    expect(result.encounter.battle.enemyActions.foe).toBe(1);
    expect(result.events.some(e=>e.type==='cancelled_skill'&&e.outcome==='miss'&&e.reason==='empty_cell')).toBe(true);
  });
  it('tracks the locked body within range without changing the public target or plan',()=>{
    let enc=createEncounter(fixture());const before=structuredClone(enc.intents.foe);
    enc=play(enc,{actorId:'hero',type:'move_body',to:{x:2,y:2}});
    expect(enc.intents.foe).toEqual(before);enc=enemyTurn(enc);
    const result=advanceEnemy(enc);expect(result.ok).toBe(true);
    expect(result.encounter.battle.actors[0]!.hp).toBe(86);
    expect(result.events.some(e=>e.type==='damage'&&e.actorId==='hero'&&e.target==='body')).toBe(true);
  });
  it('shows an out-of-range lock as interrupted, permits undo, and still advances once if committed',()=>{
    let enc=createEncounter(fixture());const before=structuredClone(enc.intents.foe);
    enc=play(enc,{actorId:'hero',type:'move_body',to:{x:0,y:2}});
    expect(enc.intents.foe!.status).toBe('interrupted');expect(enc.intents.foe!.reason).toBe('outside_skill_range');
    expect(enc.intents.foe!.targetId).toBe(before!.targetId);
    const undone=play(enc,{actorId:'hero',type:'undo'});expect(undone.intents.foe).toEqual(before);
    const result=advanceEnemy(enemyTurn(enc));expect(result.ok).toBe(true);
    expect(result.encounter.battle.enemyActions.foe).toBe(1);expect(result.encounter.battle.actors[1]!.readyAt).toBe(110);
    expect(result.events.some(e=>e.type==='cancelled_skill'&&e.outcome==='interrupted')).toBe(true);
  });
  it('interrupts a pushed attacker instead of silently choosing a new attack',()=>{
    const def=fixture();def.actors[0]!.astral={x:2,y:2};def.actors[1]!.body={x:3,y:1};def.actors[1]!.astral={x:3,y:2};
    let enc=createEncounter(def);const target=enc.intents.foe!.targetId;
    enc=play(enc,{actorId:'hero',type:'skill',skillId:'rush',targetId:'foe',target:'astral'});
    expect(enc.intents.foe!.status).toBe('interrupted');expect(enc.intents.foe!.reason).toBe('actor_displaced');
    expect(enc.intents.foe!.targetId).toBe(target);
    const result=advanceEnemy(enc);expect(result.ok).toBe(true);expect(result.encounter.battle.enemyActions.foe).toBe(1);
  });
  it('does not let player command entry execute enemy actions or internal cancellations',()=>{
    const enc=createEncounter(fixture());
    expect(commandEncounter(enc,{actorId:'hero',type:'cancelled_skill',skillId:'rush',outcome:'miss',reason:'empty_cell'}).ok).toBe(false);
    const enemy=enemyTurn(enc);expect(commandEncounter(enemy,{actorId:'foe',type:'wait'}).ok).toBe(false);
    expect(advanceEnemy(enc).ok).toBe(false);
  });
  it('interrupts a locked astral when it is recalled and consumes the existing enemy action',()=>{
    const def=fixture();def.actors[0]!.body={x:0,y:0};def.actors[0]!.astral={x:1,y:2};def.blocked=[{x:1,y:0},{x:0,y:1}];
    let enc=createEncounter(def);expect(enc.intents.foe!.target).toBe('astral');
    enc=play(enc,{actorId:'hero',type:'recall'});
    expect(enc.intents.foe!.status).toBe('interrupted');expect(enc.intents.foe!.reason).toBe('target_unavailable');
    const result=advanceEnemy(enc);expect(result.ok).toBe(true);expect(result.encounter.battle.enemyActions.foe).toBe(1);
  });
  it('interrupts an obstructed fixed movement plan instead of rerouting through a unit',()=>{
    const def=fixture();def.actors[1]!.body={x:6,y:2};def.actors[1]!.astral={x:5,y:2};def.actors[1]!.skillIds=['basic_strike'];
    let enc=createEncounter(def);const intent=structuredClone(enc.intents.foe)!;
    const move=intent.commands.find(c=>c.type==='move_astral');expect(move?.type).toBe('move_astral');
    if(!move||move.type!=='move_astral')throw new Error('Missing approach move');
    enc=play(enc,{actorId:'hero',type:'move_body',to:move.to});
    expect(enc.intents.foe!.status).toBe('interrupted');expect(enc.intents.foe!.reason).toBe('plan_blocked');
    expect(enc.intents.foe!.commands).toEqual(intent.commands);
    const result=advanceEnemy(enemyTurn(enc));expect(result.ok).toBe(true);expect(result.encounter.battle.enemyActions.foe).toBe(1);
  });
  it('shows a locked target moving behind a wall as interrupted and pays the heavy cost',()=>{
    const def=fixture();def.actors[1]!.skillIds=['flare'];def.actors[0]!.lampMarks=1;def.blocked=[{x:2,y:1}];
    let enc=createEncounter(def);expect(enc.intents.foe!.skillId).toBe('flare');
    enc=play(enc,{actorId:'hero',type:'move_body',to:{x:1,y:1}});
    expect(enc.intents.foe!.reason).toBe('blocked_line_of_sight');
    const result=advanceEnemy(enemyTurn(enc));expect(result.ok).toBe(true);
    expect(result.encounter.battle.actors[1]!.readyAt).toBe(143);expect(result.encounter.battle.actors[1]!.will).toBe(7);
  });
  it('ends a second enemy action when its locked target was already defeated by the first enemy',()=>{
    const def=fixture();def.actors[0]!.hp=1;def.actors[0]!.readyAt=200;
    const ally=fighter('ally','player',0);ally.body={x:0,y:0};ally.astral=null;ally.mode='recalled';ally.order=1;ally.readyAt=200;
    const foe2=fighter('foe2','enemy',4);foe2.body.y=4;foe2.astral!.y=4;foe2.order=1;
    def.actors.push(ally,foe2);def.blocked=[{x:1,y:0},{x:0,y:1}];
    const enc=createEncounter(def);expect(enc.intents.foe2!.targetId).toBe('hero');
    const first=advanceEnemy(enc);expect(first.ok).toBe(true);expect(first.encounter.battle.actors[0]!.hp).toBe(0);
    expect(first.encounter.intents.foe2!.reason).toBe('target_unavailable');
    const second=advanceEnemy(first.encounter);expect(second.ok).toBe(true);expect(second.encounter.battle.enemyActions.foe2).toBe(1);
  });
  it('can hit the player unit that occupies the fixed point without changing the announced target',()=>{
    const def=fixture();def.intentModes={foe:'point'};let enc=createEncounter(def);
    enc=play(enc,{actorId:'hero',type:'move_body',to:{x:0,y:2}});
    enc=play(enc,{actorId:'hero',type:'move_astral',to:{x:1,y:2}});
    expect(enc.intents.foe!.target).toBe('body');
    const result=advanceEnemy(enemyTurn(enc));expect(result.ok).toBe(true);
    expect(result.events.some(e=>e.type==='damage'&&e.actorId==='hero'&&e.target==='astral'&&e.damage===10)).toBe(true);
  });
  it('keeps reserved actor IDs as own intent and hit records',()=>{
    const def=fixture();def.actors[1]!.id='__proto__';
    const enc=createEncounter(def);expect(Object.hasOwn(enc.intents,'__proto__')).toBe(true);
    const next=enemyTurn(enc);const result=advanceEnemy(next);expect(result.ok).toBe(true);
    expect(Object.hasOwn(result.encounter.battle.enemyActions,'__proto__')).toBe(true);
  });
  it('still commits a previously announced heavy skill if another enemy consumed its required marks',()=>{
    const def=fixture();def.actors[0]!.readyAt=200;def.actors[0]!.lampMarks=1;
    def.actors[1]!.skillIds=['flare'];
    const foe2=fighter('foe2','enemy',4);foe2.body.y=4;foe2.astral!.y=4;foe2.order=1;foe2.skillIds=['flare'];def.actors.push(foe2);
    const enc=createEncounter(def);expect(enc.intents.foe2!.skillId).toBe('flare');
    const first=advanceEnemy(enc);expect(first.ok).toBe(true);expect(first.encounter.battle.actors[0]!.lampMarks).toBe(0);
    expect(first.encounter.intents.foe2!.reason).toBe('skill_condition_lost');
    const second=advanceEnemy(first.encounter);expect(second.ok).toBe(true);
    expect(second.encounter.battle.enemyActions.foe2).toBe(1);
    expect(second.encounter.battle.actors.find(a=>a.id==='foe2')!.readyAt).toBe(143);
  });
  it('plans a goal actor with a reserved ID before the first effective hit is recorded',()=>{
    const def=fixture();def.actors[0]!.id='__proto__';def.goal={kind:'survive_and_hit',actorId:'__proto__',enemyId:'foe',enemyActions:3};
    const enc=createEncounter(def);const commands=planPlayerTurn(enc);expect(commands.length).toBeGreaterThan(0);
    let next=enc;for(const command of commands)next=play(next,command);
    expect(Object.hasOwn(next.battle.hitEnemy,'__proto__')).toBe(true);
  });
  it('returns a complete legal player plan without modifying the input',()=>{
    const enc=createEncounter(fixture()),before=structuredClone(enc),commands=planPlayerTurn(enc);
    expect(commands.length).toBeGreaterThan(0);expect(enc).toEqual(before);
    let next=enc;for(const command of commands)next=play(next,command);
    expect(next.battle.turnNumber).toBeGreaterThan(enc.battle.turnNumber);
    expect(next.battle.actors[1]!.hp).toBeLessThan(100);
    expect(planPlayerTurn(enemyTurn(enc))).toEqual([]);
  });
});

describe('current damage forecasts for fixed enemy plans',()=>{
  it('reduces the forecast after guard without changing any announced targeting or movement',()=>{
    const enc=createEncounter(fixture()),intent=structuredClone(enc.intents.foe)!;
    expect(intent.expectedDamage).toBe(14);
    const guarded=play(enc,{actorId:'hero',type:'guard'});
    expect(guarded.intents.foe).toEqual({...intent,expectedDamage:0});
    const hit=advanceEnemy(guarded);expect(hit.ok).toBe(true);expect(hit.encounter.battle.actors[0]!.hp).toBe(100);
  });
  it('applies the recalled body multiplier to an existing unit lock',()=>{
    const enc=createEncounter(fixture()),intent=structuredClone(enc.intents.foe)!;
    const recalled=play(enc,{actorId:'hero',type:'recall'});
    expect(recalled.intents.foe).toEqual({...intent,expectedDamage:7});
    const hit=advanceEnemy(recalled);expect(hit.ok).toBe(true);expect(hit.encounter.battle.actors[0]!.hp).toBe(93);
  });
  it('shows zero on an emptied fixed point, restores its forecast on undo, and predicts the replacement unit',()=>{
    const def=fixture();def.intentModes={foe:'point'};
    const enc=createEncounter(def),intent=structuredClone(enc.intents.foe)!;
    const moved=play(enc,{actorId:'hero',type:'move_body',to:{x:0,y:2}});
    expect(moved.intents.foe).toEqual({...intent,expectedDamage:0});
    const undone=play(moved,{actorId:'hero',type:'undo'});expect(undone.intents.foe).toEqual(intent);
    const occupied=play(moved,{actorId:'hero',type:'move_astral',to:{x:1,y:2}});
    expect(occupied.intents.foe).toEqual({...intent,expectedDamage:10});
  });
  it('returns zero for interruption and never mutates the state or fixed plan while forecasting',()=>{
    const enc=createEncounter(fixture()),before=structuredClone(enc);
    expect(forecastIntentDamage(enc.battle,enc.intents.foe!)).toBe(14);expect(enc).toEqual(before);
    const moved=play(enc,{actorId:'hero',type:'move_body',to:{x:0,y:2}}),movedBefore=structuredClone(moved);
    expect(moved.intents.foe!.status).toBe('interrupted');expect(moved.intents.foe!.expectedDamage).toBe(0);
    expect(forecastIntentDamage(moved.battle,moved.intents.foe!)).toBe(0);expect(moved).toEqual(movedBefore);
  });
  it('includes collision damage only for the actual target owner',()=>{
    const def=fixture();def.actors[1]!.body={x:3,y:2};def.actors[1]!.astral={x:2,y:2};def.actors[1]!.skillIds=['rush'];
    const ally=fighter('ally','player',0);ally.order=1;def.actors.push(ally);
    const enc=createEncounter(def);expect(enc.intents.foe!.targetId).toBe('hero');expect(enc.intents.foe!.target).toBe('body');
    expect(enc.intents.foe!.expectedDamage).toBe(39);
    let next=enemyTurn(enc);next=play(next,{actorId:'ally',type:'wait'});
    const hit=advanceEnemy(next);expect(hit.ok).toBe(true);
    expect(hit.encounter.battle.actors.find(a=>a.id==='hero')!.hp).toBe(61);
    expect(hit.encounter.battle.actors.find(a=>a.id==='ally')!.hp).toBe(90);
  });
  it('respects a legal story HP floor when forecasting a committed skill',()=>{
    const def=fixture();def.actors[0]!.astral={x:2,y:2};def.actors[0]!.skillIds=['laurel_bolt'];
    def.goal={kind:'survive_and_hit',actorId:'hero',enemyId:'foe',enemyActions:3};def.hpFloors={foe:95};
    const state=createBattle(def),hero=state.actors[0]!;
    const intent:EnemyIntent={actorId:'hero',mode:'unit',skillId:'laurel_bolt',targetId:'foe',target:'body',cell:{x:4,y:2},expectedDamage:0,status:'ready',
      origin:{body:{...hero.body},astral:{...hero.astral!}},commands:[{type:'skill',actorId:'hero',skillId:'laurel_bolt',targetId:'foe',target:'body'}]};
    const before=structuredClone({state,intent});expect(forecastIntentDamage(state,intent)).toBe(5);
    expect({state,intent}).toEqual(before);
  });
});
