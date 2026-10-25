import {BattleController,type BattleInput} from '../battle/controller.ts';
import {applyBattleCommand,type BattleDefinition,type BattleEvent,type BattleState} from '../battle/engine.ts';
import {actionInterval,orderTimeline} from '../battle/math.ts';
import type {BattleActor,Point} from '../battle/model.ts';
import {getSkill} from '../battle/skills.ts';
import {Assets} from '../render/assets.ts';
import {phaseFor} from '../render/animation.ts';
import {text,centered,lines} from '../render/text.ts';
import {cameraOffset,type GameState,type MapData,type Entity} from '../systems/world.ts';
import {renderWorld} from '../render/world.ts';
import {t,words} from '../content.ts';
import {actorArt} from './battle-catalog.ts';
import {commandAt,commandPosition} from './battle-layout.ts';
import type {AudioPlayer} from '../audio/player.ts';

type Clip={event:BattleEvent;age:number;duration:number;started?:boolean};
const label=(key:string)=>words[key]??t('battle.preview.invalid');
const duration=(e:BattleEvent)=>e.type==='move'?Math.max(6,(e.path.length-1)*5):e.type==='damage'?30:e.type==='heal'?45:e.type==='manifest'?36:e.type==='recall'?24:e.type==='knockback'?8:e.type==='tether_pull'?6:e.type==='skill'?15:e.type==='collision'?8:e.type==='ko'?10:e.type==='shield'?18:e.type==='cancelled_skill'?20:e.type==='outcome'?18:0;
function pixelLine(ctx:CanvasRenderingContext2D,a:Point,b:Point,color:string,dotted=false):void {
  let x=Math.round(a.x),y=Math.round(a.y);const dx=Math.abs(Math.round(b.x)-x),dy=-Math.abs(Math.round(b.y)-y),sx=x<b.x?1:-1,sy=y<b.y?1:-1;let error=dx+dy,n=0;
  ctx.fillStyle=color;for(;;){if(!dotted||n++%3!==2)ctx.fillRect(x,y,1,1);if(x===Math.round(b.x)&&y===Math.round(b.y))break;const twice=2*error;if(twice>=dy){error+=dy;x+=sx;}if(twice<=dx){error+=dx;y+=sy;}}
}
function dither(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string):void {ctx.fillStyle=color;for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if((xx+yy*2)%4===0)ctx.fillRect(xx,yy,1,1);}

