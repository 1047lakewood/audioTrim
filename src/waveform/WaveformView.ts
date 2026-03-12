/**
 * Viewport state for the waveform display.
 * Manages scroll offset and zoom level (samples per pixel).
 */
export class WaveformView {
  /** Samples per pixel (zoom level). Lower = more zoomed in. */
  samplesPerPixel: number = 1;
  /** First visible sample (scroll position). */
  scrollOffset: number = 0;
  /** Total number of samples in the audio. */
  totalSamples: number = 0;
  /** Width of the canvas in CSS pixels. */
  canvasWidth: number = 0;

  private sampleRate: number = 44100;

  setSampleRate(rate: number): void {
    this.sampleRate = rate;
  }

  getSampleRate(): number {
    return this.sampleRate;
  }

  /** Number of samples visible in the viewport. */
  get visibleSamples(): number {
    return this.samplesPerPixel * this.canvasWidth;
  }

  /** The last visible sample. */
  get endSample(): number {
    return this.scrollOffset + this.visibleSamples;
  }

  /** Maximum scroll offset. */
  get maxScroll(): number {
    return Math.max(0, this.totalSamples - this.visibleSamples);
  }

  /**
   * Set zoom to fit all samples in the canvas width.
   */
  fitToWidth(): void {
    if (this.canvasWidth <= 0 || this.totalSamples <= 0) return;
    this.samplesPerPixel = this.totalSamples / this.canvasWidth;
    this.scrollOffset = 0;
  }

  /**
   * Zoom centered on a pixel position.
   * factor > 1 zooms in, factor < 1 zooms out.
   */
  zoomAt(pixelX: number, factor: number): void {
    const sampleAtCursor = this.pixelToSample(pixelX);
    const minSpp = 1 / 16; // max zoom: 16 pixels per sample
    const maxSpp = this.totalSamples / Math.max(1, this.canvasWidth);

    this.samplesPerPixel = Math.max(minSpp, Math.min(maxSpp, this.samplesPerPixel / factor));

    // Keep the sample under cursor at the same pixel position
    this.scrollOffset = sampleAtCursor - pixelX * this.samplesPerPixel;
    this.clampScroll();
  }

  /**
   * Scroll by a number of pixels.
   */
  scrollByPixels(deltaPixels: number): void {
    this.scrollOffset += deltaPixels * this.samplesPerPixel;
    this.clampScroll();
  }

  /**
   * Clamp scroll to valid range.
   */
  clampScroll(): void {
    this.scrollOffset = Math.max(0, Math.min(this.maxScroll, this.scrollOffset));
  }

  /**
   * Convert a pixel X coordinate to a sample index.
   */
  pixelToSample(pixelX: number): number {
    return this.scrollOffset + pixelX * this.samplesPerPixel;
  }

  /**
   * Convert a sample index to a pixel X coordinate.
   */
  sampleToPixel(sample: number): number {
    return (sample - this.scrollOffset) / this.samplesPerPixel;
  }

  /**
   * Convert sample index to time in seconds.
   */
  sampleToTime(sample: number): number {
    return sample / this.sampleRate;
  }

  /**
   * Convert time in seconds to sample index.
   */
  timeToSample(time: number): number {
    return time * this.sampleRate;
  }

  /**
   * Scrollbar thumb position and size (0-1 range).
   */
  getScrollbarState(): { thumbPos: number; thumbSize: number } {
    if (this.totalSamples <= 0) return { thumbPos: 0, thumbSize: 1 };
    const thumbSize = Math.max(0.02, this.visibleSamples / this.totalSamples);
    const thumbPos = this.scrollOffset / this.totalSamples;
    return { thumbPos: Math.min(thumbPos, 1 - thumbSize), thumbSize };
  }

  /**
   * Ensure a sample position is visible, scrolling if needed.
   */
  ensureVisible(sample: number, margin: number = 0.1): void {
    const marginSamples = this.visibleSamples * margin;
    if (sample < this.scrollOffset + marginSamples) {
      this.scrollOffset = sample - marginSamples;
    } else if (sample > this.endSample - marginSamples) {
      this.scrollOffset = sample - this.visibleSamples + marginSamples;
    }
    this.clampScroll();
  }
}
