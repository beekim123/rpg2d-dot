export const WIDTH = 480;
export const HEIGHT = 270;
export function viewportScale(width: number, height: number): number {
  return Math.max(1, Math.floor(Math.min(width / WIDTH, height / HEIGHT)));
}
export class FixedClock {
  private previous: number | undefined;
  private remainder = 0;
  advance(now: number): number {
    if (this.previous === undefined) { this.previous = now; return 0; }
    this.remainder += Math.max(0, Math.min(1000 / 12, now - this.previous));
    this.previous = now;
    const steps = Math.min(5, Math.floor((this.remainder + 1e-8) / (1000 / 60)));
    this.remainder -= steps * (1000 / 60);
    return steps;
  }
  reset(): void { this.previous = undefined; this.remainder = 0; }
}
export type Scene = 'title' | 'map' | 'dialogue' | 'menu' | 'debug' | 'battle';
export class SceneStack {
  private scenes: Scene[];
  constructor(initial: Scene) { this.scenes = [initial]; }
  get current(): Scene { return this.scenes.at(-1)!; }
  replace(scene: Scene): void { this.scenes = [scene]; }
  push(scene: Scene): void { this.scenes.push(scene); }
  pop(): void { if (this.scenes.length > 1) this.scenes.pop(); }
}
