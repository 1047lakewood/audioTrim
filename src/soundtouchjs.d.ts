declare module 'soundtouchjs' {
  export class SoundTouch {
    tempo: number;
    pitch: number;
    rate: number;
  }

  interface SoundTouchSource {
    extract(target: Float32Array, numFrames: number, position: number): number;
  }

  export class SimpleFilter {
    constructor(source: SoundTouchSource, soundTouch: SoundTouch);
    extract(target: Float32Array, numFrames: number): number;
  }
}
