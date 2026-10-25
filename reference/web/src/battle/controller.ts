import {applyBattleCommand,type BattleCommand,type BattleDefinition,type BattleEvent} from './engine.ts';
import {advanceEnemy as advanceEncounterEnemy,commandEncounter,createEncounter,type Encounter,type EncounterResult} from './encounter.ts';
import {manhattan} from './math.ts';
import type {BattleActor,DamageTarget,Point} from './model.ts';
import {getSkill} from './skills.ts';

export type BattleMode='command'|'skills'|'move_body'|'move_astral'|'manifest'|'target'|'outcome';
export type BattleInput='up'|'down'|'left'|'right'|'confirm'|'cancel';
export interface BattleOption {id:string;labelKey:string}
export interface BattlePreview {valid:boolean;damage?:number;absorbed?:number;heal?:number;shield?:number;reason?:string}
interface TargetCell {actorId:string;unit:DamageTarget;cell:Point}
const same=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y;

/** Input state only: every accepted action still goes through the shared encounter engine. */
export class BattleController {
  encounter:Encounter;
  mode:BattleMode='command';
  selection=0;
  cursor:Point={x:0,y:0};
  message='battle.prompt.command';
  exitRequested=false;
  selectedSkillId:string|null=null;
  private readonly definition:BattleDefinition;
  private skillSelection=0;

  constructor(definition:BattleDefinition) {
    this.definition=structuredClone(definition);
    this.encounter=createEncounter(this.definition);
    this.resetInput();
  }

  get actor():BattleActor {return this.encounter.battle.actors.find(actor=>actor.id===this.encounter.battle.activeId)!;}
  get isEnemyTurn():boolean {return this.encounter.battle.phase==='active'&&this.actor.team==='enemy';}

  options():BattleOption[] {
    if(this.mode==='outcome')return (this.encounter.battle.phase==='won'?['return','retry']:['retry','return'])
      .map(id=>({id,labelKey:`battle.outcome.${id}`}));
    if(this.isEnemyTurn)return [];
    if(this.mode==='skills')return (this.actor.skillIds??['basic_strike']).map(id=>({id,labelKey:`battle.skill.${id}`}));
    if(this.mode==='command')return ['move_body','move_astral','skills','guard',this.actor.mode==='recalled'?'manifest':'recall','undo','wait']
      .map(id=>({id,labelKey:`battle.command.${id}`}));
    return [];
  }

  handle(action:BattleInput):BattleEvent[] {
    if(this.exitRequested||this.isEnemyTurn)return [];
    if(action==='cancel')return this.cancel();
    if(this.isGridMode()){
      if(action==='confirm')return this.confirmCell();
      const board=this.encounter.battle;
      this.cursor={x:Math.max(0,Math.min(board.width-1,this.cursor.x+(action==='left'?-1:action==='right'?1:0))),
        y:Math.max(0,Math.min(board.height-1,this.cursor.y+(action==='up'?-1:action==='down'?1:0)))};
      this.setPrompt();return [];
    }
    if(action==='confirm')return this.choose(this.selection);
    const count=this.options().length;if(!count)return [];
    if(action==='up'||action==='down')this.selection=(this.selection+(action==='up'?-1:1)+count)%count;
    else{
      const next=this.selection+(action==='left'?-4:4);
      if(next>=0&&next<count)this.selection=next;
    }
    this.setPrompt();return [];
  }

  choose(index:number):BattleEvent[] {
    if(this.exitRequested||this.isEnemyTurn||!Number.isInteger(index))return [];
    const option=this.options()[index];if(!option)return [];
    this.selection=index;
    if(this.mode==='outcome'){
      if(option.id==='retry')this.restart();else this.exitRequested=true;
      return [];
    }
    if(this.mode==='skills'){
      this.skillSelection=index;this.selectedSkillId=option.id;this.mode='target';
      const skill=getSkill(option.id),origin=this.actor.astral??this.actor.body;
      const candidates=this.targetCells().filter(target=>{
        const actor=this.encounter.battle.actors.find(entry=>entry.id===target.actorId)!;
        return skill?.effect==='damage'?actor.team!==this.actor.team:actor.team===this.actor.team;
      }).sort((a,b)=>manhattan(a.cell,origin)-manhattan(b.cell,origin)||a.cell.y-b.cell.y||a.cell.x-b.cell.x);
      const legal=candidates.find(target=>applyBattleCommand(this.encounter.battle,this.skillCommand(target)).ok);
      this.cursor={...(legal??candidates[0])?.cell??origin};this.setPrompt();return [];
    }
    if(option.id==='skills'){
      this.mode='skills';this.selection=0;this.setPrompt();return [];
    }
    if(option.id==='move_body'||option.id==='move_astral'||option.id==='manifest'){
      this.mode=option.id;
      this.cursor={...(option.id==='move_astral'?this.actor.astral??this.actor.body:this.actor.body)};
      if(option.id==='manifest'){
        const body=this.actor.body;
        const adjacent=[{x:body.x,y:body.y-1},{x:body.x-1,y:body.y},{x:body.x+1,y:body.y},{x:body.x,y:body.y+1}];
        const legal=adjacent.find(to=>applyBattleCommand(this.encounter.battle,{type:'manifest',actorId:this.actor.id,to}).ok);
        if(legal)this.cursor={...legal};
      }
      this.setPrompt();return [];
    }
    return this.commit({actorId:this.actor.id,type:option.id as 'guard'|'recall'|'undo'|'wait'});
  }

