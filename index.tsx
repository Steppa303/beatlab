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
  type LiveMusicGenerationConfig as GenAiLiveMusicGenerationConfig,
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
const ORB_COLORS = [
  'rgba(255, 64, 129, 0.2)', // Pink
  'rgba(64, 196, 255, 0.2)', // Light Blue
  'rgba(0, 191, 165, 0.2)',  // Teal
  'rgba(255, 193, 7, 0.15)', // Amber
  'rgba(171, 71, 188, 0.2)' // Purple
];


interface Prompt {
  readonly promptId: string;
  text: string;
  weight: number;
  color: string;
}

type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused';

// Extend LiveMusicGenerationConfig to include new parameters
interface AppLiveMusicGenerationConfig extends GenAiLiveMusicGenerationConfig {
  guidance?: number;
  bpm?: number;
  density?: number;
  brightness?: number;
  mute_bass?: boolean;
  mute_drums?: boolean;
  only_bass_and_drums?: boolean;
  music_generation_mode?: 'QUALITY' | 'DIVERSITY';
  systemInstruction?: string; // Added for system-level instructions
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

// Preset interfaces
interface PresetPrompt {
  text: string;
  weight: number;
}

interface Preset {
  version: string;
  prompts: PresetPrompt[];
  temperature: number;
  guidance?: number;
  bpm?: number;
  density?: number;
  brightness?: number;
  muteBass?: boolean;
  muteDrums?: boolean;
  onlyBassAndDrums?: boolean;
  musicGenerationMode?: 'QUALITY' | 'DIVERSITY';
}
const CURRENT_PRESET_VERSION = "1.1"; // Incremented version for new params


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
      align-items: center;
      box-sizing: border-box;
      height: 20px; /* Doubled height for the host */
      touch-action: none; /* Prevent default touch actions like scrolling */
    }
    .slider-container {
      position: relative;
      height: 12px; /* Doubled height for the track */
      width: 100%; /* Track takes full width of host */
      background-color: #555; /* Darker track for better contrast */
      border-radius: 6px; /* Adjusted radius */
    }
    #thumb {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      border-radius: 6px; /* Match container radius */
      box-shadow: 0 0 3px rgba(0, 0, 0, 0.7);
      transition: filter 0.3s ease-out, transform 0.3s ease-out; /* For pulse effect */
    }
    #thumb.pulse-effect {
      animation: thumbPulseEffect 0.3s ease-out;
    }
    @keyframes thumbPulseEffect {
      0% { filter: brightness(1.2) saturate(1.2); }
      50% { filter: brightness(1.6) saturate(1.6); transform: scaleY(1.1); } /* Slightly scale Y for emphasis */
      100% { filter: brightness(1.2) saturate(1.2); }
    }
  `;

  @property({type: Number}) value = 0; // Range 0-2
  @property({type: String}) sliderColor = '#5200ff'; // Default color if not provided

  @query('.slider-container') private sliderContainer!: HTMLDivElement;
  @query('#thumb') private thumbElement!: HTMLDivElement;


  private dragStartPos = 0;
  private dragStartValue = 0;
  private containerBounds: DOMRect | null = null;
  private activePointerId: number | null = null;
  @state() private _isThumbPulsing = false;
  private _previousValueForPulse = this.value;

  // Bound event handlers for robust removal
  private boundHandlePointerMove: (e: PointerEvent) => void;
  private boundHandlePointerUpOrCancel: (e: PointerEvent) => void;


  constructor() {
    super();
    this.boundHandlePointerMove = this.handlePointerMove.bind(this);
    this.boundHandlePointerUpOrCancel = this.handlePointerUpOrCancel.bind(this);

    this.addEventListener('pointerdown', this.handlePointerDown);
    this.addEventListener('wheel', this.handleWheel);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.activePointerId !== null) {
      try {
        this.releasePointerCapture(this.activePointerId);
      } catch (error) {
        // console.warn("Error releasing pointer capture on disconnect:", error);
      }
      document.body.removeEventListener('pointermove', this.boundHandlePointerMove);
      document.body.removeEventListener('pointerup', this.boundHandlePointerUpOrCancel);
      document.body.removeEventListener('pointercancel', this.boundHandlePointerUpOrCancel);
      document.body.classList.remove('dragging');
      this.activePointerId = null;
    }
    this.removeEventListener('pointerdown', this.handlePointerDown);
    this.removeEventListener('wheel', this.handleWheel);
  }

  override updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('value') && this.value !== this._previousValueForPulse) {
      this._previousValueForPulse = this.value;
      if (this.value > 0.005 && this.thumbElement) { // Only pulse if thumb is visible
          this.thumbElement.classList.add('pulse-effect');
          setTimeout(() => {
            if (this.thumbElement) this.thumbElement.classList.remove('pulse-effect');
          }, 300); // Duration of the pulse animation
      }
    }
  }


  private handlePointerDown(e: PointerEvent) {
    if (this.activePointerId !== null) {
      return;
    }
    // e.preventDefault(); // Keep this commented unless issues arise with text selection etc. on desktop during drag

    this.activePointerId = e.pointerId;
    try {
      this.setPointerCapture(e.pointerId);
    } catch(err) {
        console.warn("Failed to capture pointer:", err);
        // Proceed without capture if it fails, common on some browsers or specific scenarios
    }


    this.containerBounds = this.sliderContainer.getBoundingClientRect();
    this.dragStartPos = e.clientX;
    this.dragStartValue = this.value;
    document.body.classList.add('dragging');

    document.body.addEventListener('pointermove', this.boundHandlePointerMove);
    document.body.addEventListener('pointerup', this.boundHandlePointerUpOrCancel);
    document.body.addEventListener('pointercancel', this.boundHandlePointerUpOrCancel);

    // Update value on initial press down as well
    this.updateValueFromPosition(e.clientX);
  }

  private handlePointerMove(e: PointerEvent) {
    if (e.pointerId !== this.activePointerId) {
      return;
    }
    // Prevent default behavior (like scrolling) during drag on touch devices
    if (e.pointerType === 'touch') {
        e.preventDefault();
    }
    this.updateValueFromPosition(e.clientX);
  }

  private handlePointerUpOrCancel(e: PointerEvent) {
    if (e.pointerId !== this.activePointerId) {
      return;
    }

    try {
        this.releasePointerCapture(e.pointerId);
    } catch (error) {
        // console.warn("Error releasing pointer capture:", error);
    }
    this.activePointerId = null;

    document.body.classList.remove('dragging');
    this.containerBounds = null;

    document.body.removeEventListener('pointermove', this.boundHandlePointerMove);
    document.body.removeEventListener('pointerup', this.boundHandlePointerUpOrCancel);
    document.body.removeEventListener('pointercancel', this.boundHandlePointerUpOrCancel);
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

    const trackWidth = this.containerBounds.width;
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
      display: this.value > 0.005 ? 'block' : 'none',
      backgroundColor: this.sliderColor,
    });

    return html`
      <div class="slider-container">
        <div id="thumb" style=${thumbStyle}></div>
      </div>
    `;
  }
}


/** A generic slider for parameters. */
@customElement('parameter-slider')
class ParameterSlider extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.3em;
      width: 100%;
      font-size: 0.9em; /* Slightly smaller than main UI text */
    }
    .label-value-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #ccc; /* Lighter text for labels */
    }
    .label {
      font-weight: 500;
    }
    .value-display {
      font-variant-numeric: tabular-nums;
    }
    input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 10px; /* Slightly thinner than prompt sliders */
      background: #282828; /* Darker track */
      border-radius: 5px;
      outline: none;
      cursor: ew-resize;
      margin: 0;
    }
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px; /* Thumb size */
      height: 18px;
      background: #7e57c2; /* Purple thumb color like screenshot */
      border-radius: 50%;
      cursor: ew-resize;
      border: 2px solid #fff; /* White border for contrast */
      box-shadow: 0 0 3px rgba(0,0,0,0.5);
    }
    input[type="range"]::-moz-range-thumb {
      width: 16px; /* Adjusted for Firefox */
      height: 16px;
      background: #7e57c2;
      border-radius: 50%;
      cursor: ew-resize;
      border: 2px solid #fff;
      box-shadow: 0 0 3px rgba(0,0,0,0.5);
    }
     :host([disabled]) input[type="range"],
     :host([disabled]) input[type="range"]::-webkit-slider-thumb,
     :host([disabled]) input[type="range"]::-moz-range-thumb {
        cursor: not-allowed;
        opacity: 0.5;
     }
  `;

  @property({type: String}) label = '';
  @property({type: Number}) value = 0;
  @property({type: Number}) min = 0;
  @property({type: Number}) max = 1;
  @property({type: Number}) step = 0.01;
  @property({type: Boolean, reflect: true}) disabled = false;

  private handleInput(e: Event) {
    if (this.disabled) return;
    const target = e.target as HTMLInputElement;
    this.value = parseFloat(target.value);
    this.dispatchEvent(new CustomEvent<number>('input', {detail: this.value, bubbles: true, composed: true}));
  }

  override render() {
    return html`
      <div class="label-value-container">
        <span class="label">${this.label}</span>
        <span class="value-display">${this.value.toFixed(this.step < 0.01 ? 3 : (this.step < 0.1 ? 2 : (this.step < 1 ? 1 : 0)))}</span>
      </div>
      <input
        type="range"
        .min=${this.min}
        .max=${this.max}
        .step=${this.step}
        .value=${this.value.toString()}
        @input=${this.handleInput}
        ?disabled=${this.disabled}
        aria-label=${this.label}
      />
    `;
  }
}

