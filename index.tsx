
/**
 * @fileoverview Control real time music with text prompts - Minimal Demo
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, unsafeCSS, CSSResultGroup, html, LitElement, svg} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {styleMap} from 'lit/directives/style-map.js';

import {
  GoogleGenAI,
  type LiveMusicServerMessage,
  type LiveMusicSession,
  type LiveMusicGenerationConfig, // Keep for potential minimal config
} from '@google/genai';
import {decode, decodeAudioData} from './utils';
import { MidiController } from './midi-controller';

// Use API_KEY as per guidelines
const ai = new GoogleGenAI({
  apiKey: process.env.API_KEY,
  apiVersion: 'v1alpha',
});
const model = 'lyria-realtime-exp';

const TRACK_COLORS = ['#FF4081', '#40C4FF', '#00BFA5', '#FFC107', '#AB47BC', '#FF7043', '#26A69A'];


interface Prompt {
  readonly promptId: string;
  text: string;
  weight: number;
  color: string;
}

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

// WeightSlider component
// -----------------------------------------------------------------------------
/** A slider for adjusting and visualizing prompt weight. */
@customElement('weight-slider')
class WeightSlider extends LitElement {
  static override styles = css`
    :host {
      cursor: ew-resize; /* Horizontal resize cursor */
      position: relative;
      width: 100%;
      display: flex;
      /* justify-content: center; No longer needed as value display is removed */
      /* flex-direction: column; No longer needed */
      align-items: center;
      /* padding: 5px 0; Removed, parent will handle padding */
      box-sizing: border-box;
      height: 10px; /* Define height for the host, which contains the slider track */
    }
    /* .scroll-container removed, event handlers on :host */
    .slider-container {
      position: relative;
      height: 6px; /* Fixed height for the track */
      width: 100%; /* Track takes full width of host */
      background-color: #555; /* Darker track for better contrast */
      border-radius: 3px;
    }
    #thumb {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      border-radius: 3px; /* Match container radius */
      box-shadow: 0 0 3px rgba(0, 0, 0, 0.7);
      /* background-color will be set by sliderColor property */
    }
  `;

  @property({type: Number}) value = 0; // Range 0-2
  @property({type: String}) sliderColor = '#5200ff'; // Default color if not provided

  // @query('.scroll-container') private scrollContainer!: HTMLDivElement; // No longer needed
  @query('.slider-container') private sliderContainer!: HTMLDivElement;

  private dragStartPos = 0;
  private dragStartValue = 0;
  private containerBounds: DOMRect | null = null;

  constructor() {
    super();
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    // Add event listeners to host itself
    this.addEventListener('pointerdown', this.handlePointerDown as EventListener);
    this.addEventListener('wheel', this.handleWheel as EventListener);
  }

  override disconnectedCallback(): void {
      super.disconnectedCallback();
      this.removeEventListener('pointerdown', this.handlePointerDown as EventListener);
      this.removeEventListener('wheel', this.handleWheel as EventListener);
      // Clean up global listeners if any were added during drag, though they should be cleaned in handlePointerUp
      window.removeEventListener('pointermove', this.handlePointerMove);
      window.removeEventListener('touchmove', this.handleTouchMove);
      window.removeEventListener('pointerup', this.handlePointerUp);
      document.body.classList.remove('dragging');
  }


  private handlePointerDown(e: PointerEvent) {
    e.preventDefault();
    // Use sliderContainer for bounds, as host might have padding from its parent
    this.containerBounds = this.sliderContainer.getBoundingClientRect(); 
    this.dragStartPos = e.clientX;
    this.dragStartValue = this.value;
    document.body.classList.add('dragging');
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('touchmove', this.handleTouchMove, {
      passive: false,
    });
    window.addEventListener('pointerup', this.handlePointerUp, {once: true});
    this.updateValueFromPosition(e.clientX);
  }

  private handlePointerMove(e: PointerEvent) {
    this.updateValueFromPosition(e.clientX);
  }

