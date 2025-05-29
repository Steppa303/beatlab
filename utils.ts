/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {Blob} from '@google/genai'; // This type might not be directly used client-side anymore

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

// createBlob might not be needed client-side if prompts are sent as text to backend
function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // convert float32 -1 to 1 to int16 -32768 to 32767
    int16[i] = data[i] * 32768;
  }

  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000', // This specific Lyria format might change
  };
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const buffer = ctx.createBuffer(
    numChannels,
    data.length / 2 / numChannels, // Assuming 16-bit PCM, so 2 bytes per sample
    sampleRate,
  );

  // Assuming data is Int16Array LE. Convert to Float32Array for AudioBuffer.
  // DataView is safer for endianness but Int16Array usually works for PCM from web services.
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const dataFloat32 = new Float32Array(dataInt16.length);
  for (let i = 0; i < dataInt16.length; i++) {
    dataFloat32[i] = dataInt16[i] / 32768.0; // Convert to range -1.0 to 1.0
  }

  // De-interleave if necessary (example assumes data is already in correct channel order or mono)
  // For stereo interleaved PCM:
  if (numChannels > 0 && dataFloat32.length >= numChannels) {
    for (let c = 0; c < numChannels; c++) {
      const channelData = buffer.getChannelData(c);
      for (let i = 0, j = c; i < channelData.length; i++, j += numChannels) {
        channelData[i] = dataFloat32[j];
      }
    }
  } else if (numChannels === 1) {
     buffer.copyToChannel(dataFloat32, 0);
  }


  return buffer;
}

export {createBlob, decode, decodeAudioData, encode};