/** Presentation plays the immutable engine's event list; frame timing never advances battle rules. */
export class BattleScene {
  readonly controller:BattleController;
  readonly origin:Point;
  speed=1;
  private queue:Clip[]=[];
  private shown:BattleActor[];
  private actingId:string;
  private enemyDelay=40;
  private audio:AudioPlayer;
  private map:MapData;
  private world:GameState;
  private props:{entity:Entity;at:Point;depth:number}[]=[];
  private hiddenProps:string[]=[];
  private rangeState:BattleState|undefined;
  private rangeMode='';
  private rangeCells:Point[]=[];
  private attack:{sourceId:string;targetId:string;skillId:string;target:'body'|'astral';age:number;direction:'left'|'right'}|undefined;
  private hurt:{id:string;unit:'body'|'astral';age:number}|undefined;
  private freeze=0;
  private ribbon='';
  constructor(definition:BattleDefinition,map:MapData,world:GameState,arena:Point,audio:AudioPlayer){
    this.controller=new BattleController(definition);this.map=map;this.world=structuredClone(world);this.audio=audio;
    const cx=cameraOffset(world.player.x*16+8,map.width*16,480),cy=cameraOffset(world.player.y*16+8,map.height*16,270);
    this.props=map.entities.filter(e=>e.kind==='decoration'&&e.x>=arena.x&&e.y>=arena.y&&e.x<arena.x+definition.width&&e.y<arena.y+definition.height).map(entity=>({entity,at:{x:entity.x*16+8-cx,y:entity.y*16+16-cy},depth:entity.y-arena.y})).sort((a,b)=>a.depth-b.depth);this.hiddenProps=this.props.map(p=>p.entity.id);
    this.origin={x:arena.x*16-cx,y:arena.y*16-cy};this.shown=structuredClone(this.controller.encounter.battle.actors);this.actingId=this.controller.actor.id;
  }
  get busy():boolean{return this.queue.length>0;}
  get exitRequested():boolean{return this.controller.exitRequested;}
  toggleSpeed():void{this.speed=this.speed===1?2:this.speed===2?0:1;this.audio.play('step');}
  handle(action:BattleInput):void {
    if(this.busy){
      const draft=this.queue.every(c=>['move','tether_pull','undo','intent_status'].includes(c.event.type));
      if(action==='cancel'&&draft){this.queue=[];this.shown=structuredClone(this.controller.encounter.battle.actors);}else {this.audio.play('deny');return;}
    }
    if(this.controller.isEnemyTurn){this.audio.play('deny');return;}
    const before=structuredClone(this.controller.encounter.battle.actors);const actorId=this.controller.actor.id;
    const events=this.controller.handle(action);this.capture(events,before,actorId);
    if(!events.length)this.audio.play(action==='cancel'?'cancel':'step');
  }
  click(x:number,y:number):void {
    if(this.busy||this.controller.isEnemyTurn){this.audio.play('deny');return;}
    const before=structuredClone(this.controller.encounter.battle.actors),actorId=this.controller.actor.id;
    let events:BattleEvent[]=[];
    const option=commandAt(x,y,this.controller.options().length);
    if(option!==undefined)events=this.controller.choose(option);
    else if(x>=this.origin.x&&y>=this.origin.y)events=this.controller.clickCell({x:Math.floor((x-this.origin.x)/16),y:Math.floor((y-this.origin.y)/16)});
    this.capture(events,before,actorId);
  }
  update():void {
    const count=this.speed===0?200:this.speed;
    for(let n=0;n<count;n++){
      const clip=this.queue[0];
      if(clip){
        if(!clip.started){clip.started=true;this.startClip(clip.event);}
        if(this.freeze>0&&this.speed!==0){this.freeze--;if(this.hurt)this.hurt.age++;break;}
        clip.age++;if(this.attack)this.attack.age++;if(this.hurt)this.hurt.age++;
        if(clip.age>=clip.duration){this.applyVisual(clip.event);this.queue.shift();}continue;
      }
      this.attack=undefined;this.hurt=undefined;this.freeze=0;
      this.shown=structuredClone(this.controller.encounter.battle.actors);this.actingId=this.controller.actor.id;
      if(this.controller.isEnemyTurn){if(--this.enemyDelay<=0){const before=structuredClone(this.shown),id=this.actingId;this.capture(this.controller.advanceEnemy(),before,id);this.enemyDelay=40;}}else this.enemyDelay=40;
      break;
    }
  }
  private capture(events:BattleEvent[],before:BattleActor[],actorId:string):void {
    if(events.some(e=>e.type==='invalid')){this.audio.play('deny');return;}
    if(events.length){this.shown=before;this.actingId=actorId;this.queue=events.map(event=>({event,age:0,duration:duration(event)}));this.ribbon=events.some(e=>e.type==='skill')?this.skillRibbon(events):this.actionText();}
    else {this.shown=structuredClone(this.controller.encounter.battle.actors);this.actingId=this.controller.actor.id;}
  }
  private skillRibbon(events:BattleEvent[]):string {const event=events.find(e=>e.type==='skill');return event?.type==='skill'?`${t(`name.${event.actorId}`)}  ·  ${t(`battle.skill.${event.skillId}`)}`:'';}
  private startClip(event:BattleEvent):void {
    if(event.type==='skill'){
      const source=this.shown.find(a=>a.id===event.actorId)!,target=this.shown.find(a=>a.id===event.targetId)!;
      this.attack={sourceId:source.id,targetId:target.id,target:event.target,skillId:event.skillId,age:0,direction:(event.target==='body'?target.body:target.astral??target.body).x>=(source.astral??source.body).x?'right':'left'};
      this.audio.play('battle_cast');
    }
    if(event.type==='damage'){this.hurt={id:event.actorId,unit:event.target,age:0};this.freeze=3;this.audio.play('battle_hit');}
    if(event.type==='heal')this.audio.play('battle_heal');
    if(event.type==='shield')this.audio.play('battle_guard');
    if(event.type==='outcome')this.audio.play(event.phase==='won'?'battle_win':'battle_lose');
    if(event.type==='move')this.audio.play('step');
  }
  private applyVisual(event:BattleEvent):void {
    if(!('actorId'in event))return;const a=this.shown.find(a=>a.id===event.actorId);if(!a)return;
    if(event.type==='move'||event.type==='knockback'){if(event.unit==='body')a.body=event.to;else a.astral=event.to;}
    if(event.type==='tether_pull')a.astral=event.to;
    if(event.type==='damage'){a.hp=event.hp;a.shield=Math.max(0,a.shield-event.absorbed);}
    if(event.type==='heal')a.hp=event.hp;
    if(event.type==='shield')a.shield=event.shield;
    if(event.type==='marks')a.lampMarks=event.marks;
    if(event.type==='skill')a.will=Math.max(0,a.will-event.cost);
    if(event.type==='recall'){a.astral=null;a.mode='recalled';}
    if(event.type==='manifest'){a.astral=event.at;a.mode='manifested';}
    if(event.type==='ko'){a.hp=0;a.astral=null;a.mode='extinguished';}
  }
  private point(p:Point):Point{return {x:Math.round(this.origin.x+p.x*16+8),y:Math.round(this.origin.y+p.y*16+16)};}
  private position(a:BattleActor,unit:'body'|'astral'):Point|null {
    const p=unit==='body'?a.body:a.astral;const clip=this.queue[0];if(!p||!clip||!('actorId'in clip.event)||clip.event.actorId!==a.id)return p;
    const event=clip.event;
    if((event.type==='move'||event.type==='knockback')&&event.unit===unit){
      const path=event.type==='move'?event.path:[event.from,event.to];const progress=Math.min(path.length-1,clip.age/clip.duration*(path.length-1));const i=Math.min(path.length-2,Math.floor(progress));
      if(i<0)return p;const from=path[i]!,to=path[i+1]!,f=progress-i;return {x:from.x+(to.x-from.x)*f,y:from.y+(to.y-from.y)*f};
    }
    return p;
  }
  render(ctx:CanvasRenderingContext2D,assets:Assets,tick:number):void {
    const state=this.controller.encounter.battle,o=this.origin,w=state.width*16,h=state.height*16;
    renderWorld(ctx,assets.muted(),this.map,this.world,tick,this.world.player,false,false,true,this.hiddenProps);
    ctx.save();ctx.beginPath();ctx.rect(o.x-16,o.y-24,w+32,h+40);ctx.clip();renderWorld(ctx,assets,this.map,this.world,tick,this.world.player,false,false,true,this.hiddenProps);ctx.restore();
    const mode=this.controller.mode,selecting=['move_body','move_astral','manifest','target'].includes(mode)&&!this.busy;
    if(selecting)for(let y=0;y<state.height;y++)for(let x=0;x<state.width;x++){ctx.fillStyle='#b06f35';ctx.fillRect(o.x+x*16,o.y+y*16,16,1);ctx.fillRect(o.x+x*16,o.y+y*16,1,16);}
    ctx.fillStyle='#ffe36b';for(const x of [o.x,o.x+w-8])for(const y of [o.y,o.y+h-1])ctx.fillRect(x,y,8,1);
    for(const x of [o.x,o.x+w-1])for(const y of [o.y,o.y+h-8])ctx.fillRect(x,y,1,8);
    if(!this.busy)for(const intent of Object.values(this.controller.encounter.intents)){
      const actor=state.actors.find(a=>a.id===intent.actorId),target=state.actors.find(a=>a.id===intent.targetId);
      const cell=intent.mode==='unit'?(intent.target==='astral'?target?.astral:target?.body):intent.cell;
      if(cell&&actor?.astral){const source=this.point(actor.astral),p=this.point(cell),x=p.x-8,y=p.y-16,color=intent.status==='interrupted'?'#85706a':'#d6453a';
        pixelLine(ctx,{x:source.x,y:source.y-8},{x:p.x,y:p.y-8},color,true);dither(ctx,x,y,16,16,color);
        ctx.fillStyle=color;ctx.fillRect(x,y,16,1);ctx.fillRect(x,y+15,16,1);ctx.fillRect(x,y,1,16);ctx.fillRect(x+15,y,1,16);
        if(intent.mode==='point'){ctx.fillStyle='#fff6c8';ctx.fillRect(x+6,y+6,4,4);}else{pixelLine(ctx,{x:x+8,y:y+2},{x:x+14,y:y+8},'#fff6c8');pixelLine(ctx,{x:x+14,y:y+8},{x:x+8,y:y+14},'#fff6c8');}
      }
    }
    if(selecting&&mode!=='target'){
      if(this.rangeState!==state||this.rangeMode!==mode){this.rangeState=state;this.rangeMode=mode;this.rangeCells=[];
        for(let y=0;y<state.height;y++)for(let x=0;x<state.width;x++)if(applyBattleCommand(state,{actorId:state.activeId,type:mode as 'move_body'|'move_astral'|'manifest',to:{x,y}}).ok)this.rangeCells.push({x,y});}
      for(const p of this.rangeCells){ctx.fillStyle='#79c6ef';ctx.fillRect(o.x+p.x*16+6,o.y+p.y*16+13,4,2);}
    }
    for(const a of this.shown){const body=this.position(a,'body')!,star=this.position(a,'astral');if(a.hp>0&&star){const b=this.point(body),p=this.point(star);pixelLine(ctx,{x:b.x,y:b.y-9},{x:p.x,y:p.y-13},a.team==='player'?'#ffe36b':'#b07ad0',true);}}
    const units=this.shown.filter(a=>a.hp>0).flatMap(a=>[{a,unit:'body' as const,p:this.position(a,'body')!},...(a.astral?[{a,unit:'astral' as const,p:this.position(a,'astral')!}]:[])]).sort((a,b)=>a.p.y-b.p.y||a.p.x-b.p.x);
    let propIndex=0;const drawProp=()=>{const prop=this.props[propIndex++]!;assets.draw(ctx,prop.entity.sprite,prop.at.x,prop.at.y,assets.frame(prop.entity.sprite,'idle',tick));};
    for(const {a,unit,p} of units){while(propIndex<this.props.length&&this.props[propIndex]!.depth<=p.y)drawProp();const art=actorArt[a.id];if(!art)continue;const at=this.point(p),id=unit==='body'?art.body:art.astral;
      const moving=this.queue[0]?.event.type==='move'&&this.queue[0].event.actorId===a.id&&this.queue[0].event.unit===unit;
      let animation=unit==='body'?`${moving?'walk':'idle'}_${a.team==='player'?'right':'left'}`:'idle',clock=tick,phase=phaseFor(a.id);
      if(unit==='astral'&&this.attack?.sourceId===a.id&&this.attack.age<30){animation=`attack_${this.attack.direction}`;clock=this.attack.age;phase=0;
        const skill=getSkill(this.attack.skillId);if(skill?.effect==='damage'&&skill.range===1){const power=this.attack.age<15?Math.max(0,this.attack.age-7)/2:Math.max(0,30-this.attack.age)/4;at.x+=Math.round((this.attack.direction==='right'?1:-1)*Math.min(4,power));}}
      if(this.hurt?.id===a.id&&this.hurt.age<12){if(assets.definitions.get(id)?.animations.hurt){animation='hurt';clock=this.hurt.age;phase=0;}at.x+=this.hurt.age<4?(a.team==='enemy'?1:-1):0;}
      if(unit==='body')assets.draw(ctx,'prop.shadow',at.x,at.y);
      const frame=assets.frame(id,animation,clock,phase);if(this.speed!==0&&this.hurt?.id===a.id&&this.hurt.age<3)assets.flash(ctx,id,at.x,at.y,frame);else assets.draw(ctx,id,at.x,at.y,frame);
      ctx.fillStyle=a.team==='player'?'#ffe36b':'#f07a5a';ctx.fillRect(Math.round(at.x)-3,Math.round(at.y),6,1);
      if(a.id===this.actingId&&unit==='body'){ctx.fillStyle='#fff6c8';ctx.fillRect(Math.round(at.x)-2,Math.round(at.y)+2,4,2);}
      if(unit==='body'){const y=at.y-(assets.definitions.get(id)?.size[1]??24)-5;ctx.fillStyle='#1a1220';ctx.fillRect(at.x-13,y,26,4);ctx.fillStyle=a.team==='player'?'#86c440':'#f07a5a';ctx.fillRect(at.x-12,y+1,Math.round(24*this.visualHp(a)/a.maxHp),2);
        if((a.lampMarks??0)>0)text(ctx,'•'.repeat(a.lampMarks!),at.x-8,at.y+3,'#ffe36b');}
    }
    while(propIndex<this.props.length)drawProp();
    if(selecting){const p=this.point(this.controller.cursor),preview=this.controller.preview();ctx.fillStyle=preview.valid?'#fff6c8':'#f07a5a';for(const dx of [-8,5])for(const dy of [-16,-3]){ctx.fillRect(p.x+dx,p.y+dy,4,1);ctx.fillRect(p.x+dx,p.y+dy,1,4);}
      if(mode==='target'&&preview.valid){const value=preview.damage!==undefined?`${t('battle.preview.damage')} ${preview.damage}`:preview.heal!==undefined?`${t('battle.preview.heal')} ${preview.heal}`:`${t('battle.preview.shield')} ${preview.shield??0}`;const x=Math.max(8,Math.min(360,p.x-48)),y=Math.min(180,p.y+10);assets.panel(ctx,x,y,112,22);text(ctx,value,x+7,y+5,'#ffe36b');}}
    this.drawEffect(ctx,assets);
    if(!this.busy&&!selecting)for(const intent of Object.values(this.controller.encounter.intents)){
      const enemy=this.shown.find(a=>a.id===intent.actorId);if(!enemy||enemy.hp<=0)continue;const at=this.point(enemy.body),x=Math.max(8,Math.min(380,at.x-46)),y=Math.max(54,at.y-(assets.definitions.get(actorArt[enemy.id]!.body)?.size[1]??24)-46);
      assets.panel(ctx,x,y,92,36);text(ctx,intent.skillId?label(`battle.skill.${intent.skillId}`):t('battle.intent.wait'),x+7,y+5,'#f2e6cf');
      text(ctx,intent.status==='interrupted'?`${t('battle.intent.interrupted')}·${label(`battle.intent.reason.${intent.reason??'actor_unavailable'}`)}`:`${t(`battle.intent.short.${intent.mode}`)}${t(intent.mode==='point'?'battle.cell':intent.target==='astral'?'battle.astral':'battle.body')} ${intent.expectedDamage}`,x+7,y+19,intent.status==='interrupted'?'#b09a8a':intent.expectedDamage>0?'#f07a5a':'#c4e070');
    }
    assets.panel(ctx,8,7,218,26);text(ctx,t(`battle.title.${state.id}`),16,14,'#ffe36b');
    const landed=state.goal&&Object.hasOwn(state.hitEnemy,state.goal.actorId)&&state.hitEnemy[state.goal.actorId]!.includes(state.goal.enemyId);
    text(ctx,state.goal?`${t('battle.goal.actions')} ${state.enemyActions[state.goal.enemyId]??0}/${state.goal.enemyActions} · ${t(landed?'battle.goal.hit_done':'battle.goal.hit_needed')}`:t('battle.goal.defeat'),14,40,'#fff6c8');
    assets.panel(ctx,286,7,186,26);text(ctx,t('battle.next'),294,14,'#b09a8a');const timeline=structuredClone(state.actors.filter(a=>a.hp>0));
    for(let i=0;i<5&&timeline.length;i++){const next=orderTimeline(timeline)[0]!,art=actorArt[next.id],x=332+i*26;if(art)assets.drawHead(ctx,art.body,x,12,assets.frame(art.body,`idle_${next.team==='player'?'right':'left'}`,tick));if(i===0){ctx.fillStyle='#ffe36b';ctx.fillRect(x,29,16,1);}next.readyAt+=actionInterval(next.chart.spd,i===0&&this.controller.selectedSkillId?(getSkill(this.controller.selectedSkillId)?.weight??'normal'):'normal');}
    this.drawDock(ctx,assets);
    if(this.busy&&this.ribbon){assets.panel(ctx,140,179,200,22);centered(ctx,this.ribbon,240,185,'#ffe36b');}
    if(!this.busy&&mode==='outcome'){assets.panel(ctx,144,86,192,62);centered(ctx,t(`battle.result.${state.phase}`),240,108,state.phase==='won'?'#ffe36b':'#f07a5a',24);}
  }
  private drawDock(ctx:CanvasRenderingContext2D,assets:Assets):void {
    const state=this.controller.encounter.battle,a=this.shown.find(a=>a.id===this.controller.actor.id&&a.team==='player')??this.shown.find(a=>a.team==='player')!,art=actorArt[a.id];
    assets.panel(ctx,8,204,464,64);if(art?.portrait)assets.draw(ctx,art.portrait,12,212,0,false);
    text(ctx,t(`name.${a.id}`),64,212,'#ffe36b');text(ctx,`${this.visualHp(a)}/${a.maxHp}`,64,226);ctx.fillStyle='#4a3040';ctx.fillRect(64,240,88,3);ctx.fillStyle=a.hp/a.maxHp<=0.3?'#f07a5a':'#86c440';ctx.fillRect(64,240,Math.floor(88*this.visualHp(a)/a.maxHp),3);text(ctx,`${t('battle.will')} ${a.will}`,64,250,'#79c6ef');
    const mode=this.controller.mode,options=this.controller.options();
    if(!this.busy&&options.length){options.forEach((option,i)=>{const p=commandPosition(i);if(i===this.controller.selection)text(ctx,'›',p.x-9,p.y,'#ffe36b');text(ctx,label(option.labelKey),p.x,p.y,i===this.controller.selection?'#ffe36b':'#d6c3ab');});}
    else {text(ctx,this.busy?this.ribbon||t('battle.prompt.enemy'):label(this.controller.message),176,213,'#ffe36b');if(!this.busy){const preview=this.controller.preview();const message=this.controller.isEnemyTurn?t('battle.enemy_hint'):preview.valid?t('battle.controls'):label(`battle.error.${preview.reason??'unknown_command'}`);lines(ctx,message,282).slice(0,2).forEach((line,i)=>text(ctx,line,176,231+i*14,'#d6c3ab'));}}
    if(options.length<=7)text(ctx,`${t('battle.speed')} ${this.speed===0?t('battle.instant'):`${this.speed}×`}`,324,250,'#b09a8a');
    if(mode==='skills'){const skill=getSkill(options[this.controller.selection]?.id??'');if(skill){text(ctx,`${t('battle.cost')} ${skill.cost}  ${t('battle.range')} ${skill.range}`,324,212,'#79c6ef');lines(ctx,label(`battle.description.${skill.id}`),136).slice(0,2).forEach((line,i)=>text(ctx,line,324,229+i*13,'#d6c3ab'));}}
    if(state.phase!=='active')text(ctx,t('battle.controls'),324,224,'#b09a8a');
  }
  private visualHp(actor:BattleActor):number {const clip=this.queue[0];if(!clip)return actor.hp;const e=clip.event;return (e.type==='damage'||e.type==='heal')&&e.actorId===actor.id?Math.round(actor.hp+(e.hp-actor.hp)*Math.min(1,clip.age/12)):actor.hp;}
  private actionText():string {const e=this.queue[0]?.event;if(!e)return '';if(e.type==='skill')return `${t(`name.${e.actorId}`)} · ${t(`battle.skill.${e.skillId}`)}`;return t(e.type==='heal'?'battle.action.heal':e.type==='cancelled_skill'?`battle.action.${e.outcome==='miss'?'miss':'interrupted'}`:e.type==='recall'?'battle.action.recall':e.type==='manifest'?'battle.action.manifest':e.type==='shield'?'battle.action.guard':e.type==='damage'?'battle.action.hit':'battle.action.moving');}
  private drawEffect(ctx:CanvasRenderingContext2D,assets:Assets):void {
    if(this.attack&&this.attack.age>=10&&this.attack.age<30&&['lamp_punch','rush'].includes(this.attack.skillId)){
      const source=this.shown.find(a=>a.id===this.attack!.sourceId),target=this.shown.find(a=>a.id===this.attack!.targetId);
      if(source?.astral&&target){const a=this.point(source.astral),b=this.point(this.attack.target==='body'?target.body:target.astral??target.body);assets.draw(ctx,'fx.strike',Math.round((a.x+b.x)/2),Math.round((a.y+b.y)/2)-14,assets.frame('fx.strike',this.attack.direction,this.attack.age-10));}
    }
    const clip=this.queue[0];if(!clip||!('actorId'in clip.event))return;const event=clip.event;const actor=this.shown.find(a=>a.id===event.actorId);if(!actor)return;
    const at=this.point(event.type==='damage'&&event.target==='astral'?(actor.astral??actor.body):actor.body);
    const effect=event.type==='damage'?(this.attack?.skillId==='laurel_bolt'?'fx.leaf_hit':this.attack?.sourceId==='shade'||this.attack?.sourceId==='faux_sword'?'fx.ash_hit':'fx.hit'):event.type==='heal'||event.type==='shield'?'fx.heal':event.type==='manifest'||event.type==='recall'?'fx.summon':undefined;
    if(effect)assets.draw(ctx,effect,at.x,at.y-14,assets.frame(effect,'once',clip.age));
    if(event.type==='damage'||event.type==='heal')centered(ctx,`${event.type==='heal'?'+':'−'}${event.type==='heal'?event.amount:event.damage}`,at.x,at.y-38-Math.floor(clip.age/6),event.type==='heal'?'#c4e070':'#fff6c8');
  }
}
