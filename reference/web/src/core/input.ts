export type Action = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'menu' | 'debug';
const bindings: Record<string, Action> = { ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',KeyZ:'confirm',Space:'confirm',Enter:'confirm',KeyX:'cancel',Escape:'cancel',KeyC:'menu',Tab:'menu',F2:'debug' };
export class Input {
  readonly held = new Set<string>();
  private queue: Action[] = [];
  constructor(canvas: HTMLCanvasElement, onGesture: () => void) {
    canvas.addEventListener('keydown', e => {
      const action=bindings[e.code]; if(action) e.preventDefault();
      this.held.add(e.code); if(action && !e.repeat) this.queue.push(action); onGesture();
    });
    addEventListener('keyup', e => this.held.delete(e.code));
    addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => this.clear());
    canvas.addEventListener('pointerdown', () => { canvas.focus(); onGesture(); });
  }
  clear(): void { this.held.clear(); this.queue=[]; }
  consume(): Action | undefined { return this.queue.shift(); }
  get running(): boolean { return this.held.has('ShiftLeft') || this.held.has('ShiftRight'); }
  direction(): 'up'|'down'|'left'|'right'|undefined {
    // Newer held keys must not bypass earlier queued scene/menu transitions.
    if(this.queue.length>0)return undefined;
    for (const code of this.held) { const a=bindings[code]; if(a==='up'||a==='down'||a==='left'||a==='right') return a; }
    return undefined;
  }
}
