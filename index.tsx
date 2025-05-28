
/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { css, html, LitElement, svg, CSSResultGroup } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { classMap } from 'lit/directives/class-map.js';

// Fix: Changed import from GoogleGenerativeAI to GoogleGenAI
// Fix: Removed unused FilteredPrompt import
import { GoogleGenAI, type LiveMusicSession, type LiveMusicServerMessage } from '@google/genai';
import { decode, decodeAudioData } from './utils.js' // <-- MODIFIED HERE

// NOTE: This import path is an example. Update to your actual API key import method.
// Ensure process.env.GEMINI_API_KEY is available in your environment.
// Fix: Use process.env.API_KEY instead of process.env.GEMINI_API_KEY and remove apiVersion
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
const model = 'lyria-realtime-exp';


interface Prompt {
  readonly promptId: string;
  text: string;
  weight: number;
  cc: number;
  color: string;
}

interface PresetItem {
  name: string;
  prompts: Prompt[];
}

interface ControlChange {
  channel: number;
  cc: number;
  value: number;
}

type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused';
type EffectTypeName = 'filter' | 'glitch' | 'beatgrid';


/**
 * Throttles a callback to be called at most once per `delay` milliseconds.
 * Also returns the result of the last "fresh" call...
 */
function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => ReturnType<T> {
  let lastCall = -Infinity;
  let lastResult: ReturnType<T>;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    if (timeSinceLastCall >= delay) {
      lastResult = func(...args);
      lastCall = now;
    }
    return lastResult;
  };
}

const DEFAULT_PROMPTS_CONFIG = [
  { color: '#9900ff', text: 'psytrance' },
  { color: '#5200ff', text: 'psychedelic vocals' },
  { color: '#ff25f6', text: 'thrash' },
  { color: '#2af6de', text: 'wobble bass' },
  { color: '#ffdd28', text: 'Tek House' },
  { color: '#2af6de', text: 'West coast hip hop' },
  { color: '#9900ff', text: 'electro house' },
  { color: '#3dffab', text: 'Lush Strings' },
  { color: '#d8ff3e', text: 'Sparkling Arpeggios' },
  { color: '#d9b2ff', text: 'Staccato Rhythms' },
  { color: '#3dffab', text: 'Punchy Kick' },
  { color: '#ffdd28', text: 'Dubstep' },
  { color: '#ff25f6', text: 'K Pop' },
  { color: '#d8ff3e', text: 'Neo Soul' },
  { color: '#5200ff', text: 'solo piano' },
  { color: '#d9b2ff', text: 'solo cello' },
];

const PREDEFINED_PROMPTS_TEMPLATES = {
  deepResonantBass: { text: 'Deep Resonant Bass', color: '#4A0D66' },
  glitchySynths: { text: 'Glitchy Synths', color: '#FF6F00' },
  warmPads: { text: 'Warm Pads', color: '#FFB347' },
  gentlePercussion: { text: 'Gentle Percussion', color: '#A0D2DB' },
  hypnoticSequence: { text: 'Hypnotic Sequence', color: '#7D3C98' },
  metallicHiHats: { text: 'Metallic Hi-Hats', color: '#BDC3C7' },
  etherealVocals: { text: 'Ethereal Vocals', color: '#FADBD8' },
  cosmicEchoes: { text: 'Cosmic Echoes', color: '#A9CCE3' },
  industrialGrind: { text: 'Industrial Grind', color: '#78909C' },
  funkyBassline: { text: 'Funky Bassline', color: '#F7DC6F' },
};


function createBasePresetPrompts(): Prompt[] {
  return DEFAULT_PROMPTS_CONFIG.map((p, i) => ({
    promptId: `prompt-${i}`,
    text: p.text,
    weight: 0,
    cc: i,
    color: p.color,
  }));
}

const PREDEFINED_PRESETS: PresetItem[] = [
  {
    name: "Cosmic Chill",
    prompts: (() => {
      const prompts = createBasePresetPrompts();
      // Adjust indices if DEFAULT_PROMPTS_CONFIG length changed or specific items shifted
      // Assuming Lush Strings is at index 7, Sparkling Arpeggios at 8, Chillwave (or similar) at 1
      prompts[7] = { ...prompts[7], text: DEFAULT_PROMPTS_CONFIG[7].text, weight: 1.5 };
      prompts[8] = { ...prompts[8], text: DEFAULT_PROMPTS_CONFIG[8].text, weight: 1.0 };
      prompts[1] = { ...prompts[1], text: 'psychedelic vocals', weight: 0.8 }; // Example: psychedelic vocals as part of chill
      prompts[0] = { ...prompts[0], ...PREDEFINED_PROMPTS_TEMPLATES.deepResonantBass, weight: 0.5 };
      return prompts;
    })(),
  },
  {
    name: "Cyberpunk Drive",
    prompts: (() => {
      const prompts = createBasePresetPrompts();
      // Assuming thrash is at index 2, wobble bass at 3, Staccato Rhythms at 9
      prompts[2] = { ...prompts[2], text: DEFAULT_PROMPTS_CONFIG[2].text, weight: 1.6 }; // thrash
      prompts[3] = { ...prompts[3], text: DEFAULT_PROMPTS_CONFIG[3].text, weight: 1.2 }; // wobble bass
      prompts[9] = { ...prompts[9], text: DEFAULT_PROMPTS_CONFIG[9].text, weight: 1.0 }; // Staccato Rhythms
      prompts[4] = { ...prompts[4], ...PREDEFINED_PROMPTS_TEMPLATES.glitchySynths, weight: 0.9 }; // Tek House with glitchy synths
      return prompts;
    })(),
  },
  {
    name: "Sunset Bossa", // This preset might need re-theming or removal if Bossa Nova is not in default
    prompts: (() => {
      const prompts = createBasePresetPrompts();
      // Example: Using 'solo piano' for a Bossa Nova feel
      prompts[14] = { ...prompts[14], text: DEFAULT_PROMPTS_CONFIG[14].text, weight: 1.5 }; // solo piano
      prompts[13] = { ...prompts[13], text: DEFAULT_PROMPTS_CONFIG[13].text, weight: 1.0 }; // Neo Soul
      prompts[5] = { ...prompts[5], ...PREDEFINED_PROMPTS_TEMPLATES.warmPads, weight: 0.8 }; // West coast hip hop (as a base) + warm pads
      prompts[6] = { ...prompts[6], ...PREDEFINED_PROMPTS_TEMPLATES.gentlePercussion, weight: 0.6 }; // electro house (as a base) + gentle percussion
      return prompts;
    })(),
  },
    {
    name: "Industrial Echoes",
    prompts: (() => {
      const prompts = createBasePresetPrompts();
      // Assuming Punchy Kick is at 10, Dubstep at 11 (or use industrial grind), K Pop at 12
      prompts[10] = { ...prompts[10], text: DEFAULT_PROMPTS_CONFIG[10].text, weight: 1.7 }; // Punchy Kick
      prompts[11] = { ...prompts[11], ...PREDEFINED_PROMPTS_TEMPLATES.industrialGrind, weight: 1.3 }; // Dubstep + industrial grind
      // Using 'solo cello' (index 15) for cosmic echoes, and 'K Pop' (index 12) for metallic hi-hats as an example adjustment
      prompts[15] = { ...prompts[15], ...PREDEFINED_PROMPTS_TEMPLATES.cosmicEchoes, weight: 0.9 };
      prompts[12] = { ...prompts[12], ...PREDEFINED_PROMPTS_TEMPLATES.metallicHiHats, weight: 1.1 };
      return prompts;
    })(),
  },
];

const MIDI_CONTROL_SETTINGS_KEY = 'midiControlSettings_v4'; // Incremented version
const DEFAULT_PLAY_PAUSE_CC = 16;
const DEFAULT_DROP_CC = 17;
const DEFAULT_FILTER_CC = 18; 
const DEFAULT_GLITCH_CC = 19;
const DEFAULT_BEATGRID_CC = 20; 
const DEFAULT_TRANSITION_CC = 21; // New CC for Transition

const BUILD_UP_DURATION = 3000; // ms
const DROP_SILENCE_DURATION = 750; // ms
const DROP_IMPACT_DURATION = 1500; // ms
const DROP_TOTAL_INTERNAL_DURATION = DROP_SILENCE_DURATION + DROP_IMPACT_DURATION;


// Toast Message component
// -----------------------------------------------------------------------------

@customElement('toast-message')
class ToastMessage extends LitElement {
  static override styles = css`
    .toast {
      line-height: 1.6;
      position: fixed;
      top: 20px;
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
      z-index: 1000;
    }
    button {
      border-radius: 100px;
      aspect-ratio: 1;
      border: none;
      color: #000;
      cursor: pointer;
    }
    .toast:not(.showing) {
      transition-duration: 1s;
      transform: translate(-50%, -200%);
    }
  `;

  @property({ type: String }) message = '';
  @property({ type: Boolean }) showing = false;

