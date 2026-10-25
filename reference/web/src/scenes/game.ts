import {BattleScene} from './battle-scene.ts';
import {battleMapId,battleArenaId} from './battle-catalog.ts';
import {battles} from '../battle/content.ts';
import { Assets } from '../render/assets.ts';
import { renderWorld } from '../render/world.ts';
import { text, centered, lines } from '../render/text.ts';
import { Input, type Action } from '../core/input.ts';
import { FixedClock, SceneStack, viewportScale } from '../core/runtime.ts';
import { SaveStore, decodeSave, encodeSave } from '../core/save.ts';
import { AudioPlayer } from '../audio/player.ts';
import { debugStart } from '../debug/params.ts';
import { maps, scripts, t } from '../content.ts';
import { newGame, movePlayer, interact, nearLitLamp, DELTA, entityAt, type GameState, type Point } from '../systems/world.ts';
import { runScript, type Say } from '../systems/story.ts';

const menuKeys=['menu.resume','menu.save1','menu.save2','menu.save3','menu.load1','menu.load2','menu.load3','menu.export','menu.import','menu.audio','menu.titleback'];
const titleKeys=['title.new','title.continue','title.workbench'];
const debugKeys=['debug.grid','debug.teleport','debug.reset','debug.battle_ella','debug.battle_shade'];
export class Game {
  state:GameState=newGame();
  private canvas:HTMLCanvasElement;
  private ctx:CanvasRenderingContext2D;
  private assets:Assets;
  private input:Input;
  private clock=new FixedClock();
  private scenes=new SceneStack('title');
  private audio=new AudioPlayer();
  private store:SaveStore;
  private tick=0;
  private processedInputs=0;
  private selection=0;
  private line:Say|undefined;
  private script='';
  private pc=0;
  private letters=0;
  private toast='';
  private toastUntil=0;
  private grid=false;
  private muted=false;
  private previous:Point=this.state.player;
  private moveRemaining=0;
  private moveDuration=10;
  private fileInput:HTMLInputElement;
  private battle:BattleScene|undefined;
  private beforeBattle:GameState|undefined;
  constructor(canvas:HTMLCanvasElement,assets:Assets) {
    this.canvas=canvas; this.ctx=canvas.getContext('2d')!; this.ctx.imageSmoothingEnabled=false;this.assets=assets;
    const unavailable={getItem:()=>null,setItem:()=>{throw new Error('storage unavailable');}};
    let storage:Storage;try{storage=localStorage;}catch{storage=unavailable as unknown as Storage;}
    this.store=new SaveStore(storage,maps);
    this.input=new Input(canvas,()=>{void this.audio.unlock().then(()=>this.audio.music(this.battle?'battle_theme':'test_theme')).catch(()=>{});});
    this.fileInput=document.createElement('input');this.fileInput.type='file';this.fileInput.accept='.json,application/json';this.fileInput.hidden=true;document.body.append(this.fileInput);
    this.fileInput.addEventListener('change',()=>{void this.importSave();});
    canvas.addEventListener('click',e=>this.click(e));
    addEventListener('resize',()=>this.resize());
    document.addEventListener('visibilitychange',()=>this.clock.reset());
    const direct=debugStart(location.search,maps);if(direct){this.state=direct;this.previous=direct.player;this.scenes.replace('map');}
    const battleId=new URLSearchParams(location.search).get('battle');if(battleId&&Object.hasOwn(battles,battleId))this.startBattle(battleId,true);
    this.resize();canvas.focus();this.syncStatus();requestAnimationFrame(now=>this.frame(now));
  }
  private get map(){return maps[this.state.mapId]!;}
  private resize():void {const scale=viewportScale(innerWidth,innerHeight);this.canvas.style.width=`${480*scale}px`;this.canvas.style.height=`${270*scale}px`;}
  private frame(now:number):void {
    if(!document.hidden){const steps=this.clock.advance(now);for(let n=0;n<steps;n++)this.update();this.render();}
    requestAnimationFrame(t=>this.frame(t));
  }
  private update():void {
    this.tick++;
    if(this.moveRemaining>0&&--this.moveRemaining===0)this.syncStatus();
    const action=this.input.consume();if(action){this.action(action);this.processedInputs++;this.syncStatus();}
    if(this.scenes.current==='battle'&&this.battle){this.battle.update();this.syncStatus();if(this.battle.exitRequested){this.battle=undefined;if(this.beforeBattle)this.restore(this.beforeBattle);this.beforeBattle=undefined;this.audio.music('test_theme');}}
    if(this.scenes.current==='dialogue') {if(this.tick%2===0)this.letters++;if(this.input.held.has('KeyX'))this.letters+=3;}
    if(this.scenes.current==='map'&&this.moveRemaining===0){
      const d=this.input.direction();if(d)this.tryMove(d);
    }
  }
  private tryMove(direction:'up'|'down'|'left'|'right'):void {
    if(this.moveRemaining>0)return;
    const before=this.state;this.state=movePlayer(before,this.map,direction);
    if(this.state.steps!==before.steps){this.previous=before.player;this.moveDuration=this.input.running?6:10;this.moveRemaining=this.moveDuration;this.audio.play('step');}
    this.syncStatus();
  }
  private action(action:Action):void {
    const scene=this.scenes.current;
    if(scene==='battle'&&this.battle){if(action==='menu')this.battle.toggleSpeed();else if(action!=='debug')this.battle.handle(action);this.syncStatus();return;}
    if(scene==='map') {
      if(action==='up'||action==='down'||action==='left'||action==='right')this.tryMove(action);
      if(action==='confirm'&&this.moveRemaining===0)this.interact();
      if(action==='menu'||action==='cancel'){this.scenes.push('menu');this.selection=0;this.audio.play('confirm');}
      if(action==='debug'){this.scenes.push('debug');this.selection=0;}
    } else if(scene==='dialogue') {
      if(action==='confirm'||action==='cancel'){
        if(this.letters<t(this.line!.text).length)this.letters=t(this.line!.text).length;
        else this.nextLine();this.audio.play('confirm');
      }
    } else {
      const length=scene==='title'?titleKeys.length:scene==='debug'?debugKeys.length:menuKeys.length;
      if(action==='up'||action==='down') {this.selection=(this.selection+(action==='up'?-1:1)+length)%length;this.audio.play('step');}
      if(scene==='menu'&&(action==='left'||action==='right')) {
        const target=(action==='left'?0:6)+this.selection%6;if(target<length)this.selection=target;
      }
      if(action==='cancel'||action==='menu'||(scene==='debug'&&action==='debug')) {if(scene!=='title'){this.scenes.pop();this.audio.play('cancel');}}
      if(action==='confirm')this.choose();
    }
    this.syncStatus();
  }
  private interact():void {
    const result=interact(this.state,this.map);this.state=result.state;
    if(result.script){this.script=result.script;this.pc=0;this.scenes.push('dialogue');this.nextLine();}
    else if(result.lamp){this.audio.play('lamp');const saved=this.store.save(0,this.state);this.notify(saved.ok?(result.newlyLit?'lamp.lit':'lamp.rest'):'save.error');}
    else {this.audio.play('deny');this.notify('notice.empty');}
  }
  private nextLine():void {
    const result=runScript(scripts[this.script]!,this.state,this.pc,this.map);this.state=result.state;this.pc=result.pc;
    if(result.done){this.scenes.pop();this.line=undefined;this.syncStatus();return;}
    this.line=result.line;this.letters=0;this.syncStatus();
  }
  private choose():void {
    this.audio.play('confirm');
    if(this.scenes.current==='title'){
      if(this.selection===0){this.state=newGame();this.previous=this.state.player;this.moveRemaining=0;this.scenes.replace('map');}
      if(this.selection===1){let result=this.store.load(0);for(let s=1;!result.ok&&s<=3;s++)result=this.store.load(s);if(result.ok)this.restore(result.state);else this.notify('save.error');}
      if(this.selection===2)location.href=new URL('workbench/',location.href).href;
    } else if(this.scenes.current==='debug') {
      if(this.selection===0)this.grid=!this.grid;
      if(this.selection===1){this.state.player={...this.map.spawn,facing:'down'};this.previous=this.state.player;this.moveRemaining=0;}
      if(this.selection===2){this.state=newGame();this.previous=this.state.player;this.moveRemaining=0;}
      if(this.selection===3||this.selection===4){this.startBattle(this.selection===3?'prologue_ella':'prologue_shade');return;}
      this.scenes.pop();
    } else if(this.scenes.current==='menu') {
      const n=this.selection;
      if(n===0)this.scenes.pop();
      else if(n<=3){if(!nearLitLamp(this.state,this.map)){this.audio.play('deny');this.notify('notice.savedlamp');return;}const result=this.store.save(n,this.state);this.notify(result.ok?'save.ok':'save.error');if(result.ok)this.audio.play('save');}
      else if(n<=6){const result=this.store.load(n-3);if(result.ok){this.restore(result.state);this.notify('save.loaded');}else this.notify('save.error');}
      else if(n===7)this.exportSave();
      else if(n===8){this.fileInput.value='';this.fileInput.click();}
      else if(n===9){this.muted=!this.muted;this.audio.setMuted(this.muted);}
      else {this.scenes.replace('title');this.selection=0;}
    }
    this.syncStatus();
  }
  private startBattle(id:string,directPreview=false):void {
    if(!Object.hasOwn(battles,id))return;const definition=battles[id]!;
    const previousSave=directPreview?this.store.load(0):undefined;
    this.beforeBattle=structuredClone(previousSave?.ok?previousSave.state:this.state);
    if(!directPreview)this.store.save(0,this.state);
    const map=maps[battleMapId]!,arena=map.arenas![battleArenaId]!;
    this.state={...newGame(),mapId:map.id,player:{...map.spawn,facing:'right'}};this.previous=this.state.player;this.moveRemaining=0;
    this.battle=new BattleScene(definition,map,this.state,arena,this.audio);this.scenes.replace('battle');this.input.clear();this.audio.music('battle_theme');
  }
  private restore(state:GameState):void {this.state=state;this.previous=state.player;this.moveRemaining=0;this.scenes.replace('map');this.input.clear();this.syncStatus();}
  private exportSave():void {const blob=new Blob([encodeSave(this.state)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='astra-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.notify('save.exported');}
  private async importSave():Promise<void> {
    const file=this.fileInput.files?.[0];if(!file)return;
    if(file.size>512000){this.notify('error.import.large');return;}
    try{const state=decodeSave(await file.text(),maps);this.restore(state);this.notify('save.loaded');}catch{this.audio.play('deny');this.notify('save.error');}
  }
  private notify(key:string):void {this.toast=t(key);this.toastUntil=this.tick+180;this.syncStatus();}
  private syncStatus():void {
    this.canvas.dataset.scene=this.scenes.current;
    this.canvas.dataset.inputProcessed=String(this.processedInputs);
    this.canvas.dataset.moving=String(this.moveRemaining>0);
    this.canvas.dataset.selection=String(this.selection);
    if(this.battle){const b=this.battle.controller;this.canvas.dataset.battleActor=b.actor.id;this.canvas.dataset.battleMode=b.mode;this.canvas.dataset.battleTurn=String(b.encounter.battle.turnNumber);this.canvas.dataset.battleBody=`${b.actor.body.x},${b.actor.body.y}`;this.canvas.dataset.battleBusy=String(this.battle.busy);this.canvas.dataset.intentMode=Object.values(b.encounter.intents)[0]?.mode??'';this.canvas.dataset.battleState=JSON.stringify(b.encounter.battle);this.canvas.dataset.battleSpeed=String(this.battle.speed);}
    this.canvas.dataset.position=`${this.state.player.x},${this.state.player.y}`;
    this.canvas.dataset.lamps=String(this.state.lamps.length);
    this.canvas.dataset.metHob=String(!!this.state.flags.met_hob);
    const status=document.querySelector('#status')!;status.textContent=this.line?`${t(this.line.speaker)}：${t(this.line.text)}`:this.toast||t(this.map.name);
  }
  private visual():Point {
    const f=1-this.moveRemaining/this.moveDuration;
    return {x:this.previous.x+(this.state.player.x-this.previous.x)*f,y:this.previous.y+(this.state.player.y-this.previous.y)*f};
  }
  private render():void {
    const ctx=this.ctx,assets=this.assets,scene=this.scenes.current;
    if(scene==='battle'&&this.battle){this.battle.render(ctx,assets,this.tick);return;}
    renderWorld(ctx,assets,this.map,this.state,this.tick,this.visual(),this.moveRemaining>0,this.grid);
    if(scene==='title'){
      assets.panel(ctx,100,29,280,207);
      centered(ctx,t('game.title'),240,52,'#ffe36b',24);
      centered(ctx,t('title.chapter'),240,91,'#d6c3ab');
      for(let n=0;n<titleKeys.length;n++)this.option(titleKeys[n]!,n,158,130+n*24,scene);
      centered(ctx,t('title.stage'),240,213,'#b09a8a');
    } else {
      assets.panel(ctx,6,6,224,26);text(ctx,t(this.map.name),16,13,'#ffe36b');
      const quest=!this.state.flags.met_hob?'quest.hob':this.state.lamps.length<2?'quest.lamp':'quest.done';
      assets.panel(ctx,6,34,Math.min(456,t(quest).length*12+18),24);text(ctx,t(quest),15,40);
      if(scene==='map'){
        assets.panel(ctx,6,246,468,22);centered(ctx,t('hint.controls'),240,251,'#f2e6cf');
        const d=DELTA[this.state.player.facing];const facing=entityAt(this.map,this.state.player.x+d.x,this.state.player.y+d.y,this.state.actors);
        if(facing?.kind==='npc'||facing?.kind==='lamp'){assets.panel(ctx,383,215,91,25);text(ctx,t('hint.interact'),393,221,'#ffe36b');}
      }
    }
    if(scene==='dialogue'&&this.line){
      assets.panel(ctx,12,180,456,84);assets.draw(ctx,this.line.portrait,22,207,0,false);
      text(ctx,t(this.line.speaker),85,189,'#ffe36b');
      const wrapped=lines(ctx,t(this.line.text).slice(0,this.letters),368);
      wrapped.slice(0,3).forEach((row,n)=>text(ctx,row,85,207+n*15));
      text(ctx,t('hint.confirm'),360,249,'#d6c3ab');
    }
    if(scene==='menu'){
      assets.panel(ctx,28,57,424,183);text(ctx,t('menu.title'),45,69,'#ffe36b');
      text(ctx,`${t('summary.lamps')} ${this.state.lamps.length}/2 · ${t('summary.steps')} ${this.state.steps}`,230,69,'#c4e070');
      menuKeys.forEach((key,n)=>this.option(key,n,48+Math.floor(n/6)*202,94+(n%6)*21,scene));
      centered(ctx,t('menu.savehint'),240,223,'#b09a8a');
    }
    if(scene==='debug'){
      assets.panel(ctx,114,53,252,168);text(ctx,t('debug.title'),130,65,'#ffe36b');debugKeys.forEach((key,n)=>this.option(key,n,136,89+n*24,scene));
    }
    if(this.toastUntil>this.tick&&scene!=='dialogue'){
      const width=Math.min(456,this.toast.length*12+20);assets.panel(ctx,240-width/2,211,width,29);centered(ctx,this.toast,240,219,'#fff6c8');
    }
  }
  private option(key:string,n:number,x:number,y:number,scene:string):void {
    const selected=this.selection===n;const value=t(key)+(key==='menu.audio'?` · ${t(this.muted?'audio.off':'audio.on')}`:'');
    if(selected)text(this.ctx,'›',x-12,y,'#ffe36b');
    text(this.ctx,value,x,y,selected?'#ffe36b':'#d6c3ab');
    if(scene==='title'&&n===0&&selected)this.assets.draw(this.ctx,'prop.lamp',x-23,y+18,1);
  }
  private click(e:MouseEvent):void {
    const rect=this.canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*480/rect.width,y=(e.clientY-rect.top)*270/rect.height;
    const scene=this.scenes.current;
    if(scene==='battle'&&this.battle){this.battle.click(x,y);this.syncStatus();return;}
    if(scene==='dialogue'){this.action('confirm');return;}
    let hit=-1;
    if(scene==='title'&&x>=140&&x<=350&&y>=124&&y<200)hit=Math.floor((y-124)/24);
    if(scene==='menu'&&x>=38&&x<440&&y>=90&&y<216)hit=Math.floor((x-38)/202)*6+Math.floor((y-90)/21);
    if(scene==='debug'&&x>=126&&x<355&&y>=85&&y<207)hit=Math.floor((y-85)/24);
    const count=scene==='title'?titleKeys.length:scene==='menu'?menuKeys.length:debugKeys.length;
    if(hit>=0&&hit<count){this.selection=hit;this.choose();}
  }
}
