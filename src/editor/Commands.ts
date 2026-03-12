import type { AudioBufferData } from '../audio/AudioBufferData';
import type { PeakCache } from '../waveform/PeakCache';

export interface Command {
  execute(): void;
  undo(): void;
}

export class DeleteRegionCommand implements Command {
  private bufferData: AudioBufferData;
  private peakCache: PeakCache;
  private startSample: number;
  private endSample: number;
  private deletedData: Float32Array[] | null = null;

  constructor(
    bufferData: AudioBufferData,
    peakCache: PeakCache,
    startSample: number,
    endSample: number
  ) {
    this.bufferData = bufferData;
    this.peakCache = peakCache;
    this.startSample = startSample;
    this.endSample = endSample;
  }

  execute(): void {
    this.deletedData = this.bufferData.deleteRange(this.startSample, this.endSample);
    this.peakCache.rebuild(this.bufferData.channels);
  }

  undo(): void {
    if (!this.deletedData) return;
    this.bufferData.insertAt(this.startSample, this.deletedData);
    this.peakCache.rebuild(this.bufferData.channels);
  }
}