  override render() {
    return html`<div class=${classMap({ showing: this.showing, toast: true })}>
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


// WeightKnob component
// -----------------------------------------------------------------------------

/** Maps prompt weight to halo size. */
const MIN_HALO_SCALE = 1;
const MAX_HALO_SCALE = 2;

/** The amount of scale to add to the halo based on audio level. */
const HALO_LEVEL_MODIFIER = 1;

/** A knob for adjusting and visualizing prompt weight. */
@customElement('weight-knob')
class WeightKnob extends LitElement {
  static override styles = css`
    :host {
      cursor: grab;
      position: relative;
      width: 100%;
      aspect-ratio: 1;
      flex-shrink: 0;
      touch-action: none;
    }
    svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    #halo {
      position: absolute;
      z-index: -1;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      mix-blend-mode: lighten;
      transform: scale(2);
      will-change: transform;
    }
  `;

  @property({ type: Number }) value = 0;
  @property({ type: String }) color = '#000';
  @property({ type: Number }) audioLevel = 0;

  private dragStartPos = 0;
  private dragStartValue = 0;

  constructor() {
    super();
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  private handlePointerDown(e: PointerEvent) {
    this.dragStartPos = e.clientY;
    this.dragStartValue = this.value;
    document.body.classList.add('dragging');
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  private handlePointerMove(e: PointerEvent) {
    const delta = this.dragStartPos - e.clientY;
    this.value = this.dragStartValue + delta * 0.01;
    this.value = Math.max(0, Math.min(2, this.value));
    this.dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
  }

  private handlePointerUp(e: PointerEvent) {
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    document.body.classList.remove('dragging');
  }

  private handleWheel(e: WheelEvent) {
    const delta = e.deltaY;
    this.value = this.value + delta * -0.0025;
    this.value = Math.max(0, Math.min(2, this.value));
    this.dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
  }

  private describeArc(
    centerX: number,
    centerY: number,
    startAngle: number,
    endAngle: number,
    radius: number,
  ): string {
    const startX = centerX + radius * Math.cos(startAngle);
    const startY = centerY + radius * Math.sin(startAngle);
    const endX = centerX + radius * Math.cos(endAngle);
    const endY = centerY + radius * Math.sin(endAngle);

    const largeArcFlag = endAngle - startAngle <= Math.PI ? '0' : '1';

    return (
      `M ${startX} ${startY}` +
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`
    );
  }

  override render() {
    const rotationRange = Math.PI * 2 * 0.75;
    const minRot = -rotationRange / 2 - Math.PI / 2;
    const maxRot = rotationRange / 2 - Math.PI / 2;
    const rot = minRot + (this.value / 2) * (maxRot - minRot);
    const dotStyle = styleMap({
      transform: `translate(40px, 40px) rotate(${rot}rad)`,
    });

    let scale = (this.value / 2) * (MAX_HALO_SCALE - MIN_HALO_SCALE);
    scale += MIN_HALO_SCALE;
    scale += this.audioLevel * HALO_LEVEL_MODIFIER;

    const haloStyle = styleMap({
      display: this.value > 0 ? 'block' : 'none',
      background: this.color,
      transform: `scale(${scale})`,
    });

    return html`
      <div id="halo" style=${haloStyle}></div>
      <!-- Static SVG elements -->
      <svg viewBox="0 0 80 80">
        <ellipse
          opacity="0.4"
          cx="40"
          cy="40"
          rx="40"
          ry="40"
          fill="url(#f1)" />
        <g filter="url(#f2)">
          <ellipse cx="40" cy="40" rx="29" ry="29" fill="url(#f3)" />
        </g>
        <g filter="url(#f4)">
          <circle cx="40" cy="40" r="20.6667" fill="url(#f5)" />
        </g>
        <circle cx="40" cy="40" r="18" fill="url(#f6)" />
        <defs>
          <filter
            id="f2"
            x="8.33301"
            y="10.0488"
            width="63.333"
            height="64"
            filterUnits="userSpaceOnUse"
            color-interpolation-filters="sRGB">
            <feFlood flood-opacity="0" result="BackgroundImageFix" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha" />
            <feOffset dy="2" />
            <feGaussianBlur stdDeviation="1.5" />
            <feComposite in2="hardAlpha" operator="out" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
            <feBlend mode="normal" in2="BackgroundImageFix" result="shadow1" />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="shadow1"
              result="shape" />
          </filter>
          <filter
            id="f4"
            x="11.333"
            y="19.0488"
            width="57.333"
            height="59.334"
            filterUnits="userSpaceOnUse"
            color-interpolation-filters="sRGB">
            <feFlood flood-opacity="0" result="BackgroundImageFix" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha" />
            <feOffset dy="10" />
            <feGaussianBlur stdDeviation="4" />
            <feComposite in2="hardAlpha" operator="out" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
            <feBlend mode="normal" in2="BackgroundImageFix" result="shadow1" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha" />
            <feMorphology
              radius="5"
              operator="erode"
              in="SourceAlpha"
              result="shadow2" />
            <feOffset dy="8" />
            <feGaussianBlur stdDeviation="3" />
            <feComposite in2="hardAlpha" operator="out" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
            <feBlend mode="normal" in2="shadow1" result="shadow2" />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="shadow2"
              result="shape" />
          </filter>
          <linearGradient
            id="f1"
            x1="40"
            y1="0"
            x2="40"
            y2="80"
            gradientUnits="userSpaceOnUse">
            <stop stop-opacity="0.5" />
            <stop offset="1" stop-color="white" stop-opacity="0.3" />
          </linearGradient>
          <radialGradient
            id="f3"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(40 40) rotate(90) scale(29 29)">
            <stop offset="0.6" stop-color="white" />
            <stop offset="1" stop-color="white" stop-opacity="0.7" />
          </radialGradient>
          <linearGradient
            id="f5"
            x1="40"
            y1="19.0488"
            x2="40"
            y2="60.3822"
            gradientUnits="userSpaceOnUse">
            <stop stop-color="white" />
            <stop offset="1" stop-color="#F2F2F2" />
          </linearGradient>
          <linearGradient
            id="f6"
            x1="40"
            y1="21.7148"
            x2="40"
            y2="57.7148"
            gradientUnits="userSpaceOnUse">
            <stop stop-color="#EBEBEB" />
            <stop offset="1" stop-color="white" />
          </linearGradient>
        </defs>
      </svg>
      <!-- SVG elements that move, separated to limit redraws -->
      <svg
        viewBox="0 0 80 80"
        @pointerdown=${this.handlePointerDown}
        @wheel=${this.handleWheel}>
        <g style=${dotStyle}>
          <circle cx="14" cy="0" r="2" fill="#000" />
        </g>
        <path
          d=${this.describeArc(40, 40, minRot, maxRot, 34.5)}
          fill="none"
          stroke="#0003"
          stroke-width="3"
          stroke-linecap="round" />
        <path
          d=${this.describeArc(40, 40, minRot, rot, 34.5)}
          fill="none"
          stroke="#fff"
          stroke-width="3"
          stroke-linecap="round" />
      </svg>
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
      pointer-events: none; /* Host itself doesn't handle pointer events */
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
      pointer-events: all; /* Hitbox handles pointer events */
      position: absolute;
      width: 65%; /* Original value, may need adjustment for smaller buttons */
      aspect-ratio: 1;
      top: 9%; /* Original value */
      border-radius: 50%;
      cursor: pointer;
    }
  ` as CSSResultGroup;

  // Method to be implemented by subclasses to provide the specific icon SVG
  protected renderIcon() {
    return svg``; // Default empty icon
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

// PlayPauseButton
// -----------------------------------------------------------------------------

/** A button for toggling play/pause. */
@customElement('play-pause-button')
export class PlayPauseButton extends IconButton {
  @property({ type: String }) playbackState: PlaybackState = 'stopped';
  @property({ type: Boolean }) disabled = false; // Added disabled property

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
        from { transform: rotate(0deg); }
        to { transform: rotate(359deg); }
      }
      :host([disabled]) .hitbox {
        cursor: not-allowed;
        pointer-events: none;
      }
      :host([disabled]) svg {
        opacity: 0.5;
      }
    `
  ] as CSSResultGroup;

  override render() {
    this.toggleAttribute('disabled', this.disabled); // Reflect disabled state for styling
    return super.render();
  }


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

// DropButton component
// -----------------------------------------------------------------------------
@customElement('drop-button')
class DropButton extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    button {
      font-family: 'Google Sans', sans-serif;
      font-weight: bold;
      text-transform: uppercase;
      font-size: 3.5vmin; /* Will be overridden by specific styles in controls-bar */
      width: 20vmin; /* Will be overridden */
      height: 10vmin; /* Will be overridden */
      max-width: 180px;
      max-height: 90px;
      border-radius: 15px;
      border: 3px solid #111;
      color: white;
      background: linear-gradient(145deg, #ff7e5f, #feb47b); /* Softer orange/yellow */
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      box-shadow: 0 5px 15px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
      -webkit-font-smoothing: antialiased;
    }
    button:hover:not(:disabled) {
      transform: scale(1.05);
      box-shadow: 0 8px 25px rgba(254, 180, 123, 0.5);
    }
    button:active:not(:disabled) {
      transform: scale(0.95);
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }
    button:disabled {
      background: linear-gradient(145deg, #777, #999);
      color: #ccc;
      cursor: not-allowed;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      transform: scale(1); /* Reset transform for disabled state */
    }
  `;

  @property({ type: Boolean, reflect: true }) disabled = false;

  private handleClick() {
    if (!this.disabled) {
      this.dispatchEvent(new CustomEvent('drop-requested', { bubbles: true, composed: true }));
    }
  }

  override render() {
    return html`
      <button @click=${this.handleClick} ?disabled=${this.disabled} aria-label="Musik-Drop auslösen">
        DROP!
      </button>
    `;
  }
}


/** Simple class for dispatching MIDI CC messages as events. */
class MidiDispatcher extends EventTarget {
  private access: MIDIAccess | null = null;
  activeMidiInputId: string | null = null;

  async getMidiAccess(): Promise<string[]> {
    if (this.access) {
      // If access is already granted, ensure inputs are fresh
      const currentInputs = Array.from(this.access.inputs.values());
      currentInputs.forEach(input => this.listenToInput(input)); // Re-attach listeners to existing inputs
      return Array.from(this.access.inputs.keys());
    }

    try {
      // Request MIDI access.
      // `sysex: true` is required for some devices like the Novation Launch Control XL,
      // even if you don't intend to send or receive SysEx messages.
      // However, it might trigger more permissive security warnings for the user.
      // Setting to `false` if not strictly needed.
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (error) {
      console.warn('MIDI access not supported or denied.', error);
      this.access = null; // Ensure access is null on error
      return [];
    }

    if (!(this.access instanceof MIDIAccess)) {
      console.warn('MIDI access not supported.');
      this.access = null;
      return [];
    }

    const inputIds = Array.from(this.access.inputs.keys());

    if (inputIds.length > 0 && this.activeMidiInputId === null) {
      this.activeMidiInputId = inputIds[0];
    }

    for (const input of this.access.inputs.values()) {
      this.listenToInput(input);
    }

    this.access.onstatechange = (event: MIDIConnectionEvent) => {
      if (!event.port) return; // Add null check for event.port
        console.log('MIDI state change:', event.port.name, event.port.state);
        if (event.port.type === 'input') {
            if (event.port.state === 'connected') {
                this.listenToInput(event.port as MIDIInput);
            } else if (event.port.state === 'disconnected') {
                // Remove listener if necessary, though onmidimessage = null is typical
                (event.port as MIDIInput).onmidimessage = null;
                if (this.activeMidiInputId === event.port.id) {
                    this.activeMidiInputId = null; // Or switch to another if available
                }
            }
        }
        // Re-initialize or update input list
        this.dispatchEvent(new CustomEvent('midistatechange'));
    };

    return inputIds;
  }

  private listenToInput(input: MIDIInput) {
      // Remove any existing listener before adding a new one
      input.onmidimessage = null;
      input.onmidimessage = (event: MIDIMessageEvent) => {
        if (input.id !== this.activeMidiInputId && this.activeMidiInputId !== null) return; // Allow if activeMidiInputId is null (listen to all)

        const { data } = event;
        if (!data) {
          console.error('MIDI message has no data');
          return;
        }

        const statusByte = data[0];
        const channel = statusByte & 0x0f;
        const messageType = statusByte & 0xf0;

        const isControlChange = messageType === 0xb0;
        if (!isControlChange) return;
        if (data.length < 3) return; // CC messages have 3 bytes

        const detail: ControlChange = { cc: data[1], value: data[2], channel };
        this.dispatchEvent(
          new CustomEvent<ControlChange>('cc-message', { detail }),
        );
      };
  }


  getDeviceName(id: string): string | null {
    if (!this.access) {
      return null;
    }
    const input = this.access.inputs.get(id);
    return input ? input.name : null;
  }
}

/** Simple class for getting the current level from our audio element. */
class AudioAnalyser {
  readonly node: AnalyserNode;
  private readonly freqData: Uint8Array;
  constructor(context: AudioContext) {
    this.node = context.createAnalyser();
    this.node.smoothingTimeConstant = 0;
    this.freqData = new Uint8Array(this.node.frequencyBinCount);
  }
  getCurrentLevel() {
    this.node.getByteFrequencyData(this.freqData);
    const avg = this.freqData.reduce((a, b) => a + b, 0) / this.freqData.length;
    return avg / 0xff;
  }
}

/** A single prompt input associated with a MIDI CC. */
@customElement('prompt-controller')
class PromptController extends LitElement {
  static override styles = css`
    .prompt {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    weight-knob {
      width: 70%;
      flex-shrink: 0;
    }
    #midi {
      font-family: monospace;
      text-align: center;
      font-size: 1.5vmin;
      border: 0.2vmin solid #fff;
      border-radius: 0.5vmin;
      padding: 2px 5px;
      color: #fff;
      background: #0006;
      cursor: pointer;
      visibility: hidden;
      user-select: none;
      margin-top: 0.75vmin;
      .learn-mode & {
        color: orange;
        border-color: orange;
      }
      .show-cc & {
        visibility: visible;
      }
    }
    #text {
      font-family: 'Google Sans', sans-serif;
      font-weight: 500;
      font-size: 1.8vmin;
      max-width: 100%;
      min-width: 2vmin;
      padding: 0.1em 0.3em;
      margin-top: 0.5vmin;
      flex-shrink: 0;
      border-radius: 0.25vmin;
      text-align: center;
      white-space: wrap;
      word-break: break-word;
      overflow: hidden;
      border: none;
      outline: none;
      -webkit-font-smoothing: antialiased;
      background: #000;
      color: #fff;
      &:not(:focus) {
        text-overflow: ellipsis;
      }
    }
    :host([filtered=true]) #text {
      background: #da2000;
    }
    @media only screen and (max-width: 600px) {
      #text {
        font-size: 2.3vmin;
      }
      weight-knob {
        width: 60%;
      }
    }
  `;

  @property({ type: String }) promptId = '';
  @property({ type: String }) text = '';
  @property({ type: Number }) weight = 0;
  @property({ type: String }) color = '';

  @property({ type: Number }) cc = 0;
  @property({ type: Number }) channel = 0; // Not currently used

  @property({ type: Boolean }) learnMode = false;
  @property({ type: Boolean }) showCC = false;

  @query('weight-knob') private weightInput!: WeightKnob;
  @query('#text') private textInput!: HTMLInputElement;

  @property({ type: Object })
  midiDispatcher: MidiDispatcher | null = null;

  @property({ type: Number }) audioLevel = 0;

  private lastValidText!: string;
  private ccListener: ((e: Event) => void) | null = null;


  override connectedCallback() {
    super.connectedCallback();
    if (this.midiDispatcher) {
      this.ccListener = (e: Event) => {
        const customEvent = e as CustomEvent<ControlChange>;
        const { channel, cc, value } = customEvent.detail;
        // Only react if this specific controller is in learn mode or the CC matches
        if (this.learnMode) {
          this.cc = cc;
          this.channel = channel; // Store channel if needed in future
          this.learnMode = false; // Automatically exit learn mode for this controller
          this.dispatchPromptChange(); // Make sure new CC is saved
          this.dispatchEvent(new CustomEvent('learn-mode-toggled', { detail: { active: this.learnMode, controllerId: this.promptId }, bubbles: true, composed: true }));
          this.requestUpdate(); // Ensure UI reflects the change
        } else if (cc === this.cc) {
          this.weight = (value / 127) * 2;
          this.dispatchPromptChange();
        }
      };
      this.midiDispatcher.addEventListener('cc-message', this.ccListener);
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.midiDispatcher && this.ccListener) {
      this.midiDispatcher.removeEventListener('cc-message', this.ccListener);
      this.ccListener = null;
    }
  }


  override firstUpdated() {
    this.textInput.setAttribute('contenteditable', 'plaintext-only');
    this.textInput.textContent = this.text;
    this.lastValidText = this.text;
  }

  override update(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('showCC') && !this.showCC) {
      // If MIDI settings are hidden globally, individual learn mode should also turn off.
      if (this.learnMode) {
        this.learnMode = false;
         this.dispatchEvent(new CustomEvent('learn-mode-toggled', { detail: { active: this.learnMode, controllerId: this.promptId }, bubbles: true, composed: true }));
      }
    }
    if (changedProperties.has('text') && this.textInput && this.textInput.textContent !== this.text) {
      this.textInput.textContent = this.text;
      this.lastValidText = this.text;
    }
     if (changedProperties.has('weight') && this.weightInput && this.weightInput.value !== this.weight) {
      this.weightInput.value = this.weight;
    }
    super.update(changedProperties);
  }

  private dispatchPromptChange() {
    this.dispatchEvent(
      new CustomEvent<Prompt>('prompt-changed', {
        detail: {
          promptId: this.promptId,
          text: this.text,
          weight: this.weight,
          cc: this.cc,
          color: this.color,
        },
        bubbles: true, 
        composed: true
      }),
    );
  }

  private async updateText() {
    const newText = this.textInput.textContent?.trim();
    if (!newText) {
      this.text = this.lastValidText;
      this.textInput.textContent = this.lastValidText;
    } else {
      this.text = newText;
      this.lastValidText = newText;
    }
    this.dispatchPromptChange();
  }

  private onFocus() {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(this.textInput);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  private updateWeight() {
    this.weight = this.weightInput.value;
    this.dispatchPromptChange();
  }

  private toggleLearnMode() {
    const newLearnModeState = !this.learnMode;
    // Dispatch event *before* changing local state, so parent can react to "turning on"
    this.dispatchEvent(new CustomEvent('learn-mode-toggled', { 
        detail: { active: newLearnModeState, controllerId: this.promptId }, 
        bubbles: true, 
        composed: true 
    }));
    this.learnMode = newLearnModeState;
  }


  override render() {
    const classes = classMap({
      'prompt': true,
      'learn-mode': this.learnMode, // This class now styles the #midi div when this controller is learning
      'show-cc': this.showCC,
    });
    return html`<div class=${classes}>
      <weight-knob
        id="weight"
        .value=${this.weight}
        color=${this.color}
        audioLevel=${this.audioLevel}
        @input=${this.updateWeight}></weight-knob>
      <span
        id="text"
        spellcheck="false"
        @focus=${this.onFocus}
        @blur=${this.updateText}></span>
      <div id="midi" @click=${this.toggleLearnMode} title=${this.learnMode ? `Hört auf CC ${this.cc}` : `MIDI CC ${this.cc} zuweisen`}>
        ${this.learnMode ? 'Hört...' : `CC:${this.cc}`}
      </div>
    </div>`;
  }
}

/** The grid of prompt inputs. */
@customElement('prompt-dj-midi')
class PromptDjMidi extends LitElement {
  static override styles = css`
    :host {
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      position: relative;
    }
    #background {
      will-change: background-image;
      position: absolute;
      height: 100%;
      width: 100%;
      z-index: -1;
      background: #111;
    }
    #grid {
      width: 80vmin;
      height: 80vmin;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 2.5vmin;
      /* Adjusted margin-top considering new controls bar height */
      margin-top: calc(2vmin + 90px); /* Default margin */
    }
    prompt-controller {
      width: 100%;
    }
    #controls-bar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      width: 100%;
      box-sizing: border-box;
      display: flex;
      justify-content: space-between; 
      align-items: center;
      padding: 10px 15px; 
      background-color: rgba(0,0,0,0.1);
      z-index: 100;
      gap: 10px;
      flex-wrap: wrap; 
    }
    .control-group { 
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .action-controls { 
      display: flex;
      gap: 6px; /* Slightly reduced gap to fit more buttons potentially */
      align-items: center;
      flex-wrap: wrap; 
      justify-content: center; 
    }

    .action-item {
      display: flex;
      flex-direction: column; 
      align-items: center;
      gap: 3px; 
    }
    .action-item play-pause-button, 
    .action-item drop-button,
    .action-item .effect-button,
    .action-item .transition-button { /* Added transition button */
      margin-bottom: 2px; 
    }
    
    .midi-learn-button {
      font-family: 'Google Sans', sans-serif;
      font-size: 10px; 
      font-weight: 500;
      color: #fff;
      background: #0005;
      border: 1px solid #fff9;
      border-radius: 3px;
      padding: 2px 4px; 
      cursor: pointer;
      user-select: none;
      min-width: 80px; 
      text-align: center;
      transition: background-color 0.2s, border-color 0.2s;
    }
    .midi-learn-button.learning {
      background-color: #ff8c00; 
      border-color: #ffaf4d;
      color: #000;
    }
    .midi-learn-button:hover:not(.learning) {
      background-color: #0008;
    }


    /* General styles for buttons/selects in the bar */
    #controls-bar button,
    #controls-bar select {
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: #0002;
      -webkit-font-smoothing: antialiased;
      border: 1.5px solid #fff;
      border-radius: 4px;
      user-select: none;
      padding: 5px 8px;
      height: 32px;
      box-sizing: border-box;
    }
    #controls-bar button.active { /* For MIDI button */
      background-color: #fff;
      color: #000;
    }
    #controls-bar select { /* For MIDI select */
      background: #fff;
      color: #000;
      border: none;
      outline: none;
      min-width: 120px;
    }

    /* Specific styling for Play/Pause button */
    #controls-bar .action-item play-pause-button {
      width: 55px; 
      height: 55px;
      padding: 0;
      border: none;
      background: transparent;
    }
    #controls-bar .action-item play-pause-button .hitbox {
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
    }

    /* Specific styling for Drop button's inner button */
    #controls-bar .action-item drop-button button {
      height: 55px; 
      width: auto; 
      padding: 0 20px; 
      font-size: 18px; 
      min-width: 90px;
      border-radius: 8px; 
    }
    
    /* Styling for Effect and Transition buttons */
    .action-item button.effect-button,
    .action-item button.transition-button {
        font-family: 'Google Sans', sans-serif;
        font-weight: bold;
        text-transform: uppercase;
        font-size: 14px; 
        height: 45px; 
        padding: 0 12px;
        border-radius: 6px;
        border: 2px solid #222;
        color: white;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease;
        box-shadow: 0 3px 8px rgba(0,0,0,0.25);
        text-shadow: 1px 1px 1px rgba(0,0,0,0.3);
        min-width: 90px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .action-item button.effect-button#filter-button { background: linear-gradient(145deg, #4facfe, #00f2fe); border-color: #00e2ee;}
    .action-item button.effect-button#glitch-button { background: linear-gradient(145deg, #ff0057, #ff5733); border-color: #ee3713;}
    .action-item button.effect-button#beatgrid-button { background: linear-gradient(145deg, #43e97b, #38f9d7); border-color: #18d9b7;}
    .action-item button.transition-button { background: linear-gradient(145deg, #8A2BE2, #4B0082); border-color: #3A0072;} /* Purple for Transition */


    .action-item button.effect-button:hover:not(:disabled),
    .action-item button.transition-button:hover:not(:disabled) {
        transform: translateY(-2px) scale(1.03);
        box-shadow: 0 6px 12px rgba(0,0,0,0.3);
    }
    .action-item button.effect-button:active:not(:disabled),
    .action-item button.transition-button:active:not(:disabled) {
        transform: translateY(0px) scale(0.97);
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }
    .action-item button.effect-button:disabled,
    .action-item button.transition-button:disabled {
        background: linear-gradient(145deg, #666, #888);
        color: #bbb;
        cursor: not-allowed;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        transform: scale(1);
        border-color: #555;
    }


    @media (max-width: 860px) { /* Adjusted breakpoint for more controls */
       .action-controls {
          gap: 4px; /* Further reduce gap for more items */
       }
       .action-item button.effect-button,
       .action-item button.transition-button {
            font-size: 12px;
            height: 42px;
            padding: 0 10px;
            min-width: 80px;
       }
        #controls-bar .action-item drop-button button {
            font-size: 16px;
            height: 50px;
            padding: 0 15px;
            min-width: 80px;
        }
         #controls-bar .action-item play-pause-button {
            width: 50px;
            height: 50px;
        }
        .midi-learn-button {
            font-size: 9px;
            min-width: 70px;
            padding: 1px 3px;
        }
    }

    @media (max-width: 768px) { 
      #controls-bar {
        flex-direction: column;
        align-items: stretch; 
        padding-top: 10px; 
        padding-bottom: 10px;
      }
      .control-group {
        width: 100%;
        justify-content: space-between; 
        margin-bottom: 10px;
      }
      .action-controls {
        width: 100%;
        justify-content: space-around; 
        margin-bottom: 10px;
        gap: 5px; 
      }
       .action-controls .action-item {
        flex-basis: auto; 
        flex-grow: 0; 
      }
      .control-group:last-child, .action-controls:last-child {
        margin-bottom: 0;
      }
       #controls-bar select {
        flex-grow: 1;
        min-width: 0; 
      }

      #controls-bar .action-item play-pause-button {
        width: 60px;
        height: 60px;
      }
      #controls-bar .action-item drop-button button {
        height: 60px;
        font-size: 18px;
        padding: 0 20px;
        min-width: 100px;
      }
      .action-item button.effect-button,
      .action-item button.transition-button {
        height: 50px;
        font-size: 13px;
        padding: 0 10px;
        min-width: 80px;
      }
       .midi-learn-button {
        font-size: 10px;
        padding: 2px 4px;
        min-width: 70px;
      }
      #controls-bar .control-group button { /* MIDI button */
        height: 36px;
        font-size: 14px;
      }
      #grid {
        /* Estimate height: 2 lines of controls: (group + actions) */
        /* MIDI select + MIDI button ~40px + padding. Actions ~70px + padding */
        /* Total ~130px for two rows. If it wraps to three, needs more. */
        /* Let's be generous for 3 rows potential on very small action items */
        margin-top: calc(2vmin + 180px); 
      }
    }

     @media (max-width: 480px) {
        .action-controls {
            gap: 3px;
        }
        .action-item button.effect-button,
        .action-item button.transition-button {
            font-size: 12px;
            height: 45px;
            padding: 0 8px;
            min-width: 65px; /* Adjusted for very small screens */
        }
        #controls-bar .action-item drop-button button {
            font-size: 16px;
            height: 50px;
            min-width: 75px; /* Adjusted */
         }
         #controls-bar .action-item play-pause-button {
            width: 50px;
            height: 50px;
        }
        .midi-learn-button {
            min-width: 60px;
            font-size: 9px;
        }
         #grid {
             /* Controls bar could be ~200-240px tall if all wraps */
             margin-top: calc(2vmin + 220px);
         }
     }
  `;

  prompts: Map<string, Prompt>;
  private midiDispatcher: MidiDispatcher;
  private audioAnalyser: AudioAnalyser;

  @state() private playbackState: PlaybackState = 'stopped';

  private session: LiveMusicSession | null = null;
  private audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  private outputNode: GainNode = this.audioContext.createGain();
  private nextStartTime = 0;
  private readonly bufferTime = 2;

  @property({ type: Boolean }) private showMidi = false;
  @state() private audioLevel = 0;
  @state() private midiInputIds: string[] = [];
  @state() private activeMidiInputId: string | null = null;

  @property({ type: Object })
  private filteredPrompts = new Set<string>();

  private audioLevelRafId: number | null = null;
  @state() private connectionError = true; 
  @state() private isConnecting = false;
  @state() private lastConnectionErrorMessage: string | null = null;


  @query('play-pause-button') private playPauseButtonElement!: PlayPauseButton;
  @query('drop-button') private dropButtonElement!: DropButton;
  @query('toast-message') private toastMessage!: ToastMessage;

  @state() private availablePresets: PresetItem[] = [];
  @state() private selectedPresetName: string = '';

  @state() private isDropping = false;
  private originalDropPromptStates: Map<string, Prompt> = new Map();
  @state() private isTransitioning = false;
  private originalPromptsBeforeTransition: Map<string, Prompt> | null = null;


  // MIDI CC control states
  @state() private playPauseCC: number = DEFAULT_PLAY_PAUSE_CC;
  @state() private dropCC: number = DEFAULT_DROP_CC;
  @state() private filterCC: number = DEFAULT_FILTER_CC; 
  @state() private glitchCC: number = DEFAULT_GLITCH_CC;
  @state() private beatgridCC: number = DEFAULT_BEATGRID_CC; 
  @state() private transitionCC: number = DEFAULT_TRANSITION_CC;

  @state() private learnPlayPauseCCMode: boolean = false;
  @state() private learnDropCCMode: boolean = false;
  @state() private learnFilterCCMode: boolean = false; 
  @state() private learnGlitchCCMode: boolean = false;
  @state() private learnBeatgridCCMode: boolean = false; 
  @state() private learnTransitionCCMode: boolean = false;

  private globalCcListener: ((e: Event) => void) | null = null;
  private anyPromptControllerInLearnMode = false;


  // Effect states
  @state() private activeEffectIntensities: Map<EffectTypeName, number> = new Map();
  private basePromptsSnapshot: Map<string, Prompt> | null = null;


  constructor(
    initialPrompts: Map<string, Prompt>,
    midiDispatcher: MidiDispatcher,
  ) {
    super();
    this.prompts = initialPrompts;
    this.midiDispatcher = midiDispatcher;
    this.audioAnalyser = new AudioAnalyser(this.audioContext);
    this.audioAnalyser.node.connect(this.audioContext.destination);
    this.outputNode.connect(this.audioAnalyser.node);
    this.updateAudioLevel = this.updateAudioLevel.bind(this);
    this.updateAudioLevel();
    this.initializePresets();
    this.loadMidiControlSettings();

    // Initialize effect intensities
    this.activeEffectIntensities.set('filter', 0);
    this.activeEffectIntensities.set('glitch', 0);
    this.activeEffectIntensities.set('beatgrid', 0);

    this.midiDispatcher.addEventListener('midistatechange', async () => {
        console.log('MIDI state changed, refreshing devices...');
        await this.refreshMidiDeviceList();
    });
    this.setupGlobalMidiListener();
    this.addEventListener('learn-mode-toggled', this.handlePromptLearnModeToggle as EventListener);
  }

 private handlePromptLearnModeToggle(event: CustomEvent<{active: boolean, controllerId?: string}>) {
    if (event.detail.active) {
      this.anyPromptControllerInLearnMode = true;
      // A prompt controller entered learn mode, disable all global learn modes
      this.learnPlayPauseCCMode = false;
      this.learnDropCCMode = false;
      this.learnFilterCCMode = false;
      this.learnGlitchCCMode = false;
      this.learnBeatgridCCMode = false;
      this.learnTransitionCCMode = false; // Added for transition
      // Ensure only one prompt controller is in learn mode
      this.shadowRoot?.querySelectorAll('prompt-controller').forEach((pc: PromptController) => {
        if (pc.promptId !== event.detail.controllerId && pc.learnMode) {
            pc.learnMode = false; 
        }
      });
    } else {
        this.anyPromptControllerInLearnMode = false;
        // Check if ANY prompt controller is still in learn mode
        this.shadowRoot?.querySelectorAll('prompt-controller').forEach((pc: PromptController) => {
            if (pc.learnMode) this.anyPromptControllerInLearnMode = true;
        });
    }
    this.requestUpdate();
  }


  private deactivateAllPromptLearnModes() {
    this.anyPromptControllerInLearnMode = false;
    this.shadowRoot?.querySelectorAll('prompt-controller').forEach((pc: PromptController) => {
        if (pc.learnMode) {
            pc.learnMode = false; // This will trigger its own update and event
        }
    });
  }


  private setupGlobalMidiListener() {
    if (this.globalCcListener) {
      this.midiDispatcher.removeEventListener('cc-message', this.globalCcListener);
    }
    this.globalCcListener = (e: Event) => {
      const customEvent = e as CustomEvent<ControlChange>;
      const { cc, value } = customEvent.detail;

      // If any prompt controller is in learn mode, global listeners should not learn.
      if (this.anyPromptControllerInLearnMode) return;

      let ccLearned = false;
      if (this.learnPlayPauseCCMode) {
        this.playPauseCC = cc; this.learnPlayPauseCCMode = false; ccLearned = true;
        this.toastMessage.show(`Play/Pause CC auf ${cc} gesetzt.`);
      } else if (this.learnDropCCMode) {
        this.dropCC = cc; this.learnDropCCMode = false; ccLearned = true;
        this.toastMessage.show(`Drop CC auf ${cc} gesetzt.`);
      } else if (this.learnFilterCCMode) { 
        this.filterCC = cc; this.learnFilterCCMode = false; ccLearned = true;
        this.toastMessage.show(`Filter FX CC auf ${cc} gesetzt.`);
      } else if (this.learnGlitchCCMode) {
        this.glitchCC = cc; this.learnGlitchCCMode = false; ccLearned = true;
        this.toastMessage.show(`Glitch FX CC auf ${cc} gesetzt.`);
      } else if (this.learnBeatgridCCMode) { 
        this.beatgridCC = cc; this.learnBeatgridCCMode = false; ccLearned = true;
        this.toastMessage.show(`Beatgrid FX CC auf ${cc} gesetzt.`);
      } else if (this.learnTransitionCCMode) { // Added for transition
        this.transitionCC = cc; this.learnTransitionCCMode = false; ccLearned = true;
        this.toastMessage.show(`Transition CC auf ${cc} gesetzt.`);
      }


      if (ccLearned) {
        this.saveMidiControlSettings();
        this.requestUpdate();
        return;
      }

      // Trigger actions based on CC
      if (cc === this.playPauseCC) {
         if (value > 64) this.handlePlayPause();
      } else if (cc === this.dropCC) {
         if (value > 64 && !this.isDropping && this.playbackState === 'playing' && !this.isAnyEffectActive() && !this.isTransitioning) this.handleDrop();
      } else if (cc === this.transitionCC) { // Added for transition
         if (value > 64 && !this.isTransitioning && this.playbackState === 'playing' && !this.isAnyEffectActive() && !this.isDropping) this.handleTransition();
      } else if (cc === this.filterCC) {
        this.handleEffectCCChange('filter', value);
      } else if (cc === this.glitchCC) {
        this.handleEffectCCChange('glitch', value);
      } else if (cc === this.beatgridCC) {
        this.handleEffectCCChange('beatgrid', value);
      }
    };
    this.midiDispatcher.addEventListener('cc-message', this.globalCcListener);
  }

  private loadMidiControlSettings() {
    const settingsString = localStorage.getItem(MIDI_CONTROL_SETTINGS_KEY);
    if (settingsString) {
      try {
        const settings = JSON.parse(settingsString);
        this.playPauseCC = typeof settings.playPauseCC === 'number' ? settings.playPauseCC : DEFAULT_PLAY_PAUSE_CC;
        this.dropCC = typeof settings.dropCC === 'number' ? settings.dropCC : DEFAULT_DROP_CC;
        this.filterCC = typeof settings.filterCC === 'number' ? settings.filterCC : (settings.sweepCC ?? DEFAULT_FILTER_CC); 
        this.glitchCC = typeof settings.glitchCC === 'number' ? settings.glitchCC : DEFAULT_GLITCH_CC;
        this.beatgridCC = typeof settings.beatgridCC === 'number' ? settings.beatgridCC : (settings.ambianceCC ?? DEFAULT_BEATGRID_CC); 
        this.transitionCC = typeof settings.transitionCC === 'number' ? settings.transitionCC : DEFAULT_TRANSITION_CC; // Added for transition
      } catch (e) {
        console.error("Failed to parse MIDI control settings from localStorage", e);
        this.resetMidiControlSettingsToDefaults();
      }
    } else {
        this.resetMidiControlSettingsToDefaults();
    }
  }
  
  private resetMidiControlSettingsToDefaults() {
    this.playPauseCC = DEFAULT_PLAY_PAUSE_CC;
    this.dropCC = DEFAULT_DROP_CC;
    this.filterCC = DEFAULT_FILTER_CC;
    this.glitchCC = DEFAULT_GLITCH_CC;
    this.beatgridCC = DEFAULT_BEATGRID_CC;
    this.transitionCC = DEFAULT_TRANSITION_CC; // Added for transition
  }

  private saveMidiControlSettings() {
    const settings = {
      playPauseCC: this.playPauseCC,
      dropCC: this.dropCC,
      filterCC: this.filterCC, 
      glitchCC: this.glitchCC,
      beatgridCC: this.beatgridCC, 
      transitionCC: this.transitionCC, // Added for transition
    };
    localStorage.setItem(MIDI_CONTROL_SETTINGS_KEY, JSON.stringify(settings));
  }

 private toggleGlobalLearnMode(modeToToggle: 'playPause' | 'drop' | EffectTypeName | 'transition') {
    const propertyName = `learn${modeToToggle.charAt(0).toUpperCase() + modeToToggle.slice(1)}CCMode` as keyof this;
    
    // Cast to any to bypass TypeScript's strict checking for dynamic property access
    // This is safe here as we know propertyName will be a valid key of `this`
    const self = this as any; 
    const currentActiveState = self[propertyName];
    
    // Deactivate all global learn modes first
    this.learnPlayPauseCCMode = false;
    this.learnDropCCMode = false;
    this.learnFilterCCMode = false;
    this.learnGlitchCCMode = false;
    this.learnBeatgridCCMode = false;
    this.learnTransitionCCMode = false; // Added for transition

    if (!currentActiveState) {
        self[propertyName] = true; // Activate the selected mode
        this.deactivateAllPromptLearnModes(); // Also deactivate individual prompt learn modes
    }
    // No need to set self[propertyName] = false if it was already active,
    // because all modes were just deactivated.
    this.requestUpdate();
  }


  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.audioLevelRafId) {
      cancelAnimationFrame(this.audioLevelRafId);
    }
    this.session?.close();
    this.audioContext.close();
    if (this.globalCcListener) {
        this.midiDispatcher.removeEventListener('cc-message', this.globalCcListener);
        this.globalCcListener = null;
    }
    this.removeEventListener('learn-mode-toggled', this.handlePromptLearnModeToggle as EventListener);
  }


  private initializePresets() {
    const userPresetsString = localStorage.getItem('promptDjUserPresets');
    let userPresets: PresetItem[] = [];
    if (userPresetsString) {
      try {
        userPresets = JSON.parse(userPresetsString);
      } catch (e) {
        console.error("Failed to parse user presets from localStorage", e);
      }
    }
    const defaultPreset = this.getDefaultPreset();
    this.availablePresets = [defaultPreset, ...PREDEFINED_PRESETS, ...userPresets];

    const currentPromptsArray = Array.from(this.prompts.values());
    const matchedPreset = this.availablePresets.find(p =>
        JSON.stringify(p.prompts.map(prompt => ({...prompt, weight: Number(prompt.weight.toFixed(2))}))) ===
        JSON.stringify(currentPromptsArray.map(prompt => ({...prompt, weight: Number(prompt.weight.toFixed(2))})))
    );

    if (matchedPreset) {
        this.selectedPresetName = matchedPreset.name;
    } else {
        if(JSON.stringify(defaultPreset.prompts.map(prompt => ({...prompt, weight: Number(prompt.weight.toFixed(2))}))) ===
           JSON.stringify(currentPromptsArray.map(prompt => ({...prompt, weight: Number(prompt.weight.toFixed(2))}))) ) {
            this.selectedPresetName = defaultPreset.name;
        } else {
            this.selectedPresetName = '';
        }
    }
  }

  private getDefaultPreset(): PresetItem {
    return {
      name: "Standard",
      prompts: Array.from(buildDefaultPrompts().values())
    };
  }

  private saveUserPresets(presets: PresetItem[]) {
    const userPresetsToSave = presets.filter(p => p.name !== "Standard" && !PREDEFINED_PRESETS.find(pre => pre.name === p.name));
    localStorage.setItem('promptDjUserPresets', JSON.stringify(userPresetsToSave));
  }

  private handleSavePreset() {
    const presetName = prompt("Preset-Namen eingeben:");
    if (presetName && presetName.trim() !== "") {
      const currentPromptsArray = Array.from(this.prompts.values()).map(p => ({...p}));
      const newPreset: PresetItem = { name: presetName.trim(), prompts: currentPromptsArray };

      let userPresets = this.availablePresets.filter(p => p.name !== "Standard" && !PREDEFINED_PRESETS.find(pre => pre.name === p.name));
      userPresets = userPresets.filter(p => p.name !== newPreset.name);
      userPresets.push(newPreset);

      this.saveUserPresets(userPresets);

      const defaultPreset = this.getDefaultPreset();
      this.availablePresets = [defaultPreset, ...PREDEFINED_PRESETS, ...userPresets].sort((a,b) => {
        if (a.name === "Standard") return -1;
        if (b.name === "Standard") return 1;
        if (PREDEFINED_PRESETS.find(p => p.name === a.name) && !PREDEFINED_PRESETS.find(p => p.name === b.name)) return -1;
        if (!PREDEFINED_PRESETS.find(p => p.name === a.name) && PREDEFINED_PRESETS.find(p => p.name === b.name)) return 1;
        return a.name.localeCompare(b.name);
      });
      this.selectedPresetName = newPreset.name;
      this.toastMessage.show(`Preset "${presetName}" gespeichert.`);
    }
  }

  private handleLoadPreset(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const presetName = selectElement.value;
    const presetToLoad = this.availablePresets.find(p => p.name === presetName);

    if (presetToLoad) {
      const newPromptsMap = new Map(presetToLoad.prompts.map(p => [p.promptId, { ...p }]));
      this.setPrompts(newPromptsMap);
      this.selectedPresetName = presetName;
      this.toastMessage.show(`Preset "${presetName}" geladen.`);
      this.activeEffectIntensities.forEach((_, key) => this.activeEffectIntensities.set(key, 0));
      this.applyCombinedEffects(); 
    }
  }

  private handleResetDefault() {
    const defaultPromptsMap = buildDefaultPrompts();
    this.setPrompts(defaultPromptsMap);
    this.selectedPresetName = "Standard";
    this.toastMessage.show("Standard-Prompts geladen.");
    this.activeEffectIntensities.forEach((_, key) => this.activeEffectIntensities.set(key, 0));
    this.applyCombinedEffects();
  }


  override async firstUpdated() {
    if (this.toastMessage && !process.env.API_KEY) {
        this.toastMessage.show("API Key nicht konfiguriert. App nicht funktionsfähig.");
        return;
    }
    this.toastMessage.show("Verbinde mit Lyria Musik Service...");
    await this.connectToSession(false); 

    if (!this.connectionError && this.session) {
        await this.setSessionPrompts();
        this.playbackState = 'stopped'; 
    } else {
        this.playbackState = 'stopped';
    }
    await this.refreshMidiDeviceList();
  }

  private async refreshMidiDeviceList() {
    const inputIds = await this.midiDispatcher.getMidiAccess();
    this.midiInputIds = inputIds;
    if (this.midiDispatcher.activeMidiInputId && !inputIds.includes(this.midiDispatcher.activeMidiInputId)) {
        this.midiDispatcher.activeMidiInputId = inputIds.length > 0 ? inputIds[0] : null;
    } else if (!this.midiDispatcher.activeMidiInputId && inputIds.length > 0) {
        this.midiDispatcher.activeMidiInputId = inputIds[0];
    }
    this.activeMidiInputId = this.midiDispatcher.activeMidiInputId;
  }

private async connectToSession(isRetryOrigin = false) {
    if (this.isConnecting) {
        console.warn("Connection attempt already in progress.");
        return;
    }
    this.isConnecting = true;
    this.playbackState = 'loading';
    this.lastConnectionErrorMessage = null; 

    const MAX_RETRIES = 3;
    let currentAttempt = 0;

    const attemptConnection = async (): Promise<LiveMusicSession | null> => {
        currentAttempt++;
        try {
            if (currentAttempt > 1 || isRetryOrigin) {
                 this.toastMessage.show(`Verbindungsversuch ${currentAttempt}/${MAX_RETRIES}...`);
            }
            const session = await ai.live.music.connect({
                model: model,
                callbacks: {
                    onmessage: async (e: LiveMusicServerMessage) => {
                        if (e.setupComplete) {
                            this.connectionError = false;
                            if (currentAttempt > 1 || isRetryOrigin) {
                                this.toastMessage.show('Erfolgreich verbunden!');
                                setTimeout(() => { if (this.toastMessage.message === 'Erfolgreich verbunden!') this.toastMessage.hide(); }, 2000);
                            }
                        }
                        if (e.filteredPrompt) {
                            if (typeof e.filteredPrompt.text === 'string') {
                                this.filteredPrompts = new Set([...this.filteredPrompts, e.filteredPrompt.text]);
                            }
                            if (typeof e.filteredPrompt.filteredReason === 'string') {
                                this.toastMessage.show(e.filteredPrompt.filteredReason);
                            } else if (typeof e.filteredPrompt.text === 'string') {
                                this.toastMessage.show(`Prompt "${e.filteredPrompt.text}" wurde gefiltert (Grund nicht spezifiziert).`);
                            } else {
                                this.toastMessage.show("Ein Prompt wurde ohne Angabe von Details gefiltert.");
                            }
                        }
                        if (e.serverContent?.audioChunks !== undefined) {
                            if (this.playbackState === 'paused' || this.playbackState === 'stopped') return;
                            const audioBuffer = await decodeAudioData(
                                decode(e.serverContent?.audioChunks[0].data),
                                this.audioContext,
                                48000,
                                2,
                            );
                            const source = this.audioContext.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(this.outputNode);
                            if (this.nextStartTime === 0) {
                                this.nextStartTime = this.audioContext.currentTime + this.bufferTime;
                                setTimeout(() => {
                                    if (this.playbackState === 'loading') this.playbackState = 'playing';
                                }, this.bufferTime * 1000);
                            }

                            if (this.nextStartTime < this.audioContext.currentTime) {
                                console.warn("Audio buffer underrun, resetting playback.");
                                this.playbackState = 'loading';
                                this.nextStartTime = 0;
                                return;
                            }
                            source.start(this.nextStartTime);
                            this.nextStartTime += audioBuffer.duration;
                        }
                    },
                    onerror: (errorEvent: ErrorEvent) => {
                        const specificErrorMessage = errorEvent.message || (errorEvent.error as Error)?.message || 'Unbekannter Sitzungsfehler';
                        console.error('Session error:', specificErrorMessage, errorEvent.error);
                        this.lastConnectionErrorMessage = specificErrorMessage;
                        this.connectionError = true;
                        this.stop();
                        if (specificErrorMessage.includes('The service is currently unavailable')) {
                            this.toastMessage.show('Verbindung zum Lyria Dienst unterbrochen (Dienst nicht verfügbar). Bitte Audio neu starten.');
                        } else {
                           this.toastMessage.show('Sitzungsfehler. Bitte Audio neu starten.');
                        }
                    },
                    onclose: (closeEvent: CloseEvent) => {
                        console.warn('Session closed:', closeEvent.type, 'Code:', closeEvent.code, 'Reason:', closeEvent.reason, 'wasClean:', closeEvent.wasClean);
                        this.connectionError = true;
                        this.stop();
                        if (this.playbackState !== 'stopped') { 
                           this.toastMessage.show(`Verbindung geschlossen (Code: ${closeEvent.code}). Audio neu starten.`);
                        }
                    },
                },
            });
            this.connectionError = false;
            return session;
        } catch (error) {
            console.error(`Connection attempt ${currentAttempt} failed:`, error);
            if (error instanceof Error) {
                this.lastConnectionErrorMessage = error.message;
            } else {
                this.lastConnectionErrorMessage = String(error);
            }
            this.connectionError = true;
            if (currentAttempt < MAX_RETRIES) {
                const delay = Math.pow(2, currentAttempt -1 ) * 1000;
                this.toastMessage.show(`Verbindung fehlgeschlagen. Nächster Versuch in ${delay/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return attemptConnection();
            } else {
                return null;
            }
        }
    };

    try {
        const newSession = await attemptConnection();
        if (newSession) {
            this.session = newSession;
            this.connectionError = false;
        } else {
            this.session = null;
            if (this.lastConnectionErrorMessage && this.lastConnectionErrorMessage.includes('The service is currently unavailable')) {
                this.toastMessage.show('Lyria Musikdienst ist derzeit nicht erreichbar. Bitte später erneut versuchen.');
            } else {
                this.toastMessage.show('Maximale Verbindungsversuche erreicht. Bitte später erneut versuchen.');
            }
            if (this.playbackState === 'loading') {
                this.playbackState = 'stopped';
            }
            this.connectionError = true;
        }
    } finally {
        this.isConnecting = false;
    }
}


  private getPromptsToSend() {
    return Array.from(this.prompts.values())
      .filter((p) => {
        return !this.filteredPrompts.has(p.text) && p.weight > 0.001;
      })
  }

  private setSessionPrompts = throttle(async () => {
    if (!this.session || this.playbackState === 'stopped') return;

    const promptsToSend = this.getPromptsToSend();
    if (promptsToSend.length === 0 && this.playbackState === 'playing') {
      this.toastMessage.show('Mindestens ein aktiver Prompt ist erforderlich, um zu spielen. Drehe einen Regler auf.')
      this.pause();
      return;
    }
     if (promptsToSend.length === 0 && (this.playbackState === 'paused' || this.playbackState === 'loading')) {
      return;
    }

    try {
      await this.session.setWeightedPrompts({
        weightedPrompts: promptsToSend,
      });
    } catch (e) {
      if (e instanceof Error) {
        this.toastMessage.show(e.message);
      } else {
        this.toastMessage.show(String(e));
      }
      console.error("Error setting weighted prompts:", e);
    }
  }, 200);

  private updateAudioLevel() {
    this.audioLevelRafId = requestAnimationFrame(this.updateAudioLevel);
    this.audioLevel = this.audioAnalyser.getCurrentLevel();
  }

  private dispatchPromptsChange() {
    setStoredPrompts(this.prompts);
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const changedPromptDetail = e.detail;
    const prompt = this.prompts.get(changedPromptDetail.promptId);

    if (!prompt) {
      console.error('prompt not found', changedPromptDetail.promptId);
      return;
    }

    prompt.text = changedPromptDetail.text;
    prompt.weight = changedPromptDetail.weight;
    prompt.cc = changedPromptDetail.cc;
    prompt.color = changedPromptDetail.color;

    const newPrompts = new Map(this.prompts);
    this.setPrompts(newPrompts, true);
  }

  private setPrompts(newPrompts: Map<string, Prompt>, checkPresetMatch = true) {
    this.prompts = new Map(Array.from(newPrompts.entries()).map(([id, p]) => [id, {...p}])); 

    if (checkPresetMatch) {
        const currentPromptsArray = Array.from(this.prompts.values());
        const matchedPreset = this.availablePresets.find(p =>
          JSON.stringify(p.prompts.map(pr => ({...pr, weight: Number(pr.weight.toFixed(2))}))) ===
          JSON.stringify(currentPromptsArray.map(pr => ({...pr, weight: Number(pr.weight.toFixed(2))})))
        );
        this.selectedPresetName = matchedPreset ? matchedPreset.name : '';
    }
    this.dispatchPromptsChange(); 
    this.requestUpdate(); 
    
    if (!this.isAnyEffectActive() || !this.basePromptsSnapshot) {
        if (!this.isTransitioning) { // Don't send if in a transition step before drop
            this.setSessionPrompts();
        }
    }
  }


  private readonly makeBackground = throttle(
    () => {
      const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

      const MAX_WEIGHT = 0.5;
      const MAX_ALPHA = 0.6;

      const bg: string[] = [];

      [...this.prompts.values()].forEach((p, i) => {
        const alphaPct = clamp01(p.weight / MAX_WEIGHT) * MAX_ALPHA;
        const alpha = Math.round(alphaPct * 0xff)
          .toString(16)
          .padStart(2, '0');

        const stop = p.weight / 2;
        const x = (i % 4) / 3;
        const y = Math.floor(i / 4) / 3;
        const s = `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${p.color}${alpha} 0px, ${p.color}00 ${stop * 100}vmin)`;

        bg.push(s);
      });

      return bg.join(', ');
    },
    30,
  );

  private pause() {
    if (this.playbackState === 'playing' || this.playbackState === 'loading') {
      this.session?.pause();
      this.playbackState = 'paused';
      this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
      this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
    }
  }

  private play() {
    const promptsToSend = this.getPromptsToSend();
    if (promptsToSend.length === 0) {
      this.toastMessage.show('Mindestens ein aktiver Prompt ist erforderlich. Drehe einen Regler auf, um die Wiedergabe fortzusetzen.')
      if (this.playbackState === 'playing' || this.playbackState === 'loading') {
          this.pause();
      }
      return;
    }

    this.audioContext.resume();
    this.session?.play();
    this.playbackState = 'loading';
    this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime); 
    this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
  }

  private stop() {
    this.session?.stop(); 
    this.playbackState = 'stopped';
    this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
    this.nextStartTime = 0;
    
    this.outputNode.disconnect();
    this.outputNode = this.audioContext.createGain();
    this.outputNode.connect(this.audioContext.destination);
    this.outputNode.connect(this.audioAnalyser.node);
    this.outputNode.gain.value = 0; 
  }


private async handlePlayPause() {
    if (this.isConnecting || this.isAnyEffectActive() || this.isTransitioning || this.isDropping) { 
        let reason = "Aktion blockiert: ";
        if (this.isConnecting) reason += "Verbindung aktiv.";
        else if (this.isTransitioning) reason += "Transition aktiv.";
        else if (this.isDropping) reason += "Drop aktiv.";
        else if (this.isAnyEffectActive()) reason += "Effekt aktiv.";
        this.toastMessage.show(reason);
        return;
    }

    switch (this.playbackState) {
        case 'playing':
            this.pause();
            break;
        case 'paused':
        case 'stopped':
            if (this.connectionError || !this.session) {
                this.toastMessage.show('Versuche neu zu verbinden...');
                await this.connectToSession(true);
                if (!this.connectionError && this.session) {
                    await this.setSessionPrompts(); 
                    this.play();
                }
            } else {
                this.play();
            }
            break;
        case 'loading':
            this.pause();
            this.toastMessage.show('Ladevorgang angehalten. Erneut Play/Pause drücken zum Fortsetzen.');
            break;
    }
}

  private async handleDrop() {
    if (this.playbackState !== 'playing') {
      this.toastMessage.show('Musik muss abgespielt werden für einen Drop!');
      return;
    }
    if (this.isDropping || this.isAnyEffectActive() || this.isTransitioning) {
      let reason = "Drop blockiert: ";
      if (this.isTransitioning) reason += "Transition aktiv.";
      else if (this.isAnyEffectActive()) reason += "Effekt aktiv.";
      else if (this.isDropping) reason += "Drop läuft bereits.";
      this.toastMessage.show(reason);
      return;
    }

    this.isDropping = true;
    this.originalDropPromptStates.clear();
    this.prompts.forEach((p, id) => {
      this.originalDropPromptStates.set(id, { ...p }); 
    });
    this.requestUpdate(); // Ensure buttons reflect new state

    const silencePromptsMap = new Map<string, Prompt>();
    this.originalDropPromptStates.forEach((originalPrompt, id) => {
        silencePromptsMap.set(id, {...originalPrompt, weight: 0.01});
    });
    
    this.setPrompts(silencePromptsMap, false); 
    // setPrompts already calls setSessionPrompts if not in effect/snapshot mode
    // but for drop, we want to ensure it sends, so directly call
    try {
      await this.session?.setWeightedPrompts({ weightedPrompts: Array.from(silencePromptsMap.values()) }); 
    } catch (e) {
      let message = "Unbekannter Fehler beim Drop (Silence).";
      if (e instanceof Error) message = `Fehler beim Drop (Silence): ${e.message}`;
      else message = `Fehler beim Drop (Silence): ${String(e)}`;
      this.toastMessage.show(message);

      this.setPrompts(new Map(this.originalDropPromptStates), true); 
      this.isDropping = false;
      this.requestUpdate();
      return;
    }


    setTimeout(async () => {
        const impactPromptsMap = new Map<string, Prompt>();
        const dropKeywords = ["kick", "bass", "drum", "beat", "rhythm", "snare", "hit", "sub", "stomp", "thump", "impact", "punch"];

        this.originalDropPromptStates.forEach((originalPrompt, id) => {
          const newPrompt = { ...originalPrompt };
          if (originalPrompt.weight > 0.05) {
            const textLower = originalPrompt.text.toLowerCase();
            if (dropKeywords.some(keyword => textLower.includes(keyword))) {
              newPrompt.weight = Math.min(2.0, originalPrompt.weight * 1.75 + 0.3);
            } else {
              newPrompt.weight = Math.min(2.0, originalPrompt.weight * 1.1 + 0.1);
            }
          } else {
            newPrompt.weight = 0; 
          }
          impactPromptsMap.set(id, newPrompt);
        });
        
        const activeImpactPrompts = Array.from(impactPromptsMap.values()).filter(p => p.weight > 0.1);
        if (activeImpactPrompts.length === 0 && this.originalDropPromptStates.size > 0) {
            let firstActiveOriginal = Array.from(this.originalDropPromptStates.values()).find(p => p.weight > 0.05);
            if(firstActiveOriginal) {
                const fallbackPrompt = impactPromptsMap.get(firstActiveOriginal.promptId) || {...firstActiveOriginal};
                fallbackPrompt.weight = Math.min(2.0, firstActiveOriginal.weight * 1.2 + 0.1);
                impactPromptsMap.set(firstActiveOriginal.promptId, fallbackPrompt);
            }
        }
        this.setPrompts(new Map(impactPromptsMap), false); 
        // Again, ensure send for drop's impact phase
        try {
          await this.session?.setWeightedPrompts({ weightedPrompts: Array.from(impactPromptsMap.values()) });
        } catch (e) {
            let message = "Unbekannter Fehler beim Drop (Impact).";
            if (e instanceof Error) message = `Fehler beim Drop (Impact): ${e.message}`;
            else message = `Fehler beim Drop (Impact): ${String(e)}`;
            this.toastMessage.show(message);
             // Fallback to original state
            this.setPrompts(new Map(this.originalDropPromptStates), true);
            this.isDropping = false;
            this.requestUpdate();
            return;
        }

        setTimeout(async () => {
          const finalPrompts = new Map<string, Prompt>();
          this.originalDropPromptStates.forEach((p, id) => {
            finalPrompts.set(id, { ...p }); 
          });
          this.setPrompts(finalPrompts, true); 
          this.isDropping = false;
          this.requestUpdate();
        }, DROP_IMPACT_DURATION);
    }, DROP_SILENCE_DURATION);
  }

  private async handleTransition() {
    if (this.playbackState !== 'playing') {
      this.toastMessage.show('Musik muss für Transition abgespielt werden!');
      return;
    }
    if (this.isTransitioning || this.isDropping || this.isAnyEffectActive()) {
      let reason = "Transition blockiert: ";
      if (this.isDropping) reason += "Drop aktiv.";
      else if (this.isAnyEffectActive()) reason += "Effekt aktiv.";
      else if (this.isTransitioning) reason += "Transition läuft bereits.";
      this.toastMessage.show(reason);
      return;
    }

    this.isTransitioning = true;
    this.originalPromptsBeforeTransition = new Map(Array.from(this.prompts.entries()).map(([id, p]) => [id, { ...p }]));
    this.requestUpdate(); // Update button states

    // Build-up Phase
    const buildUpPrompts = new Map<string, Prompt>();
    let hasActivePromptForBuildUp = false;
    this.originalPromptsBeforeTransition.forEach((originalPrompt, id) => {
        const newPrompt = { ...originalPrompt };
        if (originalPrompt.weight > 0.1) { // Only modify significantly active prompts
            newPrompt.weight = Math.min(2.0, originalPrompt.weight * 1.5 + 0.2);
            newPrompt.text = `${originalPrompt.text}, baut Spannung auf mit Filter-Sweep und Intensität.`;
            hasActivePromptForBuildUp = true;
        }
        buildUpPrompts.set(id, newPrompt);
    });
    
    // Add a riser prompt if there was at least one active prompt
    const riserPromptId = 'prompt-riser-temp';
    if (hasActivePromptForBuildUp) {
        buildUpPrompts.set(riserPromptId, {
            promptId: riserPromptId,
            text: 'Schnelle Snare-Rolls und ein lauter White-Noise Riser',
            weight: 1.7, // High weight for riser
            cc: 999, // Temporary CC, won't be saved
            color: '#FFFFFF' // White color for riser
        });
    }


    this.setPrompts(buildUpPrompts, false); // Update UI and send to Lyria
    try {
        await this.session?.setWeightedPrompts({ weightedPrompts: Array.from(buildUpPrompts.values()).filter(p=>p.weight > 0.01) });
    } catch(e) {
        let message = "Unbekannter Fehler in Transition (Build-up).";
        if (e instanceof Error) message = `Fehler in Transition (Build-up): ${e.message}`;
        else message = `Fehler in Transition (Build-up): ${String(e)}`;
        this.toastMessage.show(message);

        if (this.originalPromptsBeforeTransition) {
             this.setPrompts(new Map(this.originalPromptsBeforeTransition), true);
        }
        this.isTransitioning = false;
        this.originalPromptsBeforeTransition = null;
        this.requestUpdate();
        return;
    }


    // Schedule Drop after Build-up
    setTimeout(async () => {
        // Remove temporary riser prompt before drop
        const promptsForDrop = new Map(this.prompts);
        promptsForDrop.delete(riserPromptId);
        this.setPrompts(promptsForDrop, false); // Update internal state first
         try {
            await this.session?.setWeightedPrompts({ weightedPrompts: Array.from(promptsForDrop.values()).filter(p=>p.weight > 0.01) });
        } catch(e) {
            // If this fails, we might proceed to drop anyway or revert, for now proceed.
            console.error("Error removing riser before drop:", e);
        }

        await this.handleDrop(); // handleDrop is async due to its internal structure but doesn't return a promise indicating full completion

        // Schedule final restoration after drop sequence completes
        // handleDrop itself takes DROP_TOTAL_INTERNAL_DURATION
        setTimeout(() => {
            if (this.originalPromptsBeforeTransition) {
                this.setPrompts(new Map(this.originalPromptsBeforeTransition), true);
            }
            this.isTransitioning = false;
            this.originalPromptsBeforeTransition = null;
            this.requestUpdate(); // Final button state update
        }, DROP_TOTAL_INTERNAL_DURATION + 200); // Add small buffer

    }, BUILD_UP_DURATION);
  }


  private isAnyEffectActive(): boolean {
    return Array.from(this.activeEffectIntensities.values()).some(intensity => intensity > 0.01); 
  }

  private handleEffectCCChange(effectType: EffectTypeName, ccValue: number) {
    if (this.playbackState !== 'playing' || this.isDropping || this.isTransitioning) return;

    const intensity = Math.max(0, Math.min(1, ccValue / 127.0)); 
    this.activeEffectIntensities.set(effectType, intensity);
    this.applyCombinedEffects();
    this.requestUpdate(); 
  }

  private handleEffectButtonClick(effectType: EffectTypeName) {
    if (this.playbackState !== 'playing' || this.isDropping || this.isTransitioning) {
        let reason = "Effekt blockiert: ";
        if (this.isDropping) reason += "Drop aktiv.";
        else if (this.isTransitioning) reason += "Transition aktiv.";
        else reason += "Musik muss für Effekte abgespielt werden.";
        this.toastMessage.show(reason);
        return;
    }
    const currentIntensity = this.activeEffectIntensities.get(effectType) || 0;
    const newIntensity = currentIntensity > 0.05 ? 0 : (100 / 127.0); 

    this.activeEffectIntensities.set(effectType, newIntensity);
    this.applyCombinedEffects();
    this.requestUpdate();
  }


  private applyCombinedEffects() {
    const anyEffectBecomingActive = Array.from(this.activeEffectIntensities.values()).some(val => val > 0.01);

    if (!this.basePromptsSnapshot && anyEffectBecomingActive) {
      this.basePromptsSnapshot = new Map(Array.from(this.prompts.entries()).map(([id, p]) => [id, { ...p }]));
    }

    if (this.basePromptsSnapshot) {
      const workingPrompts = new Map(Array.from(this.basePromptsSnapshot.entries()).map(([id, p]) => [id, { ...p }]));
      let totalGlitchIntensityReductionFactor = 1.0;

      const glitchIntensity = this.activeEffectIntensities.get('glitch') || 0;
      if (glitchIntensity > 0.01) {
        workingPrompts.forEach(prompt => {
          const basePrompt = this.basePromptsSnapshot!.get(prompt.promptId)!;
          const { text, weight } = this.getGlitchEffectTextAndWeight(basePrompt.text, basePrompt.weight, glitchIntensity);
          prompt.text = text;
          prompt.weight = weight;
        });
        if (glitchIntensity > 0.3 && glitchIntensity <= 0.6) totalGlitchIntensityReductionFactor = 0.8;
        else if (glitchIntensity > 0.6 && glitchIntensity <= 0.85) totalGlitchIntensityReductionFactor = 0.6;
        else if (glitchIntensity > 0.85) totalGlitchIntensityReductionFactor = 0.4;
      }
      
      if (totalGlitchIntensityReductionFactor < 1.0) {
          workingPrompts.forEach(prompt => {
              if (!prompt.text.includes("digitalen Zerfall") && !prompt.text.includes("Bit-Crush")) {
                 const basePrompt = this.basePromptsSnapshot!.get(prompt.promptId)!;
                 prompt.weight = basePrompt.weight * totalGlitchIntensityReductionFactor;
              }
          });
      }

      const filterIntensity = this.activeEffectIntensities.get('filter') || 0;
      if (filterIntensity > 0.01) {
        workingPrompts.forEach(prompt => {
          const textToFilter = glitchIntensity > 0.01 ? prompt.text : this.basePromptsSnapshot!.get(prompt.promptId)!.text;
          prompt.text = this.getFilterEffectText(textToFilter, filterIntensity, this.basePromptsSnapshot!.get(prompt.promptId)!.text);
        });
      }

      const beatgridIntensity = this.activeEffectIntensities.get('beatgrid') || 0;
      if (beatgridIntensity > 0.01) {
        workingPrompts.forEach(prompt => {
          const textToGrid = (glitchIntensity > 0.01 || filterIntensity > 0.01) ? prompt.text : this.basePromptsSnapshot!.get(prompt.promptId)!.text;
          prompt.text = this.getBeatgridEffectText(textToGrid, beatgridIntensity, this.basePromptsSnapshot!.get(prompt.promptId)!.text);
        });
      }
      
      this.setPrompts(workingPrompts, false); 
      this.setSessionPrompts(); 
    }

    if (!anyEffectBecomingActive && this.basePromptsSnapshot) {
      this.setPrompts(new Map(this.basePromptsSnapshot), true); 
      this.setSessionPrompts();
      this.basePromptsSnapshot = null;
    }
    this.requestUpdate();
  }

 private getFilterEffectText(currentText: string, intensity: number, originalBaseText: string): string {
    // Intensity 0.0 = open, 1.0 = closed
    if (intensity < 0.02) return originalBaseText; // Filter fully open

    let effectDescription = "";
    // More granular steps for filter description
    if (intensity >= 0.02 && intensity < 0.10) {
        effectDescription = " mit fast offenem, leicht resonantem Filter, Höhen sehr klar.";
    } else if (intensity >= 0.10 && intensity < 0.20) {
        effectDescription = " mit weit geöffnetem, resonantem Filter, Höhen hell und prägnant.";
    } else if (intensity >= 0.20 && intensity < 0.30) {
        effectDescription = " mit geöffnetem, resonantem Low-Pass, obere Mitten treten hervor.";
    } else if (intensity >= 0.30 && intensity < 0.40) {
        effectDescription = " mit moderat geöffnetem, stark resonantem Low-Pass, Mitten präsent und warm.";
    } else if (intensity >= 0.40 && intensity < 0.50) {
        effectDescription = " mit einsetzendem, stark resonantem Low-Pass, der den Mittenbereich formt.";
    } else if (intensity >= 0.50 && intensity < 0.60) {
        effectDescription = " mit zupackendem, stark resonantem Low-Pass, untere Mitten werden kräftig.";
    } else if (intensity >= 0.60 && intensity < 0.70) {
        effectDescription = " mit deutlichem, stark resonantem Low-Pass, Bässe werden druckvoll und rund.";
    } else if (intensity >= 0.70 && intensity < 0.80) {
        effectDescription = " mit starkem, extrem resonantem Low-Pass, Bässe sind dominant und tief.";
    } else if (intensity >= 0.80 && intensity < 0.90) {
        effectDescription = " mit sehr geschlossenem, grollendem Low-Pass, tiefe Bässe im Vordergrund.";
    } else if (intensity >= 0.90 && intensity < 0.98) {
        effectDescription = " mit fast geschlossenem, extrem resonantem Low-Pass, Subbässe wummern tief.";
    } else { // intensity >= 0.98
        effectDescription = " mit extrem geschlossenem, dumpfem Low-Pass, nur noch Subbass hörbar.";
    }
    return originalBaseText + effectDescription;
}


  private getGlitchEffectTextAndWeight(originalText: string, originalWeight: number, intensity: number): { text: string, weight: number } {
    if (intensity < 0.05) return { text: originalText, weight: originalWeight };
    
    let text = originalText;
    let weight = originalWeight;
    let effectDescription = "";

    if (intensity >= 0.05 && intensity < 0.3) {
      effectDescription = " (subtile digitale Artefakte)";
      weight = Math.min(2.0, originalWeight * 1.1);
    } else if (intensity >= 0.3 && intensity < 0.6) {
      effectDescription = " (deutlich hörbares 8-Bit Stottern)";
      weight = Math.min(2.0, originalWeight * 1.3 + 0.1);
    } else if (intensity >= 0.6 && intensity < 0.85) {
      effectDescription = " (starker, knisternder Bit-Crush Effekt)";
      weight = Math.min(2.0, originalWeight * 1.6 + 0.3);
    } else if (intensity >= 0.85) {
      effectDescription = " (im chaotischen digitalen Zerfall)";
      weight = Math.min(2.0, originalWeight * 2.0 + 0.5);
    }
    return { text: originalText + effectDescription, weight: Math.max(0, weight) };
  }

  private getBeatgridEffectText(currentText: string, intensity: number, originalBaseText: string): string {
    if (intensity < 0.05) return originalBaseText;
    let effectDescription = "";
    if (intensity >= 0.05 && intensity < 0.3) effectDescription = " mit sanftem rhythmischem Gate (1/4 Noten).";
    else if (intensity >= 0.3 && intensity < 0.6) effectDescription = " gechoppt im 1/8 Noten Raster.";
    else if (intensity >= 0.6 && intensity < 0.85) effectDescription = " gesliced in ein schnelles 1/16 Noten Beatgrid.";
    else if (intensity >= 0.85) effectDescription = " mit hyperschnellem 1/32 Noten Slicing.";
     return originalBaseText + effectDescription;
  }


  private async toggleShowMidi() {
    this.showMidi = !this.showMidi;
    if (this.showMidi) {
       await this.refreshMidiDeviceList();
    } else {
      this.learnPlayPauseCCMode = false;
      this.learnDropCCMode = false;
      this.learnFilterCCMode = false;
      this.learnGlitchCCMode = false;
      this.learnBeatgridCCMode = false;
      this.learnTransitionCCMode = false; // Added for transition
      this.deactivateAllPromptLearnModes();
    }
  }

  private async handleMidiInputChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newMidiId = selectElement.value;
    this.activeMidiInputId = newMidiId;
    this.midiDispatcher.activeMidiInputId = newMidiId;
  }


  override render() {
    const bg = styleMap({
      backgroundImage: this.makeBackground(),
    });
    const midiControlsHiddenStyle = !this.showMidi ? 'visibility: hidden; width: 0; padding:0; border:0; margin-left:-5px; overflow:hidden; opacity:0;' : '';
    const midiLearnControlsHiddenStyle = !this.showMidi ? 'display: none;' : '';
    
    const generalActionDisabled = this.playbackState !== 'playing' || this.isDropping || this.isTransitioning;
    const playPauseDisabled = this.isDropping || this.isTransitioning || this.isAnyEffectActive();


    return html`<div id="background" style=${bg}></div>
      <div id="controls-bar">
        <div class="control-group"> 
            <button
            @click=${this.toggleShowMidi}
            class=${this.showMidi ? 'active' : ''}
            title="MIDI-Einstellungen anzeigen/ausblenden"
            aria-pressed=${this.showMidi}
            >MIDI</button
            >
            <select
            @change=${this.handleMidiInputChange}
            .value=${this.activeMidiInputId || ''}
            style=${midiControlsHiddenStyle}
            aria-label="MIDI-Eingabegerät auswählen"
            ?disabled=${!this.showMidi}
            >
            ${this.midiInputIds.length > 0
                ? this.midiInputIds.map(
                    (id) =>
                    html`<option value=${id}>
                            ${this.midiDispatcher.getDeviceName(id) || `Gerät ${id.substring(0,6)}`}
                        </option>`,
                )
                : html`<option value="">Keine Geräte</option>`}
            </select>
        </div>

        <div class="action-controls"> 
            <div class="action-item">
                <play-pause-button
                    .playbackState=${this.playbackState}
                    @click=${this.handlePlayPause}
                    aria-label=${this.playbackState === 'playing' || this.playbackState === 'loading' ? "Pause" : "Play"}
                    .disabled=${playPauseDisabled} 
                ></play-pause-button>
                <button 
                    class="midi-learn-button ${this.learnPlayPauseCCMode ? 'learning' : ''}"
                    style=${midiLearnControlsHiddenStyle}
                    @click=${() => this.toggleGlobalLearnMode('playPause')}
                    title="MIDI CC für Play/Pause zuweisen"
                    aria-pressed=${this.learnPlayPauseCCMode}
                    ?disabled=${!this.showMidi}>
                    ${this.learnPlayPauseCCMode ? 'Hört...' : `Play: CC ${this.playPauseCC}`}
                </button>
            </div>
            <div class="action-item">
                <drop-button
                    @drop-requested=${this.handleDrop}
                    .disabled=${generalActionDisabled || this.isAnyEffectActive()}
                ></drop-button>
                 <button 
                    class="midi-learn-button ${this.learnDropCCMode ? 'learning' : ''}"
                    style=${midiLearnControlsHiddenStyle}
                    @click=${() => this.toggleGlobalLearnMode('drop')}
                    title="MIDI CC für Drop zuweisen"
                    aria-pressed=${this.learnDropCCMode}
                    ?disabled=${!this.showMidi}>
                    ${this.learnDropCCMode ? 'Hört...' : `Drop: CC ${this.dropCC}`}
                </button>
            </div>
             <div class="action-item">
                <button id="transition-button" class="transition-button" @click=${this.handleTransition} ?disabled=${generalActionDisabled || this.isAnyEffectActive()} aria-label="Transition auslösen (Build-up mit Drop)">Transition</button>
                <button 
                    class="midi-learn-button ${this.learnTransitionCCMode ? 'learning' : ''}"
                    style=${midiLearnControlsHiddenStyle}
                    @click=${() => this.toggleGlobalLearnMode('transition')}
                    title="MIDI CC für Transition zuweisen"
                    aria-pressed=${this.learnTransitionCCMode}
                    ?disabled=${!this.showMidi}>
                    ${this.learnTransitionCCMode ? 'Hört...' : `Trans: CC ${this.transitionCC}`}
                </button>
            </div>
            
            <div class="action-item">
                <button id="filter-button" class="effect-button" @click=${() => this.handleEffectButtonClick('filter')} ?disabled=${generalActionDisabled} aria-label="Filter Effekt an-/ausschalten">Filter</button>
                <button 
                    class="midi-learn-button ${this.learnFilterCCMode ? 'learning' : ''}"
                    style=${midiLearnControlsHiddenStyle}
                    @click=${() => this.toggleGlobalLearnMode('filter')}
                    title="MIDI CC für Filter Effekt zuweisen"
                    aria-pressed=${this.learnFilterCCMode}
                    ?disabled=${!this.showMidi}>
                    ${this.learnFilterCCMode ? 'Hört...' : `Filter: CC ${this.filterCC}`}
                </button>
            </div>
            <div class="action-item">
                <button id="glitch-button" class="effect-button" @click=${() => this.handleEffectButtonClick('glitch')} ?disabled=${generalActionDisabled} aria-label="Glitch Effekt an-/ausschalten">Glitch</button>
                <button 
                    class="midi-learn-button ${this.learnGlitchCCMode ? 'learning' : ''}"
                    style=${midiLearnControlsHiddenStyle}
                    @click=${() => this.toggleGlobalLearnMode('glitch')}
                    title="MIDI CC für Glitch Effekt zuweisen"
                    aria-pressed=${this.learnGlitchCCMode}
                    ?disabled=${!this.showMidi}>
                    ${this.learnGlitchCCMode ? 'Hört...' : `Glitch: CC ${this.glitchCC}`}
                </button>
            </div>
            <div class="action-item">
                <button id="beatgrid-button" class="effect-button" @click=${() => this.handleEffectButtonClick('beatgrid')} ?disabled=${generalActionDisabled} aria-label="Beatgrid Effekt an-/ausschalten">Beatgrid</button>
                <button 
                    class="midi-learn-button ${this.learnBeatgridCCMode ? 'learning' : ''}"
                    style=${midiLearnControlsHiddenStyle}
                    @click=${() => this.toggleGlobalLearnMode('beatgrid')}
                    title="MIDI CC für Beatgrid Effekt zuweisen"
                    aria-pressed=${this.learnBeatgridCCMode}
                    ?disabled=${!this.showMidi}>
                    ${this.learnBeatgridCCMode ? 'Hört...' : `Beatgrid: CC ${this.beatgridCC}`}
                </button>
            </div>
        </div>
      </div>
      <div id="grid">${this.renderPrompts()}</div>
      <toast-message></toast-message>`;
  }

  private renderPrompts() {
    return [...this.prompts.values()].map((prompt) => {
      const promptController = this.shadowRoot?.querySelector<PromptController>(`prompt-controller[promptId="${prompt.promptId}"]`);
      const isLearning = this.anyPromptControllerInLearnMode && promptController?.learnMode === true;

      return html`<prompt-controller
        .promptId=${prompt.promptId}
        ?filtered=${this.filteredPrompts.has(prompt.text)}
        .cc=${prompt.cc}
        .text=${prompt.text}
        .weight=${prompt.weight}
        .color=${prompt.color}
        .midiDispatcher=${this.midiDispatcher}
        .showCC=${this.showMidi}
        .learnMode=${isLearning}
        .audioLevel=${this.audioLevel}
        @prompt-changed=${this.handlePromptChanged}>
      </prompt-controller>`;
    });
  }
}

async function main(parent: HTMLElement) {
  const midiDispatcher = new MidiDispatcher();
  const initialPrompts = getInitialPrompts();

  const pdjMidi = new PromptDjMidi(
    initialPrompts,
    midiDispatcher,
  );
  parent.appendChild(pdjMidi);

  window.addEventListener('beforeunload', () => {
    if (pdjMidi) {
      setStoredPrompts(pdjMidi.prompts);
    }
  });
}

function getInitialPrompts(): Map<string, Prompt> {
  const { localStorage } = window;
  const storedPrompts = localStorage.getItem('prompts');

  if (storedPrompts) {
    try {
      const promptsArray = JSON.parse(storedPrompts) as Prompt[];
      console.log('Loading stored prompts', promptsArray);
      if (promptsArray.length === DEFAULT_PROMPTS_CONFIG.length) {
         const validPrompts = new Map(promptsArray.map((prompt) => [prompt.promptId, prompt]));
         let allIdsCorrect = true;
         for(let i=0; i<DEFAULT_PROMPTS_CONFIG.length; i++) {
            if(!validPrompts.has(`prompt-${i}`)) {
                allIdsCorrect = false;
                break;
            }
         }
         if (allIdsCorrect && promptsArray.every(p => p.text != null && p.weight != null && p.cc != null && p.color != null)) {
             return validPrompts;
         }
         console.warn("Stored prompts have incorrect IDs or structure, falling back to default.");
      } else {
        console.warn(`Stored prompts length (${promptsArray.length}) mismatch, falling back to default.`);
      }
    } catch (e) {
      console.error('Failed to parse stored prompts, falling back to default.', e);
    }
  }

  console.log('No valid stored prompts, using default prompts.');
  return buildDefaultPrompts();
}

function buildDefaultPrompts(): Map<string, Prompt> {
  const promptsMap = new Map<string, Prompt>();
  const basePromptsArray = createBasePresetPrompts(); 

  basePromptsArray.forEach((promptStructure) => {
    let initialWeight = promptStructure.weight; 
    if (promptStructure.text.toLowerCase() === DEFAULT_PROMPTS_CONFIG[0].text.toLowerCase()) {
      initialWeight = 1.0; 
    }
    promptsMap.set(promptStructure.promptId, {
      ...promptStructure,
      weight: initialWeight,
    });
  });
  return promptsMap;
}

function setStoredPrompts(prompts: Map<string, Prompt>) {
  const promptsArray = Array.from(prompts.values());
  if (promptsArray.length === DEFAULT_PROMPTS_CONFIG.length + (prompts.has('prompt-riser-temp') ? 1 : 0) || // Allow for temp riser
      (promptsArray.length === DEFAULT_PROMPTS_CONFIG.length && promptsArray.every(p => p.promptId && p.text != null && p.weight != null && p.cc != null && p.color != null))
     ) {
    const promptsToStore = promptsArray.filter(p => p.promptId !== 'prompt-riser-temp'); // Don't store temp riser
    if (promptsToStore.length === DEFAULT_PROMPTS_CONFIG.length && promptsToStore.every(p => p.promptId && p.text != null && p.weight != null && p.cc != null && p.color != null)) {
      const storedPrompts = JSON.stringify(promptsToStore);
      localStorage.setItem('prompts', storedPrompts);
    } else if (promptsToStore.length !== DEFAULT_PROMPTS_CONFIG.length) {
       console.warn("Attempted to save prompts with incorrect length after filtering temp prompts. Not saving.");
    } else {
       console.error("Attempted to save invalid prompts structure to localStorage after filtering. Prompts:", promptsToStore);
    }
  } else {
    console.error("Attempted to save invalid prompts structure or length to localStorage. Prompts:", promptsArray);
  }
}

main(document.body);

declare global {
  interface HTMLElementTagNameMap {
    'prompt-dj-midi': PromptDjMidi;
    'prompt-controller': PromptController;
    'weight-knob': WeightKnob;
    'play-pause-button': PlayPauseButton;
    'toast-message': ToastMessage;
    'drop-button': DropButton;
  }
   interface Window {
    webkitAudioContext: typeof AudioContext;
  }
  // Add this to make process.env available in TypeScript
  namespace NodeJS {
    interface ProcessEnv {
      API_KEY?: string; // Define API_KEY as an optional string
    }
  }
}
