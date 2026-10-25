import { describe, expect, it } from 'vitest';
import { applyBattleCommand, createBattle, type BattleCommand, type BattleDefinition, type BattleState } from '../../reference/web/src/battle/engine.ts';
import { validateActor } from '../../reference/web/src/battle/math.ts';
import type { BattleActor, DamageTarget } from '../../reference/web/src/battle/model.ts';

const allSkills=['basic_strike','lamp_punch','flare','laurel_bolt','laurel_heal','laurel_shield','rush'];
function fighter(id='finn',team:'player'|'enemy'='player'):BattleActor {
  return {id,team,order:team==='player'?0:1,body:{x:team==='player'?1:4,y:2},astral:{x:team==='player'?2:3,y:2},kind:'close',mode:'manifested',hp:100,maxHp:100,will:8,maxWill:20,shield:0,chart:{pow:40,spd:60,rch:40,end:50,prc:50,pot:80},reach:3,readyAt:0,skillIds:[...allSkills],lampMarks:0};
}
function definition(extra:Partial<BattleDefinition>={}):BattleDefinition {
  return {id:'actions',width:9,height:7,blocked:[],actors:[fighter(),fighter('shade','enemy')],...extra};
}
function setup(extra:Partial<BattleDefinition>={}):BattleState { return createBattle(definition(extra)); }
function command(state:BattleState,cmd:BattleCommand):BattleState {
  const result=applyBattleCommand(state,cmd);expect(result.ok,JSON.stringify(result.events)).toBe(true);return result.state;
}
function cast(state:BattleState,skillId:string,targetId='shade',target:DamageTarget='astral'):BattleState {
  return command(state,{actorId:state.activeId,type:'skill',skillId,targetId,target});
}
function returnTo(state:BattleState,id='finn'):BattleState {
  for(let i=0;i<10&&state.phase==='active'&&state.activeId!==id;i++)state=command(state,{actorId:state.activeId,type:'wait'});
  expect(state.activeId).toBe(id);return state;
}
const get=(state:BattleState,id='finn')=>state.actors.find(a=>a.id===id)!;
const goal={kind:'survive_and_hit' as const,actorId:'finn',enemyId:'shade',enemyActions:3};

