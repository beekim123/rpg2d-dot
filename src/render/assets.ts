import palette from '../../art/palette.json';
import {frameAt,type Animation} from './animation.ts';
export type {Animation} from './animation.ts';
export interface Asset { id: string; file: string; size: [number, number]; anchor: [number, number]; frames: number; animations: Record<string, Animation>; hash: string; category?: string; nineSlice?: number[] }
export interface Manifest { format: string; assets: Asset[] }
export class Assets {
  readonly definitions = new Map<string, Asset>();
  readonly images = new Map<string, HTMLImageElement|HTMLCanvasElement>();
  private dimmed:Assets|undefined;
  private whiteImages=new Map<string,HTMLCanvasElement>();
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
  private remap(image:HTMLImageElement|HTMLCanvasElement,colors:Map<string,string>|null):HTMLCanvasElement {
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    for(let i=0;i<pixels.data.length;i+=4){if(!pixels.data[i+3])continue;
      const key='#'+[pixels.data[i],pixels.data[i+1],pixels.data[i+2]].map(c=>c!.toString(16).padStart(2,'0')).join('');
      const target=colors?colors.get(key)??key:'#fff6c8';pixels.data[i]=parseInt(target.slice(1,3),16);pixels.data[i+1]=parseInt(target.slice(3,5),16);pixels.data[i+2]=parseInt(target.slice(5,7),16);
    }
    ctx.putImageData(pixels,0,0);return canvas;
  }
  muted():Assets {
    if(this.dimmed)return this.dimmed;const variant=new Assets(),colors=new Map<string,string>();
    for(const color of palette.colors){const ramp=palette.colors.filter(c=>c.ramp===color.ramp),index=ramp.findIndex(c=>c.name===color.name);colors.set(color.hex,ramp[Math.max(0,index-1)]!.hex);}
    for(const [id,definition]of this.definitions){variant.definitions.set(id,definition);variant.images.set(id,this.remap(this.images.get(id)!,colors));}
    this.dimmed=variant;return variant;
  }
  drawHead(ctx:CanvasRenderingContext2D,id:string,x:number,y:number,frame=0):void {
    const a=this.definitions.get(id)!,img=this.images.get(id)!;const width=Math.min(16,a.size[0]);
    ctx.drawImage(img,frame*a.size[0]+Math.floor((a.size[0]-width)/2),0,width,16,x,y,width,16);
  }
  flash(ctx:CanvasRenderingContext2D,id:string,x:number,y:number,frame=0):void {
    const a=this.definitions.get(id)!;let img=this.whiteImages.get(id);if(!img){img=this.remap(this.images.get(id)!,null);this.whiteImages.set(id,img);}
    ctx.drawImage(img,frame*a.size[0],0,a.size[0],a.size[1],Math.round(x-a.anchor[0]),Math.round(y-a.anchor[1]),a.size[0],a.size[1]);
  }
  draw(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, frame = 0, anchored = true): void {
    const a = this.definitions.get(id); const img = this.images.get(id);
    if (!a || !img) throw new Error(`Missing sprite ${id}`);
    const [w, h] = a.size; const [ax, ay] = anchored ? a.anchor : [0, 0];
    ctx.drawImage(img, (frame % a.frames) * w, 0, w, h, Math.round(x - ax!), Math.round(y - ay!), w, h);
  }
  frame(id:string,animation:string,tick:number,phase=0):number {
    return frameAt(this.definitions.get(id)?.animations[animation],tick,phase);
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