/** A generic toggle switch. */
@customElement('toggle-switch')
class ToggleSwitch extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.9em;
      color: #ccc;
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    :host([disabled]) {
        cursor: not-allowed;
        opacity: 0.5;
    }
    .switch {
      position: relative;
      display: inline-block;
      width: 44px; /* Slightly smaller */
      height: 24px; /* Slightly smaller */
    }
    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #4A4A4A; /* Darker grey for off state */
      transition: .3s;
      border-radius: 24px;
    }
    .slider:before {
      position: absolute;
      content: "";
      height: 18px; /* Smaller knob */
      width: 18px;  /* Smaller knob */
      left: 3px;    /* Adjusted position */
      bottom: 3px;  /* Adjusted position */
      background-color: white;
      transition: .3s;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    input:checked + .slider {
      background-color: #7e57c2; /* Purple when on, matching param sliders */
    }
    input:focus + .slider {
      box-shadow: 0 0 1px #7e57c2;
    }
    input:checked + .slider:before {
      transform: translateX(20px); /* Adjusted travel distance */
    }
    :host([disabled]) .slider {
        cursor: not-allowed;
    }
    .label {
      font-weight: 500;
    }
  `;

  @property({type: String}) label = '';
  @property({type: Boolean, reflect: true}) checked = false;
  @property({type: Boolean, reflect: true}) disabled = false;

  private _onClick() {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.dispatchEvent(new CustomEvent('change', {
      detail: { checked: this.checked },
      bubbles: true,
      composed: true,
    }));
  }

  override render() {
    return html`
      <label class="label" @click=${this._onClick}>${this.label}</label>
      <div class="switch" @click=${this._onClick}>
        <input type="checkbox" .checked=${this.checked} ?disabled=${this.disabled} aria-label=${this.label}>
        <span class="slider"></span>
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
      pointer-events: none; /* Host itself doesn't receive clicks */
    }
    :host(:hover) svg {
      transform: scale(1.2);
      filter: brightness(1.2);
    }
    :host(:active) svg { /* Press down effect */
      transform: scale(1.1);
      filter: brightness(0.9);
    }
    svg {
      width: 100%;
      height: 100%;
      transition: transform 0.2s cubic-bezier(0.25, 1.56, 0.32, 0.99), filter 0.2s ease-out;
    }
    .hitbox {
      pointer-events: all; /* Hitbox receives clicks */
      position: absolute;
      width: 65%; /* Adjust as needed for comfortable click area */
      aspect-ratio: 1;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent; /* Remove tap highlight on mobile */
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
      .play-icon-path {
        fill: #4CAF50; /* Green play icon */
      }
    `,
  ];

  private renderPause() {
    return svg`<path class="icon-path" d="M35 25 H45 V75 H35 Z M55 25 H65 V75 H55 Z" />`;
  }

  private renderPlay() {
    // Added play-icon-path class for specific styling
    return svg`<path class="icon-path play-icon-path" d="M30 20 L75 50 L30 80 Z" />`;
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

// SettingsButton component
@customElement('settings-button')
export class SettingsButton extends IconButton {
  static override styles = [
    IconButton.styles,
    css`
      .icon-path {
        stroke: #FEFEFE;
        stroke-width: 6;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    `
  ];
  // Simple gear icon
  private renderSettingsIcon() {
    return svg`
      <path class="icon-path" d="M43.75 25V20.625C43.75 19.9179 44.3429 19.375 45.0804 19.375H54.9196C55.6571 19.375 56.25 19.9179 56.25 20.625V25M43.75 75V79.375C43.75 80.0821 44.3429 80.625 45.0804 80.625H54.9196C55.6571 80.625 56.25 80.0821 56.25 79.375V75M25 43.75H20.625C19.9179 43.75 19.375 44.3429 19.375 45.0804V54.9196C19.375 55.6571 19.9179 56.25 20.625 56.25H25M75 43.75H79.375C80.0821 43.75 80.625 44.3429 80.625 45.0804V54.9196C80.625 55.6571 80.0821 56.25 79.375 56.25H75" />
      <circle class="icon-path" cx="50" cy="50" r="12.5" />
      <path class="icon-path" d="M33.2375 33.2375L37.5 37.5M66.7625 66.7625L62.5 62.5M33.2375 66.7625L37.5 62.5M66.7625 33.2375L62.5 37.5" />
    `;
  }
  override renderIcon() {
    return this.renderSettingsIcon();
  }
}


// HelpButton component
@customElement('help-button')
export class HelpButton extends IconButton {
  static override styles = [
    IconButton.styles,
    css`
      .icon-path-curve {
        stroke: #FEFEFE;
        stroke-width: 10; /* Made thicker */
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
      }
      .icon-path-dot {
        fill: #FEFEFE;
        stroke: none;
      }
    `
  ];

  private renderHelpIcon() {
    // Adjusted path for a more solid, rounded question mark
    return svg`
      <path class="icon-path-curve" d="M38 35 Q38 20 50 20 Q62 20 62 35 C62 45 53 42 50 55 L50 60" />
      <circle class="icon-path-dot" cx="50" cy="72" r="6" />
    `;
  }
  override renderIcon() {
    return this.renderHelpIcon();
  }
}

// ShareButton component
@customElement('share-button')
export class ShareButton extends IconButton {
  static override styles = [
    IconButton.styles,
    // No specific icon path styles needed if using text
  ];

  private renderShareText() {
    return svg`
      <text 
        x="50%" 
        y="50%" 
        dominant-baseline="middle" 
        text-anchor="middle" 
        font-family="Arial, sans-serif"
        font-size="30"  /* Adjust as needed for "Share" */
        font-weight="bold" 
        fill="#FEFEFE">
        Share
      </text>
    `;
  }
  override renderIcon() {
    return this.renderShareText();
  }
}

// DropButton component (formerly FXButton)
@customElement('drop-button')
export class DropButton extends IconButton {
  static override styles = [
    IconButton.styles,
    css`
      /* Gold color is applied directly in the SVG text element. */
    `
  ];

  private renderDropIcon() {
    return svg`
      <text 
        x="50%" 
        y="50%" 
        dominant-baseline="middle" 
        text-anchor="middle" 
        font-family="Arial, sans-serif"
        font-size="38"  /* Adjusted for "Drop!" */
        font-weight="bold" 
        fill="#FFD700">
        Drop!
      </text>
    `;
  }

  override renderIcon() {
    return this.renderDropIcon();
  }
}


// SavePresetButton component
@customElement('save-preset-button')
export class SavePresetButton extends IconButton {
  static override styles = [
    IconButton.styles,
    css` .icon-path { fill: #FEFEFE; } `
  ];
  // Download arrow icon
  private renderSaveIcon() {
    return svg`<path class="icon-path" d="M25 65 H75 V75 H25 Z M50 20 L70 45 H58 V20 H42 V45 H30 Z"/>`;
  }
  override renderIcon() { return this.renderSaveIcon(); }
}

// LoadPresetButton component
@customElement('load-preset-button')
export class LoadPresetButton extends IconButton {
  static override styles = [
    IconButton.styles,
    css` .icon-path { fill: #FEFEFE; } `
  ];
  // Folder inspired icon
  private renderLoadIcon() {
    return svg`<path class="icon-path" d="M20 25 H40 L45 20 H70 L75 25 V30 H20 V25 Z M20 35 H80 V70 H20 V35 Z"/>`;
  }
  override renderIcon() { return this.renderLoadIcon(); }
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
      transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.5s ease-out;
      z-index: 1100;
      opacity: 1;
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
      opacity: 0;
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
    // Auto-hide after some time
    setTimeout(() => this.hide(), 5000);
  }

  hide() {
    this.showing = false;
  }
}

/** A single prompt input */
@customElement('prompt-controller')
class PromptController extends LitElement {
  static override styles = css`
    @keyframes promptAppear {
      from {
        opacity: 0;
        transform: translateY(-20px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    .prompt {
      position: relative;
      width: 100%;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      overflow: hidden;
      background-color: #3E3E3E;
      border-radius: 12px;
      padding: 0;
      animation: promptAppear 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      transition: transform 0.2s ease-out, box-shadow 0.2s ease-out;
    }
    .prompt:hover {
      transform: translateY(-3px);
      box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    }
    .prompt-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 15px;
      gap: 10px;
    }
    .remove-button {
      background: #D32F2F;
      color: #FFFFFF;
      border: none;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      font-size: 18px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 28px;
      cursor: pointer;
      opacity: 0.8;
      transition: opacity 0.15s, transform 0.15s, background-color 0.15s;
      flex-shrink: 0;
    }
    .remove-button:hover {
      opacity: 1;
      transform: scale(1.15);
      background-color: #E53935; /* Slightly brighter red on hover */
    }
    .ratio-display {
      color: #FFFFFF;
      font-size: 3.2vmin;
      white-space: nowrap;
      font-weight: normal;
      margin-left: 5px; /* Reduced margin to make space for edit button */
      padding: 0 5px; /* Reduced padding */
      flex-shrink: 0;
    }
    weight-slider {
      width: auto;
      height: 20px;
      margin: 0 15px 12px 15px;
    }
    .text-container {
      display: flex;
      align-items: center;
      flex-grow: 1;
      overflow: hidden; /* Important for text ellipsis */
      margin-right: 8px;
    }
    #text-input, #static-text {
      font-family: 'Google Sans', sans-serif;
      font-size: 3.6vmin;
      font-weight: 500;
      padding: 2px 4px; /* Added some padding */
      box-sizing: border-box;
      text-align: left;
      word-wrap: break-word;
      border: none;
      outline: none;
      -webkit-font-smoothing: antialiased;
      color: #fff;
      background-color: transparent;
      border-radius: 3px;
      flex-grow: 1;
      min-width: 0; /* Allows shrinking and ellipsis */
    }
    #static-text {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      min-height: 1.2em;
      line-height: 1.2em;
      cursor: text; /* Indicate it can be interacted with */
    }
    #static-text:hover {
      background-color: rgba(255,255,255,0.05);
    }
    #text-input {
      background-color: rgba(0,0,0,0.2); /* Slight background for input */
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
    }
    #text-input:focus {
        box-shadow: 0 0 0 2px #66afe9;
    }
    .edit-save-button {
      background: none;
      border: none;
      color: #ccc;
      cursor: pointer;
      padding: 4px;
      margin-left: 8px; /* Space between text and button */
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      flex-shrink: 0;
      transition: background-color 0.2s, color 0.2s;
    }
    .edit-save-button:hover {
      background-color: rgba(255,255,255,0.1);
      color: #fff;
    }
    .edit-save-button svg {
      width: 20px; /* Adjust icon size */
      height: 20px;
      fill: currentColor;
    }
    :host([filtered='true']) #static-text,
    :host([filtered='true']) #text-input {
      background: #da2000;
    }
  `;

