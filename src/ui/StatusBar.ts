/**
 * Status bar display: position, selection range, file info.
 */
export class StatusBar {
  private posEl: HTMLElement;
  private selEl: HTMLElement;
  private infoEl: HTMLElement;

  constructor() {
    this.posEl = document.getElementById('status-position')!;
    this.selEl = document.getElementById('status-selection')!;
    this.infoEl = document.getElementById('status-info')!;
  }

  setPosition(seconds: number): void {
    this.posEl.textContent = `Position: ${this.formatTime(seconds)}`;
  }

  setSelection(startSec: number | null, endSec: number | null): void {
    if (startSec === null || endSec === null || startSec === endSec) {
      this.selEl.textContent = 'Selection: None';
    } else {
      const s = Math.min(startSec, endSec);
      const e = Math.max(startSec, endSec);
      const dur = e - s;
      this.selEl.textContent = `Selection: ${this.formatTime(s)} - ${this.formatTime(e)} (${this.formatDuration(dur)})`;
    }
  }

  setFileInfo(filename: string, duration: number, sampleRate: number, channels: number): void {
    const durStr = this.formatDuration(duration);
    this.infoEl.textContent = `${filename} | ${durStr} | ${sampleRate}Hz | ${channels}ch`;
  }

  clearFileInfo(): void {
    this.infoEl.textContent = 'No file loaded';
  }

  showMessage(text: string): void {
    this.infoEl.textContent = text;
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toFixed(3).padStart(6, '0')}`;
  }

  private formatDuration(seconds: number): string {
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}m ${Math.floor(s)}s`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
}
