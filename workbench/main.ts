import '../src/style.css';
import './style.css';
import { Assets } from '../src/render/assets.ts';
import { AudioPlayer } from '../src/audio/player.ts';
import { cues } from '../src/audio/synth.ts';
import palette from '../art/palette.json';
import { t } from '../src/content.ts';
const setText=(id:string,key:string)=>{document.getElementById(id)!.textContent=t(key);};
setText('game-link','workbench.game');setText('heading','workbench.title');setText('subtitle','workbench.status');setText('palette-heading','workbench.palette');setText('audio-heading','workbench.audio');setText('filter-label','workbench.filter');setText('animate','workbench.pause');
await document.fonts.load('12px Fusion');
const assets=new Assets();await assets.load(new URL('../',location.href));
const library=document.getElementById('library')!;
const filter=document.querySelector<HTMLSelectElement>('#filter')!;
const categories=['all',...new Set([...assets.definitions.values()].map(a=>a.category??'other'))];
for(const category of categories){const option=new Option(category==='all'?t('workbench.all'):category,category);filter.add(option);}
const previews:{canvas:HTMLCanvasElement;id:string;select:HTMLSelectElement}[]=[];
for(const a of assets.definitions.values()){
  const article=document.createElement('article');article.dataset.category=a.category??'other';
  const heading=document.createElement('h3');heading.textContent=a.id;
  const canvas=document.createElement('canvas');canvas.width=Math.max(96,a.size[0]+16);canvas.height=Math.max(88,a.size[1]+16);canvas.style.width=`${canvas.width*2}px`;canvas.style.height=`${canvas.height*2}px`;canvas.setAttribute('aria-label',a.id);
  const info=document.createElement('p');info.textContent=`${a.size.join(' × ')} · ${a.frames} ${t('workbench.frames')} · ${a.anchor.join(',')}`;
  const select=document.createElement('select');select.setAttribute('aria-label',`${a.id} ${t('workbench.anim')}`);
  for(const name of Object.keys(a.animations))select.add(new Option(name,name));
  article.append(heading,canvas,info,select);library.append(article);previews.push({canvas,id:a.id,select});
}
filter.addEventListener('change',()=>{for(const article of library.children)(article as HTMLElement).hidden=filter.value!=='all'&&(article as HTMLElement).dataset.category!==filter.value;});
for(const color of palette.colors){const chip=document.createElement('div');chip.className='chip';const swatch=document.createElement('span');swatch.style.backgroundColor=color.hex;const label=document.createElement('small');label.textContent=`${color.name} ${color.hex}`;chip.append(swatch,label);document.getElementById('palette')!.append(chip);}
let playing=true,tick=0,last=0;
const toggle=document.querySelector<HTMLButtonElement>('#animate')!;toggle.onclick=()=>{playing=!playing;toggle.textContent=t(playing?'workbench.pause':'workbench.play');};
function draw(now:number):void {
  if(!document.hidden&&now-last>=1000/30){last=now;if(playing)tick+=2;
    for(const p of previews){if(p.canvas.parentElement!.hidden)continue;const ctx=p.canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;ctx.fillStyle='#d6c3ab';ctx.fillRect(0,0,p.canvas.width,p.canvas.height);const a=assets.definitions.get(p.id)!;
      assets.draw(ctx,p.id,Math.floor((p.canvas.width-a.size[0])/2),Math.floor((p.canvas.height-a.size[1])/2),assets.frame(p.id,p.select.value,tick),false);
    }
  }requestAnimationFrame(draw);
}requestAnimationFrame(draw);
const audio=new AudioPlayer();
for(const cue of cues){const b=document.createElement('button');b.textContent=t(`cue.${cue}`);b.onclick=()=>{void audio.unlock().then(()=>audio.play(cue));};document.getElementById('audio')!.append(b);}
