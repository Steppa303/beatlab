/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// Blob import removed as createBlob is removed

// encode function removed

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// createBlob function removed

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  // Ensure sufficient data for the number of channels
  if (data.length < numChannels * 2) { // Each sample is 2 bytes (Int16)
    console.error("Insufficient data for the number of channels specified.");
    // Create an empty buffer or throw an error
    return ctx.createBuffer(numChannels, 0, sampleRate);
  }

  const buffer = ctx.createBuffer(
    numChannels,
    data.length / 2 / numChannels, // Each sample is 2 bytes (Int16)
    sampleRate,
  );

  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.length / 2); // Ensure correct view for Int16
  const dataFloat32 = new Float32Array(dataInt16.length);
  for (let i = 0; i < dataInt16.length; i++) {
    dataFloat32[i] = dataInt16[i] / 32768.0;
  }

  if (numChannels === 0) { // Should not happen if we check data.length
      console.warn("Number of channels is zero, copying data to mono.");
      if (buffer.numberOfChannels > 0) {
        buffer.copyToChannel(dataFloat32, 0);
      }
  } else if (numChannels === 1) { // Mono
    if (buffer.numberOfChannels > 0) {
        buffer.copyToChannel(dataFloat32, 0);
    }
  } else { // Stereo or more
    for (let i = 0; i < numChannels; i++) {
      if (buffer.numberOfChannels > i) { // Check if buffer has this channel
        const channelData = new Float32Array(dataFloat32.length / numChannels);
        for (let j = 0; j < channelData.length; j++) {
          channelData[j] = dataFloat32[j * numChannels + i];
        }
        buffer.copyToChannel(channelData, i);
      }
    }
  }
  return buffer;
}

/** Throttles a callback to be called at most once per `freq` milliseconds. */
function throttle(func: (...args: unknown[]) => void, delay: number) {
  let lastCall = 0;
  return (...args: unknown[]) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    if (timeSinceLastCall >= delay) {
      func(...args);
      lastCall = now;
    }
  };
}

/** Debounces a callback to be called only after `delay` milliseconds have passed without it being called again. */
function debounce<T extends (...args: any[]) => void>(func: T, delay: number): (...args: Parameters<T>) => void {
  let timeoutId: number | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      func(...args);
    }, delay);
  };
}

export {decode, decodeAudioData, throttle, debounce};