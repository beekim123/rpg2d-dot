export class SoundLimiter {
  private activeUntil: number[] = [];
  private readonly lastStarted = new Map<string, number>();

  /** Reserve only accepted sounds; AudioContext time naturally pauses with a hidden page. */
  tryStart(id: string, nowSeconds: number, durationSeconds: number): boolean {
    this.activeUntil = this.activeUntil.filter((end) => end > nowSeconds);
    const previous = this.lastStarted.get(id);
    if (this.activeUntil.length >= 6 || (previous !== undefined && nowSeconds - previous < 0.07 - 1e-9)) return false;
    this.activeUntil.push(nowSeconds + durationSeconds);
    this.lastStarted.set(id, nowSeconds);
    return true;
  }
}