  private handleTouchMove(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length > 0) {
      this.updateValueFromPosition(e.touches[0].clientX);
    }
  }

  private handlePointerUp() {
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('touchmove', this.handleTouchMove);
    document.body.classList.remove('dragging');
    this.containerBounds = null;
  }

  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY;
    this.value = this.value + delta * -0.005; 
    this.value = Math.max(0, Math.min(2, this.value));
    this.dispatchInputEvent();
  }

  private updateValueFromPosition(clientX: number) {
    if (!this.containerBounds) return;

    const trackWidth = this.containerBounds.width; // Use bounds of slider-container
    const trackLeft = this.containerBounds.left;

    const relativeX = clientX - trackLeft;
    const normalizedValue =
      Math.max(0, Math.min(trackWidth, relativeX)) / trackWidth;
    this.value = normalizedValue * 2;

    this.dispatchInputEvent();
  }

  private dispatchInputEvent() {
    this.dispatchEvent(new CustomEvent<number>('input', {detail: this.value}));
  }

  override render() {
    const thumbWidthPercent = (this.value / 2) * 100;
    const thumbStyle = styleMap({
      width: `${thumbWidthPercent}%`,
      display: this.value > 0.005 ? 'block' : 'none', // Hide if very close to 0
      backgroundColor: this.sliderColor,
    });

    return html`
      <div class="slider-container">
        <div id="thumb" style=${thumbStyle}></div>
      </div>
    `;
  }
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
      width: 50px;
      height: 50px;
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
      top: 50%; 
      left: 50%;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      cursor: pointer;
    }
  ` as CSSResultGroup;

  protected renderIcon() {
    return svg``;
  }

  private renderSVG() {
    return html` <svg
      viewBox="0 0 100 100" 
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="45" fill="rgba(255,255,255,0.05)" />
      <circle cx="50" cy="50" r="43.5" stroke="rgba(0,0,0,0.3)" stroke-width="3"/>
      ${this.renderIcon()}
    </svg>`;
  }

  override render() {
    return html`${this.renderSVG()}<div class="hitbox"></div>`;
  }
}

// PlayPauseButton
@customElement('play-pause-button')
export class PlayPauseButton extends IconButton {
  @property({type: String}) playbackState: PlaybackState = 'stopped';

  static override styles = [
    IconButton.styles,
    css`
      .loader {
        stroke: #ffffff;
        stroke-width: 8; 
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
      .icon-path {
        fill: #FEFEFE;
      }
    `,
  ];

  private renderPause() {
    return svg`<path class="icon-path" d="M35 25 H45 V75 H35 Z M55 25 H65 V75 H55 Z" />`;
  }

  private renderPlay() {
    return svg`<path class="icon-path" d="M30 20 L75 50 L30 80 Z" />`;
  }

  private renderLoading() {
    return svg`<circle class="loader" cx="50" cy="50" r="30" fill="none" stroke-dasharray="100 100" />`;
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

// AddPromptButton component
@customElement('add-prompt-button')
export class AddPromptButton extends IconButton {
  static override styles = [
    IconButton.styles,
    css`
      .icon-path {
        fill: #FEFEFE;
      }
    `
  ];

  private renderAddIcon() {
    return svg`<path class="icon-path" d="M45 20 H55 V45 H80 V55 H55 V80 H45 V55 H20 V45 H45 Z" />`;
  }

  override renderIcon() {
    return this.renderAddIcon();
  }
}

// Toast Message component
@customElement('toast-message')
class ToastMessage extends LitElement {
  static override styles = css`
    .toast {
      line-height: 1.6;
      position: fixed;
      bottom: 20px; 
      left: 50%;
      transform: translateX(-50%);
      background-color: #000;
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
      z-index: 1100; 
    }
    button {
      border-radius: 100px;
      aspect-ratio: 1;
      border: none;
      color: #000;
      cursor: pointer;
      background-color: #fff; 
    }
    .toast:not(.showing) {
      transition-duration: 1s;
      transform: translate(-50%, 200%); 
    }
  `;

  @property({type: String}) message = '';
  @property({type: Boolean}) showing = false;

  override render() {
    return html`<div class=${classMap({showing: this.showing, toast: true})}>
      <div class="message">${this.message}</div>
      <button @click=${this.hide}>✕</button>
    </div>`;
  }

  show(message: string) {
    this.showing = true;
    this.message = message;
  }

  hide() {
    this.showing = false;
  }
}

/** A single prompt input */
@customElement('prompt-controller')
class PromptController extends LitElement {
  static override styles = css`
    .prompt {
      position: relative;
      width: 100%; 
      display: flex;
      flex-direction: column; 
      box-sizing: border-box;
      overflow: hidden;
      background-color: #3E3E3E; /* Screenshot-like grey */
      border-radius: 12px; /* Screenshot-like rounding */
      padding: 0; /* Padding will be handled by inner elements */
    }
    .prompt-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 15px; /* Padding for header content */
      gap: 10px; /* Spacing between header items */
    }
    .remove-button {
      background: #D32F2F; /* Red color from screenshot */
      color: #FFFFFF;
      border: none;
      border-radius: 50%;
      width: 28px; /* Adjust size to match screenshot */
      height: 28px;
      font-size: 18px; /* Size of 'X' */
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 28px; /* Center 'X' vertically */
      cursor: pointer;
      opacity: 0.8;
      transition: opacity 0.2s, transform 0.2s;
      flex-shrink: 0; /* Prevent button from shrinking */
    }
    .remove-button:hover {
      opacity: 1;
      transform: scale(1.1);
    }
    .ratio-display {
      color: #FFFFFF;
      font-size: 3.2vmin; /* Doubled from 1.6vmin */
      white-space: nowrap;
      font-weight: normal;
      margin-left: auto; /* Pushes it to the right before the X button if text is short */
      padding: 0 10px; /* Space around ratio text */
      flex-shrink: 0;
    }
    weight-slider {
      width: auto; /* Slider takes width from margin */
      height: 10px; /* Height of the slider interaction area */
      margin: 0 15px 12px 15px; /* Padding around slider, bottom margin */
    }
    #text {
      font-family: 'Google Sans', sans-serif;
      font-size: 3.6vmin; /* Doubled from 1.8vmin */
      font-weight: 500; /* Bolder track name */
      width: 100%; /* Take available space */
      padding: 0; /* Remove padding, handled by parent */
      box-sizing: border-box;
      text-align: left; /* Align track name to left */
      word-wrap: break-word;
      border: none;
      outline: none;
      -webkit-font-smoothing: antialiased;
      color: #fff;
      background-color: transparent; /* Transparent background */
      border-radius: 3px;
      overflow: hidden; /* Hide potential scrollbars if text overflows fixed height */
      white-space: nowrap; /* Keep it on one line */
      text-overflow: ellipsis; /* Add ellipsis if text is too long */
      min-height: 1.2em; /* Ensure it has some height */
      line-height: 1.2em;
      flex-grow: 1; /* Allow text to take up space */
    }
    #text:focus {
        overflow: visible;
        white-space: normal;
        text-overflow: clip;
    }
    :host([filtered='true']) #text { /* Keep existing filter style */
      background: #da2000;
    }
  `;

  @property({type: String, reflect: true}) promptId = '';
  @property({type: String}) text = '';
  @property({type: Number}) weight = 0;
  @property({type: String}) sliderColor = '#5200ff'; // Default, will be overridden

  @query('weight-slider') private weightInput!: WeightSlider;
  @query('#text') private textInput!: HTMLSpanElement;

  private handleTextKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { 
      e.preventDefault();
      this.updateText();
      (e.target as HTMLElement).blur();
    }
  }

  private dispatchPromptChange() {
    this.dispatchEvent(
      new CustomEvent<Partial<Prompt>>('prompt-changed', { // Partial as color is not changed here
        detail: {
          promptId: this.promptId,
          text: this.text,
          weight: this.weight,
        },
      }),
    );
  }

  private updateText() {
    const newText = this.textInput.textContent?.trim();
    if (newText === undefined || newText === this.text) { // If unchanged or empty attempt
        if (newText === '') this.textInput.textContent = this.text; // Revert if cleared
        return;
    }
    this.text = newText;
    this.dispatchPromptChange();
  }

  private updateWeight() {
    this.weight = this.weightInput.value;
    this.dispatchPromptChange();
  }

  private dispatchPromptRemoved() {
    this.dispatchEvent(
      new CustomEvent<string>('prompt-removed', {
        detail: this.promptId,
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`<div class="prompt">
      <div class="prompt-header">
        <span
            id="text"
            spellcheck="false"
            contenteditable="plaintext-only"
            @keydown=${this.handleTextKeyDown}
            @blur=${this.updateText}
            title=${this.text} 
            >${this.text}</span>
        <div class="ratio-display">RATIO: ${this.weight.toFixed(1)}</div>
        <button class="remove-button" @click=${this.dispatchPromptRemoved} aria-label="Remove prompt">✕</button>
      </div>
      <weight-slider
        .value=${this.weight}
        .sliderColor=${this.sliderColor}
        @input=${this.updateWeight}></weight-slider>
    </div>`;
  }
}


/** Component for the PromptDJ UI. */
@customElement('prompt-dj')
class PromptDj extends LitElement {
  static override styles = css`
    :host {
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-sizing: border-box;
      position: relative;
      font-size: 1.8vmin; 
      background-color: #111;
    }
    .header-bar {
      width: 100%;
      padding: 1vmin 2vmin;
      background-color: #1c1c1c; 
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-sizing: border-box;
      flex-shrink: 0; 
      border-bottom: 1px solid #2a2a2a;
      z-index: 100; 
    }
    .midi-selector {
      background-color: #333;
      color: #fff;
      border: 1px solid #555;
      padding: 0.6em 0.8em; 
      border-radius: 4px;
      font-size: 1.6vmin; 
      min-width: 180px;
      max-width: 300px;
      height: 100%; 
      box-sizing: border-box;
    }
    .midi-selector:disabled {
      background-color: #222;
      color: #777;
      cursor: not-allowed;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 1.5vmin; 
    }
    .header-actions > add-prompt-button,
    .header-actions > play-pause-button {
      width: 6vmin; 
      height: 6vmin;
      max-width: 50px; 
      max-height: 50px;
    }

    .content-area { 
      display: flex;
      flex-direction: column;
      align-items: center; 
      flex-grow: 1; 
      width: 100%;
      max-width: 800px; 
      margin: 0 auto; 
      overflow: hidden; 
      padding: 2vmin; 
      box-sizing: border-box;
    }
    #prompts-container {
      display: flex;
      flex-direction: column; 
      align-items: stretch; 
      width: 100%;
      flex-grow: 1; 
      gap: 1.5vmin; 
      overflow-y: auto; 
      overflow-x: hidden;
      scrollbar-width: thin;
      scrollbar-color: #666 #1a1a1a;
      box-sizing: border-box;
      padding-right: 5px; /* Space for scrollbar to not overlap content */
    }
    #prompts-container::-webkit-scrollbar {
      width: 8px;
    }
    #prompts-container::-webkit-scrollbar-track {
      background: #111;
      border-radius: 4px;
    }
    #prompts-container::-webkit-scrollbar-thumb {
      background-color: #666;
      border-radius: 4px;
    }
    #prompts-container::-webkit-scrollbar-thumb:hover {
      background-color: #777;
    }
    prompt-controller {
      width: 100%; 
      /* min-height: 18vmin; Removed, height will be intrinsic */
      flex-shrink: 0; 
      box-sizing: border-box;
    }
  `;

  @property({
    type: Object,
    attribute: false,
  })
  private prompts: Map<string, Prompt>;
  private nextPromptId: number;
  private session!: LiveMusicSession;
  private readonly sampleRate = 48000;
  private audioContext = new (window.AudioContext || (window as any).webkitAudioContext)(
    {sampleRate: this.sampleRate},
  );
  private outputNode: GainNode = this.audioContext.createGain();
  private nextStartTime = 0;
  private readonly bufferTime = 2;
  @state() private playbackState: PlaybackState = 'stopped';
  @property({type: Object})
  private filteredPrompts = new Set<string>();
  private connectionError = true;
  private midiController: MidiController;
  private readonly midiCcBase = 1; 
  private isConnecting = false;


  @query('toast-message') private toastMessage!: ToastMessage;

  @state() private availableMidiInputs: Array<{id: string, name: string}> = [];
  @state() private selectedMidiInputId: string | null = null;

  constructor() {
    super();
    const initialColor = TRACK_COLORS[0];
    this.prompts = new Map([
      ['prompt-0', {promptId: 'prompt-0', text: 'Ambient Chill', weight: 1.0, color: initialColor}],
    ]);
    this.nextPromptId = 1;
    this.outputNode.connect(this.audioContext.destination);
    this.midiController = new MidiController();
    this.handleMidiCcReceived = this.handleMidiCcReceived.bind(this);
    this.handleMidiInputsChanged = this.handleMidiInputsChanged.bind(this);
  }

  override async firstUpdated() {
    await this.connectToSession(); // Attempt initial connection without changing playbackState to 'loading'
    // If connectToSession failed, connectionError will be true, and playbackState remains 'stopped'.
    // If it succeeded, session is established.
    // setSessionPrompts is not strictly needed here if connectToSession doesn't auto-play.
    // if (!this.connectionError) {
    //    this.setSessionPrompts(); // Only set if connection was okay.
    // }

    this.midiController.initialize();
    this.addEventListener('midi-cc-received', this.handleMidiCcReceived as EventListener);
    this.midiController.addEventListener('midi-inputs-changed', this.handleMidiInputsChanged as EventListener);
  }

  override disconnectedCallback(): void {
      super.disconnectedCallback();
      this.midiController.destroy();
      this.removeEventListener('midi-cc-received', this.handleMidiCcReceived as EventListener);
      this.midiController.removeEventListener('midi-inputs-changed', this.handleMidiInputsChanged as EventListener);
      if (this.session) {
        try {
            this.session.stop();
        } catch(e) {
            console.warn("Error stopping session on disconnect:", e);
        }
      }
      if (this.audioContext.state !== 'closed') {
        this.audioContext.close();
      }
  }

  private handleMidiInputsChanged(event: CustomEvent<{inputs: Array<{id: string, name: string}>}>) {
    const newInputs = event.detail.inputs;
    this.availableMidiInputs = newInputs;

    if (newInputs.length > 0) {
        const currentSelectedStillExists = this.selectedMidiInputId && newInputs.some(input => input.id === this.selectedMidiInputId);
        let newSelectedId = this.selectedMidiInputId;

        if (!currentSelectedStillExists) {
            newSelectedId = newInputs[0].id; 
        }
        
        if (newSelectedId && newSelectedId !== this.selectedMidiInputId) {
             this.selectedMidiInputId = newSelectedId; 
        } else if (!this.selectedMidiInputId && newInputs.length > 0) {
            this.selectedMidiInputId = newInputs[0].id;
        }

        if (this.selectedMidiInputId) {
             this.midiController.selectMidiInput(this.selectedMidiInputId);
        }

    } else {
        if (this.selectedMidiInputId) { 
            this.midiController.selectMidiInput(''); 
        }
        this.selectedMidiInputId = null;
    }
  }

  private handleMidiDeviceChange(event: Event) {
    const selectedId = (event.target as HTMLSelectElement).value;
    this.selectedMidiInputId = selectedId || null; 
    if (this.selectedMidiInputId) {
        this.midiController.selectMidiInput(this.selectedMidiInputId);
    } else {
        this.midiController.selectMidiInput(''); 
    }
  }


  private async connectToSession() {
    if (this.isConnecting) {
        console.log("Connection attempt already in progress.");
        return;
    }
    this.isConnecting = true;
    try {
        // DO NOT set this.playbackState = 'loading' here for initial connection.
        // It will be set by handlePlayPause when user clicks play.
        this.session = await ai.live.music.connect({
        model: model,
        callbacks: {
            onmessage: async (e: LiveMusicServerMessage) => {
            console.log('Received message from the server:', e);
            if (e.setupComplete) {
                // this.connectionError = false; // Already set after successful connect()
            }
            if (e.filteredPrompt) {
                this.filteredPrompts = new Set([
                ...this.filteredPrompts,
                e.filteredPrompt.text,
                ]);
                this.toastMessage.show(e.filteredPrompt.filteredReason);
            }
            if (e.serverContent?.audioChunks !== undefined) {
                if (
                this.playbackState === 'paused' ||
                this.playbackState === 'stopped' 
                ) // Also check for stopped, though usually it would be loading/playing here
                return;

                const audioBuffer = await decodeAudioData(
                decode(e.serverContent?.audioChunks[0].data),
                this.audioContext,
                this.sampleRate,
                2,
                );
                const source = this.audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this.outputNode);
                if (this.nextStartTime === 0) { 
                  this.nextStartTime =
                      this.audioContext.currentTime + this.bufferTime;
                  setTimeout(() => {
                      if (this.playbackState === 'loading') this.playbackState = 'playing';
                  }, this.bufferTime * 1000);
                }

                if (this.nextStartTime < this.audioContext.currentTime) {
                  console.log('Audio under run');
                  this.playbackState = 'loading'; // Re-buffer if under run occurs
                  this.nextStartTime = this.audioContext.currentTime + this.bufferTime;
                  return;
                }
                source.start(this.nextStartTime);
                this.nextStartTime += audioBuffer.duration;
            }
            },
            onerror: (e: ErrorEvent) => {
            console.error('Error occurred during session:', e);
            this.connectionError = true;
            this.stopAudio(); // This sets playbackState to 'stopped'
            this.toastMessage.show(`Connection error: ${e.message}. Please try again.`);
            },
            onclose: (e: CloseEvent) => {
            console.log('Connection closed.');
            this.connectionError = true;
            this.stopAudio(); // This sets playbackState to 'stopped'
            this.toastMessage.show('Connection closed. Please restart audio.');
            },
        },
        });
        this.connectionError = false; // Connection successful
        console.log("Session connected successfully.");
    } catch (error: any) {
        console.error("Failed to connect to session:", error);
        this.connectionError = true;
        this.playbackState = 'stopped'; // Ensure stopped on connection failure
        this.toastMessage.show(`Failed to connect: ${error.message}`);
    } finally {
        this.isConnecting = false;
    }
  }

  private setSessionPrompts = throttle(async () => {
    if (!this.session || this.connectionError) {
        console.warn("Cannot set prompts: No session or connection error.");
        return;
    }
    const promptsToSend = Array.from(this.prompts.values()).filter((p) => {
      return !this.filteredPrompts.has(p.text) && p.weight > 0;
    }).map(p => ({ text: p.text, weight: p.weight })); 

    if (promptsToSend.length === 0 && this.playbackState === 'playing') {
        // Optionally pause if no prompts are active, or let it continue with silence/last state.
        // For now, we allow sending empty prompts to potentially clear the model's context.
        console.log("Setting empty prompts list.");
    }


    try {
      await this.session.setWeightedPrompts({
        weightedPrompts: promptsToSend,
      });
      console.log("Prompts sent to session:", promptsToSend);
    } catch (e: any) {
      this.toastMessage.show(`Error setting prompts: ${e.message}`);
      this.pauseAudio(); // Pause if setting prompts fails
    }
  }, 200);


  private handlePromptChanged(e: CustomEvent<Partial<Prompt>>) {
    const {promptId, text, weight} = e.detail;
    
    if (!promptId) {
        console.error('Prompt ID missing in event detail');
        return;
    }
    const prompt = this.prompts.get(promptId);

    if (!prompt) {
      console.error('prompt not found', promptId);
      return;
    }

    if (text !== undefined) prompt.text = text;
    if (weight !== undefined) prompt.weight = weight;
    this.prompts = new Map(this.prompts); 
    this.setSessionPrompts();
  }

  private async handlePlayPause() {
    if (this.isConnecting && (this.playbackState === 'stopped' || this.playbackState === 'paused')) {
        this.toastMessage.show("Connecting... please wait.");
        return; // Don't interfere if initial connection is still in progress
    }

    if (this.playbackState === 'playing') {
      this.pauseAudio();
    } else if (
      this.playbackState === 'paused' ||
      this.playbackState === 'stopped'
    ) {
      this.playbackState = 'loading'; // Set loading state for UI

      if (this.connectionError || !this.session) {
        await this.connectToSession(); 
        if (this.connectionError) { 
            // connectToSession's catch block already sets playbackState to 'stopped'.
            // If it was an early exit due to isConnecting, playbackState might still be loading.
            if(this.playbackState === 'loading') this.playbackState = 'stopped';
            return;
        }
      }
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(err => console.error("Audio context resume failed:", err));
      }
      // It's important to set prompts *before* calling play if it's a fresh start or state might be stale.
      await this.setSessionPrompts(); 
      this.loadAudio();

    } else if (this.playbackState === 'loading') {
      // User clicked stop/pause while it was loading
      this.stopAudio(); 
    }
  }

 private pauseAudio() {
    if (this.session && !this.connectionError && this.playbackState === 'playing') {
        try {
            this.session.pause();
        } catch (e) {
            console.error("Error pausing session:", e);
        }
    }
    this.playbackState = 'paused';
    if (this.audioContext.state === 'running') {
        this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
        this.outputNode.gain.linearRampToValueAtTime(
        0,
        this.audioContext.currentTime + 0.1,
        );
    }
  }


  private loadAudio() {
    if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(err => console.error("Audio context resume failed:", err));
    }
    if (this.session && !this.connectionError && (this.playbackState === 'loading' || this.playbackState === 'paused')) {
        try {
            this.session.play();
            // DO NOT set playbackState = 'loading' here; it's already handled by handlePlayPause
            // or is irrelevant if already playing/paused.
            // The transition from 'loading' to 'playing' is handled by onmessage callback.
        } catch (e) {
            console.error("Error playing session:", e);
            this.toastMessage.show("Error trying to play. Session might be in an invalid state.");
            this.playbackState = 'stopped'; 
            return;
        }
    } else if (!this.session || this.connectionError) {
        if (this.playbackState === 'loading') { // If we were trying to load but can't
            this.playbackState = 'stopped';
        }
        this.toastMessage.show("Cannot play: Not connected or connection error.");
        return;
    }
    this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime); // Use current gain if resuming
    if (this.outputNode.gain.value === 0) { // Only ramp up if gain is 0 (e.g. after stop/pause)
        this.outputNode.gain.linearRampToValueAtTime(
        1,
        this.audioContext.currentTime + 0.1, 
        );
    }
  }

  private stopAudio() {
    if (this.session && (this.playbackState === 'playing' || this.playbackState === 'paused' || this.playbackState === 'loading')) {
        try {
            if (!this.connectionError) { // Only try to call stop if no connection error
                 this.session.stop();
            }
        } catch (e) {
            console.error("Error stopping session:", e);
            // Don't assume connectionError true here, might be other session error
        }
    }
    this.playbackState = 'stopped';
    if (this.audioContext.state === 'running') {
        this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
        this.outputNode.gain.linearRampToValueAtTime(
        0,
        this.audioContext.currentTime + 0.1,
        );
    }
    this.nextStartTime = 0;
    // Don't disconnect and recreate gain node on every stop, only if context needs reset or issues.
    // Recreating it can cause clicks or issues if not handled carefully.
    // this.outputNode.disconnect();
    // this.outputNode = this.audioContext.createGain();
    // this.outputNode.connect(this.audioContext.destination);
  }


  private async handleAddPrompt() {
    const newPromptId = `prompt-${this.nextPromptId}`;
    const newColor = TRACK_COLORS[this.nextPromptId % TRACK_COLORS.length];
    this.nextPromptId++; 

    const newPrompt: Prompt = {
      promptId: newPromptId,
      text: 'New Prompt',
      weight: 0,
      color: newColor,
    };
    const newPrompts = new Map(this.prompts);
    newPrompts.set(newPromptId, newPrompt);
    this.prompts = newPrompts; 

    await this.updateComplete; 

    const promptsContainer = this.renderRoot.querySelector('#prompts-container');
    if (promptsContainer) {
        promptsContainer.scrollTop = promptsContainer.scrollHeight; 
    }

    const newPromptElement = this.renderRoot.querySelector<PromptController>(
      `prompt-controller[promptId="${newPromptId}"]`,
    );
    if (newPromptElement) {
      setTimeout(() => { 
        const textSpan =
          newPromptElement.shadowRoot?.querySelector<HTMLSpanElement>('#text');
        if (textSpan) {
          textSpan.focus();
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(textSpan);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }, 100); 
    }
  }

  private handlePromptRemoved(e: CustomEvent<string>) {
    e.stopPropagation();
    const promptIdToRemove = e.detail;
    if (this.prompts.has(promptIdToRemove)) {
      const newPrompts = new Map(this.prompts);
      newPrompts.delete(promptIdToRemove);
      this.prompts = newPrompts;
      this.setSessionPrompts();
    } else {
      console.warn(
        `Attempted to remove non-existent prompt ID: ${promptIdToRemove}`,
      );
    }
  }


  private handleMidiCcReceived(event: CustomEvent<{ ccNumber: number, value: number }>) {
    const receivedCc = event.detail.ccNumber;
    const normalizedValue = event.detail.value; 

    const promptArray = Array.from(this.prompts.values());
    const promptIndex = receivedCc - this.midiCcBase;

    if (promptIndex >= 0 && promptIndex < promptArray.length) {
        const targetPrompt = promptArray[promptIndex];
        if (targetPrompt) {
            const existingPrompt = this.prompts.get(targetPrompt.promptId);
            if (existingPrompt) {
                existingPrompt.weight = normalizedValue;
                this.prompts = new Map(this.prompts); 
                this.setSessionPrompts();
            }
        }
    }
  }


  override render() {
    const showSelectPlaceholder = this.availableMidiInputs.length > 0 && !this.availableMidiInputs.some(input => input.id === this.selectedMidiInputId);

    return html`
      <div class="header-bar">
        <select 
          class="midi-selector" 
          @change=${this.handleMidiDeviceChange} 
          .value=${this.selectedMidiInputId || ''}
          ?disabled=${this.availableMidiInputs.length === 0}
          aria-label="Select MIDI Input Device">
          ${this.availableMidiInputs.length === 0 ? 
            html`<option value="">No MIDI Devices</option>` :
            html`
              ${showSelectPlaceholder ? html`<option value="" disabled selected hidden>Select MIDI Device</option>` : ''}
              ${this.availableMidiInputs.map(input => 
                html`<option .value=${input.id} ?selected=${input.id === this.selectedMidiInputId}>${input.name}</option>`
              )}
            `}
        </select>
        <div class="header-actions">
          <add-prompt-button @click=${this.handleAddPrompt} aria-label="Add new prompt"></add-prompt-button>
          <play-pause-button
            @click=${this.handlePlayPause}
            .playbackState=${this.playbackState}
            aria-label=${this.playbackState === 'playing' ? 'Pause audio' : 'Play audio'}
          ></play-pause-button>
        </div>
      </div>
      <div class="content-area">
        <div id="prompts-container" @prompt-removed=${this.handlePromptRemoved}>
          ${this.renderPrompts()}
        </div>
      </div>
      <toast-message .message=${this.toastMessage?.message || ''} .showing=${this.toastMessage?.showing || false}></toast-message>`;
  }

  private renderPrompts() {
    return [...this.prompts.values()].map((prompt) => {
      return html`<prompt-controller
        .promptId=${prompt.promptId}
        ?filtered=${this.filteredPrompts.has(prompt.text)}
        .text=${prompt.text}
        .weight=${prompt.weight}
        .sliderColor=${prompt.color}
        @prompt-changed=${this.handlePromptChanged}>
      </prompt-controller>`;
    });
  }
}

function gen(parent: HTMLElement) {
  const pdj = new PromptDj();
  parent.appendChild(pdj);
}

function main(container: HTMLElement) {
  gen(container);
}

main(document.body);

declare global {
  interface HTMLElementTagNameMap {
    'prompt-dj': PromptDj;
    'prompt-controller': PromptController;
    'add-prompt-button': AddPromptButton;
    'play-pause-button': PlayPauseButton;
    'weight-slider': WeightSlider;
    'toast-message': ToastMessage;
  }
  
  interface MidiInputInfo {
    id: string;
    name: string;
  }

  interface HTMLElementEventMap {
    'midi-cc-received': CustomEvent<{ ccNumber: number, value: number }>;
    'midi-inputs-changed': CustomEvent<{ inputs: MidiInputInfo[] }>;
  }
}