describe('data-driven battle skills',()=>{
  it('defaults to basic strike, applies one shared damage result and commits one normal action',()=>{
    const def=definition();delete def.actors[0]!.skillIds;
    const before=createBattle(def);const result=applyBattleCommand(before,{actorId:'finn',type:'skill',skillId:'basic_strike',targetId:'shade',target:'astral'});
    expect(result.ok).toBe(true);expect(get(result.state,'shade').hp).toBe(87);expect(get(result.state).readyAt).toBe(100);
    expect(result.state.turnNumber).toBe(2);expect(result.state.activeId).toBe('shade');
    expect(result.events.some(e=>e.type==='damage')).toBe(true);expect(get(before,'shade').hp).toBe(100);
  });
  it.each([
    {skillId:'missing',targetId:'shade',target:'astral'},
    {skillId:'laurel_heal',targetId:'shade',target:'body'},
    {skillId:'basic_strike',targetId:'finn',target:'body'},
    {skillId:'flare',targetId:'shade',target:'astral'},
    {skillId:'basic_strike',targetId:'missing',target:'body'},
    {skillId:'basic_strike',targetId:'shade',target:'missing'},
  ])('rejects invalid skill %j without spending resources, movement or turn',data=>{
    let state=setup();state=command(state,{actorId:'finn',type:'move_body',to:{x:1,y:3}});
    const before=structuredClone(state);
    const result=applyBattleCommand(state,{actorId:'finn',type:'skill',...data} as BattleCommand);
    expect(result.ok).toBe(false);expect(result.state).toBe(state);expect(state).toEqual(before);
  });
  it('restricts explicit skill lists and refuses insufficient will',()=>{
    const def=definition();def.actors[0]!.skillIds=['basic_strike'];let state=createBattle(def);
    expect(applyBattleCommand(state,{actorId:'finn',type:'skill',skillId:'lamp_punch',targetId:'shade',target:'astral'}).ok).toBe(false);
    state=setup();get(state).will=2;get(state,'shade').lampMarks=1;
    const result=applyBattleCommand(state,{actorId:'finn',type:'skill',skillId:'flare',targetId:'shade',target:'astral'});
    expect(result.ok).toBe(false);expect(result.state).toBe(state);expect(get(state).will).toBe(2);
  });
  it('rejects recalled targets, unmanifested casters, out-of-range and out-of-tether casts',()=>{
    const state=setup();get(state,'shade').mode='recalled';get(state,'shade').astral=null;
    expect(applyBattleCommand(state,{actorId:'finn',type:'skill',skillId:'basic_strike',targetId:'shade',target:'astral'}).ok).toBe(false);
    expect(applyBattleCommand(state,{actorId:'finn',type:'skill',skillId:'basic_strike',targetId:'shade',target:'body'}).ok).toBe(false);
    get(state).mode='recalled';get(state).astral=null;
    expect(applyBattleCommand(state,{actorId:'finn',type:'skill',skillId:'laurel_bolt',targetId:'shade',target:'body'}).ok).toBe(false);
    get(state).mode='manifested';get(state).astral={x:7,y:2};
    expect(applyBattleCommand(state,{actorId:'finn',type:'skill',skillId:'laurel_bolt',targetId:'shade',target:'body'}).ok).toBe(false);
  });
  it('blocks straight and diagonal shots that touch walls',()=>{
    const def=definition();def.actors[1]!.astral={x:5,y:2};def.actors[1]!.body={x:6,y:2};def.blocked=[{x:3,y:2}];
    const straight=createBattle(def);get(straight,'shade').lampMarks=1;
    expect(applyBattleCommand(straight,{actorId:'finn',type:'skill',skillId:'flare',targetId:'shade',target:'astral'}).ok).toBe(false);
    def.actors[1]!.astral={x:3,y:3};def.actors[1]!.body={x:4,y:3};
    const diagonal=createBattle(def);get(diagonal,'shade').lampMarks=1;
    expect(applyBattleCommand(diagonal,{actorId:'finn',type:'skill',skillId:'flare',targetId:'shade',target:'astral'}).ok).toBe(false);
  });
  it('stores capped lamp marks on the owner and detonates them from the other target unit',()=>{
    let state=setup();get(state,'shade').hp=300;get(state,'shade').maxHp=300;
    for(let i=0;i<4;i++){state=cast(state,'lamp_punch');state=returnTo(state);}
    expect(get(state,'shade').lampMarks).toBe(3);expect(get(state,'shade').hp).toBe(244);
    const beforeWill=get(state).will;const beforeReady=get(state).readyAt;
    state=cast(state,'flare','shade','body');
    expect(get(state,'shade').hp).toBe(201);expect(get(state,'shade').lampMarks).toBe(0);
    expect(get(state).will).toBe(beforeWill-3);expect(get(state).readyAt).toBe(beforeReady+130);
  });
  it('heals and shields allies with precision scaling and caps healing at max HP',()=>{
    let state=setup();get(state).hp=60;
    state=cast(state,'laurel_heal','finn','body');expect(get(state).hp).toBe(87);
    state=returnTo(state);state=cast(state,'laurel_heal','finn','astral');expect(get(state).hp).toBe(100);
    state=returnTo(state);state=cast(state,'laurel_shield','finn','body');expect(get(state).shield).toBe(23);
    state=returnTo(state);state=cast(state,'laurel_shield','finn','body');expect(get(state).shield).toBe(23);
  });
  it('never resurrects a defeated ally through healing',()=>{
    const def=definition();const fallen=fighter('fallen');fallen.hp=0;fallen.mode='extinguished';fallen.astral=null;fallen.body={x:1,y:3};def.actors.push(fallen);
    const state=createBattle(def);const result=applyBattleCommand(state,{actorId:'finn',type:'skill',skillId:'laurel_heal',targetId:'fallen',target:'body'});
    expect(result.ok).toBe(false);expect(get(state,'fallen').hp).toBe(0);
  });
  it('validates optional marks and skill-list structure at the shared actor boundary',()=>{
    for(const patch of [{lampMarks:-1},{lampMarks:4},{lampMarks:NaN},{skillIds:['basic_strike','basic_strike']},{skillIds:['']},{skillIds:'basic_strike'}]){
      expect(()=>validateActor({...fighter(),...patch} as BattleActor)).toThrow();
    }
  });
});

