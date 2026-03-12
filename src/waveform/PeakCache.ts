/**
 * Multi-resolution peak pyramid for fast waveform rendering.
 * Stores min, max, rms at each level.
 */

export interface PeakEntry {
  min: number;
  max: number;
  rms: number;
}

export interface PeakLevel {
  blockSize: number;
  data: PeakEntry[]; // one entry per block (mono-mixed)
}

const BLOCK_SIZES = [256, 1024, 4096, 16384, 65536];

export class PeakCache {
  levels: PeakLevel[] = [];
  private totalSamples = 0;

  get length(): number {
    return this.totalSamples;
  }

  /**
   * Build the peak pyramid from raw channel data.
   */
  buildFromChannels(channels: Float32Array[]): void {
    if (channels.length === 0 || channels[0].length === 0) {
      this.levels = [];
      this.totalSamples = 0;
      return;
    }

    this.totalSamples = channels[0].length;

    // Build level 0 (smallest block size) from raw samples
    this.levels = [];
    const level0 = this.buildLevel0(channels, BLOCK_SIZES[0]);
    this.levels.push(level0);

    // Build higher levels from the level below
    for (let i = 1; i < BLOCK_SIZES.length; i++) {
      const prev = this.levels[i - 1];
      const ratio = BLOCK_SIZES[i] / BLOCK_SIZES[i - 1];
      this.levels.push(this.buildFromPrevLevel(prev, BLOCK_SIZES[i], ratio));
    }
  }

  /**
   * Get the best level for a given samples-per-pixel value.
   * Picks the level where each pixel covers ~1-4 blocks.
   */
  getBestLevel(samplesPerPixel: number): PeakLevel | null {
    if (this.levels.length === 0) return null;

    for (let i = this.levels.length - 1; i >= 0; i--) {
      const level = this.levels[i];
      const blocksPerPixel = samplesPerPixel / level.blockSize;
      if (blocksPerPixel >= 1) return level;
    }
    return this.levels[0];
  }

  /**
   * Get peaks for a sample range at a given level.
   */
  getPeaks(level: PeakLevel, startSample: number, endSample: number): PeakEntry[] {
    const startBlock = Math.max(0, Math.floor(startSample / level.blockSize));
    const endBlock = Math.min(level.data.length, Math.ceil(endSample / level.blockSize));
    return level.data.slice(startBlock, endBlock);
  }

  /**
   * Invalidate and rebuild after an edit.
   */
  rebuild(channels: Float32Array[]): void {
    this.buildFromChannels(channels);
  }

  private buildLevel0(channels: Float32Array[], blockSize: number): PeakLevel {
    const numSamples = channels[0].length;
    const numBlocks = Math.ceil(numSamples / blockSize);
    const data: PeakEntry[] = new Array(numBlocks);
    const numCh = channels.length;

    for (let b = 0; b < numBlocks; b++) {
      const start = b * blockSize;
      const end = Math.min(start + blockSize, numSamples);
      let min = Infinity;
      let max = -Infinity;
      let sumSq = 0;
      let count = 0;

      for (let ch = 0; ch < numCh; ch++) {
        const chan = channels[ch];
        for (let i = start; i < end; i++) {
          const v = chan[i];
          if (v < min) min = v;
          if (v > max) max = v;
          sumSq += v * v;
          count++;
        }
      }

      data[b] = {
        min,
        max,
        rms: Math.sqrt(sumSq / (count || 1)),
      };
    }

    return { blockSize, data };
  }

  private buildFromPrevLevel(prev: PeakLevel, blockSize: number, ratio: number): PeakLevel {
    const numBlocks = Math.ceil(prev.data.length / ratio);
    const data: PeakEntry[] = new Array(numBlocks);

    for (let b = 0; b < numBlocks; b++) {
      const start = Math.floor(b * ratio);
      const end = Math.min(Math.floor((b + 1) * ratio), prev.data.length);
      let min = Infinity;
      let max = -Infinity;
      let rmsSum = 0;
      let count = 0;

      for (let i = start; i < end; i++) {
        const p = prev.data[i];
        if (p.min < min) min = p.min;
        if (p.max > max) max = p.max;
        rmsSum += p.rms * p.rms;
        count++;
      }

      data[b] = {
        min,
        max,
        rms: Math.sqrt(rmsSum / (count || 1)),
      };
    }

    return { blockSize, data };
  }
}
