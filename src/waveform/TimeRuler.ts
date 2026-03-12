import type { WaveformView } from './WaveformView';

/**
 * Draws a time axis ruler with adaptive tick marks.
 */
export class TimeRuler {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number = 1;

  private bgColor = '#181825';
  private tickColor = '#6c7086';
  private textColor = '#a6adc8';
  private majorTickColor = '#a6adc8';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.floor(rect.width * this.dpr);
    const h = Math.floor(rect.height * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(view: WaveformView): void {
    this.resize();
    const ctx = this.ctx;
    const dpr = this.dpr;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = this.bgColor;
    ctx.fillRect(0, 0, w, h);

    if (view.totalSamples <= 0) return;

    // Choose tick interval based on zoom level
    const secondsPerPixel = view.samplesPerPixel / view.getSampleRate();
    const targetPixelsBetweenTicks = 80;
    const rawInterval = secondsPerPixel * targetPixelsBetweenTicks;

    // Snap to nice intervals
    const niceIntervals = [
      0.001, 0.002, 0.005,
      0.01, 0.02, 0.05,
      0.1, 0.2, 0.5,
      1, 2, 5,
      10, 15, 30,
      60, 120, 300,
      600, 900, 1800, 3600,
    ];
    let majorInterval = niceIntervals[0];
    for (const ni of niceIntervals) {
      if (ni >= rawInterval) {
        majorInterval = ni;
        break;
      }
      majorInterval = ni;
    }
    const minorInterval = majorInterval / 5;

    // Draw ticks
    const startTime = view.sampleToTime(view.scrollOffset);
    const endTime = view.sampleToTime(view.endSample);

    const firstMinorIndex = Math.floor(startTime / minorInterval);
    const lastMinorIndex = Math.ceil(endTime / minorInterval);
    ctx.strokeStyle = this.tickColor;
    ctx.lineWidth = dpr;

    for (let i = firstMinorIndex; i <= lastMinorIndex; i++) {
      const t = i * minorInterval;
      const sample = view.timeToSample(t);
      const px = view.sampleToPixel(sample) * dpr;
      if (px < 0 || px > w) continue;

      const isMajor = Math.abs(t / majorInterval - Math.round(t / majorInterval)) < minorInterval * 0.1;

      ctx.beginPath();
      if (isMajor) {
        ctx.strokeStyle = this.majorTickColor;
        ctx.moveTo(px, h * 0.3);
        ctx.lineTo(px, h);
      } else {
        ctx.strokeStyle = this.tickColor;
        ctx.moveTo(px, h * 0.65);
        ctx.lineTo(px, h);
      }
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = this.textColor;
        ctx.font = `${10 * dpr}px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(this.formatTime(t, majorInterval), px, h * 0.25 + 10 * dpr);
      }
    }
  }

  private formatTime(seconds: number, interval: number): string {
    const absTime = Math.abs(seconds);
    const sign = seconds < 0 ? '-' : '';

    if (interval < 0.01) {
      // Show milliseconds
      const ms = absTime * 1000;
      return `${sign}${ms.toFixed(1)}ms`;
    } else if (interval < 1) {
      const s = Math.floor(absTime);
      const ms = Math.round((absTime - s) * 1000);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${sign}${m}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    } else if (interval < 60) {
      const m = Math.floor(absTime / 60);
      const s = absTime % 60;
      const isWhole = Math.abs(s - Math.round(s)) < 0.01;
      if (isWhole) {
        return `${sign}${m}:${Math.round(s).toString().padStart(2, '0')}`;
      }
      return `${sign}${m}:${s.toFixed(1).padStart(4, '0')}`;
    } else {
      const h = Math.floor(absTime / 3600);
      const m = Math.floor((absTime % 3600) / 60);
      const s = Math.floor(absTime % 60);
      if (h > 0) {
        return `${sign}${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
      return `${sign}${m}:${s.toString().padStart(2, '0')}`;
    }
  }
}