describe('body actions and free manifestation',()=>{
  it('recalls as a light main action, protects the body and restores four will next turn',()=>{
    let state=setup();get(state).will=0;
    state=command(state,{actorId:'finn',type:'recall'});
    expect(get(state)).toMatchObject({mode:'recalled',astral:null,readyAt:70,will:0});
    state=cast(state,'laurel_bolt','finn','body');
    expect(get(state).hp).toBe(93);expect(get(state).will).toBe(4);
  });
  it('manifests once for free at an adjacent open cell and undo never restores eligibility',()=>{
    const def=definition();def.actors[0]!.mode='recalled';def.actors[0]!.astral=null;
    let state=createBattle(def);const will=get(state).will;
    state=command(state,{actorId:'finn',type:'manifest',to:{x:2,y:2}});
    expect(state.turnNumber).toBe(1);expect(state.activeId).toBe('finn');expect(get(state).will).toBe(will);expect(state.manifestUsed).toBe(true);
    state=command(state,{actorId:'finn',type:'move_astral',to:{x:2,y:3}});
    state=command(state,{actorId:'finn',type:'undo'});
    expect(get(state)).toMatchObject({mode:'manifested',astral:{x:2,y:2}});expect(state.manifestUsed).toBe(true);
    expect(applyBattleCommand(state,{actorId:'finn',type:'manifest',to:{x:2,y:2}}).ok).toBe(false);
    expect(cast(state,'basic_strike').activeId).toBe('shade');
  });
  it('rejects manifestation after movement and onto distant, occupied or blocked cells',()=>{
    const def=definition();def.actors[0]!.mode='recalled';def.actors[0]!.astral=null;def.blocked=[{x:1,y:1}];
    const state=createBattle(def);
    for(const to of [{x:1,y:1},{x:3,y:2},{x:1,y:2},{x:1,y:4}])expect(applyBattleCommand(state,{actorId:'finn',type:'manifest',to}).ok).toBe(false);
    const moved=command(state,{actorId:'finn',type:'move_body',to:{x:1,y:3}});
    expect(applyBattleCommand(moved,{actorId:'finn',type:'manifest',to:{x:2,y:3}}).ok).toBe(false);
  });
  it('guards without stacking unlimited shield or spending will',()=>{
    let state=setup();const will=get(state).will;
    state=command(state,{actorId:'finn',type:'guard'});expect(get(state).shield).toBe(20);expect(get(state).will).toBe(will);
    state=returnTo(state);state=command(state,{actorId:'finn',type:'guard'});expect(get(state).shield).toBe(20);
  });
});

