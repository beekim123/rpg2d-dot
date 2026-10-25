import './style.css';
import text from '../content/i18n/zh-Hans/ui.json';
import { WIDTH, HEIGHT, viewportScale } from './core/runtime.ts';
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;
await document.fonts.load('12px Fusion');
ctx.imageSmoothingEnabled = false;
function draw(): void {
  const scale = viewportScale(innerWidth, innerHeight);
  canvas.style.width = `${WIDTH * scale}px`; canvas.style.height = `${HEIGHT * scale}px`;
  ctx.fillStyle = '#1a1220'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#ffe36b'; ctx.font = '24px Fusion'; ctx.textAlign = 'center';
  ctx.fillText(text['game.title'], WIDTH / 2, 112);
  ctx.font = '12px Fusion'; ctx.fillStyle = '#f2e6cf';
  ctx.fillText(text['game.motto'], WIDTH / 2, 145);
}
addEventListener('resize', draw); draw();