  @property({type: String, reflect: true}) promptId = '';
  @property({type: String}) text = '';
  @property({type: Number}) weight = 0;
  @property({type: String}) sliderColor = '#5200ff';

  @state() private isEditingText = false;
  @query('#text-input') private textInputElement!: HTMLInputElement;
  private _originalTextBeforeEdit = ''; // To revert on Escape

  override connectedCallback() {
    super.connectedCallback();
    // For new prompts, start in edit mode.
    // !this.hasUpdated ensures this is only for the initial setup.
    if (this.text === 'New Prompt' && !this.hasUpdated) {
      this.isEditingText = true;
      this._originalTextBeforeEdit = this.text;
    }
  }

  override updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('isEditingText') && this.isEditingText) {
      requestAnimationFrame(() => {
        if (this.textInputElement) {
          this.textInputElement.focus();
          this.textInputElement.select();
        }
      });
    }
  }

  private dispatchPromptChange() {
    this.dispatchEvent(
      new CustomEvent<Partial<Prompt>>('prompt-changed', {
        detail: {
          promptId: this.promptId,
          text: this.text,
          weight: this.weight,
        },
      }),
    );
  }

  private saveText() {
    const newText = this.textInputElement.value.trim();
    if (newText === this.text && this.text !== 'New Prompt') { // Check if text actually changed, unless it's the initial "New Prompt"
      this.isEditingText = false;
      return;
    }
    this.text = newText === '' ? 'Untitled Prompt' : newText;
    this.dispatchPromptChange();
    this.isEditingText = false;
  }

  private handleToggleEditSave() {
    if (this.isEditingText) {
      // Currently editing, so save
      this.saveText();
    } else {
      // Not editing, so start editing
      this._originalTextBeforeEdit = this.text;
      this.isEditingText = true;
    }
  }

  private handleTextInputKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.saveText();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.text = this._originalTextBeforeEdit; // Revert to original text
      // No need to dispatch if reverting, text prop itself will re-render if changed.
      // If you want to ensure parent knows about revert:
      // if (this.text !== this.textInputElement.value.trim()) this.dispatchPromptChange();
      this.isEditingText = false;
    }
  }
  
  private handleTextInputBlur() {
    // Save on blur if input is still visible (i.e., not already handled by Enter/Escape)
    if (this.isEditingText) {
        this.saveText();
    }
  }

  private handleStaticTextDoubleClick() {
    if (!this.isEditingText) {
      this._originalTextBeforeEdit = this.text;
      this.isEditingText = true;
    }
  }


  private updateWeight(event: CustomEvent<number>) {
    const newWeight = event.detail;
    if (this.weight === newWeight) {
      return;
    }
    this.weight = newWeight;
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

  private renderEditIcon() {
    return svg`<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;
  }

  private renderSaveIcon() {
    return svg`<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`;
  }

  override render() {
    const textContent = this.isEditingText
      ? html`<input
            type="text"
            id="text-input"
            .value=${this.text === 'New Prompt' && this.isEditingText ? '' : this.text}
            placeholder=${this.text === 'New Prompt' ? 'Enter prompt...' : this.text}
            @keydown=${this.handleTextInputKeyDown}
            @blur=${this.handleTextInputBlur}
            spellcheck="false"
          />`
      : html`<span id="static-text" title=${this.text} @dblclick=${this.handleStaticTextDoubleClick}>${this.text}</span>`;

    return html`<div class="prompt">
      <div class="prompt-header">
        <div class="text-container">
            ${textContent}
        </div>
        <button 
            class="edit-save-button" 
            @click=${this.handleToggleEditSave} 
            aria-label=${this.isEditingText ? 'Save prompt text' : 'Edit prompt text'}
            title=${this.isEditingText ? 'Save (Enter)' : 'Edit (Double-click text)'} >
            ${this.isEditingText ? this.renderSaveIcon() : this.renderEditIcon()}
        </button>
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

@customElement('help-guide-panel')
class HelpGuidePanel extends LitElement {
  @property({type: Boolean, reflect: true}) isOpen = false;

  static override styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0;
      right: 0;
      width: 100%;
      height: 100%;
      z-index: 1050; /* Above most content, below modals if any */
      pointer-events: none; /* Allow clicks through overlay if panel not open */
      transition: background-color 0.3s ease-in-out;
    }
    :host([isOpen]) {
      pointer-events: auto; /* Enable interaction when open */
      background-color: rgba(0, 0, 0, 0.5); /* Dim overlay */
    }
    .panel {
      position: absolute;
      top: 0;
      right: 0;
      width: clamp(300px, 40vw, 500px); /* Responsive width */
      height: 100%;
      background-color: #282828; /* Dark background for the panel */
      color: #e0e0e0;
      box-shadow: -5px 0 15px rgba(0,0,0,0.3);
      transform: translateX(100%);
      transition: transform 0.3s ease-in-out;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    :host([isOpen]) .panel {
      transform: translateX(0);
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      background-color: #333;
      border-bottom: 1px solid #444;
      flex-shrink: 0;
    }
    .panel-header h2 {
      margin: 0;
      font-size: 1.4em;
      font-weight: 500;
    }
    .close-button {
      background: none;
      border: none;
      color: #e0e0e0;
      font-size: 1.8em;
      font-weight: bold;
      cursor: pointer;
      padding: 0 5px;
      line-height: 1;
    }
    .close-button:hover {
      color: #fff;
    }
    .panel-content {
      padding: 20px;
      overflow-y: auto;
      flex-grow: 1;
      scrollbar-width: thin;
      scrollbar-color: #555 #282828;
    }
    .panel-content::-webkit-scrollbar { width: 8px; }
    .panel-content::-webkit-scrollbar-track { background: #282828; }
    .panel-content::-webkit-scrollbar-thumb { background-color: #555; border-radius: 4px; }
    
    .panel-content h3 {
      color: #fff;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 500;
      border-bottom: 1px solid #444;
      padding-bottom: 0.3em;
    }
    .panel-content h3:first-child {
      margin-top: 0;
    }
    .panel-content h4 {
      color: #ddd;
      margin-top: 1em;
      margin-bottom: 0.3em;
      font-weight: 500;
    }
    .panel-content p, .panel-content ul {
      line-height: 1.6;
      margin-bottom: 0.8em;
    }
    .panel-content ul {
      padding-left: 20px;
    }
    .panel-content li {
      margin-bottom: 0.5em;
    }
    .panel-content strong {
      color: #fff;
      font-weight: 600;
    }
    .panel-content code {
      background-color: #1e1e1e;
      padding: 0.1em 0.4em;
      border-radius: 3px;
      font-family: monospace;
    }
  `;

  private _close() {
    this.dispatchEvent(new CustomEvent('close-help', {bubbles: true, composed: true}));
  }

  override render() {
    return html`
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="help-panel-title" ?hidden=${!this.isOpen}>
        <div class="panel-header">
          <h2 id="help-panel-title">Steppa's BeatLab Help</h2>
          <button class="close-button" @click=${this._close} aria-label="Close help panel">✕</button>
        </div>
        <div class="panel-content">
          <section>
            <h3>Willkommen bei Steppa's BeatLab!</h3>
            <p>Diese App ermöglicht es dir, interaktiv Musik in Echtzeit mit Text-Prompts und MIDI-Controllern zu gestalten.</p>
          </section>
          <section>
            <h3>Grundlagen</h3>
            <h4>Tracks hinzufügen</h4>
            <p>Klicke auf den großen <strong>+ Button</strong> unterhalb deiner aktuellen Track-Liste, um einen neuen Track (Prompt-Zeile) hinzuzufügen.</p>
            <h4>Prompts schreiben</h4>
            <p>Klicke auf den Text (z.B. "Ambient Chill" oder "New Prompt") eines Tracks oder den Bearbeiten-Button (Stift-Icon) daneben, um deinen eigenen Musik-Prompt einzugeben. Drücke <strong>Enter</strong> oder klicke den Speichern-Button (Haken-Icon), um zu speichern. Die Musik-Engine versucht dann, diesen Prompt umzusetzen.</p>
            <h4>Gewichtung anpassen (Ratio)</h4>
            <p>Ziehe den farbigen Slider unter jedem Prompt, um dessen Einfluss (Gewichtung) auf die generierte Musik anzupassen. Werte reichen von 0 (kein Einfluss) bis 2 (starker Einfluss). Die aktuelle Ratio wird rechts neben dem Prompt-Text angezeigt.</p>
            <h4>Musik starten/pausieren</h4>
            <p>Verwende den großen <strong>Play/Pause-Button (▶️/⏸️ unten links)</strong>. Beim ersten Start oder nach einer Unterbrechung kann es einen Moment dauern (Lade-Symbol), bis die Musik beginnt.</p>
            <h4>"Drop!"-Effekt</h4>
            <p>Klicke den <strong>Drop!-Button ( unten rechts)</strong> für einen Überraschungseffekt! Die Musik baut Spannung auf und entlädt sich dann – perfekt für Übergänge oder um Energie freizusetzen. Der Drop versucht, sich an den aktuell gespielten Musikstil anzupassen.</p>
          </section>
          <section>
            <h3>Konfiguration Teilen (via Link)</h3>
            <p>Klicke auf den <strong>Share-Button</strong> unten rechts. Dadurch wird ein spezieller Link in deine Zwischenablage kopiert.</p>
            <p>Wenn jemand diesen Link öffnet, startet Steppa's BeatLab automatisch mit genau deiner aktuellen Konfiguration (Prompts, Gewichtungen, und alle erweiterten Einstellungen).</p>
            <p>Ideal, um deine Kreationen schnell und einfach zu präsentieren oder gemeinsam an Klanglandschaften zu arbeiten!</p>
          </section>
          <section>
            <h3>Erweiterte Einstellungen (Zahnrad-Icon)</h3>
            <p>Klicke auf das Zahnrad-Icon (⚙️) in der oberen rechten Leiste, um die erweiterten Einstellungen ein- oder auszublenden.</p>
            <ul>
              <li><strong>Temperature:</strong> Regelt die Zufälligkeit. Höher = mehr Variation.</li>
              <li><strong>Guidance:</strong> Steuert, wie genau das Modell den Prompts folgt. Höher = strenger, aber Übergänge können abrupter sein.</li>
              <li><strong>BPM (Beats Per Minute):</strong> Legt das gewünschte Tempo fest. <em>Hinweis: Eine Änderung hier erfordert möglicherweise ein Anhalten/Neustarten der Musik, um wirksam zu werden.</em></li>
              <li><strong>Density:</strong> Steuert die Dichte der Noten/Töne. Niedriger = spärlicher, höher = "belebter".</li>
              <li><strong>Brightness:</strong> Passt die Tonalität an. Höher = "hellerer" Klang mit Betonung höherer Frequenzen.</li>
              <li><strong>Mute Bass / Mute Drums:</strong> Reduziert den Bass bzw. das Schlagzeug.</li>
              <li><strong>Only Bass & Drums:</strong> Gibt nur Bass und Schlagzeug aus. Deaktiviert "Mute Bass" und "Mute Drums".</li>
              <li><strong>Music Generation Mode:</strong> Wählt zwischen "Quality" (höhere Qualität, Standard) und "Diversity" (mehr Abwechslung).</li>
            </ul>
          </section>
          <section>
            <h3>Tracks verwalten</h3>
            <h4>Prompts bearbeiten</h4>
            <p>Klicke auf den Text des Prompts (oder den Stift-Button), bearbeite ihn und drücke <strong>Enter</strong> (oder klicke den Haken-Button).</p>
            <h4>Tracks entfernen</h4>
            <p>Klicke auf das rote <strong>✕</strong>-Symbol rechts neben einem Track, um ihn zu entfernen.</p>
          </section>
          <section>
            <h3>Inspirations-Ecke: Was kannst du Cooles machen?</h3>
            <ul>
              <li><strong>Ambient-Klangwelten:</strong> Erzeuge beruhigende Ambient-Klanglandschaften für Meditation oder Fokus. Nutze Prompts wie <code>tiefer Weltraumklang, langsame Synthesizer-Pads, ferne Chöre</code> und halte die Temperatur niedrig (z.B. 0.5-0.8) für subtile Entwicklungen.</li>
              <li><strong>Dynamische Live-Sets:</strong> Mixe verschiedene Musikstile live! Starte mit einem <code>Deep House Beat mit 120 BPM</code>, füge dann einen Track mit <code>funky analog Bassline</code> hinzu und überblende später zu <code>energetischer Trance-Melodie mit treibenden Arpeggios</code>. Nutze die Gewichts-Slider (Ratio) und einen MIDI-Controller für fließende Übergänge. Nutze den <strong>Drop!</strong>-Button für dramatische Höhepunkte!</li>
              <li><strong>Kreative Sound-Experimente:</strong> Entdecke verrückte und einzigartige Sounds! Probiere ungewöhnliche Prompts wie <code>singende Roboter im Dschungel bei Gewitter</code>, <code>gläserne Regentropfen auf einer alten Holztür</code> oder <code>flüsternde Alien-Stimmen in einer Höhle</code>. Spiele mit hoher Temperatur (z.B. 1.2-1.8) für überraschende und unvorhersehbare Ergebnisse.</li>
              <li><strong>Storytelling mit Musik:</strong> Untermale eine Geschichte, ein Hörspiel oder ein Rollenspiel live mit passender Musik. Ändere die Prompts dynamisch, um die Stimmung der jeweiligen Szene widerzuspiegeln – von <code>spannungsgeladener Verfolgungsmusik mit schnellen Drums</code> bis zu <code>friedlicher Melodie bei Sonnenaufgang mit sanften Streichern</code>.</li>
              <li><strong>Interaktive Jam-Session mit der KI:</strong> Verwende einen MIDI-Keyboard-Controller, um die Gewichte der Tracks wie Instrumente in einer Band zu 'spielen'. Erstelle einen Basis-Groove mit einem Prompt und improvisiere dann Melodien, Harmonien oder Stimmungsänderungen, indem du andere Prompts über die Slider (oder MIDI CCs) ein- und ausblendest.</li>
              <li><strong>Genre-Mashups:</strong> Kombiniere gegensätzliche Genres! Was passiert, wenn du <code>Barockes Cembalo-Solo</code> mit <code>Heavy Dubstep Wobble Bass</code> mischst? Sei mutig und finde neue Klangkombinationen.</li>
            </ul>
          </section>
          <section>
            <h3>MIDI-Steuerung</h3>
            <p>Wähle dein MIDI-Gerät aus dem Dropdown-Menü oben links aus. Wenn kein Gerät erscheint, stelle sicher, dass es verbunden ist und dein Browser Zugriff auf MIDI-Geräte hat.</p>
            <p>Die MIDI Control Change (CC) Nachrichten steuern die Gewichts-Slider der Tracks. CC1 steuert den ersten Track, CC2 den zweiten, und so weiter. Der CC-Wert (0-127) wird automatisch auf den Slider-Bereich (0-2) umgerechnet.</p>
          </section>
          <section>
            <h3>Tipps & Fehlerbehebung</h3>
            <h4>"No MIDI Devices" / MIDI-Gerät nicht erkannt</h4>
            <p>Stelle sicher, dass dein MIDI-Gerät korrekt angeschlossen und eingeschaltet ist, bevor du die Seite lädst. Manchmal hilft es, die Seite neu zu laden, nachdem das Gerät verbunden wurde. Überprüfe auch die Browser-Berechtigungen für MIDI.</p>
            <h4>Ladeanzeige / Musik startet nicht sofort</h4>
            <p>Es kann einen Moment dauern, bis die Verbindung zur Musik-Engine hergestellt und genügend Audio-Daten für eine stabile Wiedergabe gepuffert wurden.</p>
            <h4>Verbindungsfehler / Musik stoppt</h4>
            <p>Es kann zu Netzwerkproblemen oder serverseitigen Unterbrechungen kommen. Versuche, die Wiedergabe über den Play/Pause-Button neu zu starten. Eine Fehlermeldung gibt oft genauere Hinweise.</p>
            <h4>"Filtered Prompt" Nachricht</h4>
            <p>Manchmal werden Prompts aus Sicherheitsgründen oder aufgrund von Inhaltsrichtlinien gefiltert und nicht zur Musikgenerierung verwendet. In diesem Fall wird der entsprechende Prompt markiert und eine Nachricht angezeigt.</p>
             <h4>Geteilter Link funktioniert nicht richtig</h4>
            <p>Stelle sicher, dass der Link vollständig kopiert wurde. Sehr lange oder komplexe Prompts könnten in seltenen Fällen die maximale URL-Länge überschreiten, obwohl dies unwahrscheinlich ist.</p>
          </section>
        </div>
      </div>
    `;
  }
}

/** Component for the Steppa's BeatLab UI. */
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
      background: linear-gradient(45deg, #101010, #1a1a1a, #101010);
      background-size: 400% 400%;
      animation: subtleBgAnimation 25s ease infinite;
      overflow: hidden; 
    }

    @keyframes subtleBgAnimation {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    .background-orbs-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      z-index: 0; 
      pointer-events: none; 
    }

    .orb {
      position: absolute;
      border-radius: 50%;
      will-change: transform, opacity;
      opacity: 0; 
    }

    .orb1 {
      width: 30vmax;
      height: 30vmax;
      background: radial-gradient(circle, ${unsafeCSS(ORB_COLORS[0])} 0%, transparent 70%);
      animation: floatOrb1 35s infinite ease-in-out;
      top: 10%; left: 5%;
    }
    @keyframes floatOrb1 {
      0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.2; }
      25% { transform: translate(20vw, 30vh) scale(1.3); opacity: 0.3; }
      50% { transform: translate(-10vw, 50vh) scale(0.8); opacity: 0.15; }
      75% { transform: translate(15vw, -10vh) scale(1.1); opacity: 0.25; }
    }

    .orb2 {
      width: 45vmax;
      height: 45vmax;
      background: radial-gradient(circle, ${unsafeCSS(ORB_COLORS[1])} 0%, transparent 70%);
      animation: floatOrb2 45s infinite ease-in-out 5s; 
      top: 40%; left: 60%;
    }
    @keyframes floatOrb2 {
      0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.15; }
      25% { transform: translate(-30vw, -25vh) scale(0.7); opacity: 0.25; }
      50% { transform: translate(15vw, 20vh) scale(1.2); opacity: 0.1; }
      75% { transform: translate(-10vw, -15vh) scale(0.9); opacity: 0.2; }
    }
    
    .orb3 {
      width: 25vmax;
      height: 25vmax;
      background: radial-gradient(circle, ${unsafeCSS(ORB_COLORS[2])} 0%, transparent 65%);
      animation: floatOrb3 30s infinite ease-in-out 2s; 
      top: 70%; left: 20%;
    }
    @keyframes floatOrb3 {
      0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.25; }
      33% { transform: translate(25vw, -30vh) scale(1.4); opacity: 0.35; }
      66% { transform: translate(-15vw, 10vh) scale(0.7); opacity: 0.15; }
    }
    
    .orb4 { 
      width: 15vmax;
      height: 15vmax;
      background: radial-gradient(circle, ${unsafeCSS(ORB_COLORS[3])} 0%, transparent 75%);
      animation: floatOrb4 55s infinite ease-in-out 8s; 
      top: 5%; left: 80%;
    }
    @keyframes floatOrb4 {
      0%, 100% { transform: translate(0, 0) scale(1.2); opacity: 0.1; }
      25% { transform: translate(-10vw, 15vh) scale(0.9); opacity: 0.15; }
      50% { transform: translate(5vw, -20vh) scale(1.3); opacity: 0.05; }
      75% { transform: translate(-15vw, 5vh) scale(1); opacity: 0.12; }
    }


    .header-bar {
      width: 100%;
      padding: 2vmin 3vmin;
      background: linear-gradient(90deg, #1f1f1f, #2a2a2a, #1f1f1f);
      background-size: 300% 100%;
      animation: animatedHeaderGradient 15s ease infinite;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-sizing: border-box;
      flex-shrink: 0;
      border-bottom: 1px solid #383838; 
      z-index: 100; 
      position: relative; 
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }

    @keyframes animatedHeaderGradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    .header-left-controls {
      display: flex;
      align-items: center;
      gap: 1.5vmin;
    }

    .midi-selector, .styled-select {
      background-color: #333;
      color: #fff;
      border: 1px solid #555;
      padding: 0.8em 1em;
      border-radius: 6px;
      font-size: 2vmin;
      min-width: 180px; 
      max-width: 280px; 
      box-sizing: border-box;
      transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
      flex-shrink: 1; 
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
      background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23BBB%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.4-5.4-12.8z%22/%3E%3C/svg%3E');
      background-repeat: no-repeat;
      background-position: right .7em top 50%, 0 0;
      background-size: .65em auto, 100%;
      padding-right: 2.5em; /* Make space for arrow */
    }
    .midi-selector:hover, .styled-select:hover {
      border-color: #777;
      box-shadow: 0 0 5px rgba(120,120,120,0.5);
    }
    .midi-selector:focus, .styled-select:focus {
      border-color: #66afe9;
      outline: none;
      box-shadow: 0 0 8px rgba(102,175,233,0.6);
    }
    .midi-selector:disabled, .styled-select:disabled {
      background-color: #222;
      color: #777;
      cursor: not-allowed;
      border-color: #444;
      box-shadow: none;
      background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23555%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.4-5.4-12.8z%22/%3E%3C/svg%3E');
    }
    .header-actions { /* Now only contains settings button */
      display: flex;
      align-items: center;
      gap: 1.5vmin; 
    }
    .header-actions > settings-button {
      width: 7vmin; 
      height: 7vmin;
      max-width: 55px; 
      max-height: 55px;
    }


    .advanced-settings-panel {
      background-color: #222; 
      width: 100%;
      padding: 0; 
      box-sizing: border-box;
      z-index: 99; 
      position: relative;
      overflow: hidden;
      max-height: 0;
      opacity: 0;
      transition: max-height 0.5s ease-in-out, opacity 0.5s ease-in-out, padding 0.5s ease-in-out;
      border-bottom: 1px solid #383838;
    }
    .advanced-settings-panel.visible {
      max-height: 500px; /* Adjust if more settings are added */
      opacity: 1;
      padding: 2vmin 3vmin;
    }
    .settings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 2vmin 2.5vmin; /* Row gap, Column gap */
      align-items: start; /* Align items at the start of their grid cell */
    }
    /* Styling for select within the settings grid */
    .settings-grid .styled-select {
        width: 100%; /* Make select take full width of its grid cell */
        max-width: none; /* Override max-width from general .styled-select */
        font-size: 0.9em;
        padding: 0.6em 2.2em 0.6em 0.8em; /* Adjusted padding for smaller font */
    }
    .settings-grid-item { /* Wrapper for label + control if needed for alignment */
        display: flex;
        flex-direction: column;
        gap: 0.5em;
    }
    .settings-grid-item > label { /* For select dropdown label */
        font-size: 0.9em;
        color: #ccc;
        font-weight: 500;
    }

    .hide-settings-link {
      display: block;
      text-align: center;
      color: #aaa;
      text-decoration: underline;
      cursor: pointer;
      padding-top: 2vmin; /* Increased padding */
      font-size: 0.9em;
    }
    .hide-settings-link:hover {
      color: #fff;
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
      z-index: 10; 
      position: relative; 
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
      padding-right: 8px; 
      padding-left: 3px; 
      /* Add padding at the bottom if add button is inside and absolutely positioned at bottom of container
         padding-bottom: calc(21vmin + 4vmin); /* Approx button height + desired margin */
    }
    #prompts-container::-webkit-scrollbar {
      width: 10px; 
    }
    #prompts-container::-webkit-scrollbar-track {
      background: #181818; 
      border-radius: 5px;
    }
    #prompts-container::-webkit-scrollbar-thumb {
      background-color: #555; 
      border-radius: 5px;
      border: 2px solid #181818; 
    }
    #prompts-container::-webkit-scrollbar-thumb:hover {
      background-color: #777;
    }
    prompt-controller {
      width: 100%;
      flex-shrink: 0;
      box-sizing: border-box;
    }
    
    .floating-add-button { /* Styles for the add-prompt-button when it's below prompts */
      display: block; /* Or flex if content inside needs centering */
      width: 21vmin;
      height: 21vmin;
      max-width: 150px;
      max-height: 150px;
      margin: 3vmin auto 1vmin auto; /* Top margin, Auto horizontal, Bottom margin */
      flex-shrink: 0; /* Prevent shrinking if prompts-container is flex */
    }

    .bottom-left-utility-cluster {
      position: fixed;
      bottom: 20px;
      left: 20px;
      z-index: 1000;
      display: flex;
      flex-direction: column; /* Stacked vertically */
      align-items: center;
      gap: 15px;
    }

    .bottom-left-utility-cluster > play-pause-button {
      width: 21vmin; /* Increased size */
      height: 21vmin;
      max-width: 150px;
      max-height: 150px;
    }

    .utility-button-cluster { /* This is the bottom-right cluster */
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1000; 
      display: flex;
      flex-direction: column;
      align-items: center; 
      gap: 15px; 
    }

    .utility-button-cluster > drop-button { 
      width: 12vmin;
      height: 12vmin;
      max-width: 80px;
      max-height: 80px;
    }

    .utility-button-cluster > share-button,
    .utility-button-cluster > help-button {
      width: 7vmin; 
      height: 7vmin;
      max-width: 50px; 
      max-height: 50px;
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
  private readonly bufferTime = 2; // Target buffer duration in seconds
  @state() private playbackState: PlaybackState = 'stopped';
  @state() private firstChunkReceivedTimestamp = 0; // Timestamp of the first chunk in current loading cycle

  @property({type: Object})
  private filteredPrompts = new Set<string>();
  private connectionError = true;
  private midiController: MidiController;
  private readonly midiCcBase = 1;
  private isConnecting = false;

  @query('toast-message') private toastMessage!: ToastMessage;
  @query('#presetFileInput') private fileInputForPreset!: HTMLInputElement;


  @state() private availableMidiInputs: Array<{id: string, name: string}> = [];
  @state() private selectedMidiInputId: string | null = null;
  @state() private showAdvancedSettings = false;
  @state() private temperature = 1.0; // Default, Min: 0, Max: 2, Step: 0.1
  @state() private showHelpPanel = false;
  @state() private globalSystemInstruction = "You are an AI music DJ creating live, evolving soundscapes based on user prompts. Strive for musicality and coherence.";
  
  // New advanced settings states
  @state() private guidance = 4.0; // Range 0.0 - 6.0, Default 4.0
  @state() private bpm = 120; // Range 60 - 200, Default 120
  @state() private density = 0.5; // Range 0.0 - 1.0, Default 0.5
  @state() private brightness = 0.5; // Range 0.0 - 1.0, Default 0.5
  @state() private muteBass = false;
  @state() private muteDrums = false;
  @state() private onlyBassAndDrums = false;
  @state() private musicGenerationMode: 'QUALITY' | 'DIVERSITY' = 'QUALITY';


  // Drop effect states
  @state() private isDropActive = false;
  private originalPromptWeightsBeforeDrop: Map<string, number> | null = null;
  private temporaryDropPromptId: string | null = null;
  private dropTimeoutId: number | null = null;

  // MIDI Access states
  @state() private isMidiSupported = false;
  @state() private midiAccessAttempted = false;
  @state() private midiAccessGranted = false;
  @state() private isRequestingMidiAccess = false;


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
    this.firstChunkReceivedTimestamp = 0;
  }

  override async firstUpdated() {
    await this._loadStateFromUrl(); // Attempt to load shared state first
    await this.connectToSession();
    
    this.midiController.initialize(); // Initialize MIDI controller (doesn't request access yet)
    this.isMidiSupported = this.midiController.isMidiSupported();
    
    this.addEventListener('midi-cc-received', this.handleMidiCcReceived as EventListener);
    this.midiController.addEventListener('midi-inputs-changed', this.handleMidiInputsChanged as EventListener);
  }

  override disconnectedCallback(): void {
      super.disconnectedCallback();
      if (this.dropTimeoutId) {
        clearTimeout(this.dropTimeoutId);
        this.dropTimeoutId = null;
      }
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

  private async handleMidiSelectorInteraction() {
    if (this.isRequestingMidiAccess || !this.isMidiSupported) {
        return;
    }

    if (!this.midiAccessAttempted || (this.midiAccessAttempted && !this.midiAccessGranted) ) {
        this.isRequestingMidiAccess = true;
        this.requestUpdate(); 

        const success = await this.midiController.requestMidiAccessAndListDevices();
        
        this.midiAccessGranted = success;
        this.midiAccessAttempted = true;
        this.isRequestingMidiAccess = false;
        this.requestUpdate();
    }
    // If access is already granted, normal dropdown behavior will occur.
  }

  private handleMidiInputsChanged(event: CustomEvent<{inputs: Array<{id: string, name: string}>}>) {
    const newInputs = event.detail.inputs;
    this.availableMidiInputs = newInputs;

    if (newInputs.length > 0) {
        const currentSelectedStillExists = this.selectedMidiInputId && newInputs.some(input => input.id === this.selectedMidiInputId);
        let newSelectedId = this.selectedMidiInputId;

        if (!currentSelectedStillExists) {
            // If current selection is gone, try to select the first available one if not already selected
            newSelectedId = newInputs[0].id;
        }
        
        // If no input was selected before, and now inputs are available, select the first one.
        if (!this.selectedMidiInputId && newInputs.length > 0) {
             newSelectedId = newInputs[0].id;
        }

        if (newSelectedId && newSelectedId !== this.selectedMidiInputId) {
             this.selectedMidiInputId = newSelectedId;
             this.midiController.selectMidiInput(this.selectedMidiInputId);
        } else if (this.selectedMidiInputId && !currentSelectedStillExists) {
            // If the previously selected device is gone, and we auto-selected a new one, apply it.
             this.midiController.selectMidiInput(this.selectedMidiInputId);
        }


    } else { // No inputs available
        if (this.selectedMidiInputId) { // If something was selected
            this.midiController.selectMidiInput(''); // Deselect
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
        this.session = await ai.live.music.connect({
        model: model,
        callbacks: {
            onmessage: async (e: LiveMusicServerMessage) => {
            // console.log('Received message from the server:', e); // Log every message for debug if needed
            if (e.setupComplete) {
                this.setGenerationConfiguration();
            }
            if (e.filteredPrompt) {
                this.filteredPrompts = new Set([
                ...this.filteredPrompts,
                e.filteredPrompt.text,
                ]);
                this.toastMessage.show(e.filteredPrompt.filteredReason);
            }
            if (e.serverContent?.audioChunks !== undefined) {
                if (this.playbackState === 'paused' || this.playbackState === 'stopped') {
                    return; // Ignore audio if not trying to play/load
                }

                const audioBuffer = await decodeAudioData(
                    decode(e.serverContent?.audioChunks[0].data),
                    this.audioContext,
                    this.sampleRate,
                    2,
                );
                const source = this.audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this.outputNode);

                const currentTime = this.audioContext.currentTime;

                if (this.playbackState === 'loading') {
                    if (this.firstChunkReceivedTimestamp === 0) { // First chunk in this loading cycle
                        this.firstChunkReceivedTimestamp = currentTime;
                        // Set the target playout time for this very first chunk
                        this.nextStartTime = currentTime + this.bufferTime;
                        console.log(`Initial buffer: first chunk received, scheduling for ${this.nextStartTime.toFixed(2)}s`);
                    }
                }

                // Handle underrun: if nextStartTime is in the past.
                if (this.nextStartTime < currentTime) {
                    console.warn(`Audio under run: nextStartTime ${this.nextStartTime.toFixed(2)}s < currentTime ${currentTime.toFixed(2)}s. Resetting playback target.`);
                    this.playbackState = 'loading'; // Ensure we are in loading state
                    this.firstChunkReceivedTimestamp = currentTime; // Restart buffering period
                    // Schedule this current buffer to play after bufferTime from now.
                    this.nextStartTime = currentTime + this.bufferTime;
                }

                source.start(this.nextStartTime);

                // If we were loading, check if we can transition to 'playing'
                if (this.playbackState === 'loading') {
                    // Transition to playing if currentTime has caught up to when the first buffered chunk *should* start playing.
                    // This means the initial bufferTime period has elapsed since receiving the first chunk for this loading cycle.
                    if (this.firstChunkReceivedTimestamp > 0 && (currentTime >= this.firstChunkReceivedTimestamp + this.bufferTime - 0.1)) { // -0.1s for slight margin
                        console.log("Buffer period elapsed, transitioning to playing state.");
                        this.playbackState = 'playing';
                        this.firstChunkReceivedTimestamp = 0; // Reset for next loading cycle
                    }
                }
                
                // Advance nextStartTime for the *next* buffer
                this.nextStartTime += audioBuffer.duration;
            }
            },
            onerror: (e: ErrorEvent) => {
            console.error('Error occurred during session:', e);
            this.connectionError = true;
            this.stopAudio();
            this.toastMessage.show(`Connection error: ${e.message}. Please try again.`);
            },
            onclose: (e: CloseEvent) => {
            console.log('Connection closed.');
            this.connectionError = true;
            this.stopAudio();
            this.toastMessage.show('Connection closed. Please restart audio.');
            },
        },
        });
        this.connectionError = false;
        console.log("Session connected successfully.");
        this.setGenerationConfiguration(); // Send initial full config
    } catch (error: any) {
        console.error("Failed to connect to session:", error);
        this.connectionError = true;
        this.playbackState = 'stopped';
        this.toastMessage.show(`Failed to connect: ${error.message}`);
    } finally {
        this.isConnecting = false;
    }
  }

  private setGenerationConfiguration = throttle(async () => {
    if (!this.session || this.connectionError) {
        console.warn("Cannot set generation config: No session or connection error.");
        return;
    }
    const musicGenConfig: AppLiveMusicGenerationConfig = {
        temperature: this.temperature,
        guidance: this.guidance,
        bpm: this.bpm,
        density: this.density,
        brightness: this.brightness,
        mute_bass: this.muteBass,
        mute_drums: this.muteDrums,
        only_bass_and_drums: this.onlyBassAndDrums,
        music_generation_mode: this.musicGenerationMode,
    };

    if (this.isDropActive) {
        const activePrompts = Array.from(this.prompts.values())
            .filter(p => p.weight > 0.05 && p.promptId !== this.temporaryDropPromptId); 

        let currentPlayingStyleDescription = "the current soundscape";
        if (activePrompts.length > 0) {
            currentPlayingStyleDescription = activePrompts.map(p => p.text).slice(0, 3).join(', ');
            if (activePrompts.length > 3) {
                 currentPlayingStyleDescription += ", and other elements";
            }
        }
        // Example: Temporarily boost temperature slightly for more energy during drop, if desired
        // musicGenConfig.temperature = Math.min(this.temperature + 0.2, 2.0);
        
        musicGenConfig.systemInstruction = `You are a master DJ executing a highly energetic and dramatic drop. The main prompt describes the sequence. Integrate this drop cohesively with the existing musical style, described as: ${currentPlayingStyleDescription}. Make it impactful.`;
    } else {
        musicGenConfig.systemInstruction = this.globalSystemInstruction;
    }

    try {
        await this.session.setMusicGenerationConfig({ musicGenerationConfig: musicGenConfig });
        // console.log("Generation config sent to session:", musicGenConfig); // Can be too verbose
    } catch (e: any) {
        this.toastMessage.show(`Error setting generation config: ${e.message}`);
    }
  }, 300);

  private setSessionPrompts = throttle(async () => {
    if (!this.session || this.connectionError) {
        console.warn("Cannot set prompts: No session or connection error.");
        return;
    }
    const promptsToSend = Array.from(this.prompts.values()).filter((p) => {
      return !this.filteredPrompts.has(p.text) && p.weight > 0;
    }).map(p => ({ text: p.text, weight: p.weight }));

    if (promptsToSend.length === 0 && this.playbackState === 'playing') {
        console.log("Setting empty prompts list.");
    }

    try {
      await this.session.setWeightedPrompts({
        weightedPrompts: promptsToSend,
      });
      // console.log("Prompts sent to session:", promptsToSend); // Can be too verbose
    } catch (e: any) {
      this.toastMessage.show(`Error setting prompts: ${e.message}`);
      this.pauseAudio();
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
        return;
    }

    if (this.playbackState === 'playing') {
      this.pauseAudio();
    } else if (
      this.playbackState === 'paused' ||
      this.playbackState === 'stopped'
    ) {
      this.playbackState = 'loading';
      this.firstChunkReceivedTimestamp = 0; // Reset for new loading cycle

      if (this.connectionError || !this.session) {
        await this.connectToSession();
        if (this.connectionError) {
            if(this.playbackState === 'loading') this.playbackState = 'stopped';
            this.firstChunkReceivedTimestamp = 0; // Ensure reset on failure
            return;
        }
      } else {
        // If already connected, ensure config is up-to-date before playing
        this.setGenerationConfiguration();
      }


      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(err => console.error("Audio context resume failed:", err));
      }
      await this.setSessionPrompts();
      this.loadAudio();

    } else if (this.playbackState === 'loading') {
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
    this.nextStartTime = 0; // Reset for consistent re-buffering on resume
    this.firstChunkReceivedTimestamp = 0; // Reset buffering state

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
        } catch (e) {
            console.error("Error playing session:", e);
            this.toastMessage.show("Error trying to play. Session might be in an invalid state.");
            this.playbackState = 'stopped';
            this.firstChunkReceivedTimestamp = 0;
            return;
        }
    } else if (!this.session || this.connectionError) {
        if (this.playbackState === 'loading') {
            this.playbackState = 'stopped';
            this.firstChunkReceivedTimestamp = 0;
        }
        this.toastMessage.show("Cannot play: Not connected or connection error.");
        return;
    }
    this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
    if (this.outputNode.gain.value === 0) {
        this.outputNode.gain.linearRampToValueAtTime(
        1,
        this.audioContext.currentTime + 0.1,
        );
    }
  }

  private stopAudio() {
    if (this.session && (this.playbackState === 'playing' || this.playbackState === 'paused' || this.playbackState === 'loading')) {
        try {
            if (!this.connectionError) {
                 this.session.stop();
            }
        } catch (e) {
            console.error("Error stopping session:", e);
        }
    }
    this.playbackState = 'stopped';
    this.nextStartTime = 0;
    this.firstChunkReceivedTimestamp = 0; // Reset buffering state

    if (this.audioContext.state === 'running') {
        this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
        this.outputNode.gain.linearRampToValueAtTime(
        0,
        this.audioContext.currentTime + 0.1,
        );
    }
  }


  private async handleAddPrompt() {
    if (this.isDropActive) {
        this.toastMessage.show("Cannot add prompt during Drop sequence.");
        return;
    }
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
  }

  private handlePromptRemoved(e: CustomEvent<string>) {
    e.stopPropagation();
    const promptIdToRemove = e.detail;
    if (this.isDropActive && promptIdToRemove === this.temporaryDropPromptId) {
        // If user tries to remove the drop prompt itself, let the drop logic handle it
        // or simply disallow. For now, let's assume drop logic is robust.
        console.log("Attempted to remove active drop prompt. Drop logic will handle it.");
        return;
    }
    if (this.prompts.has(promptIdToRemove)) {
        this.actuallyRemovePrompt(promptIdToRemove);
    } else {
      console.warn(
        `Attempted to remove non-existent prompt ID: ${promptIdToRemove}`,
      );
    }
  }

  private actuallyRemovePrompt(promptIdToRemove: string) {
    const newPrompts = new Map(this.prompts);
    newPrompts.delete(promptIdToRemove);
    this.prompts = newPrompts; 
    
    // If a drop is active and a non-drop prompt is removed, update original weights
    if (this.isDropActive && this.originalPromptWeightsBeforeDrop?.has(promptIdToRemove)) {
        this.originalPromptWeightsBeforeDrop.delete(promptIdToRemove);
    }

    this.setSessionPrompts();
  }


  private handleMidiCcReceived(event: CustomEvent<{ ccNumber: number, value: number }>) {
    if (this.isDropActive) return; // Don't allow MIDI control during drop

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

  private toggleAdvancedSettings() {
    this.showAdvancedSettings = !this.showAdvancedSettings;
  }

  private handleTemperatureChange(e: CustomEvent<number>) {
    if (this.isDropActive) { 
        this.toastMessage.show("Cannot change temperature during Drop sequence.");
        const slider = e.target as ParameterSlider;
        if (slider) slider.value = this.temperature;
        return;
    }
    this.temperature = e.detail;
    this.setGenerationConfiguration();
  }

  private handleGuidanceChange(e: CustomEvent<number>) {
    if (this.isDropActive) { this.toastMessage.show("Settings locked during Drop."); (e.target as ParameterSlider).value = this.guidance; return; }
    this.guidance = e.detail;
    this.setGenerationConfiguration();
  }
  private handleBpmChange(e: CustomEvent<number>) {
    if (this.isDropActive) { this.toastMessage.show("Settings locked during Drop."); (e.target as ParameterSlider).value = this.bpm; return; }
    this.bpm = e.detail;
    this.setGenerationConfiguration();
    // Note: User was informed that BPM changes might need context reset.
    // this.toastMessage.show("BPM changed. Music context may need play/pause to update tempo.");
  }
  private handleDensityChange(e: CustomEvent<number>) {
    if (this.isDropActive) { this.toastMessage.show("Settings locked during Drop."); (e.target as ParameterSlider).value = this.density; return; }
    this.density = e.detail;
    this.setGenerationConfiguration();
  }
  private handleBrightnessChange(e: CustomEvent<number>) {
    if (this.isDropActive) { this.toastMessage.show("Settings locked during Drop."); (e.target as ParameterSlider).value = this.brightness; return; }
    this.brightness = e.detail;
    this.setGenerationConfiguration();
  }
  private handleMuteBassToggle(e: CustomEvent<{checked: boolean}>) {
    if (this.isDropActive) { this.toastMessage.show("Settings locked during Drop."); (e.target as ToggleSwitch).checked = this.muteBass; return; }
    this.muteBass = e.detail.checked;
    this.setGenerationConfiguration();
  }
  private handleMuteDrumsToggle(e: CustomEvent<{checked: boolean}>) {
    if (this.isDropActive) { this.toastMessage.show("Settings locked during Drop."); (e.target as ToggleSwitch).checked = this.muteDrums; return; }
    this.muteDrums = e.detail.checked;
    this.setGenerationConfiguration();
  }
  private handleOnlyBassAndDrumsToggle(e: CustomEvent<{checked: boolean}>) {
    if (this.isDropActive) { this.toastMessage.show("Settings locked during Drop."); (e.target as ToggleSwitch).checked = this.onlyBassAndDrums; return; }
    this.onlyBassAndDrums = e.detail.checked;
    if (this.onlyBassAndDrums) {
        this.muteBass = false;
        this.muteDrums = false;
    }
    this.setGenerationConfiguration();
  }
  private handleMusicGenerationModeChange(e: Event) {
    if (this.isDropActive) { this.toastMessage.show("Settings locked during Drop."); (e.target as HTMLSelectElement).value = this.musicGenerationMode; return; }
    this.musicGenerationMode = (e.target as HTMLSelectElement).value as 'QUALITY' | 'DIVERSITY';
    this.setGenerationConfiguration();
  }


  private toggleHelpPanel() {
    this.showHelpPanel = !this.showHelpPanel;
  }
  
  private async handleDropClick() {
    if (this.isDropActive) {
      this.toastMessage.show("Drop sequence already in progress!");
      return;
    }

    this.isDropActive = true; // Set state FIRST
    this.toastMessage.show("Drop sequence initiated! Brace yourself!");

    // This call ensures the drop-specific systemInstruction is generated and sent
    this.setGenerationConfiguration(); 

    this.originalPromptWeightsBeforeDrop = new Map();
    const newPromptsForDrop = new Map<string, Prompt>();

    this.prompts.forEach((prompt, id) => {
      this.originalPromptWeightsBeforeDrop!.set(id, prompt.weight);
      // Reduce weight of existing prompts significantly during the drop
      newPromptsForDrop.set(id, { ...prompt, weight: 0.05 }); 
    });

    this.temporaryDropPromptId = `drop-prompt-${Date.now()}`;
    const dropPromptText = "Epic buildup, dramatic tension, short silence, then a massive bass drop with explosive energy.";
    newPromptsForDrop.set(this.temporaryDropPromptId, {
      promptId: this.temporaryDropPromptId,
      text: dropPromptText,
      weight: 2.0, // High weight for the drop prompt
      color: TRACK_COLORS[4], // Purple, or another distinct color
    });

    this.prompts = newPromptsForDrop;
    this.setSessionPrompts(); // Send updated prompts for the drop

    this.dropTimeoutId = window.setTimeout(async () => {
      const newPromptsAfterDrop = new Map<string, Prompt>();
      this.originalPromptWeightsBeforeDrop?.forEach((originalWeight, promptId) => {
        const currentPromptState = this.prompts.get(promptId); 
        if (currentPromptState && promptId !== this.temporaryDropPromptId) { 
           newPromptsAfterDrop.set(promptId, { ...currentPromptState, weight: originalWeight });
        }
      });
      
      this.prompts = newPromptsAfterDrop; 
      
      this.isDropActive = false; // Set state FIRST
      
      // This call ensures the systemInstruction reverts to global/normal
      this.setGenerationConfiguration(); 
      
      this.setSessionPrompts(); // Send restored prompts

      this.originalPromptWeightsBeforeDrop = null;
      this.temporaryDropPromptId = null;
      this.dropTimeoutId = null;
      this.toastMessage.show("Drop sequence complete!");
    }, 8000); // 8 seconds for the drop effect
  }


  private _applyConfiguration(configData: Preset, source: 'preset' | 'share-link') {
    if (this.isDropActive) {
        this.toastMessage.show(`Cannot load ${source} during Drop sequence.`);
        return;
    }
    
    if (
        typeof configData.version !== 'string' || // Looser version check for now
        !Array.isArray(configData.prompts) ||
        typeof configData.temperature !== 'number' ||
        !configData.prompts.every(p => typeof p.text === 'string' && typeof p.weight === 'number')
    ) {
        throw new Error('Invalid configuration data structure.');
    }
    
    this.stopAudio(); 
    this.prompts.clear();
    this.nextPromptId = 0;
    this.filteredPrompts.clear();

    const newPromptsMap = new Map<string, Prompt>();
    configData.prompts.forEach((p) => { 
        const newPromptId = `prompt-${this.nextPromptId}`;
        const newColor = TRACK_COLORS[this.nextPromptId % TRACK_COLORS.length];
        this.nextPromptId++;
        newPromptsMap.set(newPromptId, {
        promptId: newPromptId,
        text: p.text,
        weight: p.weight,
        color: newColor,
        });
    });
    this.prompts = newPromptsMap;
    this.temperature = configData.temperature;

    // Apply new settings if present, otherwise use defaults
    this.guidance = configData.guidance ?? 4.0;
    this.bpm = configData.bpm ?? 120;
    this.density = configData.density ?? 0.5;
    this.brightness = configData.brightness ?? 0.5;
    this.muteBass = configData.muteBass ?? false;
    this.muteDrums = configData.muteDrums ?? false;
    this.onlyBassAndDrums = configData.onlyBassAndDrums ?? false;
    this.musicGenerationMode = configData.musicGenerationMode ?? 'QUALITY';

    // Ensure consistency if onlyBassAndDrums is true
    if (this.onlyBassAndDrums) {
        this.muteBass = false;
        this.muteDrums = false;
    }

    this.setGenerationConfiguration(); 
    this.setSessionPrompts();          
    
    this.requestUpdate(); 
    
    if (source === 'preset') {
        this.toastMessage.show('Preset loaded successfully!');
    } else if (source === 'share-link') {
        this.toastMessage.show('Shared configuration loaded!');
    }
  }


  private handleSavePreset() {
    if (this.isDropActive) {
        this.toastMessage.show("Cannot save preset during Drop sequence.");
        return;
    }
    const presetPrompts: PresetPrompt[] = Array.from(this.prompts.values()).map(p => ({
      text: p.text,
      weight: p.weight,
    }));

    const presetData: Preset = {
      version: CURRENT_PRESET_VERSION,
      prompts: presetPrompts,
      temperature: this.temperature,
      guidance: this.guidance,
      bpm: this.bpm,
      density: this.density,
      brightness: this.brightness,
      muteBass: this.muteBass,
      muteDrums: this.muteDrums,
      onlyBassAndDrums: this.onlyBassAndDrums,
      musicGenerationMode: this.musicGenerationMode,
    };

    const jsonString = JSON.stringify(presetData, null, 2);
    const blob = new Blob([jsonString], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'steppas_beatlab_preset_v1.1.json'; 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toastMessage.show('Preset saved!');
  }

  private handleLoadPresetClick() {
    if (this.isDropActive) {
        this.toastMessage.show("Cannot load preset during Drop sequence.");
        return;
    }
    if (this.fileInputForPreset) {
      this.fileInputForPreset.click();
    }
  }

  private handlePresetFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }
    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsedPreset = JSON.parse(reader.result as string) as Preset;
        this._applyConfiguration(parsedPreset, 'preset');
      } catch (e: any) {
        console.error('Error loading preset:', e);
        this.toastMessage.show(`Error loading preset: ${e.message || 'Invalid file format.'}`);
      } finally {
        input.value = '';
      }
    };
    reader.onerror = () => {
      this.toastMessage.show('Error reading preset file.');
       input.value = '';
    };
    reader.readAsText(file);
  }

  private async _loadStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const encodedSharedStateBase64 = params.get('share');

    if (encodedSharedStateBase64) {
        try {
            const sharedStateBase64 = decodeURIComponent(encodedSharedStateBase64);
            const jsonString = atob(sharedStateBase64);
            const parsedConfig = JSON.parse(jsonString) as Preset;
            this._applyConfiguration(parsedConfig, 'share-link');
            history.replaceState(null, '', window.location.pathname);
        } catch (e: any) {
            console.error('Error loading shared state from URL:', e);
            this.toastMessage.show(`Failed to load shared state: ${e.message || 'Invalid link'}`);
            history.replaceState(null, '', window.location.pathname);
        }
    }
  }

  private async handleShareClick() {
    if (this.isDropActive) {
        this.toastMessage.show("Cannot share configuration during Drop sequence.");
        return;
    }
    const currentPrompts: PresetPrompt[] = Array.from(this.prompts.values()).map(p => ({
      text: p.text,
      weight: p.weight,
    }));

    const shareableState: Preset = {
      version: CURRENT_PRESET_VERSION,
      prompts: currentPrompts,
      temperature: this.temperature,
      guidance: this.guidance,
      bpm: this.bpm,
      density: this.density,
      brightness: this.brightness,
      muteBass: this.muteBass,
      muteDrums: this.muteDrums,
      onlyBassAndDrums: this.onlyBassAndDrums,
      musicGenerationMode: this.musicGenerationMode,
    };

    try {
      const jsonString = JSON.stringify(shareableState);
      const base64State = btoa(jsonString);
      const encodedBase64State = encodeURIComponent(base64State);
      
      const baseUrl = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") 
          ? window.location.origin + window.location.pathname
          : 'https://steppas-beatlab.onrender.com/'; 

      const shareUrl = `${baseUrl}?share=${encodedBase64State}`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        this.toastMessage.show('Share link copied to clipboard!');
      } else {
        this.toastMessage.show('Could not copy link. Please copy manually.');
        console.warn('Share URL (copy manually):', shareUrl);
      }
    } catch (e: any) {
      console.error('Error creating share link:', e);
      this.toastMessage.show('Error creating share link.');
    }
  }


  override render() {
    const showSelectPlaceholder = this.isMidiSupported && this.midiAccessGranted && this.availableMidiInputs.length > 0 && !this.availableMidiInputs.some(input => input.id === this.selectedMidiInputId);

    let midiSelectorOptions;
    if (!this.isMidiSupported) {
        midiSelectorOptions = html`<option value="" disabled selected>MIDI nicht unterstützt</option>`;
    } else if (this.isRequestingMidiAccess) {
        midiSelectorOptions = html`<option value="" disabled selected>Suche MIDI-Geräte...</option>`;
    } else if (!this.midiAccessAttempted) {
        midiSelectorOptions = html`<option value="" disabled selected>Klicken, um MIDI-Geräte zu suchen</option>`;
    } else if (!this.midiAccessGranted) {
        midiSelectorOptions = html`<option value="" disabled selected>MIDI-Zugriff verweigert. Erneut versuchen?</option>`;
    } else if (this.availableMidiInputs.length === 0) {
        midiSelectorOptions = html`<option value="" disabled selected>Keine MIDI-Geräte gefunden</option>`;
    } else {
        midiSelectorOptions = html`
            ${showSelectPlaceholder ? html`<option value="" disabled selected hidden>MIDI-Gerät auswählen</option>` : ''}
            ${this.availableMidiInputs.map(input =>
                html`<option .value=${input.id} ?selected=${input.id === this.selectedMidiInputId}>${input.name}</option>`
            )}
        `;
    }

    return html`
      <div class="background-orbs-container">
        <div class="orb orb1"></div>
        <div class="orb orb2"></div>
        <div class="orb orb3"></div>
        <div class="orb orb4"></div>
      </div>
      <div class="header-bar">
        <div class="header-left-controls">
            <select
            class="midi-selector"
            @mousedown=${this.handleMidiSelectorInteraction}
            @change=${this.handleMidiDeviceChange}
            .value=${this.selectedMidiInputId || ''}
            ?disabled=${!this.isMidiSupported || this.isRequestingMidiAccess || this.isDropActive }
            aria-label="Select MIDI Input Device">
            ${midiSelectorOptions}
            </select>
        </div>
        <div class="header-actions">
          <settings-button @click=${this.toggleAdvancedSettings} aria-label="Toggle advanced settings"></settings-button>
        </div>
      </div>
      <div class="advanced-settings-panel ${classMap({visible: this.showAdvancedSettings})}">
        <div class="settings-grid">
            <parameter-slider
                label="Temperature"
                .value=${this.temperature}
                min="0" max="2" step="0.1"
                @input=${this.handleTemperatureChange}
                ?disabled=${this.isDropActive}>
            </parameter-slider>
            <parameter-slider
                label="Guidance"
                .value=${this.guidance}
                min="0" max="6" step="0.1"
                @input=${this.handleGuidanceChange}
                ?disabled=${this.isDropActive}>
            </parameter-slider>
            <parameter-slider
                label="BPM"
                .value=${this.bpm}
                min="60" max="200" step="1"
                @input=${this.handleBpmChange}
                ?disabled=${this.isDropActive}>
            </parameter-slider>
            <parameter-slider
                label="Density"
                .value=${this.density}
                min="0" max="1" step="0.01"
                @input=${this.handleDensityChange}
                ?disabled=${this.isDropActive}>
            </parameter-slider>
            <parameter-slider
                label="Brightness"
                .value=${this.brightness}
                min="0" max="1" step="0.01"
                @input=${this.handleBrightnessChange}
                ?disabled=${this.isDropActive}>
            </parameter-slider>
             <div class="settings-grid-item">
                <label for="music-gen-mode">Music Generation Mode</label>
                <select 
                    id="music-gen-mode"
                    class="styled-select"
                    .value=${this.musicGenerationMode}
                    @change=${this.handleMusicGenerationModeChange}
                    ?disabled=${this.isDropActive}>
                    <option value="QUALITY">Quality</option>
                    <option value="DIVERSITY">Diversity</option>
                </select>
            </div>
            <toggle-switch 
                label="Mute Bass" 
                .checked=${this.muteBass}
                ?disabled=${this.isDropActive || this.onlyBassAndDrums}
                @change=${this.handleMuteBassToggle}>
            </toggle-switch>
            <toggle-switch
                label="Mute Drums"
                .checked=${this.muteDrums}
                ?disabled=${this.isDropActive || this.onlyBassAndDrums}
                @change=${this.handleMuteDrumsToggle}>
            </toggle-switch>
            <toggle-switch
                label="Only Bass & Drums"
                .checked=${this.onlyBassAndDrums}
                ?disabled=${this.isDropActive}
                @change=${this.handleOnlyBassAndDrumsToggle}>
            </toggle-switch>
        </div>
        <a class="hide-settings-link" @click=${this.toggleAdvancedSettings}>Hide Advanced Settings</a>
      </div>
      <div class="content-area">
        <div id="prompts-container" @prompt-removed=${this.handlePromptRemoved}>
          ${this.renderPrompts()}
          <add-prompt-button 
            class="floating-add-button"
            @click=${this.handleAddPrompt} 
            aria-label="Add new prompt track">
          </add-prompt-button>
        </div>
      </div>
      <toast-message .message=${this.toastMessage?.message || ''} .showing=${this.toastMessage?.showing || false}></toast-message>
      
      <div class="bottom-left-utility-cluster">
        <play-pause-button
            @click=${this.handlePlayPause}
            .playbackState=${this.playbackState}
            aria-label=${this.playbackState === 'playing' ? 'Pause audio' : 'Play audio'}
          ></play-pause-button>
      </div>

      <div class="utility-button-cluster">
        <drop-button @click=${this.handleDropClick} aria-label="Trigger Drop Effect"></drop-button>
        <share-button @click=${this.handleShareClick} aria-label="Share current configuration via link"></share-button>
        <help-button @click=${this.toggleHelpPanel} aria-label="Open help guide"></help-button>
      </div>
      
      <help-guide-panel .isOpen=${this.showHelpPanel} @close-help=${this.toggleHelpPanel}></help-guide-panel>
      
      <input type="file" id="presetFileInput" accept=".json" style="display: none;" @change=${this.handlePresetFileSelected}>
      `;
  }

  private renderPrompts() {
    return [...this.prompts.values()].map((prompt) => {
      return html`<prompt-controller
        .promptId=${prompt.promptId}
        ?filtered=${this.filteredPrompts.has(prompt.text)}
        .text=${prompt.text}
        .weight=${prompt.weight}
        .sliderColor=${prompt.color}
        ?disabled=${this.isDropActive && prompt.promptId !== this.temporaryDropPromptId}
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
    'settings-button': SettingsButton;
    'play-pause-button': PlayPauseButton;
    'help-button': HelpButton;
    'share-button': ShareButton;
    'save-preset-button': SavePresetButton;
    'load-preset-button': LoadPresetButton;
    'weight-slider': WeightSlider;
    'parameter-slider': ParameterSlider;
    'toggle-switch': ToggleSwitch;
    'toast-message': ToastMessage;
    'help-guide-panel': HelpGuidePanel;
    'drop-button': DropButton; 
  }

  interface MidiInputInfo {
    id: string;
    name: string;
  }

  interface HTMLElementEventMap {
    'midi-cc-received': CustomEvent<{ ccNumber: number, value: number }>;
    'midi-inputs-changed': CustomEvent<{ inputs: MidiInputInfo[] }>;
    'close-help': CustomEvent<void>;
    'input': CustomEvent<number>; // For parameter-slider
    'change': CustomEvent<{checked: boolean}>; // For toggle-switch
  }
}