export function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color = '#f2e6cf', size = 12): void {
  ctx.font = `${size}px Fusion`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = color;
  ctx.fillText(value, Math.round(x), Math.round(y));
}
export function centered(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color = '#f2e6cf', size = 12): void {
  ctx.font = `${size}px Fusion`; text(ctx,value,x-Math.floor(ctx.measureText(value).width/2),y,color,size);
}
export function lines(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  ctx.font = '12px Fusion'; const result: string[] = []; let row = '';
  for (const c of value) {
    if (c === '\n') { result.push(row); row=''; continue; }
    if (ctx.measureText(row+c).width > maxWidth && row) { result.push(row); row=c; } else row += c;
  }
  result.push(row); return result;
}
