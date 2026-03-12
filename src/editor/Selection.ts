/**
 * Selection model: represents a selected region of audio (start/end sample indices).
 */
export class Selection {
  startSample: number = 0;
  endSample: number = 0;

  get hasSelection(): boolean {
    return this.startSample !== this.endSample;
  }

  get length(): number {
    return Math.abs(this.endSample - this.startSample);
  }

  /** Normalized range (start < end). */
  get normalized(): { start: number; end: number } {
    return {
      start: Math.min(this.startSample, this.endSample),
      end: Math.max(this.startSample, this.endSample),
    };
  }

  set(start: number, end: number): void {
    this.startSample = start;
    this.endSample = end;
  }

  clear(): void {
    this.startSample = 0;
    this.endSample = 0;
  }

  selectAll(totalSamples: number): void {
    this.startSample = 0;
    this.endSample = totalSamples;
  }

  /** Clamp selection to valid range. */
  clamp(totalSamples: number): void {
    this.startSample = Math.max(0, Math.min(totalSamples, this.startSample));
    this.endSample = Math.max(0, Math.min(totalSamples, this.endSample));
  }
}
