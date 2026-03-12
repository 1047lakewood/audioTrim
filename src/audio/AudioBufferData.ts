/**
 * Mutable multi-channel audio buffer wrapper around Float32Array[].
 * Supports splice/delete/insert operations for non-destructive editing.
 */
export class AudioBufferData {
  channels: Float32Array[];
  sampleRate: number;

  constructor(channels: Float32Array[], sampleRate: number) {
    this.channels = channels;
    this.sampleRate = sampleRate;
  }

  get numberOfChannels(): number {
    return this.channels.length;
  }

  get length(): number {
    return this.channels.length > 0 ? this.channels[0].length : 0;
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }

  /**
   * Delete a range of samples from all channels.
   * Returns the deleted data for undo.
   */
  deleteRange(startSample: number, endSample: number): Float32Array[] {
    const start = Math.max(0, Math.floor(startSample));
    const end = Math.min(this.length, Math.floor(endSample));
    if (start >= end) return this.channels.map(() => new Float32Array(0));

    const deleted: Float32Array[] = [];
    for (let ch = 0; ch < this.numberOfChannels; ch++) {
      const data = this.channels[ch];
      deleted.push(data.slice(start, end));
      const newData = new Float32Array(data.length - (end - start));
      newData.set(data.subarray(0, start));
      newData.set(data.subarray(end), start);
      this.channels[ch] = newData;
    }
    return deleted;
  }

  /**
   * Insert samples at a position in all channels.
   */
  insertAt(position: number, data: Float32Array[]): void {
    const pos = Math.max(0, Math.min(this.length, Math.floor(position)));
    for (let ch = 0; ch < this.numberOfChannels; ch++) {
      const existing = this.channels[ch];
      const insert = data[ch] || new Float32Array(0);
      const newData = new Float32Array(existing.length + insert.length);
      newData.set(existing.subarray(0, pos));
      newData.set(insert, pos);
      newData.set(existing.subarray(pos), pos + insert.length);
      this.channels[ch] = newData;
    }
  }

  static fromAudioBuffer(buffer: AudioBuffer): AudioBufferData {
    const channels: Float32Array[] = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(new Float32Array(buffer.getChannelData(i)));
    }
    return new AudioBufferData(channels, buffer.sampleRate);
  }
}