  /** A board click confirms exactly this cell, including invalid or empty targets. */
  clickCell(cell:Point):BattleEvent[] {
    if(this.exitRequested||this.isEnemyTurn||!this.isGridMode())return [];
    const board=this.encounter.battle;
    if(!Number.isInteger(cell.x)||!Number.isInteger(cell.y)||cell.x<0||cell.y<0||cell.x>=board.width||cell.y>=board.height)
      return this.reject('invalid_destination');
    this.cursor={...cell};return this.confirmCell();
  }

  advanceEnemy():BattleEvent[] {
    if(this.exitRequested||!this.isEnemyTurn)return [];
    return this.accept(advanceEncounterEnemy(this.encounter));
  }

  preview():BattlePreview {
    if(this.exitRequested||this.isEnemyTurn||!this.isGridMode())return {valid:false};
    const command=this.cellCommand();if(!command)return {valid:false,reason:'target_unavailable'};
    const result=applyBattleCommand(this.encounter.battle,command);
    if(!result.ok)return {valid:false,reason:result.events.find(event=>event.type==='invalid')?.reason};
    const preview:BattlePreview={valid:true};
    if(command.type==='skill')for(const event of result.events){
      if(!('actorId'in event)||event.actorId!==command.targetId)continue;
      if(event.type==='damage'){
        preview.damage=(preview.damage??0)+event.damage;preview.absorbed=(preview.absorbed??0)+event.absorbed;
      }else if(event.type==='heal')preview.heal=(preview.heal??0)+event.amount;
      else if(event.type==='shield')preview.shield=(preview.shield??0)+event.amount;
    }
    return preview;
  }

  restart():void {
    this.encounter=createEncounter(this.definition);this.exitRequested=false;this.resetInput();
  }

  private isGridMode():boolean {return ['move_body','move_astral','manifest','target'].includes(this.mode);}
  private setPrompt():void {
    this.message=this.mode==='outcome'?`battle.result.${this.encounter.battle.phase}`:`battle.prompt.${this.isEnemyTurn?'enemy':this.mode}`;
  }
  private resetInput():void {
    this.mode=this.encounter.battle.phase==='active'?'command':'outcome';this.selection=0;
    this.skillSelection=0;this.selectedSkillId=null;this.cursor={...this.actor.body};this.setPrompt();
  }
  private targetCells():TargetCell[] {
    return this.encounter.battle.actors.filter(actor=>actor.hp>0).flatMap(actor=>[
      {actorId:actor.id,unit:'body' as const,cell:actor.body},
      ...(actor.mode==='manifested'&&actor.astral?[{actorId:actor.id,unit:'astral' as const,cell:actor.astral}]:[])
    ]);
  }
  private skillCommand(target:TargetCell):BattleCommand {
    return {type:'skill',actorId:this.actor.id,skillId:this.selectedSkillId!,targetId:target.actorId,target:target.unit};
  }
  private cellCommand():BattleCommand|undefined {
    if(this.mode==='target'){
      const target=this.targetCells().find(target=>same(target.cell,this.cursor));
      return target&&this.selectedSkillId?this.skillCommand(target):undefined;
    }
    if(this.mode==='move_body'||this.mode==='move_astral'||this.mode==='manifest')
      return {type:this.mode,actorId:this.actor.id,to:{...this.cursor}};
    return undefined;
  }
  private confirmCell():BattleEvent[] {
    const command=this.cellCommand();return command?this.commit(command):this.reject('target_unavailable');
  }
  private commit(command:BattleCommand):BattleEvent[] {return this.accept(commandEncounter(this.encounter,command));}
  private accept(result:EncounterResult):BattleEvent[] {
    if(result.ok){this.encounter=result.encounter;this.resetInput();}
    else this.message=`battle.error.${result.events.find(event=>event.type==='invalid')?.reason??'unknown_command'}`;
    return result.events;
  }
  private reject(reason:string):BattleEvent[] {this.message=`battle.error.${reason}`;return [{type:'invalid',reason}];}
  private cancel():BattleEvent[] {
    if(this.mode==='outcome')return [];
    if(this.mode==='command')return this.commit({actorId:this.actor.id,type:'undo'});
    if(this.mode==='target'){this.mode='skills';this.selection=this.skillSelection;this.selectedSkillId=null;}
    else{this.selection=this.mode==='skills'?2:this.mode==='move_body'?0:this.mode==='move_astral'?1:4;this.mode='command';}
    this.setPrompt();return [];
  }
}
