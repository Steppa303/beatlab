/**
 * @fileoverview Minimal example for real-time music generation with Lyria.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, CSSResultGroup, html, LitElement, svg} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';

import {
  GoogleGenAI,
  type LiveMusicGenerationConfig,
  type LiveMusicServerMessage,
  type LiveMusicSession,
} from '@google/genai';
import {decode, decodeAudioData} from './utils';

// IMPORTANT: Replace with your actual API key, ensuring it's handled securely
// and not hardcoded in production environments.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  // A more robust solution would be to display this message in the UI
  console.error(
    'API key is not set. Please set the GEMINI_API_KEY environment variable.',
  );
  alert(
    'API key is not set. Please set the GEMINI_API_KEY environment variable.',
  );
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  apiVersion: 'v1alpha',
});
const model = 'lyria-realtime-exp';

type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused';

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

// Base class for icon buttons.
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

  show(message: string) {
    this.showing = true;
    this.message = message;
    // Automatically hide after some time
    setTimeout(() => {
      this.hide();
    }, 5000);
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
  `;

  @state() private currentPromptText = 'Ambient electronic soundscape';
  private session?: LiveMusicSession;
  private readonly sampleRate = 48000;
  private audioContext!: AudioContext;
  private outputNode!: GainNode;
  private nextStartTime = 0;
  private readonly bufferTime = 1.0; // audio buffer for network latency (reduced from 2.0)
  @state() private playbackState: PlaybackState = 'stopped';
  @state() private connectionError = false;

  @query('#prompt-input') private promptInputEl!: HTMLInputElement;
  @query('toast-message') private toastMessage!: ToastMessage;

  constructor() {
    super();
    if (!GEMINI_API_KEY) {
      this.connectionError = true;
    }
  }

  override firstUpdated() {
    // Defer AudioContext creation until first user interaction (play)
    // to comply with browser autoplay policies.
  }

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

  private async connectToSession() {
    if (!GEMINI_API_KEY) {
      this.toastMessage.show(
        'API Key is missing. Cannot connect to Lyria.',
      );
      this.connectionError = true;
      this.playbackState = 'stopped';
      return;
    }
    if (this.session) {
      try {
        // If a session exists, it might be from a previous connection attempt or state.
        // Lyria sessions are typically closed by stop() or on error.
        // Explicitly closing here if it's somehow still around and not desired.
        if (this.session.stop) await this.session.stop(); // stop also closes
      } catch (e) {
        console.warn('Error stopping/closing existing session before new connection:', e);
      }
      this.session = undefined;
    }

    this.playbackState = 'loading';
    this.connectionError = false; // Reset error state for new attempt
    try {
      this.session = await ai.live.music.connect({
        model: model,
        callbacks: {
          onmessage: async (e: LiveMusicServerMessage) => {
            console.log('Received message from server:', e);
            if (e.setupComplete) {
              this.connectionError = false;
              if (this.playbackState === 'loading' || this.playbackState === 'playing') {
                 this.setSessionPrompts();
              }
            }
            if (e.filteredPrompt) {
              this.toastMessage.show(
                `Prompt filtered: ${e.filteredPrompt.filteredReason}`,
              );
            }
            if (e.serverContent?.audioChunks !== undefined) {
              if (this.playbackState !== 'playing' && this.playbackState !== 'loading') {
                return; // Not expecting audio data
              }

              await this.ensureAudioContext();

              const audioBuffer = await decodeAudioData(
                decode(e.serverContent?.audioChunks[0].data),
                this.audioContext,
                this.sampleRate,
                2, // Assuming stereo
              );
              const source = this.audioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);

              const currentTime = this.audioContext.currentTime;

              if (this.playbackState === 'loading') {
                // First chunk after 'play' or underrun recovery
                this.nextStartTime = currentTime + this.bufferTime;
                source.start(this.nextStartTime);
                this.playbackState = 'playing';
                this.nextStartTime += audioBuffer.duration;
              } else if (this.playbackState === 'playing') {
                if (this.nextStartTime < currentTime) {
                  // Audio underrun
                  console.warn(
                    `Audio underrun. Expected: ${this.nextStartTime}, Current: ${currentTime}. Re-buffering.`,
                  );
                  this.playbackState = 'loading'; // Go back to loading state
                  // This chunk is skipped. The next chunk will enter the 'loading' branch
                  // and re-initialize nextStartTime.
                  // Optionally, explicitly reset nextStartTime here for the next chunk:
                  this.nextStartTime = currentTime + this.bufferTime;
                } else {
                  // Normal playback, no underrun
                  source.start(this.nextStartTime);
                  this.nextStartTime += audioBuffer.duration;
                }
              }
            }
          },
          onerror: (e: ErrorEvent | {message: string}) => {
            const errorMessage = (e as {message: string}).message || (e as ErrorEvent).type || 'Unknown Lyria error';
            console.error('Lyria error:', e);
            this.connectionError = true;
            this.toastMessage.show(`Connection error: ${errorMessage}. Please try again.`);
            this.stopAudio(); // Stop audio and reset state fully on error
          },
          onclose: (e: CloseEvent) => {
            console.log('Lyria connection closed.', e);
            // Don't show error if closed by user (e.g. stopAudio called, which sets state to 'stopped')
            // or if an error already occurred (connectionError is true)
            if (this.playbackState !== 'stopped' && !this.connectionError) {
                this.toastMessage.show('Connection closed unexpectedly. Please try again.');
            }
            // Ensure cleanup if closed unexpectedly while not stopped by user
            if (this.playbackState !== 'stopped') {
                 this.stopAudio(); // Go to a clean stopped state
            }
          },
        },
      });

      if (this.playbackState === 'loading' && this.currentPromptText.trim() !== '') {
        // If still loading (i.e., setupComplete hasn't fired yet to send prompts)
        // and we have a prompt, send it. This covers cases where connect is fast.
        // However, setSessionPrompts is also called in onmessage->setupComplete if loading.
        // This might be redundant but ensures prompt is sent.
        await this.setSessionPrompts();
      }

    } catch (err) {
      console.error('Failed to connect to Lyria session:', err);
      this.toastMessage.show(
        `Failed to connect: ${(err as Error).message || 'Unknown error'}. Check API Key.`,
      );
      this.connectionError = true;
      this.playbackState = 'stopped';
    }
  }

  private setSessionPrompts = throttle(async () => {
    if (!this.session || this.connectionError) {
      return;
    }
    // Check if session is active/open before sending.
    // Lyria sessions might not have a direct 'isOpen' property easily accessible,
    // rely on connectionError and presence of session. Errors during setWeightedPrompts will be caught.
    if (this.currentPromptText.trim() === '') {
      this.toastMessage.show('Please enter a music prompt.');
      return;
    }

    try {
      await this.session.setWeightedPrompts({
        weightedPrompts: [{text: this.currentPromptText, weight: 1.0}],
      });
      console.log('Sent prompt to Lyria:', this.currentPromptText);
    } catch (e) {
      this.toastMessage.show(
        `Error sending prompt: ${(e as Error).message || 'Unknown error'}`,
      );
      this.pauseAudio();
    }
  }, 500);

  private handlePromptInputChange(e: Event) {
    this.currentPromptText = (e.target as HTMLInputElement).value;
    if (this.playbackState === 'playing' || this.playbackState === 'loading') {
      this.setSessionPrompts();
    }
  }

  private async handlePlayPause() {
    if (!GEMINI_API_KEY) {
        this.toastMessage.show('API Key is missing. Cannot play music.');
        return;
    }

    await this.ensureAudioContext();

    if (this.playbackState === 'playing') {
      this.pauseAudio();
    } else if (
      this.playbackState === 'paused' ||
      this.playbackState === 'stopped'
    ) {
      if (this.currentPromptText.trim() === '') {
        this.toastMessage.show('Please enter a music prompt before playing.');
        return;
      }
      // If session doesn't exist, is closed (implicitly by previous stop/error), or connectionError is true
      if (!this.session || this.connectionError) {
        await this.connectToSession(); // This will set playbackState to 'loading'
                                     // Prompts are sent via onmessage->setupComplete or end of connectToSession
      } else {
        // Session exists and no connection error, resume playback
        this.loadAudio(); // This sets state to 'loading' and calls session.play()
      }
    } else if (this.playbackState === 'loading') {
      this.stopAudio(); // If loading, clicking again acts as cancel/stop
    }
  }

  private pauseAudio() {
    if (this.session) {
        try {
            this.session.pause();
        } catch (e) {
            console.warn("Error pausing session:", e);
            // If pausing fails, it might indicate session is already closed/invalid
            this.stopAudio(); // Fallback to full stop
            return;
        }
    }
    this.playbackState = 'paused';
    if (this.audioContext && this.outputNode) {
        this.outputNode.gain.setValueAtTime(
            this.outputNode.gain.value, this.audioContext.currentTime);
        this.outputNode.gain.linearRampToValueAtTime(
            0,
            this.audioContext.currentTime + 0.1,
        );
    }
  }

  private loadAudio() { // Called when resuming from pause or starting with an existing session
    if (!this.session || this.currentPromptText.trim() === '') return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().then(() => {
        this._startPlayback();
      });
    } else {
      this._startPlayback();
    }
  }

  private _startPlayback() {
    if (!this.session) {
        console.error("Attempted to start playback without a valid session.");
        this.stopAudio(); // Ensure clean state if session is unexpectedly missing
        return;
    }
    try {
        this.session.play();
    } catch (e) {
        console.error("Error calling session.play():", e);
        this.toastMessage.show("Error resuming playback. Please try again.");
        this.stopAudio(); // If play fails, session might be invalid
        return;
    }
    this.playbackState = 'loading'; // Becomes 'playing' once audio data arrives and is scheduled
    if (this.outputNode) { // outputNode might not exist if audioContext was never created
        this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime); // Start muted
        this.outputNode.gain.linearRampToValueAtTime(
          1, // Fade in
          this.audioContext.currentTime + 0.1,
        );
    }
    this.setSessionPrompts(); // Send current prompt
  }

  private async stopAudio() {
    if (this.session) {
        try {
            await this.session.stop(); // This also closes the connection
        } catch (e) {
            console.warn("Error during session.stop():", e);
        }
        this.session = undefined;
    }
    this.playbackState = 'stopped';
     if (this.audioContext && this.outputNode) {
        this.outputNode.gain.setValueAtTime(
            this.outputNode.gain.value, this.audioContext.currentTime);
        this.outputNode.gain.linearRampToValueAtTime(
            0, // Fade out
            this.audioContext.currentTime + 0.1,
        );
    }
    this.nextStartTime = 0; // Critical: reset audio scheduling
    // Don't reset connectionError here automatically, it might be a persistent issue.
    // It will be reset on a new connection attempt.
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
        ${this.connectionError && this.playbackState === 'stopped' ? html`<div class="info-text" style="color: #ff8a80;">Connection error. Check API key or console.</div>` : ''}

      </div>
      <toast-message></toast-message>
    `;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.stopAudio();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(e => console.warn("Error closing AudioContext:", e));
    }
  }
}

function main(container: HTMLElement) {
  if (!GEMINI_API_KEY) {
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.style.padding = '20px';
    errorDiv.style.textAlign = 'center';
    errorDiv.style.fontFamily = 'sans-serif';
    errorDiv.textContent =
      'ERROR: GEMINI_API_KEY environment variable is not set. This application cannot function without it. Please set it and reload.';
    container.innerHTML = ''; // Clear the container
    container.appendChild(errorDiv);

    // Additionally, try to render the player but in a disabled/error state
    const player = new MinimalLyriaPlayer();
    container.appendChild(player); // The player itself will show API key error
    return;
  }
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
interface ProcessEnv {
  GEMINI_API_KEY: string;
}
// Shim for process.env if not defined (e.g. in browser without build tool)
if (typeof process === 'undefined') {
  // @ts-ignore
  globalThis.process = {env: {}};
}
// Attempt to load from a script tag or a global variable if not set by a build process
// This is a fallback and not a recommended way for production API key management.
if (!process.env.GEMINI_API_KEY) {
  // @ts-ignore
  process.env.GEMINI_API_KEY = window.GEMINI_API_KEY;
}
// Re-assign after potential shimming, so the top-level const gets the value
// const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // This line is effectively done at the top already.
                                                  // No need to redeclare/reassign here.
                                                  // The initial const GEMINI_API_KEY will pick up
                                                  // process.env.GEMINI_API_KEY after shimming.