describe('knockback and collision',()=>{
  it('pushes a body one cell and pulls its astral back within its tether',()=>{
    const def=definition();def.actors[1]!.body={x:3,y:2};def.actors[1]!.astral={x:3,y:3};def.actors[1]!.reach=1;
    const before=createBattle(def);const result=applyBattleCommand(before,{actorId:'finn',type:'skill',skillId:'rush',targetId:'shade',target:'body'});
    expect(result.ok).toBe(true);expect(get(result.state,'shade').body).toEqual({x:4,y:2});expect(get(result.state,'shade').astral).toEqual({x:3,y:2});
    expect(result.events.some(e=>e.type==='knockback')).toBe(true);expect(result.events.some(e=>e.type==='tether_pull')).toBe(true);
    expect(get(before,'shade').body).toEqual({x:3,y:2});
  });
  it('applies wall collision damage without pushing through a wall',()=>{
    const def=definition();def.actors[1]!.body={x:3,y:2};def.actors[1]!.astral={x:3,y:3};def.blocked=[{x:4,y:2}];
    const result=applyBattleCommand(createBattle(def),{actorId:'finn',type:'skill',skillId:'rush',targetId:'shade',target:'body'});
    expect(result.ok).toBe(true);expect(get(result.state,'shade').hp).toBe(61); // round(24×1×1.5×.8)=29, then 10.
    expect(get(result.state,'shade').body).toEqual({x:3,y:2});expect(result.events.some(e=>e.type==='collision')).toBe(true);
  });
  it('damages both colliding owners once and never moves the struck blocker',()=>{
    const def=definition();def.actors[1]!.body={x:3,y:2};def.actors[1]!.astral={x:3,y:3};
    const blocker=fighter('blocker','enemy');blocker.body={x:4,y:2};blocker.astral={x:5,y:2};def.actors.push(blocker);
    const state=cast(createBattle(def),'rush','shade','body');
    expect(get(state,'shade').hp).toBe(61);expect(get(state,'blocker').hp).toBe(90);expect(get(state,'blocker').body).toEqual({x:4,y:2});
  });
  it('settles a collision with the same owner only once',()=>{
    const state=cast(setup(),'rush','shade','astral');
    expect(get(state,'shade').hp).toBe(71); // 19 strike damage + one 10-point shared collision.
    expect(get(state,'shade').body).toEqual({x:4,y:2});expect(get(state,'shade').astral).toEqual({x:3,y:2});
  });
  it('does not knock back a target already defeated by the initial strike',()=>{
    const state=setup();get(state,'shade').hp=1;
    const result=applyBattleCommand(state,{actorId:'finn',type:'skill',skillId:'rush',targetId:'shade',target:'astral'});
    expect(result.ok).toBe(true);expect(result.events.some(e=>e.type==='knockback'||e.type==='collision')).toBe(false);
    expect(get(result.state,'shade')).toMatchObject({hp:0,mode:'extinguished',astral:null});
  });
  it('resolves simultaneous collision KOs as defeat before ordinary victory',()=>{
    const def=definition();def.actors[0]!.body={x:4,y:2};def.actors[0]!.hp=10;
    def.actors[1]!.body={x:3,y:2};def.actors[1]!.astral={x:3,y:3};def.actors[1]!.hp=39;
    // Attacker's astral is two cells from its body, within the full-strength half of reach 3.
    const state=cast(createBattle(def),'rush','shade','body');
    expect(state.actors.every(a=>a.hp===0)).toBe(true);expect(state.phase).toBe('lost');
  });
});

