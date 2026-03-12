import { AudioBufferData } from './AudioBufferData';
import { SoundTouch, SimpleFilter } from 'soundtouchjs';

export type PlaybackState = 'stopped' | 'playing' | 'paused';

export class AudioEngine {
  private ctx: AudioContext;
  private sourceNode: AudioBufferSourceNode | null = null;
  private _state: PlaybackState = 'stopped';
  private _playbackRate = 1;
  private startOffset = 0;       // sample offset where playback began
  private contextTimeAtStart = 0; // ctx.currentTime when playback started
  private cachedBuffer: AudioBuffer | null = null;

  // SoundTouch state for pitch-preserving speed
  private stNode: ScriptProcessorNode | null = null;
  private stSampleCounter = 0;

  bufferData: AudioBufferData | null = null;

  onStateChange: ((state: PlaybackState) => void) | null = null;

  constructor() {
    this.ctx = new AudioContext();
  }

  get state(): PlaybackState {
    return this._state;
  }

  get sampleRate(): number {
    return this.bufferData?.sampleRate ?? this.ctx.sampleRate;
  }

  get playbackRate(): number {
    return this._playbackRate;
  }

  set playbackRate(rate: number) {
    const newRate = Math.max(0.25, Math.min(4, rate));
    if (newRate === this._playbackRate) return;

    const wasPlaying = this._state === 'playing';
    const currentPos = this.currentSample;
    this._playbackRate = newRate;

    if (wasPlaying) {
      // Restart with new mechanism (native vs SoundTouch)
      this.stopSource();
      this.play(currentPos);
    }
  }

  /**
   * Current playback position in samples.
   */
  get currentSample(): number {
    if (!this.bufferData) return 0;
    if (this._state !== 'playing') return this.startOffset;

    if (this.stNode) {
      // SoundTouch path: track via sample counter
      return Math.min(this.startOffset + this.stSampleCounter, this.bufferData.length);
    }

    // Native path (1x speed)
    const elapsed = (this.ctx.currentTime - this.contextTimeAtStart) * this._playbackRate;
    const sample = this.startOffset + elapsed * this.sampleRate;
    return Math.min(sample, this.bufferData.length);
  }

  async loadArrayBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBufferData> {
    this.stop();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.bufferData = AudioBufferData.fromAudioBuffer(audioBuffer);
    this.cachedBuffer = null;
    return this.bufferData;
  }

  /**
   * Invalidate the cached AudioBuffer after edits.
   */
  invalidateCachedBuffer(): void {
    this.cachedBuffer = null;
  }

  play(fromSample?: number): void {
    if (!this.bufferData || this.bufferData.length === 0) return;
    this.stopSource();

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    let offset = fromSample ?? this.startOffset;

    // If at or past the end, restart from beginning
    if (offset >= this.bufferData.length) {
      offset = 0;
    }

    this.startOffset = Math.max(0, offset);

    // Reuse cached AudioBuffer if available, else create one
    if (!this.cachedBuffer) {
      this.cachedBuffer = this.ctx.createBuffer(
        this.bufferData.numberOfChannels,
        this.bufferData.length,
        this.bufferData.sampleRate
      );
      for (let ch = 0; ch < this.bufferData.numberOfChannels; ch++) {
        this.cachedBuffer.copyToChannel(this.bufferData.getChannelData(ch), ch);
      }
    }

    if (this._playbackRate === 1) {
      this.playNative();
    } else {
      this.playSoundTouch();
    }

    this._state = 'playing';
    this.onStateChange?.('playing');
  }

  private playNative(): void {
    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.cachedBuffer;
    this.sourceNode.playbackRate.value = this._playbackRate;
    this.sourceNode.connect(this.ctx.destination);

    const offsetSec = this.startOffset / this.sampleRate;
    this.sourceNode.start(0, offsetSec);
    this.contextTimeAtStart = this.ctx.currentTime;

    this.sourceNode.onended = () => {
      if (this._state === 'playing') {
        this._state = 'stopped';
        this.startOffset = 0;
        this.onStateChange?.('stopped');
      }
    };
  }

  private playSoundTouch(): void {
    if (!this.cachedBuffer) return;

    const numChannels = this.cachedBuffer.numberOfChannels;
    const bufferLength = this.cachedBuffer.length;
    const startSample = Math.floor(this.startOffset);

    // Interleave audio data from startOffset onwards
    const remaining = bufferLength - startSample;
    const interleaved = new Float32Array(remaining * numChannels);
    for (let i = 0; i < remaining; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        interleaved[i * numChannels + ch] = this.cachedBuffer.getChannelData(ch)[startSample + i];
      }
    }

    // Set up SoundTouch
    const st = new SoundTouch();
    st.tempo = this._playbackRate;
    let readPos = 0;
    const source = {
      extract: (target: Float32Array, numFrames: number, _position: number): number => {
        // SoundTouch requests interleaved frames
        const avail = Math.min(numFrames, remaining - readPos);
        if (avail <= 0) return 0;
        const srcOffset = readPos * numChannels;
        for (let i = 0; i < avail * numChannels; i++) {
          target[i] = interleaved[srcOffset + i];
        }
        readPos += avail;
        return avail;
      }
    };

    const filter = new SimpleFilter(source, st);

    // ScriptProcessorNode for real-time output
    const bufSize = 4096;
    const node = this.ctx.createScriptProcessor(bufSize, numChannels, numChannels);
    this.stNode = node;
    this.stSampleCounter = 0;

    const outputBuffer = new Float32Array(bufSize * numChannels);

    node.onaudioprocess = (event: AudioProcessingEvent) => {
      const out = event.outputBuffer;
      const frames = out.length;
      const extracted = filter.extract(outputBuffer, frames);

      if (extracted === 0) {
        // End of audio
        node.onaudioprocess = null;
        if (this._state === 'playing') {
          this._state = 'stopped';
          this.startOffset = 0;
          this.stopSource();
          this.onStateChange?.('stopped');
        }
        return;
      }

      // De-interleave into output channels
      for (let ch = 0; ch < out.numberOfChannels; ch++) {
        const channelData = out.getChannelData(ch);
        for (let i = 0; i < frames; i++) {
          if (i < extracted) {
            channelData[i] = outputBuffer[i * numChannels + ch];
          } else {
            channelData[i] = 0;
          }
        }
      }

      this.stSampleCounter += extracted;
    };

    node.connect(this.ctx.destination);
  }

  pause(): void {
    if (this._state !== 'playing') return;
    this.startOffset = this.currentSample;
    this.stopSource();
    this._state = 'paused';
    this.onStateChange?.('paused');
  }

  stop(): void {
    this.stopSource();
    this.startOffset = 0;
    this._state = 'stopped';
    this.onStateChange?.('stopped');
  }

  togglePlayPause(): void {
    if (this._state === 'playing') {
      this.pause();
    } else {
      this.play();
    }
  }

  seekTo(sample: number): void {
    const wasPlaying = this._state === 'playing';
    if (wasPlaying) {
      this.stopSource();
    }
    this.startOffset = Math.max(0, Math.min(sample, this.bufferData?.length ?? 0));
    if (wasPlaying) {
      this.play(this.startOffset);
    }
  }

  private stopSource(): void {
    // Clean up native source
    if (this.sourceNode) {
      this.sourceNode.onended = null;
      try { this.sourceNode.stop(); } catch { /* already stopped */ }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    // Clean up SoundTouch resources
    if (this.stNode) {
      this.stNode.onaudioprocess = null;
      this.stNode.disconnect();
      this.stNode = null;
    }
    this.stSampleCounter = 0;
  }
}
