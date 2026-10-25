import './style.css';
import { Assets } from './render/assets.ts';
import { Game } from './scenes/game.ts';
import { t } from './content.ts';
const canvas=document.querySelector<HTMLCanvasElement>('#game')!;
try {
  await document.fonts.load('12px Fusion');
  const assets=new Assets();await assets.load(new URL('./',location.href));
  new Game(canvas,assets);
} catch(error) {
  console.error(error);document.querySelector('#status')!.textContent=t('error.loading');
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#f2e6cf';ctx.font='12px Fusion';ctx.fillText(t('error.loading'),30,140);
}