describe('battle outcomes and survival objectives',()=>{
  it('wins normal battles on the last enemy KO and rejects further commands',()=>{
    const state=setup();get(state,'shade').hp=1;
    const result=applyBattleCommand(state,{actorId:'finn',type:'skill',skillId:'basic_strike',targetId:'shade',target:'astral'});
    expect(result.state.phase).toBe('won');expect(get(result.state,'shade')).toMatchObject({hp:0,mode:'extinguished',astral:null});
    expect(result.events.some(e=>e.type==='ko')).toBe(true);expect(result.events.some(e=>e.type==='outcome')).toBe(true);
    expect(applyBattleCommand(result.state,{actorId:'finn',type:'wait'}).ok).toBe(false);
  });
  it('counts only successful enemy main actions and requires a real damaging hit',()=>{
    let state=setup({goal,hpFloors:{shade:1}});
    state=command(state,{actorId:'finn',type:'move_body',to:{x:1,y:3}});
    state=command(state,{actorId:'finn',type:'undo'});expect(state.enemyActions.shade??0).toBe(0);
    state=cast(state,'basic_strike');expect(state.hitEnemy.finn).toContain('shade');
    for(let i=0;i<20&&(state.enemyActions.shade??0)<2;i++)state=command(state,{actorId:state.activeId,type:'wait'});
    expect(state.phase).toBe('active');expect(state.enemyActions.shade).toBe(2);
    for(let i=0;i<20&&state.phase==='active';i++)state=command(state,{actorId:state.activeId,type:'wait'});
    expect(state.phase).toBe('won');expect(state.enemyActions.shade).toBe(3);
  });
  it('does not treat a fully absorbed hit as the required damaging hit',()=>{
    let state=setup({goal,hpFloors:{shade:1}});get(state,'shade').shield=999;
    state=cast(state,'basic_strike');expect(state.hitEnemy.finn??[]).not.toContain('shade');
    for(let i=0;i<8;i++)state=command(state,{actorId:state.activeId,type:'wait'});
    expect(state.enemyActions.shade).toBeGreaterThanOrEqual(3);expect(state.phase).toBe('active');
  });
  it('enforces an explicit enemy HP floor until the goal succeeds',()=>{
    let state=setup({goal,hpFloors:{shade:1}});get(state,'shade').hp=2;
    state=cast(state,'basic_strike');expect(get(state,'shade').hp).toBe(1);expect(state.phase).toBe('active');
    expect(state.hitEnemy.finn).toContain('shade');
  });
  it('counts damage through a shield at the initial story HP floor and wins after three enemy actions',()=>{
    const def=definition({goal,hpFloors:{shade:1}});def.actors[1]!.hp=1;def.actors[1]!.shield=5;
    const before=createBattle(def);let state=cast(before,'basic_strike');
    expect(get(state,'shade').hp).toBe(1);expect(get(state,'shade').shield).toBe(0);
    expect(state.hitEnemy.finn??[]).toContain('shade');expect(get(before,'shade').shield).toBe(5);
    for(let i=0;i<20&&state.phase==='active';i++)state=command(state,{actorId:state.activeId,type:'wait'});
    expect(state.phase).toBe('won');expect(state.enemyActions.shade).toBe(3);
  });
  it('lets the goal actor land its own qualifying hit after an ally reaches the HP floor',()=>{
    const def=definition({goal,hpFloors:{shade:1}});def.actors[0]!.order=1;def.actors[1]!.hp=2;
    const ally=fighter('ally');ally.body={x:4,y:4};ally.astral={x:4,y:3};ally.order=0;def.actors.push(ally);
    let state=createBattle(def);expect(state.activeId).toBe('ally');
    state=cast(state,'laurel_bolt','shade','body');expect(get(state,'shade').hp).toBe(1);
    expect(state.hitEnemy.ally).toContain('shade');expect(state.hitEnemy.finn??[]).not.toContain('shade');
    expect(state.activeId).toBe('finn');state=cast(state,'basic_strike');expect(state.hitEnemy.finn??[]).toContain('shade');
    for(let i=0;i<30&&state.phase==='active';i++)state=command(state,{actorId:state.activeId,type:'wait'});
    expect(state.phase).toBe('won');expect(state.enemyActions.shade).toBe(3);
  });
  it('fails if the goal actor dies on the third enemy action, even with another player alive',()=>{
    const def=definition({goal,hpFloors:{shade:1}});const ally=fighter('ally');ally.body={x:7,y:4};ally.astral={x:7,y:5};ally.readyAt=10000;def.actors.push(ally);
    let state=cast(createBattle(def),'basic_strike');
    for(let i=0;i<20&&((state.enemyActions.shade??0)<2||state.activeId!=='shade');i++)state=command(state,{actorId:state.activeId,type:'wait'});
    expect(state.activeId).toBe('shade');expect(state.enemyActions.shade).toBe(2);
    get(state).hp=1;state=cast(state,'laurel_bolt','finn','body');
    expect(state.enemyActions.shade).toBe(3);expect(state.phase).toBe('lost');expect(get(state,'ally').hp).toBe(100);
  });
  it('does not turn premature objective-enemy KO into an ordinary victory',()=>{
    const state=setup({goal});get(state,'shade').hp=1;
    expect(cast(state,'basic_strike').phase).toBe('lost');
  });
  it('rejects invalid goals and HP floors outside the objective enemy',()=>{
    const invalid:Partial<BattleDefinition>[]=[
      {hpFloors:{shade:1}}, {goal,hpFloors:{finn:1}}, {goal,hpFloors:{shade:0}}, {goal,hpFloors:{shade:100}},
      {goal:{...goal,enemyId:'missing'}}, {goal:{...goal,enemyActions:0}},
    ];
    for(const extra of invalid)expect(()=>setup(extra)).toThrow();
  });
  it.each(['constructor','__proto__'])('keeps legal actor ID %s safe in hit/action/floor records',id=>{
    const def=definition({goal:{...goal,actorId:id,enemyId:'enemy'},hpFloors:{enemy:1}});
    def.actors[0]!.id=id;def.actors[1]!.id='enemy';
    let state=cast(createBattle(def),'basic_strike','enemy');
    expect(state.hitEnemy[id]).toEqual(['enemy']);
    state=cast(state,'laurel_bolt',id,'body');expect(get(state,id).hp).toBe(86);
    const enemyDefinition=definition();enemyDefinition.actors[1]!.id=id;
    state=command(createBattle(enemyDefinition),{actorId:'finn',type:'wait'});
    state=command(state,{actorId:id,type:'wait'});expect(state.enemyActions[id]).toBe(1);
  });
});
