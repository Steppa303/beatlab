/**
 * @fileoverview Minimal example for real-time music generation with Lyria,
 * adapted for backend communication.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, CSSResultGroup, html, LitElement, svg} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';

// Note: @google/genai types might be useful for structuring data exchanged with backend,
// but the SDK itself is not used directly in the client anymore.
// import type { LiveMusicServerMessage } from '@google/genai';

import {decode, decodeAudioData} from './utils';

type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused' | 'error';

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

// Base class for icon buttons (unchanged)
class IconButton extends LitElement {
  static override styles = css`
    :host {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    :host(:hover) svg {
      transform: scale(1.2);
    }
    svg {
      width: 100%;
      height: 100%;
      transition: transform 0.5s cubic-bezier(0.25, 1.56, 0.32, 0.99);
    }
    .hitbox {
      pointer-events: all;
      position: absolute;
      width: 65%;
      aspect-ratio: 1;
      top: 9%;
      border-radius: 50%;
      cursor: pointer;
    }
  ` as CSSResultGroup;

  protected renderIcon() {
    return svg``;
  }

  private renderSVG() {
    return html` <svg
      width="140"
      height="140"
      viewBox="0 -10 140 150"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <rect
        x="22"
        y="6"
        width="96"
        height="96"
        rx="48"
        fill="black"
        fill-opacity="0.05" />
      <rect
        x="23.5"
        y="7.5"
        width="93"
        height="93"
        rx="46.5"
        stroke="black"
        stroke-opacity="0.3"
        stroke-width="3" />
      <g filter="url(#filter0_ddi_1048_7373)">
        <rect
          x="25"
          y="9"
          width="90"
          height="90"
          rx="45"
          fill="white"
          fill-opacity="0.05"
          shape-rendering="crispEdges" />
      </g>
      ${this.renderIcon()}
      <defs>
        <filter
          id="filter0_ddi_1048_7373"
          x="0"
          y="0"
          width="140"
          height="140"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB">
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha" />
          <feOffset dy="2" />
          <feGaussianBlur stdDeviation="4" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_1048_7373" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha" />
          <feOffset dy="16" />
          <feGaussianBlur stdDeviation="12.5" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
          <feBlend
            mode="normal"
            in2="effect1_dropShadow_1048_7373"
            result="effect2_dropShadow_1048_7373" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect2_dropShadow_1048_7373"
            result="shape" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha" />
          <feOffset dy="3" />
          <feGaussianBlur stdDeviation="1.5" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.05 0" />
          <feBlend
            mode="normal"
            in2="shape"
            result="effect3_innerShadow_1048_7373" />
        </filter>
      </defs>
    </svg>`;
  }

  override render() {
    return html`${this.renderSVG()}<div class="hitbox"></div>`;
  }
}


@customElement('play-pause-button')
export class PlayPauseButton extends IconButton {
  @property({type: String}) playbackState: PlaybackState = 'stopped';

  static override styles = [
    IconButton.styles,
    css`
      .loader {
        stroke: #ffffff;
        stroke-width: 3;
        stroke-linecap: round;
        animation: spin linear 1s infinite;
        transform-origin: center;
        transform-box: fill-box;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(359deg);
        }
      }
    `,
  ];

  private renderPause() {
    return svg`<path
      d="M75.0037 69V39H83.7537V69H75.0037ZM56.2537 69V39H65.0037V69H56.2537Z"
      fill="#FEFEFE"
    />`;
  }

  private renderPlay() {
    return svg`<path d="M60 71.5V36.5L87.5 54L60 71.5Z" fill="#FEFEFE" />`;
  }

  private renderLoading() {
    return svg`<path shape-rendering="crispEdges" class="loader" d="M70,74.2L70,74.2c-10.7,0-19.5-8.7-19.5-19.5l0,0c0-10.7,8.7-19.5,19.5-19.5
            l0,0c10.7,0,19.5,8.7,19.5,19.5l0,0"/>`;
  }

  override renderIcon() {
    if (this.playbackState === 'playing') {
      return this.renderPause();
    } else if (this.playbackState === 'loading') {
      return this.renderLoading();
    } else {
      return this.renderPlay();
    }
  }
}

@customElement('toast-message')
class ToastMessage extends LitElement {
  static override styles = css`
    .toast {
      line-height: 1.6;
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: #333;
      color: white;
      padding: 15px;
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 15px;
      min-width: 200px;
      max-width: 80vw;
      transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1);
      z-index: 11;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    }
    button {
      background: transparent;
      border-radius: 100px;
      aspect-ratio: 1;
      border: none;
      color: #fff;
      cursor: pointer;
      font-size: 1.2em;
      padding: 0.2em 0.5em;
    }
    .toast:not(.showing) {
      transition-duration: 1s;
      transform: translate(-50%, -200%);
    }
  `;

  @property({type: String}) message = '';
  @property({type: Boolean}) showing = false;

  override render() {
    return html`<div class=${classMap({showing: this.showing, toast: true})}>
      <div class="message">${this.message}</div>
      <button @click=${this.hide} aria-label="Dismiss message">✕</button>
    </div>`;
  }

  show(message: string, duration = 5000) {
    this.showing = true;
    this.message = message;
    setTimeout(() => {
      this.hide();
    }, duration);
  }

  hide() {
    this.showing = false;
  }
}


@customElement('minimal-lyria-player')
class MinimalLyriaPlayer extends LitElement {
  static override styles = css`
    :host {
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      padding: 2vmin;
      position: relative;
      font-family: 'Google Sans', sans-serif;
      background-color: #1e1e1e;
      color: #e0e0e0;
    }
    .controls-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      padding: 20px;
      background-color: #2a2a2a;
      border-radius: 8px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    }
    #prompt-input {
      font-family: 'Google Sans', sans-serif;
      font-size: 1.8vmin;
      padding: 10px 15px;
      border-radius: 5px;
      border: 1px solid #555;
      background-color: #333;
      color: #e0e0e0;
      width: 300px;
      max-width: 80vw;
      outline: none;
      transition: border-color 0.3s;
    }
    #prompt-input:focus {
      border-color: #7b1fa2; /* A purple accent color */
    }
    play-pause-button {
      width: 15vmin;
      min-width: 80px;
      max-width: 120px;
    }
    .info-text {
      font-size: 1.2vmin;
      color: #aaa;
      margin-top: 10px;
    }
    .error-text {
      font-size: 1.2vmin;
      color: #ff8a80; /* Light red for errors */
      margin-top: 10px;
    }
  `;

  @state() private currentPromptText = 'Ambient electronic soundscape';
  private readonly sampleRate = 48000; // Should match Lyria's output
  private audioContext!: AudioContext;
  private outputNode!: GainNode;
  private nextStartTime = 0;
  private readonly bufferTime = 2; // audio buffer
  @state() private playbackState: PlaybackState = 'stopped';
  private eventSource?: EventSource;

  @query('#prompt-input') private promptInputEl!: HTMLInputElement;
  @query('toast-message') private toastMessage!: ToastMessage;

  private async ensureAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)({sampleRate: this.sampleRate});
      this.outputNode = this.audioContext.createGain();
      this.outputNode.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  private async sendControlCommand(
    action: 'play' | 'pause' | 'stop' | 'setPrompt',
    prompt?: string,
  ) {
    try {
      const response = await fetch('/api/lyria/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({action, prompt: prompt || this.currentPromptText}),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }
      const data = await response.json();
      console.log('Backend response:', data);
      if (data.message) {
         // this.toastMessage.show(data.message); // Can be noisy
      }
      return data;
    } catch (error) {
      console.error('Error sending control command:', error);
      this.toastMessage.show(
        `Error: ${(error as Error).message}`,
        7000,
      );
      this.playbackState = 'error';
      this.disconnectFromStream(); // Disconnect on error
      return {success: false, error: (error as Error).message};
    }
  }

  private connectToStream() {
    if (this.eventSource) {
      this.eventSource.close();
    }
    this.eventSource = new EventSource('/api/lyria/stream');
    this.playbackState = 'loading';

    this.eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received from SSE:', data.type);

        if (data.type === 'audioChunk' && data.audioDataB64) {
          if (this.playbackState === 'paused' || this.playbackState === 'stopped' || this.playbackState === 'error') {
            return;
          }
          await this.ensureAudioContext();
          const audioBytes = decode(data.audioDataB64);
          const audioBuffer = await decodeAudioData(
            audioBytes,
            this.audioContext,
            this.sampleRate,
            2, // Assuming stereo
          );
          const source = this.audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(this.outputNode);

          const currentTime = this.audioContext.currentTime;
          if (this.nextStartTime === 0 || this.playbackState === 'loading') { // Initial start or recovering
            this.nextStartTime = currentTime + this.bufferTime;
            this.playbackState = 'playing'; // Transition to playing once first chunk is scheduled
             // Fade in gain if it was 0
            if(this.outputNode.gain.value === 0) {
                this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
                this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
            }
          }

          if (this.nextStartTime < currentTime) {
            console.warn('Audio underrun, resetting start time.');
            this.playbackState = 'loading';
            this.nextStartTime = currentTime + this.bufferTime / 2;
            // No need to skip chunk, just adjust timing for future ones
          }
          source.start(this.nextStartTime);
          this.nextStartTime += audioBuffer.duration;

        } else if (data.type === 'playbackState') {
           if (data.state === 'playing' && this.playbackState === 'loading') {
             // Backend might confirm playing state earlier than first audio chunk
             // this.playbackState = 'playing';
           } else if (data.state === 'stopped' || data.state === 'paused' || data.state === 'error') {
             this.playbackState = data.state;
             if (data.state === 'stopped' || data.state === 'error') this.disconnectFromStream();
           }
           if(data.message) this.toastMessage.show(data.message);

        } else if (data.type === 'error') {
          console.error('Error from SSE:', data.message);
          this.toastMessage.show(`Server error: ${data.message}`, 7000);
          this.playbackState = 'error';
          this.disconnectFromStream();
        } else if (data.type === 'info' && data.message) {
           this.toastMessage.show(data.message);
        }
      } catch (err) {
        console.error('Error processing SSE message:', err);
        // this.toastMessage.show('Error processing audio stream.');
        // this.playbackState = 'error';
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
      // Don't show toast if it was an intentional close from client changing state
      if (this.playbackState !== 'stopped' && this.playbackState !== 'paused') {
         this.toastMessage.show('Stream connection error.');
      }
      this.playbackState = 'error';
      this.disconnectFromStream();
    };
  }

  private disconnectFromStream() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
  }

  private throttledSetPrompt = throttle(async () => {
    if (this.playbackState === 'playing' || this.playbackState === 'loading') {
      if (this.currentPromptText.trim() === '') {
        this.toastMessage.show('Prompt cannot be empty while playing.');
        this.promptInputEl.value = this.currentPromptText || 'Ambient electronic soundscape'; // Restore old or default
        return;
      }
      await this.sendControlCommand('setPrompt', this.currentPromptText);
    }
  }, 700);

  private handlePromptInputChange(e: Event) {
    this.currentPromptText = (e.target as HTMLInputElement).value;
    this.throttledSetPrompt();
  }

  private async handlePlayPause() {
    await this.ensureAudioContext();

    if (this.playbackState === 'playing') {
      await this.sendControlCommand('pause');
      this.playbackState = 'paused'; // Optimistic UI update
       if (this.audioContext && this.outputNode) {
            this.outputNode.gain.setValueAtTime(
                this.outputNode.gain.value, this.audioContext.currentTime);
            this.outputNode.gain.linearRampToValueAtTime(
                0,
                this.audioContext.currentTime + 0.1,
            );
        }
    } else if (this.playbackState === 'paused') {
      if (this.currentPromptText.trim() === '') {
        this.toastMessage.show('Please enter a music prompt before playing.');
        return;
      }
      // Request backend to play, this will also re-establish SSE if needed by backend
      const response = await this.sendControlCommand('play');
      if (response?.success) { // Backend confirms play command
        this.connectToStream(); // Re-connect or ensure connection
        this.playbackState = 'loading'; // Expect audio soon
         if (this.audioContext && this.outputNode) {
            this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime); // Start muted, will fade in
            this.outputNode.gain.linearRampToValueAtTime(
              1,
              this.audioContext.currentTime + 0.1,
            );
        }
      } else {
        this.playbackState = 'error'; // If command failed
      }
    } else if (this.playbackState === 'stopped' || this.playbackState === 'error') {
      if (this.currentPromptText.trim() === '') {
        this.toastMessage.show('Please enter a music prompt before playing.');
        return;
      }
      const response = await this.sendControlCommand('play'); // This will also (re)start SSE from backend
       if (response?.success) {
        this.connectToStream();
        this.playbackState = 'loading';
         if (this.audioContext && this.outputNode) { // Ensure gain is up
            this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
         }
      } else {
        this.playbackState = 'error';
      }

    } else if (this.playbackState === 'loading') {
      // If loading, clicking again should stop/cancel
      await this.stopAudio();
    }
  }

  private async stopAudio() {
    await this.sendControlCommand('stop');
    this.disconnectFromStream();
    this.playbackState = 'stopped';
     if (this.audioContext && this.outputNode) {
        this.outputNode.gain.setValueAtTime(
            this.outputNode.gain.value, this.audioContext.currentTime);
        this.outputNode.gain.linearRampToValueAtTime(
            0,
            this.audioContext.currentTime + 0.1,
        );
    }
    this.nextStartTime = 0;
  }

  override render() {
    return html`
      <div class="controls-container">
        <input
          type="text"
          id="prompt-input"
          .value=${this.currentPromptText}
          @input=${this.handlePromptInputChange}
          placeholder="Enter music prompt (e.g., funky bassline)"
          aria-label="Music Prompt" />
        <play-pause-button
          @click=${this.handlePlayPause}
          .playbackState=${this.playbackState}></play-pause-button>

        ${this.playbackState === 'loading' ? html`<div class="info-text">Loading audio...</div>` : ''}
        ${this.playbackState === 'playing' ? html`<div class="info-text">Playing music...</div>` : ''}
        ${this.playbackState === 'error' ? html`<div class="error-text">An error occurred. Please try again.</div>` : ''}
        ${this.playbackState === 'paused' ? html`<div class="info-text">Paused.</div>` : ''}

      </div>
      <toast-message></toast-message>
    `;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.stopAudio(); // Ensure session is stopped on backend
    this.disconnectFromStream();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}

function main(container: HTMLElement) {
  const player = new MinimalLyriaPlayer();
  container.appendChild(player);
}

main(document.body);

declare global {
  interface HTMLElementTagNameMap {
    'minimal-lyria-player': MinimalLyriaPlayer;
    'play-pause-button': PlayPauseButton;
    'toast-message': ToastMessage;
  }
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}
