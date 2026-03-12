import type { PeakCache, PeakLevel } from './PeakCache';
import type { WaveformView } from './WaveformView';

export interface SelectionRange {
  startSample: number;
  endSample: number;
}

export class WaveformRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number = 1;

  // Colors
  private peakColor = '#89b4fa';
  private rmsColor = '#585b70';
  private selectionColor = 'rgba(137, 180, 250, 0.25)';
  private selectionBorderColor = 'rgba(137, 180, 250, 0.6)';
  private cursorColor = '#f38ba8';
  private bgColor = '#1e1e2e';
  private centerLineColor = '#313244';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): boolean {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.floor(rect.width * this.dpr);
    const h = Math.floor(rect.height * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      return true;
    }
    return false;
  }

  get width(): number {
    return this.canvas.getBoundingClientRect().width;
  }

  get height(): number {
    return this.canvas.getBoundingClientRect().height;
  }

  render(
    peakCache: PeakCache,
    view: WaveformView,
    selection: SelectionRange | null,
    cursorSample: number
  ): void {
    this.resize();
    const ctx = this.ctx;
    const dpr = this.dpr;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
    ctx.fillStyle = this.bgColor;
    ctx.fillRect(0, 0, w, h);

    // Center line
    ctx.strokeStyle = this.centerLineColor;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    if (peakCache.length === 0) return;

    const level = peakCache.getBestLevel(view.samplesPerPixel);
    if (!level) return;

    this.drawPeaks(level, view, w, h, dpr);

    if (selection && selection.startSample !== selection.endSample) {
      this.drawSelection(selection, view, w, h, dpr);
    }

    this.drawCursor(cursorSample, view, h, dpr);
  }

  private drawPeaks(
    level: PeakLevel,
    view: WaveformView,
    w: number,
    h: number,
    dpr: number
  ): void {
    const ctx = this.ctx;
    const centerY = h / 2;
    const cssWidth = w / dpr;
    const scale = 0.80;

    // At extreme zoom-out (many samples per pixel), use filled polygon for smoother look
    const usePolygon = view.samplesPerPixel > 8000;

    if (usePolygon) {
      // Collect per-pixel peak/rms values, then draw as filled curves
      const maxTop: number[] = [];
      const maxBot: number[] = [];
      const rmsTop: number[] = [];
      const rmsBot: number[] = [];

      for (let px = 0; px < cssWidth; px++) {
        const sampleStart = view.pixelToSample(px);
        const sampleEnd = view.pixelToSample(px + 1);
        const blockStart = Math.max(0, Math.floor(sampleStart / level.blockSize));
        const blockEnd = Math.min(level.data.length, Math.ceil(sampleEnd / level.blockSize));

        let min = 0, max = 0, rmsSum = 0, count = 0;
        for (let b = blockStart; b < blockEnd; b++) {
          const p = level.data[b];
          if (p.min < min) min = p.min;
          if (p.max > max) max = p.max;
          rmsSum += p.rms;
          count++;
        }
        const rms = count > 0 ? rmsSum / count : 0;

        maxTop.push(centerY - max * centerY * scale);
        maxBot.push(centerY - min * centerY * scale);
        rmsTop.push(centerY - rms * centerY * scale);
        rmsBot.push(centerY + rms * centerY * scale);
      }

      // Draw peak polygon (outer envelope)
      ctx.beginPath();
      for (let i = 0; i < maxTop.length; i++) {
        const x = i * dpr;
        if (i === 0) ctx.moveTo(x, maxTop[i]);
        else ctx.lineTo(x, maxTop[i]);
      }
      for (let i = maxBot.length - 1; i >= 0; i--) {
        ctx.lineTo(i * dpr, maxBot[i]);
      }
      ctx.closePath();
      ctx.fillStyle = this.peakColor;
      ctx.fill();

      // Draw RMS polygon (inner fill)
      ctx.beginPath();
      for (let i = 0; i < rmsTop.length; i++) {
        const x = i * dpr;
        if (i === 0) ctx.moveTo(x, rmsTop[i]);
        else ctx.lineTo(x, rmsTop[i]);
      }
      for (let i = rmsBot.length - 1; i >= 0; i--) {
        ctx.lineTo(i * dpr, rmsBot[i]);
      }
      ctx.closePath();
      ctx.fillStyle = this.rmsColor;
      ctx.fill();
    } else {
      // Standard bar rendering for normal/close zoom
      const barW = Math.max(1, dpr);
      const rmsPath = new Path2D();
      const peakPath = new Path2D();

      for (let px = 0; px < cssWidth; px++) {
        const sampleStart = view.pixelToSample(px);
        const sampleEnd = view.pixelToSample(px + 1);
        const blockStart = Math.max(0, Math.floor(sampleStart / level.blockSize));
        const blockEnd = Math.min(level.data.length, Math.ceil(sampleEnd / level.blockSize));

        if (blockStart >= blockEnd) continue;

        let min = Infinity;
        let max = -Infinity;
        let rmsSum = 0;
        let count = 0;

        for (let b = blockStart; b < blockEnd; b++) {
          const p = level.data[b];
          if (p.min < min) min = p.min;
          if (p.max > max) max = p.max;
          rmsSum += p.rms;
          count++;
        }

        const rms = rmsSum / count;
        const x = px * dpr;

        // RMS bar
        const rmsH = rms * centerY * scale;
        rmsPath.rect(x, centerY - rmsH, barW, rmsH * 2);

        // Peak bar
        const yTop = centerY - max * centerY * scale;
        const yBot = centerY - min * centerY * scale;
        peakPath.rect(x, yTop, barW, Math.max(dpr, yBot - yTop));
      }

      ctx.fillStyle = this.rmsColor;
      ctx.fill(rmsPath);
      ctx.fillStyle = this.peakColor;
      ctx.fill(peakPath);
    }
  }

  private drawSelection(
    selection: SelectionRange,
    view: WaveformView,
    w: number,
    h: number,
    dpr: number
  ): void {
    const ctx = this.ctx;
    const x1 = Math.max(0, view.sampleToPixel(selection.startSample) * dpr);
    const x2 = Math.min(w, view.sampleToPixel(selection.endSample) * dpr);
    if (x2 <= x1) return;

    ctx.fillStyle = this.selectionColor;
    ctx.fillRect(x1, 0, x2 - x1, h);

    ctx.strokeStyle = this.selectionBorderColor;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(x1, 0); ctx.lineTo(x1, h);
    ctx.moveTo(x2, 0); ctx.lineTo(x2, h);
    ctx.stroke();
  }

  private drawCursor(
    cursorSample: number,
    view: WaveformView,
    h: number,
    dpr: number
  ): void {
    const px = view.sampleToPixel(cursorSample) * dpr;
    if (px < 0 || px > this.canvas.width) return;

    const ctx = this.ctx;
    ctx.strokeStyle = this.cursorColor;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }
}
