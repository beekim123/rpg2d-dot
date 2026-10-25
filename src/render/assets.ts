export interface Animation { frames: number[]; fps: number; loop: boolean }
export interface Asset { id: string; file: string; size: [number, number]; anchor: [number, number]; frames: number; animations: Record<string, Animation>; hash: string; category?: string; nineSlice?: number[] }
export interface Manifest { format: string; assets: Asset[] }
export class Assets {
  readonly definitions = new Map<string, Asset>();
  readonly images = new Map<string, HTMLImageElement>();
  async load(root: URL): Promise<void> {
    const base = new URL('art/export/', root);
    const response = await fetch(new URL('manifest.json', base));
    if (!response.ok) throw new Error('Art manifest unavailable');
    const manifest = await response.json() as Manifest;
    // Loading is bounded and sequential: these are tiny PNGs, no image workers.
    for (const asset of manifest.assets) {
      const img = new Image(); img.src = new URL(asset.file, base).href; await img.decode();
      this.definitions.set(asset.id, asset); this.images.set(asset.id, img);
    }
  }
  draw(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, frame = 0, anchored = true): void {
    const a = this.definitions.get(id); const img = this.images.get(id);
    if (!a || !img) throw new Error(`Missing sprite ${id}`);
    const [w, h] = a.size; const [ax, ay] = anchored ? a.anchor : [0, 0];
    ctx.drawImage(img, (frame % a.frames) * w, 0, w, h, Math.round(x - ax!), Math.round(y - ay!), w, h);
  }
  frame(id: string, animation: string, tick: number): number {
    const a = this.definitions.get(id)?.animations[animation];
    if (!a) return 0;
    const index = Math.floor(tick * a.fps / 60);
    return a.frames[a.loop ? index % a.frames.length : Math.min(index, a.frames.length - 1)] ?? 0;
  }
  panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const asset = this.definitions.get('ui.panel')!; const image = this.images.get('ui.panel')!;
    const [sw,sh] = asset.size; const b = asset.nineSlice?.[0] ?? Math.floor(sw / 3);
    const sx = [0,b,sw-b], sy = [0,b,sh-b]; const dx=[x,x+b,x+w-b], dy=[y,y+b,y+h-b];
    const widths=[b,w-2*b,b], heights=[b,h-2*b,b];
    for(let row=0;row<3;row++) for(let col=0;col<3;col++) {
      ctx.drawImage(image, sx[col]!,sy[row]!,col===1?sw-2*b:b,row===1?sh-2*b:b,dx[col]!,dy[row]!,widths[col]!,heights[row]!);
    }
  }
}
