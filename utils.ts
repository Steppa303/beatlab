
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// Fix: Removed unused import Blob
// import {Blob} from '@google/genai';

function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// The createBlob function is not used in index.tsx, and Blob type is not from @google/genai
/*
function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // convert float32 -1 to 1 to int16 -32768 to 32767
    int16[i] = data[i] * 32768;
  }

  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}
*/

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  if (numChannels <= 0) {
    throw new Error("Number of channels must be positive and an integer.");
  }
  if (!Number.isInteger(numChannels)) {
    throw new Error("Number of channels must be an integer.");
  }
  if (data.length % (2 * numChannels) !== 0) {
    // Data length must be a multiple of (bytesPerSample * numChannels)
    // Assuming 2 bytes per sample (Int16)
    throw new Error("Invalid data length for the given number of channels and sample format.");
  }

  const numFrames = data.length / (2 * numChannels);
  if (numFrames <= 0) {
      throw new Error("Calculated number of frames is not positive.");
  }

  const buffer = ctx.createBuffer(
    numChannels,
    numFrames,
    sampleRate,
  );

  // Data is Int16, but AudioBuffer expects Float32
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.length / 2);
  const dataFloat32 = new Float32Array(dataInt16.length);
  for (let i = 0; i < dataInt16.length; i++) {
    dataFloat32[i] = dataInt16[i] / 32768.0; // Convert Int16 to Float32 range [-1.0, 1.0)
  }

  if (numChannels === 1) { // Mono
    // For mono, dataFloat32 is already the single channel data
    buffer.copyToChannel(dataFloat32, 0);
  } else { // Stereo or more channels (interleaved)
    for (let i = 0; i < numChannels; i++) {
      // Create a new Float32Array for each channel's data
      const channelData = new Float32Array(numFrames);
      for (let j = 0; j < numFrames; j++) {
        // De-interleave: pick the j-th sample for the i-th channel
        channelData[j] = dataFloat32[j * numChannels + i];
      }
      buffer.copyToChannel(channelData, i);
    }
  }
  return buffer;
}

// Fix: Removed createBlob from exports as it's commented out
export {decode, decodeAudioData, encode};
