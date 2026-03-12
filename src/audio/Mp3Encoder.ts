import { AudioBufferData } from './AudioBufferData';
import lamejs from 'lamejs';

const MP3_SAMPLE_RATE = 44100;

/**
 * Resample a Float32Array from srcRate to dstRate using linear interpolation.
 */
function resample(channel: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate === dstRate) return channel;
  const ratio = srcRate / dstRate;
  const outLen = Math.round(channel.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * ratio;
    const idx = Math.floor(srcIdx);
    const frac = srcIdx - idx;
    const a = channel[idx] ?? 0;
    const b = channel[Math.min(idx + 1, channel.length - 1)] ?? 0;
    out[i] = a + frac * (b - a);
  }
  return out;
}

/**
 * Convert Float32 [-1,1] to Int16.
 */
function toInt16(channel: Float32Array): Int16Array {
  const out = new Int16Array(channel.length);
  for (let i = 0; i < channel.length; i++) {
    const s = Math.max(-1, Math.min(1, channel[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return out;
}

/**
 * Encode AudioBufferData to an MP3 Blob (128 kbps, 44100 Hz).
 */
export function encodeMp3(data: AudioBufferData): Blob {
  const numChannels = data.numberOfChannels;
  const kbps = 128;

  // Resample to 44100 Hz if needed
  const channels = data.channels.map(ch => resample(ch, data.sampleRate, MP3_SAMPLE_RATE));
  const numSamples = channels[0].length;

  const encoder = new lamejs.Mp3Encoder(numChannels, MP3_SAMPLE_RATE, kbps);
  const mp3Chunks: Int8Array[] = [];

  const left = toInt16(channels[0]);
  const right = numChannels > 1 ? toInt16(channels[1]) : left;

  // Encode in chunks of 1152 samples (MP3 frame size)
  const chunkSize = 1152;
  for (let i = 0; i < numSamples; i += chunkSize) {
    const end = Math.min(i + chunkSize, numSamples);
    const leftChunk = left.subarray(i, end);
    const rightChunk = right.subarray(i, end);

    let mp3buf: Int8Array;
    if (numChannels === 1) {
      mp3buf = encoder.encodeBuffer(leftChunk);
    } else {
      mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    }
    if (mp3buf.length > 0) {
      mp3Chunks.push(mp3buf);
    }
  }

  const tail = encoder.flush();
  if (tail.length > 0) {
    mp3Chunks.push(tail);
  }

  return new Blob(mp3Chunks, { type: 'audio/mpeg' });
}
