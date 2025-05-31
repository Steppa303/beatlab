
/**
 * @fileoverview Control real time music with text prompts - Minimal Demo
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, unsafeCSS, CSSResultGroup, html, LitElement, svg} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
// styleMap is imported by weight-slider.ts if needed there. Not directly used in this file anymore.

import {
  GoogleGenAI,
  type LiveMusicServerMessage,
  type LiveMusicSession,
  type LiveMusicGenerationConfig,
  // StartLiveMusicSessionParams and LiveMusicSessionConfig might not be needed with ai.live.music.connect
} from '@google/genai';
import {decode, decodeAudioData as localDecodeAudioData, throttle} from './utils.js';
import { MidiController, type MidiInputInfo } from './midi-controller.js';
import type { Prompt, PlaybackState, AppLiveMusicGenerationConfig, PresetPrompt, Preset } from './types.js';
import { TRACK_COLORS, ORB_COLORS, CURRENT_PRESET_VERSION, MIDI_LEARN_TARGET_DROP_BUTTON, MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON } from './constants.js';

// Import components
import './components/weight-slider.js'; 
import { WeightSlider } from './components/weight-slider.js'; 
import './components/parameter-slider.js'; 
import { ParameterSlider } from './components/parameter-slider.js'; 
import './components/toggle-switch.js'; 
import { ToggleSwitch } from './components/toggle-switch.js'; 
import { IconButton } from './components/icon-button.js'; 
import './components/play-pause-button.js'; 
import { PlayPauseButton } from './components/play-pause-button.js'; 
import './components/add-prompt-button.js'; 
import { AddPromptButton } from './components/add-prompt-button.js'; 
import './prompt-controller.js'; 
import { PromptController as PromptControllerElement } from './prompt-controller.js';


// Declare Cast SDK globals for TypeScript
declare global {
  // CHROME.CAST.MEDIA NAMESPACE
  namespace chrome.cast.media {
    const DEFAULT_MEDIA_RECEIVER_APP_ID: string;

    enum StreamType {
      BUFFERED = "BUFFERED",
      LIVE = "LIVE",
      NONE = "NONE",
    }
    enum PlayerState {
      IDLE = "IDLE",
      PLAYING = "PLAYING",
      PAUSED = "PAUSED",
      BUFFERING = "BUFFERING",
    }

    interface MediaInfo {
      contentId: string;
      contentType: string;
      streamType: StreamType;
      duration?: number | null;
      metadata?: GenericMediaMetadata | any;
    }
    interface GenericMediaMetadata {
      title?: string;
      subtitle?: string;
      artist?: string;
      images?: Array<{ url: string }>;
    }
    interface LoadRequest {
      media: MediaInfo;
      autoplay?: boolean | null;
      currentTime?: number | null;
    }
    interface Media {
      addUpdateListener(listener: (isAlive: boolean) => void): void;
      removeUpdateListener(listener: (isAlive: boolean) => void): void;
      getEstimatedTime(): number;
      getPlayerState(): PlayerState;
    }

    // Constructors for classes in chrome.cast.media
    var MediaInfo: {
      new(contentId: string, contentType: string): MediaInfo;
      prototype: MediaInfo;
    };
    var GenericMediaMetadata: {
      new(): GenericMediaMetadata;
      prototype: GenericMediaMetadata;
    };
    var LoadRequest: {
      new(mediaInfo: MediaInfo): LoadRequest;
      prototype: LoadRequest;
    };
  }

  // CHROME.CAST NAMESPACE
  namespace chrome.cast {
    enum AutoJoinPolicy {
      TAB_AND_ORIGIN_SCOPED = "tab_and_origin_scoped",
      ORIGIN_SCOPED = "origin_scoped",
      PAGE_SCOPED = "page_scoped",
    }
    type SessionRequest = any; // Opaque type
    type ApiConfig = any;    // Opaque type
  }

  // CAST.FRAMEWORK NAMESPACE
  namespace cast.framework {
    const VERSION: string;

    enum CastContextEventType {
      SESSION_STATE_CHANGED = "sessionstatechanged",
      CAST_STATE_CHANGED = "caststatechanged",
    }
    enum SessionState {
      NO_SESSION = "NO_SESSION",
      SESSION_STARTING = "SESSION_STARTING",
      SESSION_STARTED = "SESSION_STARTED",
      SESSION_START_FAILED = "SESSION_START_FAILED",
      SESSION_ENDING = "SESSION_ENDING",
      SESSION_ENDED = "SESSION_ENDED",
      SESSION_RESUMED = "SESSION_RESUMED",
      SESSION_SUSPENDED = "SESSION_SUSPENDED",
    }
    enum CastState {
      NO_DEVICES_AVAILABLE = "NO_DEVICES_AVAILABLE",
      NOT_CONNECTED = "NOT_CONNECTED",
      CONNECTING = "CONNECTING",
      CONNECTED = "CONNECTED",
    }
    enum RemotePlayerEventType {
      IS_CONNECTED_CHANGED = "isconnectedchanged",
    }

    interface SessionStateEventData {
      session: CastSession;
      sessionState: SessionState;
      error?: any;
    }
    interface CastStateEventData {
      castState: CastState;
    }

    interface CastOptions {
      receiverApplicationId: string;
      autoJoinPolicy: chrome.cast.AutoJoinPolicy;
      language?: string;
      resumeSavedSession?: boolean;
    }

    interface CastContext {
      setOptions(options: CastOptions): void;
      addEventListener(type: CastContextEventType, handler: (event: SessionStateEventData | CastStateEventData) => void): void;
      removeEventListener(type: CastContextEventType, handler: (event: SessionStateEventData | CastStateEventData) => void): void;
      getCurrentSession(): CastSession | null;
      getCastState(): CastState;
      requestSession(): Promise<void | string>; // Or Promise<chrome.cast.ErrorCode>
    }
    interface CastSession {
      getCastDevice(): { friendlyName: string };
      getSessionId(): string;
      getSessionState(): SessionState;
      addMessageListener(namespace: string, listener: (namespace: string, message: string) => void): void;
      removeMessageListener(namespace: string, listener: (namespace: string, message: string) => void): void;
      sendMessage(namespace: string, message: any): Promise<void | number>; // Or Promise<chrome.cast.ErrorCode>
      endSession(stopCasting: boolean): Promise<void | string>; // Or Promise<chrome.cast.ErrorCode>
      loadMedia(request: chrome.cast.media.LoadRequest): Promise<void | string>; // Or Promise<chrome.cast.ErrorCode>
      getMediaSession(): chrome.cast.media.Media | null;
    }
    interface RemotePlayer {
      isConnected: boolean;
    }
    interface RemotePlayerController {
      addEventListener(type: RemotePlayerEventType, handler: () => void): void;
      removeEventListener(type: RemotePlayerEventType, handler: () => void): void;
    }

    // Constructors/Static parts for classes in cast.framework
    var CastContext: {
      getInstance(): CastContext;
    };
    var RemotePlayer: {
      new(): RemotePlayer;
      prototype: RemotePlayer;
    };
    var RemotePlayerController: {
      new(player: RemotePlayer): RemotePlayerController;
      prototype: RemotePlayerController;
    };
  }

  interface Window {
    cast: typeof cast;
    chrome: typeof chrome;
    __onGCastApiAvailable?: (available: boolean, errorInfo?: any) => void;
    // webkitAudioContext for Safari
    webkitAudioContext: typeof AudioContext;
  }
}

// Define the Cast API available callback globally.
// This ensures it's set before the Cast SDK script tries to call it.
window.__onGCastApiAvailable = (available: boolean, errorInfo?: any) => {
  console.log(`__onGCastApiAvailable invoked. Available: ${available}`, errorInfo);
  if (!available && errorInfo) {
    console.error('Cast API failed to load or is not available:', errorInfo);
  }
  // Dispatch a custom event that the PromptDj component can listen to.
  document.dispatchEvent(new CustomEvent('cast-api-ready', { detail: { available, errorInfo } }));
};


// Use API_KEY as per guidelines
const ai = new GoogleGenAI({
  apiKey: process.env.API_KEY,
  apiVersion: 'v1alpha', 
});

// Model for Lyria real-time music generation.
const activeModelName = 'models/lyria-realtime-exp';


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

// CastButton component
@customElement('cast-button')
export class CastButton extends IconButton {
  static override styles = [
    IconButton.styles,
    css`
      .icon-path-fill {
        fill: #FEFEFE;
      }
      :host([iscastingactive]) .icon-path-fill {
        fill: #64B5F6; /* Light blue when casting */
      }
    `
  ];

  @property({type: Boolean, reflect: true}) isCastingActive = false;

  private renderCastIconSvg() {
    return svg`
      <path class="icon-path-fill"
        d="M87.5 25H12.5C10.25 25 8.33333 26.9167 8.33333 29.1667V37.5H16.6667V33.3333H83.3333V70.8333H54.1667V79.1667H83.3333C85.5833 79.1667 87.5 77.25 87.5 75V29.1667C87.5 26.9167 85.5833 25 87.5 25ZM8.33333 70.8333V79.1667H20.8333C20.8333 74.4167 16.25 70.8333 8.33333 70.8333ZM8.33333 58.3333V64.5833C22.5833 64.5833 29.1667 71.1667 29.1667 79.1667H35.4167C35.4167 66.0833 23.4167 58.3333 8.33333 58.3333ZM8.33333 45.8333V52.0833C29.25 52.0833 41.6667 64.5 41.6667 79.1667H47.9167C47.9167 57.9167 30.5833 45.8333 8.33333 45.8333Z"
      />
    `;
  }

  override renderIcon() {
    return this.renderCastIconSvg();
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
        stroke-width: 10; 
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
  ];

  private renderShareText() {
    return svg`
      <text 
        x="50%" 
        y="50%" 
        dominant-baseline="middle" 
        text-anchor="middle" 
        font-family="Arial, sans-serif"
        font-size="30"  
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

// DropButton component
@customElement('drop-button')
export class DropButton extends IconButton {
  static override styles = [
    IconButton.styles,
  ];

  private renderDropIcon() {
    return svg`
      <text 
        x="50%" 
        y="50%" 
        dominant-baseline="middle" 
        text-anchor="middle" 
        font-family="Arial, sans-serif"
        font-size="38"  
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
  private hideTimeout: number | null = null;

  override render() {
    return html`<div class=${classMap({showing: this.showing, toast: true})}>
      <div class="message">${this.message}</div>
      <button @click=${this.hide}>✕</button>
    </div>`;
  }

  show(message: string, duration = 5000) {
    this.showing = true;
    this.message = message;
    if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
    }
    if (duration > 0) {
        this.hideTimeout = window.setTimeout(() => this.hide(), duration);
    }
  }

  hide() {
    if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
    }
    this.showing = false;
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
      z-index: 1050; 
      pointer-events: none; 
      transition: background-color 0.3s ease-in-out;
    }
    :host([isOpen]) {
      pointer-events: auto; 
      background-color: rgba(0, 0, 0, 0.5); 
    }
    .panel {
      position: absolute;
      top: 0;
      right: 0;
      width: clamp(300px, 40vw, 500px); 
      height: 100%;
      background-color: #282828; 
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
            <p>Ziehe den farbigen Slider unter jedem Prompt, um dessen Einfluss (Gewichtung) auf die generierte Musik anzupassen. Werte reichen von 0 (kein Einfluss) bis 2 (starker Einfluss). Die aktuelle Ratio wird rechts neben dem Prompt-Text angezeigt. Dies ist auch per MIDI CC steuerbar (siehe MIDI-Sektion).</p>
            <h4>Musik starten/pausieren</h4>
            <p>Verwende den großen <strong>Play/Pause-Button (▶️/⏸️ unten links)</strong>. Beim ersten Start oder nach einer Unterbrechung kann es einen Moment dauern (Lade-Symbol), bis die Musik beginnt. Auch dieser Button ist per MIDI CC steuerbar.</p>
            <h4>"Drop!"-Effekt</h4>
            <p>Klicke den <strong>Drop!-Button ( unten rechts)</strong> für einen dynamischen Effekt! Die Musik baut Spannung auf und entlädt sich dann. Der Stil des Drops (z.B. intensiv, sanft, groovig) passt sich nun automatisch an die aktuell gespielte Musik an, um Übergänge natürlicher und wirkungsvoller zu gestalten. Auch dieser Button ist per MIDI CC steuerbar.</p>
            <h4>Cast-Funktion (Audio streamen)</h4>
            <p>Klicke auf das <strong>Cast-Icon (oben rechts)</strong>, um die Audioausgabe an ein Google Cast-fähiges Gerät (z.B. Chromecast, Google Home Lautsprecher) zu streamen. Die Audio-Chunks werden an einen Webservice gesendet, der einen kontinuierlichen Stream für das Cast-Gerät bereitstellt. Wenn die Verbindung aktiv ist, wird das Icon blau. Klicke erneut, um das Casting zu beenden. Während des Castings wird der Ton lokal stummgeschaltet.</p>
            <p><strong>Wichtig:</strong> Die Audioausgabe an das Cast-Gerät startet erst, nachdem die ersten Audio-Daten an den Webservice gesendet wurden. Dies kann zu einer kurzen Verzögerung führen. Die Qualität und Stabilität des Audio-Castings hängt von deiner Netzwerkverbindung, dem Cast-Gerät und dem Webservice (aktuell unter <code>https://chunkstreamer.onrender.com</code>) ab. Bei Problemen ("Failed to fetch"), prüfe die Browser-Konsole auf CORS- oder Mixed-Content-Fehler.</p>
            <p>Wenn eine neue Cast-Sitzung gestartet wird, wird der Server angewiesen, alle alten Audiodaten zu verwerfen und einen neuen Stream zu beginnen. Dies stellt sicher, dass du immer die aktuelle Live-Generierung hörst.</p>
          </section>
          <section>
            <h3>Konfiguration Teilen (via Link)</h3>
            <p>Klicke auf den <strong>Share-Button</strong> unten rechts. Dadurch wird ein spezieller Link in deine Zwischenablage kopiert.</p>
            <p>Wenn jemand diesen Link öffnet, startet Steppa's BeatLab automatisch mit genau deiner aktuellen Konfiguration (Prompts, Gewichtungen, und alle erweiterten Einstellungen) <strong>und beginnt mit der Wiedergabe</strong>.</p>
            <p>Ideal, um deine Kreationen schnell und einfach zu präsentieren oder gemeinsam an Klanglandschaften zu arbeiten!</p>
          </section>
          <section>
            <h3>Erweiterte Einstellungen (Zahnrad-Icon)</h3>
            <p>Klicke auf das Zahnrad-Icon (⚙️) in der oberen rechten Leiste, um die erweiterten Einstellungen ein- oder auszublenden.</p>
            <ul>
              <li><strong>Temperature:</strong> Regelt die Zufälligkeit. Höher = mehr Variation.</li>
            </ul>
            <p>Andere Parameter wie Guidance, BPM, Density, Brightness, Mute-Optionen und der Music Generation Mode können über geteilte Links oder geladene Presets beeinflusst werden, sind aber nicht direkt in der UI einstellbar.</p>
          </section>
           <section>
            <h3>MIDI-Steuerung & Learn-Funktion</h3>
            <p>Wähle dein MIDI-Gerät aus dem Dropdown-Menü oben links aus. Wenn kein Gerät erscheint, stelle sicher, dass es verbunden ist und dein Browser Zugriff auf MIDI-Geräte hat. Sobald ein Gerät ausgewählt ist, erscheint der <strong>"Learn MIDI"</strong>-Button.</p>
            <h4>MIDI Learn Modus:</h4>
            <ol>
              <li>Klicke auf <strong>"Learn MIDI"</strong>. Der Button-Text ändert sich zu "Learning... (Cancel)" und eine Anleitung erscheint über den Tracks.</li>
              <li>Klicke nun auf das Element, das du per MIDI steuern möchtest:
                <ul>
                  <li>Einen <strong>Track-Slider</strong> (die farbige Leiste unter einem Prompt).</li>
                  <li>Den <strong>"Drop!"-Button</strong>.</li>
                  <li>Den <strong>Play/Pause-Button</strong>.</li>
                </ul>
                Das ausgewählte Element wird golden hervorgehoben.
              </li>
              <li>Bewege nun einen Regler/Fader oder drücke einen Button/Pad an deinem MIDI-Gerät.</li>
              <li>Die App weist diese MIDI CC-Nummer dem ausgewählten Element zu. Eine Bestätigung (Toast-Nachricht) erscheint.</li>
              <li>Du kannst direkt weitere Zuweisungen vornehmen, indem du erneut ein Element und dann einen MIDI-Controller auswählst/bewegst.</li>
              <li>Klicke erneut auf "Learning... (Cancel)" oder drücke die <strong>Escape</strong>-Taste, um den Lernmodus zu beenden. (Escape bricht bei ausgewählten Ziel erst die Zielauswahl ab, dann den Modus).</li>
            </ol>
            <h4>Funktionsweise der zugewiesenen MIDI-Controller:</h4>
            <ul>
              <li><strong>Track-Slider:</strong> Der MIDI CC-Wert (0-127) steuert die Gewichtung des Tracks (skaliert auf 0-2).</li>
              <li><strong>Drop!-Button / Play/Pause-Button:</strong> Ein MIDI CC-Wert <strong>größer als 64</strong> löst die Aktion aus (simuliert einen Knopfdruck).</li>
            </ul>
            <h4>MIDI-Zuweisungen löschen:</h4>
            <ul>
              <li>Alle Zuweisungen werden automatisch gelöscht, wenn du ein anderes MIDI-Gerät auswählst oder die Auswahl aufhebst.</li>
              <li>Um alle Zuweisungen manuell zu löschen: Drücke und halte den <strong>"Learn MIDI"</strong>-Button (wenn der Lernmodus <em>nicht</em> aktiv ist) für ca. 2 Sekunden, bis eine Bestätigung erscheint.</li>
            </ul>
            <p><strong>Wichtig:</strong> Während eine "Drop!"-Sequenz aktiv ist, ist die MIDI-Steuerung (und das Ändern von Einstellungen) temporär deaktiviert.</p>
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

@customElement('welcome-overlay')
class WelcomeOverlay extends LitElement {
  @query('#first-prompt-input') private firstPromptInput!: HTMLInputElement;

  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(10, 10, 10, 0.85); 
      z-index: 2000; 
      backdrop-filter: blur(8px); 
      -webkit-backdrop-filter: blur(8px);
      opacity: 0;
      animation: fadeInOverlay 0.5s 0.2s ease-out forwards;
    }
    @keyframes fadeInOverlay {
      to { opacity: 1; }
    }
    .panel {
      background-color: #2C2C2C; 
      padding: 30px 40px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      color: #e0e0e0;
      width: clamp(320px, 90vw, 600px);
      text-align: center;
      border: 1px solid #444;
      transform: scale(0.95);
      opacity: 0;
      animation: popInPanel 0.5s 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }
    @keyframes popInPanel {
      to { transform: scale(1); opacity: 1; }
    }

    .app-icon {
      font-size: 3em; 
      margin-bottom: 15px;
    }

    h1 {
      font-size: 2em; 
      font-weight: 600;
      color: #fff;
      margin-top: 0;
      margin-bottom: 10px;
    }
    .tagline {
      font-size: 1.1em;
      color: #bbb;
      margin-bottom: 25px;
    }
    .features {
      list-style: none;
      padding: 0;
      margin: 0 0 25px 0;
      text-align: left;
    }
    .features li {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
      font-size: 1em;
      color: #ccc;
    }
    .features li svg {
      width: 22px;
      height: 22px;
      margin-right: 12px;
      fill: #A0A0A0; 
      flex-shrink: 0;
    }

    .prompt-section {
      margin-bottom: 25px;
    }
    .prompt-section label {
      display: block;
      font-size: 1em;
      color: #ddd;
      margin-bottom: 10px;
      font-weight: 500;
    }
    #first-prompt-input {
      width: 100%;
      padding: 12px 15px;
      border-radius: 8px;
      border: 1px solid #555;
      background-color: #1e1e1e;
      color: #fff;
      font-size: 1em;
      box-sizing: border-box;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    #first-prompt-input:focus {
      outline: none;
      border-color: #7e57c2;
      box-shadow: 0 0 0 3px rgba(126, 87, 194, 0.3);
    }
    .start-button {
      background: linear-gradient(45deg, #7e57c2, #AB47BC);
      color: white;
      border: none;
      padding: 12px 25px;
      border-radius: 8px;
      font-size: 1.1em;
      font-weight: 500;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      display: inline-block;
      box-shadow: 0 4px 15px rgba(126, 87, 194, 0.3);
    }
    .start-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(126, 87, 194, 0.4);
    }
    .start-button:active {
      transform: translateY(0px);
      box-shadow: 0 2px 10px rgba(126, 87, 194, 0.3);
    }
  `;

  private _handleSubmit() {
    const firstPromptText = this.firstPromptInput.value;
    this.dispatchEvent(new CustomEvent('welcome-complete', {
      detail: { firstPromptText },
      bubbles: true,
      composed: true
    }));
  }

  private _handleKeyPress(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this._handleSubmit();
    }
  }

  override render() {
    return html`
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div class="app-icon">🎵</div>
        <h1 id="welcome-title">Willkommen bei Steppa's BeatLab!</h1>
        <p class="tagline">Gestalte deinen Sound mit KI & MIDI</p>
        
        <ul class="features">
          <li>${svg`<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`} <span><strong>Beschreibe deine Musik:</strong> Tippe Stimmungen, Genres oder Instrumente ein.</span></li>
          <li>${svg`<svg viewBox="0 0 24 24"><path d="M4 18h16v-2H4v2zm0-5h16v-2H4v2zm0-5h16V6H4v2z"/></svg>`} <span><strong>Mische deine Tracks:</strong> Passe die Slider an, um deine Sound-Ebenen zu mischen.</span></li>
          <li>${svg`<svg viewBox="0 0 24 24"><path d="M20 18H4V6h16v12zM6 8h2v2H6V8zm0 4h2v2H6v-2zm0 4h2v2H6v-2zm10-8h2v2h-2V8zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2zM10 8h2v2h-2V8zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg>`} <span><strong>MIDI-Steuerung:</strong> Verbinde deinen Controller für interaktives Mixen.</span></li>
          <li>${svg`<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>`} <span><strong>Drop & Share:</strong> Nutze den "Drop!"-Effekt und teile deine Kreationen.</span></li>
        </ul>

        <div class="prompt-section">
          <label for="first-prompt-input">Starte mit deinem ersten Sound:</label>
          <input 
            type="text" 
            id="first-prompt-input" 
            value="Ambient Chill with a Lo-Fi Beat" 
            @keydown=${this._handleKeyPress}
            placeholder="z.B. Epic Movie Score, Funky Bassline, Relaxing Waves...">
        </div>
        <button class="start-button" @click=${this._handleSubmit}>Let's Go!</button>
      </div>
    `;
  }
}

// Default styles
const defaultStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    height: 100vh; 
    width: 100vw; 
    background-color: #181818; 
    color: #e0e0e0; 
    font-family: 'Google Sans', sans-serif;
    box-sizing: border-box;
    overflow: hidden; 
    position: relative; 
  }
`;

/** Main application component for Prompt DJ. */
@customElement('prompt-dj')
class PromptDj extends LitElement {
  // --- Constants & Configuration ---
  private readonly SAMPLE_RATE = 48000;
  private readonly BUFFER_AHEAD_TIME_SECONDS = 1.5; 
  private readonly CAST_STREAM_URL = 'https://chunkstreamer.onrender.com/stream';
  private readonly CAST_UPLOAD_URL = 'https://chunkstreamer.onrender.com/upload-chunk';
  private readonly CAST_RESET_URL = 'https://chunkstreamer.onrender.com/reset-stream';
  private readonly CAST_NAMESPACE = 'urn:x-cast:com.google.cast.media';


  // --- LitElement State & Properties ---
  @state() private prompts: Map<string, Prompt> = new Map();
  @state() private playbackState: PlaybackState = 'stopped';
  @state() private filteredPrompts: Set<string> = new Set(); 
  @state() private availableMidiInputs: MidiInputInfo[] = [];
  @state() private selectedMidiInputId: string | null = null;
  @state() private isMidiLearning = false;
  @state() private midiLearnTarget: string | null = null; 
  @state() private midiCcMap: Map<number, string> = new Map(); 
  @state() private showSettings = false;
  @state() private showHelp = false;
  @state() private showWelcome = false; 
  @state() private isDropEffectActive = false; 

  @state() private temperature = 1.1; 
  
  @state() private castContext: cast.framework.CastContext | null = null;
  @state() private castSession: cast.framework.CastSession | null = null;
  @state() private remotePlayer: cast.framework.RemotePlayer | null = null;
  @state() private remotePlayerController: cast.framework.RemotePlayerController | null = null;
  @state() private isCastingAvailable = false;
  @state() private isCastingActive = false;


  // --- Internal Class Members ---
  private nextPromptIdCounter = 0;
  private activeSession: LiveMusicSession | null = null;
  private audioContext: AudioContext;
  private outputGainNode: GainNode;
  private nextAudioChunkStartTime = 0;
  private midiController: MidiController;
  private sessionSetupComplete = false; 
  private boundHandleCastApiReady: (event: CustomEvent<{available: boolean, errorInfo?: any}>) => void;


  // --- Queries for DOM Elements ---
  @query('play-pause-button') private playPauseButtonEl!: PlayPauseButton;
  @query('drop-button') private dropButtonEl!: DropButton;
  @query('toast-message') private toastMessageEl!: ToastMessage;
  @query('#prompts-container') private promptsContainerEl!: HTMLElement;
  @query('#settings-panel') private settingsPanelEl!: HTMLElement; 
  @query('help-guide-panel') private helpGuidePanelEl!: HelpGuidePanel;
  @query('welcome-overlay') private welcomeOverlayEl!: WelcomeOverlay;
  @query('#midi-device-select') private midiDeviceSelectEl!: HTMLSelectElement;
  @query('#learn-midi-button') private learnMidiButtonEl!: HTMLButtonElement;


  constructor() {
    super();
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: this.SAMPLE_RATE,
    });
    this.outputGainNode = this.audioContext.createGain();
    this.outputGainNode.connect(this.audioContext.destination);
    this.midiController = new MidiController();
    this.initializeMidi();
    this.loadInitialPrompts(); 

    this.handleSessionMessage = this.handleSessionMessage.bind(this);
    this.handleSessionError = this.handleSessionError.bind(this);
    this.handleSessionClose = this.handleSessionClose.bind(this);
    this.boundHandleCastApiReady = this.handleCastApiReady.bind(this) as EventListener;
    document.addEventListener('cast-api-ready', this.boundHandleCastApiReady);
    
    if (!localStorage.getItem('beatLabWelcomeShown')) {
        this.showWelcome = true;
    }
  }

  // --- Lifecycle Methods ---
  override connectedCallback() {
    super.connectedCallback();
    this.audioContext.resume(); 
    document.addEventListener('keydown', this.handleGlobalKeyDown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.activeSession) {
      this.activeSession.stop();
      this.activeSession = null; 
    }
    if (this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.midiController.destroy();
    this.castContext?.removeEventListener(
        cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
        this.handleCastSessionStateChange
    );
    this.castContext?.removeEventListener(
        cast.framework.CastContextEventType.CAST_STATE_CHANGED,
        this.handleCastStateChange
    );
    this.remotePlayerController?.removeEventListener(
        cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
        this.handleRemotePlayerConnectChange
    );
    document.removeEventListener('keydown', this.handleGlobalKeyDown);
    document.removeEventListener('cast-api-ready', this.boundHandleCastApiReady);
  }

  override firstUpdated() {
    this.loadStateFromURL(); 
    this.updateMidiLearnButtonState(); 
  }

  // --- Initialization & Setup ---

  private loadInitialPrompts() {
    const storedPrompts = localStorage.getItem('prompts');
    if (storedPrompts) {
      try {
        const parsedPromptsArray: PresetPrompt[] = JSON.parse(storedPrompts);
        const newPrompts = new Map<string, Prompt>();
        parsedPromptsArray.forEach(p => {
          const id = this.generateNewPromptId();
          newPrompts.set(id, { ...p, promptId: id, color: this.getUnusedRandomColor(Array.from(newPrompts.values()).map(pr => pr.color)) });
        });
        this.prompts = newPrompts;
        this.recalculateNextPromptIdCounter();

      } catch (e) {
        console.error('Failed to parse stored prompts, using defaults:', e);
        this.createDefaultPrompts();
      }
    } else {
      this.createDefaultPrompts();
    }
  }

  private createDefaultPrompts(firstPromptText?: string) {
    const defaultTexts = ["Ambient Chill with a Lo-Fi Beat", "Energetic Drum and Bass", "Mysterious Sci-Fi Score", "Funky Jazz Groove"];
    if (firstPromptText && !defaultTexts.includes(firstPromptText)) {
        defaultTexts.unshift(firstPromptText); 
    } else if (firstPromptText) {
        const index = defaultTexts.indexOf(firstPromptText);
        if (index > -1) {
            defaultTexts.splice(index, 1);
            defaultTexts.unshift(firstPromptText);
        }
    }

    const numToCreate = Math.min(2, defaultTexts.length); 
    const newPrompts = new Map<string, Prompt>();
    for (let i = 0; i < numToCreate; i++) {
      const id = this.generateNewPromptId();
      newPrompts.set(id, {
        promptId: id,
        text: defaultTexts[i],
        weight: i === 0 ? 1.0 : 0.0, 
        color: this.getUnusedRandomColor(Array.from(newPrompts.values()).map(p => p.color)),
      });
    }
    this.prompts = newPrompts;
    this.recalculateNextPromptIdCounter();
    this.savePromptsToLocalStorage();
  }


  private async connectToSession(): Promise<boolean> {
    if (this.activeSession && this.sessionSetupComplete) {
      console.log('Session already active and setup.');
      return true;
    }
    if (this.playbackState === 'loading') { 
        console.warn('Connection attempt skipped, already loading.');
        return false;
    }

    this.playbackState = 'loading';
    this.sessionSetupComplete = false; 

    try {
      console.log(`Attempting to connect to Lyria session with model: ${activeModelName}`);
      this.activeSession = await ai.live.music.connect({
        model: activeModelName,
        callbacks: {
          onmessage: this.handleSessionMessage,
          onerror: this.handleSessionError,
          onclose: this.handleSessionClose,
        }
      });
      console.log('Successfully called ai.live.music.connect. Waiting for setupComplete...');
      return true;
    } catch (error: any) {
      console.error('Failed to connect to Lyria session:', error);
      this.toastMessageEl.show(`Error connecting: ${error.message || 'Unknown error'}`);
      this.playbackState = 'stopped';
      this.activeSession = null;
      return false;
    }
  }

  // --- Session Callbacks ---
  private async handleSessionMessage(message: LiveMusicServerMessage) {
    if (message.setupComplete) {
        console.log('Lyria session setup complete.');
        this.sessionSetupComplete = true;
        // If playbackState is still loading, it means we were waiting for this.
        // We will transition to 'playing' once the first audio chunk is processed.
    }

    if (message.filteredPrompt) {
      const filteredText = message.filteredPrompt.text;
      const reason = message.filteredPrompt.filteredReason || 'Content policy';
      this.filteredPrompts = new Set([...this.filteredPrompts, filteredText]);
      
      let foundPromptId: string | null = null;
      for (const p of this.prompts.values()){
        if (p.text === filteredText) {
          foundPromptId = p.promptId;
          break;
        }
      }
      if (foundPromptId) {
        const promptController = this.shadowRoot?.querySelector(`prompt-controller[promptid="${foundPromptId}"]`);
        if (promptController) {
          promptController.setAttribute('filtered', 'true');
        }
      }
      this.toastMessageEl.show(`Prompt: "${filteredText}" was filtered. Reason: ${reason}. It will be ignored.`);
      this.requestUpdate('filteredPrompts');
      this.sendPromptsToSession(); 
    }

    const audioChunkData = message.serverContent?.audioChunks?.[0]?.data;
    if (audioChunkData) {
      if (this.playbackState === 'paused' || this.playbackState === 'stopped') {
        return; 
      }
      
      try {
        const rawAudioData = decode(audioChunkData); 
        const audioBuffer = await localDecodeAudioData(
          rawAudioData,
          this.audioContext,
          this.SAMPLE_RATE,
          2 
        );

        if (this.isCastingActive && this.castSession) {
            this.sendChunkToCastServer(rawAudioData);
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputGainNode);

        const currentTime = this.audioContext.currentTime;
        
        if (this.nextAudioChunkStartTime === 0) { 
          this.nextAudioChunkStartTime = currentTime + this.BUFFER_AHEAD_TIME_SECONDS;
        }

        if (this.nextAudioChunkStartTime < currentTime) {
          console.warn('Audio buffer underrun! Playback might be choppy.');
          this.playbackState = 'loading'; // Show loading indicator
          this.nextAudioChunkStartTime = currentTime + this.BUFFER_AHEAD_TIME_SECONDS; // Try to re-buffer
        }
        
        source.start(this.nextAudioChunkStartTime);
        this.nextAudioChunkStartTime += audioBuffer.duration;

        // Transition to playing state if we were loading and setup is complete
        if (this.playbackState === 'loading' && this.sessionSetupComplete) {
            this.playbackState = 'playing';
        }

      } catch (error) {
        console.error('Error processing audio chunk:', error);
        this.toastMessageEl.show('Error processing audio.');
         if (this.playbackState === 'loading') { // If stuck in loading due to error
            this.playbackState = 'paused'; // or 'stopped'
        }
      }
    }
  }

  private handleSessionError(error: any) { 
    console.error('LiveMusicSession Error:', error);
    this.toastMessageEl.show(`Session error: ${error.message || 'Connection lost'}. Please try again.`);
    this.playbackState = 'stopped';
    this.activeSession = null;
    this.sessionSetupComplete = false;
    this.nextAudioChunkStartTime = 0; // Reset for next attempt
  }

  private handleSessionClose(event: any) { 
    console.log('LiveMusicSession Closed:', event);
    if (this.playbackState !== 'stopped') { 
      // this.toastMessageEl.show('Music session closed.');
    }
    this.playbackState = 'stopped';
    this.activeSession = null;
    this.sessionSetupComplete = false;
    this.nextAudioChunkStartTime = 0; // Reset for next attempt
  }


  // --- Audio Playback Control ---
  private async togglePlayPause() {
    if (this.isDropEffectActive) {
        this.toastMessageEl.show("Please wait for the 'Drop!' effect to finish.", 2000);
        return;
    }

    if (this.playbackState === 'playing') {
      this.pauseAudioStream();
    } else {
      await this.startAudioStream();
    }
  }

  private async startAudioStream() {
    if (!(await this.connectToSession())) {
      return;
    }
    
    if (this.activeSession) {
        try {
            console.log('Calling session.play()');
            // Important: Ensure nextAudioChunkStartTime is reset if resuming from a full stop/pause
            // This is now handled in pauseAudioStream and stopAudioStreamResetSession
            if (this.playbackState === 'paused' || this.playbackState === 'stopped') {
                this.nextAudioChunkStartTime = 0; 
            }

            this.activeSession.play(); 
            this.playbackState = 'loading'; 
            this.audioContext.resume();
            this.outputGainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            this.outputGainNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.2);

            await this.sendPromptsToSession();
            await this.updatePlaybackParameters();

        } catch (error: any) {
            console.error("Error trying to play session:", error);
            this.toastMessageEl.show(`Playback error: ${error.message}`);
            this.playbackState = 'stopped';
            this.nextAudioChunkStartTime = 0; // Reset on error
        }
    } else {
        console.error("Cannot start audio stream: session not active.");
        this.toastMessageEl.show("Error: Music session not available.");
        this.playbackState = 'stopped';
        this.nextAudioChunkStartTime = 0; // Reset
    }
  }

  private pauseAudioStream() {
    if (this.activeSession) {
      console.log('Calling session.pause()');
      this.activeSession.pause(); 
    }
    this.outputGainNode.gain.setValueAtTime(this.outputGainNode.gain.value, this.audioContext.currentTime);
    this.outputGainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.2);
    
    this.playbackState = 'paused';
    // DO NOT reset nextAudioChunkStartTime here if we want smooth resume.
    // However, if resume causes issues, resetting it might be necessary, but then buffering re-occurs.
    // For now, let's test NOT resetting it on pause, but DO reset on full STOP.
  }

  private stopAudioStreamResetSession() {
    if (this.activeSession) {
      console.log('Calling session.stop() and resetting context.');
      this.activeSession.stop(); 
      this.activeSession.resetContext(); 
    }
    this.outputGainNode.gain.setValueAtTime(0, this.audioContext.currentTime); 
    this.nextAudioChunkStartTime = 0; // Crucial reset for next play
    this.playbackState = 'stopped';
    this.activeSession = null; 
    this.sessionSetupComplete = false; 
    this.requestUpdate();
  }


  // --- Prompt Management ---
  private generateNewPromptId(): string {
    return `prompt-${this.nextPromptIdCounter++}`;
  }
   private recalculateNextPromptIdCounter() {
    let maxId = -1;
    this.prompts.forEach(p => {
        const idNum = parseInt(p.promptId.replace('prompt-', ''), 10);
        if (!isNaN(idNum) && idNum > maxId) {
            maxId = idNum;
        }
    });
    this.nextPromptIdCounter = maxId + 1;
  }


  private handleAddPromptClick() {
    if (this.isDropEffectActive) return;
    if (this.prompts.size >= 7) {
      this.toastMessageEl.show('Maximum of 7 prompts reached.', 3000);
      return;
    }
    const newId = this.generateNewPromptId();
    const newPrompt: Prompt = {
      promptId: newId,
      text: 'New Prompt',
      weight: 0.0, 
      color: this.getUnusedRandomColor(Array.from(this.prompts.values()).map(p => p.color)),
    };
    this.prompts = new Map(this.prompts).set(newId, newPrompt);
    this.savePromptsToLocalStorage();
    this.sendPromptsToSession(); 
    
    this.updateComplete.then(() => {
        const promptElement = this.shadowRoot?.querySelector(`prompt-controller[promptid="${newId}"]`) as PromptControllerElement | null;
        if (promptElement) {
            promptElement.enterEditModeAfterCreation?.(); 
            if (this.promptsContainerEl) { // Scroll into view if container exists
              promptElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    });
  }

  private handlePromptChanged(e: CustomEvent<Partial<Prompt> & {promptId: string}>) {
    if (this.isDropEffectActive) return;
    const { promptId, ...changes } = e.detail;
    const existingPrompt = this.prompts.get(promptId);
    if (existingPrompt) {
      const updatedPrompt = { ...existingPrompt, ...changes };
      this.prompts = new Map(this.prompts).set(promptId, updatedPrompt);
      
      if (changes.text && this.filteredPrompts.has(existingPrompt.text) && existingPrompt.text !== changes.text) {
          this.filteredPrompts.delete(existingPrompt.text);
          const promptController = this.shadowRoot?.querySelector(`prompt-controller[promptid="${promptId}"]`);
          if (promptController) {
            promptController.removeAttribute('filtered');
          }
          this.requestUpdate('filteredPrompts');
      }

      this.savePromptsToLocalStorage();
      this.sendPromptsToSession();
    }
  }

  private handlePromptRemoved(e: CustomEvent<string>) {
    if (this.isDropEffectActive) return;
    const promptIdToRemove = e.detail;
    const promptToRemove = this.prompts.get(promptIdToRemove);
    if (promptToRemove) {
      this.prompts.delete(promptIdToRemove);
      this.prompts = new Map(this.prompts); 
      if (this.filteredPrompts.has(promptToRemove.text)) {
          this.filteredPrompts.delete(promptToRemove.text);
          this.requestUpdate('filteredPrompts');
      }
      this.midiCcMap.forEach((targetId, cc) => {
        if (targetId === promptIdToRemove) {
          this.midiCcMap.delete(cc);
        }
      });

      this.savePromptsToLocalStorage();
      this.sendPromptsToSession();
    }
  }

  private async sendPromptsToSession() {
    if (!this.activeSession || !this.sessionSetupComplete) {
      return;
    }
    const promptsToSendForAPI = Array.from(this.prompts.values())
      .filter(p => !this.filteredPrompts.has(p.text) && p.weight > 0.001) 
      .map(p => ({ text: p.text, weight: p.weight }));

    try {
      await this.activeSession.setWeightedPrompts({ weightedPrompts: promptsToSendForAPI });
    } catch (error: any) {
      console.error('Error setting weighted prompts:', error);
      this.toastMessageEl.show(`Error updating prompts: ${error.message}`);
    }
  }

  private getUnusedRandomColor(usedColors: string[]): string {
    const availableColors = TRACK_COLORS.filter(c => !usedColors.includes(c));
    if (availableColors.length === 0) {
      return TRACK_COLORS[Math.floor(Math.random() * TRACK_COLORS.length)];
    }
    return availableColors[Math.floor(Math.random() * availableColors.length)];
  }

  private savePromptsToLocalStorage() {
    const promptsToStore: PresetPrompt[] = Array.from(this.prompts.values()).map(p => ({
      text: p.text,
      weight: p.weight,
    }));
    localStorage.setItem('prompts', JSON.stringify(promptsToStore));
  }


  // --- Playback Parameters & Settings ---
  private handleTemperatureChange(e: CustomEvent<number>) {
    if (this.isDropEffectActive) {
        (e.target as ParameterSlider).value = this.temperature; 
        return;
    }
    this.temperature = e.detail;
    this.updatePlaybackParameters();
  }

  private async updatePlaybackParameters() {
    if (!this.activeSession || !this.sessionSetupComplete) return;

    const currentConfigForAPI: AppLiveMusicGenerationConfig = {
      temperature: this.temperature,
    };
    
    const sharedConfig = this.getSharedConfigFromState(); 
    Object.assign(currentConfigForAPI, sharedConfig);

    const definedConfig = Object.fromEntries(
        Object.entries(currentConfigForAPI).filter(([, value]) => value !== undefined)
    ) as LiveMusicGenerationConfig;


    if (Object.keys(definedConfig).length > 0) {
      try {
        await this.activeSession.setMusicGenerationConfig({ musicGenerationConfig: definedConfig });
      } catch (error: any) {
        console.error('Error setting music generation config:', error);
        this.toastMessageEl.show(`Error updating parameters: ${error.message}`);
      }
    }
  }

  private toggleSettingsPanel() {
    this.showSettings = !this.showSettings;
  }
  private toggleHelpPanel() {
    this.showHelp = !this.showHelp;
  }
  private handleWelcomeComplete(e: CustomEvent<{firstPromptText: string}>) {
    this.showWelcome = false;
    localStorage.setItem('beatLabWelcomeShown', 'true');
    this.createDefaultPrompts(e.detail.firstPromptText);
  }


  // --- "Drop!" Effect ---
  private async handleDropClick() {
    if (!this.activeSession || !this.sessionSetupComplete || this.playbackState !== 'playing') {
      this.toastMessageEl.show("Please start playback first to use 'Drop!'", 3000);
      return;
    }
    if (this.isDropEffectActive) {
        this.toastMessageEl.show("'Drop!' effect already in progress.", 2000);
        return;
    }

    this.isDropEffectActive = true;
    this.toastMessageEl.show("Drop incoming!", 1500);
    try {
      if (this.activeSession.resetContext) { 
        this.activeSession.resetContext(); 
      } else {
        console.warn("session.resetContext() not available. 'Drop' effect might not work as intended.");
        const originalTemp = this.temperature;
        this.temperature = Math.min(originalTemp + 0.5, 2.0); 
        await this.updatePlaybackParameters();
        setTimeout(async () => {
            this.temperature = originalTemp;
            await this.updatePlaybackParameters();
        }, 2000); 
      }

    } catch (error) {
      console.error("Error during 'Drop!' effect:", error);
      this.toastMessageEl.show("Error triggering 'Drop!' effect.", 3000);
    } finally {
        setTimeout(() => {
            this.isDropEffectActive = false;
        }, 4000); 
    }
  }


  // --- MIDI Control ---
  private initializeMidi() {
    this.midiController.addEventListener('midi-inputs-changed', (e: Event) => {
      const customEvent = e as CustomEvent<{inputs: MidiInputInfo[]}>;
      this.availableMidiInputs = customEvent.detail.inputs;
      if (this.availableMidiInputs.length > 0 && !this.selectedMidiInputId) {
      } else if (this.availableMidiInputs.length === 0 && this.selectedMidiInputId) {
        this.clearMidiMappingsAndSelection(); 
      }
    });

    this.midiController.addEventListener('midi-cc-received', (e: Event) => {
      if (this.isDropEffectActive) return; 
      const customEvent = e as CustomEvent<{ccNumber: number, value: number, rawValue: number}>;
      const { ccNumber, value, rawValue } = customEvent.detail;
      const targetId = this.midiCcMap.get(ccNumber);

      if (targetId) {
        if (targetId === MIDI_LEARN_TARGET_DROP_BUTTON) {
          if (rawValue > 64) this.handleDropClick(); 
        } else if (targetId === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON) {
          if (rawValue > 64) this.togglePlayPause();
        } else { 
          const prompt = this.prompts.get(targetId);
          if (prompt) {
            const newWeight = Math.max(0, Math.min(2, value));
            if (prompt.weight !== newWeight) {
                prompt.weight = newWeight;
                this.prompts = new Map(this.prompts); 
                this.sendPromptsToSession();
                this.savePromptsToLocalStorage(); 
            }
          }
        }
      }
    });
    this.midiController.initialize(); 
  }

  private async handleMidiDeviceChange(e: Event) {
    const newId = (e.target as HTMLSelectElement).value;
    if (newId === this.selectedMidiInputId) return;

    this.clearMidiMappingsAndSelection(false); 
    this.selectedMidiInputId = newId;
    
    if (newId) {
        const success = await this.midiController.requestMidiAccessAndListDevices();
        if (success) {
            this.midiController.selectMidiInput(newId);
            this.toastMessageEl.show(`MIDI device ${this.availableMidiInputs.find(i => i.id === newId)?.name || newId} selected.`, 2000);
        } else if (this.midiController.isMidiSupported()){
            this.toastMessageEl.show('MIDI access denied or no devices found. Please check browser permissions.', 4000);
            this.selectedMidiInputId = null; 
        } else {
            this.toastMessageEl.show('Web MIDI API not supported in this browser.', 4000);
            this.selectedMidiInputId = null;
        }
    } else {
        this.midiController.selectMidiInput(''); 
        this.toastMessageEl.show('MIDI input deselected.', 2000);
    }
    this.isMidiLearning = false; 
    this.midiLearnTarget = null;
    this.updateMidiLearnButtonState();
    this.loadMidiMappings(); 
  }

  private toggleMidiLearnMode() {
    if (!this.selectedMidiInputId && !this.isMidiLearning) {
        this.toastMessageEl.show('Please select a MIDI input device first.', 3000);
        return;
    }
    this.isMidiLearning = !this.isMidiLearning;
    if (!this.isMidiLearning) { 
      this.midiLearnTarget = null; 
      this.saveMidiMappings();
    }
    this.updateMidiLearnButtonState();
  }
  
  private handleMidiLearnTargetClick(targetType: 'prompt' | 'dropbutton' | 'playpausebutton', id: string, e: Event) {
    // Check if the event originated from the prompt-controller's main div specifically for MIDI learn
    // This logic might need refinement if clicks on internal elements of prompt-controller should not trigger this.
    // The `prompt-interaction` event from `prompt-controller` is intended for this.
    // For global buttons, the click handler is directly on them.

    if (!this.isMidiLearning) return;
    e.stopPropagation(); // Prevent event from bubbling further if handled here

    if (this.midiLearnTarget === id) { 
      this.midiLearnTarget = null; 
    } else {
      this.midiLearnTarget = id;
      const targetName = 
        id === MIDI_LEARN_TARGET_DROP_BUTTON ? "Drop! Button" :
        id === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON ? "Play/Pause Button" :
        `Prompt "${this.prompts.get(id)?.text}"`;
      this.toastMessageEl.show(`Selected ${targetName}. Move a MIDI control.`, 0); // duration 0, no auto hide
    }
  }
  
  private assignMidiCcToLearnTarget(ccNumber: number) {
    if (!this.isMidiLearning || !this.midiLearnTarget) return;

    this.midiCcMap.delete(ccNumber);
    this.midiCcMap.forEach((target, cc) => {
        if (target === this.midiLearnTarget) {
            this.midiCcMap.delete(cc);
        }
    });
    
    this.midiCcMap.set(ccNumber, this.midiLearnTarget);
    const targetName = this.midiLearnTarget === MIDI_LEARN_TARGET_DROP_BUTTON ? "Drop! Button" 
                     : this.midiLearnTarget === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON ? "Play/Pause Button"
                     : `Prompt "${this.prompts.get(this.midiLearnTarget)?.text}"`;
    this.toastMessageEl.show(`MIDI CC ${ccNumber} assigned to ${targetName}.`, 2500);
    
    this.midiLearnTarget = null; 
    this.saveMidiMappings(); 
  }

  private updateMidiLearnButtonState() {
    if (!this.learnMidiButtonEl) return;
    if (this.isMidiLearning) {
      this.learnMidiButtonEl.textContent = 'Learning... (Cancel)';
      this.learnMidiButtonEl.classList.add('learning');
    } else {
      this.learnMidiButtonEl.textContent = 'Learn MIDI';
      this.learnMidiButtonEl.classList.remove('learning');
      if (!this.selectedMidiInputId) {
          this.learnMidiButtonEl.setAttribute('disabled', 'true');
      } else {
          this.learnMidiButtonEl.removeAttribute('disabled');
      }
    }
  }

  private handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (this.isMidiLearning) {
      if (e.key === 'Escape') {
        if (this.midiLearnTarget) {
          this.midiLearnTarget = null; 
          this.toastMessageEl.show('MIDI learn target deselected. Choose another or Esc to exit.', 2000);
        } else {
          this.isMidiLearning = false; 
          this.updateMidiLearnButtonState();
          this.toastMessageEl.show('MIDI learn mode exited.', 2000);
          this.saveMidiMappings();
        }
      }
    } else {
        // Global spacebar for play/pause if no input field is focused
        if (e.key === ' ' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) ) {
            e.preventDefault();
            this.togglePlayPause();
        }
    }
  }

  private learnButtonPressTimer: number | null = null;
  private readonly LONG_PRESS_DURATION = 1500; 

  private handleMidiLearnButtonMouseDown() {
    if (this.isMidiLearning || !this.selectedMidiInputId) return; 
    this.learnButtonPressTimer = window.setTimeout(this.boundHandleMidiLearnClearLongPress, this.LONG_PRESS_DURATION);
  }
  private handleMidiLearnButtonMouseUpOrLeave() {
    if (this.learnButtonPressTimer) {
      clearTimeout(this.learnButtonPressTimer);
      this.learnButtonPressTimer = null;
    }
  }
  
  private boundHandleMidiLearnClearLongPress = () => {
    this.clearMidiMappingsAndSelection(true, true); 
    this.toastMessageEl.show('All MIDI assignments for this device cleared.', 3000);
  }


  private saveMidiMappings() {
    if (!this.selectedMidiInputId) return;
    const mappingsToSave = JSON.stringify(Array.from(this.midiCcMap.entries()));
    localStorage.setItem(`midiMappings_${this.selectedMidiInputId}`, mappingsToSave);
  }

  private loadMidiMappings() {
    this.midiCcMap.clear();
    if (!this.selectedMidiInputId) {
      this.requestUpdate('midiCcMap'); 
      return;
    }
    const savedMappings = localStorage.getItem(`midiMappings_${this.selectedMidiInputId}`);
    if (savedMappings) {
      try {
        const parsedMappings: [number, string][] = JSON.parse(savedMappings);
        this.midiCcMap = new Map(parsedMappings);
      } catch (e) {
        console.error('Failed to parse MIDI mappings:', e);
        this.midiCcMap.clear();
      }
    }
    this.requestUpdate('midiCcMap');
  }

  private clearMidiMappingsAndSelection(alsoDeselectDevice = false, showToast = false) {
    this.midiCcMap.clear();
    if (this.selectedMidiInputId) {
        localStorage.removeItem(`midiMappings_${this.selectedMidiInputId}`);
        if (showToast && this.midiDeviceSelectEl) {
            const selectedOption = this.midiDeviceSelectEl.options[this.midiDeviceSelectEl.selectedIndex];
            const deviceName = selectedOption ? selectedOption.text : 'the selected device';
            if (deviceName !== '-- Select MIDI Device --') {
                 this.toastMessageEl.show(`MIDI assignments cleared for ${deviceName}.`, 2500);
            }
        }
    }
    if (alsoDeselectDevice) {
        this.midiController.selectMidiInput('');
        this.selectedMidiInputId = null;
        if (this.midiDeviceSelectEl) this.midiDeviceSelectEl.value = '';
    }
    this.isMidiLearning = false;
    this.midiLearnTarget = null;
    this.updateMidiLearnButtonState();
    this.requestUpdate('midiCcMap');
  }


  // --- Sharing & Presets ---
  private getSharedConfigFromState(): Partial<AppLiveMusicGenerationConfig> {
    const config: Partial<AppLiveMusicGenerationConfig> = {
        temperature: this.temperature,
    };
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('bpm')) config.bpm = parseFloat(urlParams.get('bpm')!);
    if (urlParams.has('guidance')) config.guidance = parseFloat(urlParams.get('guidance')!);
    if (urlParams.has('density')) config.density = parseFloat(urlParams.get('density')!);
    if (urlParams.has('brightness')) config.brightness = parseFloat(urlParams.get('brightness')!);
    if (urlParams.has('mute_bass')) config.mute_bass = urlParams.get('mute_bass') === 'true';
    if (urlParams.has('mute_drums')) config.mute_drums = urlParams.get('mute_drums') === 'true';
    if (urlParams.has('only_bass_and_drums')) config.only_bass_and_drums = urlParams.get('only_bass_and_drums') === 'true';
    if (urlParams.has('music_generation_mode')) config.music_generation_mode = urlParams.get('music_generation_mode') as 'QUALITY' | 'DIVERSITY';

    return config;
  }


  private generateShareLink() {
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();

    const promptData = Array.from(this.prompts.values()).map(p => ({t: p.text, w: p.weight.toFixed(2)}));
    params.append('p', JSON.stringify(promptData));

    params.append('temp', this.temperature.toFixed(2));
    
    const sharedConfig = this.getSharedConfigFromState(); 
    if (sharedConfig.guidance !== undefined) params.append('guid', sharedConfig.guidance.toFixed(2));
    if (sharedConfig.bpm !== undefined) params.append('bpm', sharedConfig.bpm.toFixed(0));
    if (sharedConfig.density !== undefined) params.append('den', sharedConfig.density.toFixed(2));
    if (sharedConfig.brightness !== undefined) params.append('bri', sharedConfig.brightness.toFixed(2));
    if (sharedConfig.mute_bass) params.append('mb', '1');
    if (sharedConfig.mute_drums) params.append('md', '1');
    if (sharedConfig.only_bass_and_drums) params.append('obd', '1');
    if (sharedConfig.music_generation_mode) params.append('mgm', sharedConfig.music_generation_mode);


    params.append('v', CURRENT_PRESET_VERSION); 
    params.append('play', '1'); 

    try {
      navigator.clipboard.writeText(`${base}?${params.toString()}`);
      this.toastMessageEl.show('Link copied to clipboard! Playback will start automatically.', 3000);
    } catch (err) {
      console.error('Failed to copy link:', err);
      this.toastMessageEl.show('Failed to copy link. See console.', 3000);
    }
  }

  private loadStateFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('v')) return; 

    if (params.has('p')) {
      try {
        const promptData: {t: string, w: string}[] = JSON.parse(params.get('p')!);
        const newPrompts = new Map<string, Prompt>();
        promptData.forEach(pd => {
          const id = this.generateNewPromptId();
          newPrompts.set(id, {
            promptId: id,
            text: pd.t,
            weight: parseFloat(pd.w),
            color: this.getUnusedRandomColor(Array.from(newPrompts.values()).map(p => p.color))
          });
        });
        this.prompts = newPrompts;
        this.savePromptsToLocalStorage(); 
      } catch (e) { console.error('Error parsing prompts from URL', e); }
    }

    if (params.has('temp')) this.temperature = parseFloat(params.get('temp')!);
    
    if (params.has('play') && params.get('play') === '1') {
      setTimeout(() => this.startAudioStream(), 500);
    }
  }


  private handleSavePreset() {
    const presetPrompts: PresetPrompt[] = Array.from(this.prompts.values()).map(p => ({
        text: p.text,
        weight: p.weight
    }));
    
    const preset: Preset = {
        version: CURRENT_PRESET_VERSION,
        prompts: presetPrompts,
        temperature: this.temperature,
        ...this.getSharedConfigFromState()
    };

    const filename = `BeatLabPreset_${new Date().toISOString().slice(0,10)}.json`;
    const blob = new Blob([JSON.stringify(preset, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toastMessageEl.show('Preset saved!', 2000);
  }

  private handleLoadPresetClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            try {
                const content = await file.text();
                const preset: Preset = JSON.parse(content);
                this.applyPreset(preset);
            } catch (err: any) {
                console.error("Error loading or parsing preset:", err);
                this.toastMessageEl.show(`Error loading preset: ${err.message}`, 4000);
            }
        }
    };
    input.click();
  }

  private applyPreset(preset: Preset) {
    if (!preset.version || preset.version !== CURRENT_PRESET_VERSION) {
        this.toastMessageEl.show(`Preset version mismatch. Expected ${CURRENT_PRESET_VERSION}, got ${preset.version}. Applying best effort.`, 4000);
    }

    const newPrompts = new Map<string, Prompt>();
    preset.prompts.forEach(pp => {
        const id = this.generateNewPromptId();
        newPrompts.set(id, {
            promptId: id,
            text: pp.text,
            weight: pp.weight,
            color: this.getUnusedRandomColor(Array.from(newPrompts.values()).map(p => p.color))
        });
    });
    this.prompts = newPrompts;
    this.recalculateNextPromptIdCounter(); 

    this.temperature = preset.temperature ?? this.temperature;
    
    this.savePromptsToLocalStorage(); 
    this.updatePlaybackParameters(); 
    this.toastMessageEl.show('Preset loaded!', 2000);
    if (this.playbackState === 'playing' || this.playbackState === 'loading') {
        this.stopAudioStreamResetSession(); // Reset fully to apply new config
        this.nextAudioChunkStartTime = 0; // Ensure buffering logic resets
        setTimeout(() => this.startAudioStream(), 200);
    }
  }

  // --- Cast Functionality ---
  private handleCastApiReady(event: CustomEvent<{available: boolean, errorInfo?: any}>) {
    const { available, errorInfo } = event.detail;
    if (available) {
        console.log('Cast API is available. Initializing CastContext.');
        try {
            // Ensure 'cast' and 'chrome' are available in the global scope here
            if (typeof cast === 'undefined' || typeof chrome === 'undefined' || !chrome.cast || !cast.framework) {
                console.error("Critical: 'cast' or 'chrome' global not defined even after __onGCastApiAvailable(true).");
                this.isCastingAvailable = false;
                this.toastMessageEl?.show('Cast initialization failed (globals missing).', 5000);
                return;
            }

            this.castContext = cast.framework.CastContext.getInstance();
            const castOptions: cast.framework.CastOptions = {
                receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
                autoJoinPolicy: chrome.cast.AutoJoinPolicy.TAB_AND_ORIGIN_SCOPED
            };
            this.castContext.setOptions(castOptions);
            
            this.isCastingAvailable = this.castContext.getCastState() !== cast.framework.CastState.NO_DEVICES_AVAILABLE;

            this.castContext.addEventListener(
                cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
                this.handleCastSessionStateChange.bind(this)
            );
            this.castContext.addEventListener(
                cast.framework.CastContextEventType.CAST_STATE_CHANGED,
                this.handleCastStateChange.bind(this)
            );

            this.remotePlayer = new cast.framework.RemotePlayer();
            this.remotePlayerController = new cast.framework.RemotePlayerController(this.remotePlayer);
            this.remotePlayerController.addEventListener(
                cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
                this.handleRemotePlayerConnectChange.bind(this)
            );
            console.log('CastContext initialized successfully.');

        } catch (e: any) {
            console.error("Error initializing CastContext even after API ready signal:", e);
            this.toastMessageEl?.show(`Error initializing Cast: ${e.message || 'Unknown error'}. Try refreshing.`, 5000);
            this.isCastingAvailable = false;
        }
    } else {
        console.error("Cast API not available.", errorInfo);
        this.isCastingAvailable = false;
        if (this.toastMessageEl) {
          this.toastMessageEl.show(`Google Cast API not available. ${errorInfo?.description || errorInfo?.errorType || ''}`, 3000);
        }
    }
  }
  
  private handleCastSessionStateChange(event: cast.framework.SessionStateEventData) {
    console.log('Cast session state changed:', event.sessionState);
    this.castSession = this.castContext?.getCurrentSession() || null;
    this.isCastingActive = this.castSession?.getSessionState() === cast.framework.SessionState.SESSION_STARTED;
    this.updateMuteState();
    if (this.isCastingActive && this.castSession) {
        this.toastMessageEl.show(`Casting to ${this.castSession.getCastDevice().friendlyName}`, 3000);
        this.resetCastStream(); 
        this.castMediaSession = null; // Reset media session on new cast session
        // If playback is active, start casting it.
        if (this.playbackState === 'playing' || this.playbackState === 'loading') {
            this.startCastPlaybackIfNeeded();
        }
    } else if (event.sessionState === cast.framework.SessionState.SESSION_ENDED) {
        this.toastMessageEl.show('Casting ended.', 2000);
        this.castMediaSession = null;
    } else if (event.sessionState === cast.framework.SessionState.SESSION_START_FAILED) {
        this.toastMessageEl.show('Casting failed to start.', 3000);
        this.castMediaSession = null;
    }
  }

  private handleCastStateChange(event: cast.framework.CastStateEventData) {
    console.log('Cast state changed:', event.castState);
    this.isCastingAvailable = event.castState !== cast.framework.CastState.NO_DEVICES_AVAILABLE;
  }
  
  private handleRemotePlayerConnectChange() {
    // This event can be used for more detailed player state, but basic connection is handled by session state.
  }

  private async toggleCast() {
    if (!this.castContext) {
        this.toastMessageEl.show('Cast not initialized. Try refreshing.', 3000);
        console.error('CastContext not initialized, cannot toggle cast.');
        return;
    }

    if (this.isCastingActive && this.castSession) {
        try {
            await this.castSession.endSession(true);
            // State updates will be handled by SESSION_STATE_CHANGED event
        } catch (error: any) {
            console.error('Error ending cast session:', error);
            this.toastMessageEl.show(`Error stopping cast: ${error.description || error.code || 'Unknown'}`, 3000);
        }
    } else if (this.isCastingAvailable) {
        try {
            await this.castContext.requestSession();
            // State updates will be handled by SESSION_STATE_CHANGED event
        } catch (error: any) {
            console.error('Error requesting cast session:', error);
            this.toastMessageEl.show(`Cast connect error: ${error.description || error.code || 'Unknown error'}`, 3000);
        }
    } else {
        this.toastMessageEl.show('No Cast devices available.', 3000);
    }
  }

  private updateMuteState() {
    if (this.isCastingActive) {
        this.outputGainNode.gain.value = 0; 
    } else {
        this.outputGainNode.gain.value = 1; 
    }
  }

  private async resetCastStream() {
    try {
        const response = await fetch(this.CAST_RESET_URL, { method: 'POST' });
        if (!response.ok) {
            console.error('Failed to reset cast stream on server:', response.statusText);
        } else {
            console.log('Cast stream reset on server.');
        }
    } catch (error) {
        console.error('Error calling reset-stream endpoint:', error);
    }
  }

  private async sendChunkToCastServer(chunk: Uint8Array) {
    if (!this.isCastingActive) return;
    try {
        let uploadUrl = this.CAST_UPLOAD_URL;
        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: chunk
        });
        if (!response.ok) {
            console.warn('Failed to upload chunk to cast server:', response.status, await response.text());
        }
        this.startCastPlaybackIfNeeded();
    } catch (error) {
        console.error('Error sending chunk to cast server:', error);
        this.toastMessageEl.show('Casting connection error.', 2000);
    }
  }
  
  private castMediaSession: chrome.cast.media.Media | null = null;

  private startCastPlaybackIfNeeded() {
    if (!this.castSession) {
        // console.log('Cast: No active session, cannot start playback.');
        return; 
    }

    // Check if media is already playing or buffering on the Cast device
    if (this.castMediaSession && typeof this.castMediaSession.getPlayerState === 'function') {
        const playerState = this.castMediaSession.getPlayerState();
        if (playerState === chrome.cast.media.PlayerState.PLAYING || 
            playerState === chrome.cast.media.PlayerState.BUFFERING) {
            // console.log('Cast media already playing or buffering.');
            return; 
        }
    }
    // If we reach here, it means either:
    // 1. No active media session (this.castMediaSession is null, or getPlayerState is not a function)
    // OR
    // 2. Media session exists but is not PLAYING or BUFFERING (e.g., IDLE, PAUSED).
    // In these cases, we should (re)load the media.

    console.log('Cast: Attempting to load media for playback.');
    const mediaInfo = new chrome.cast.media.MediaInfo(this.CAST_STREAM_URL, 'audio/wav');
    mediaInfo.streamType = chrome.cast.media.StreamType.LIVE;
    mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = "Steppa's BeatLab Live Stream";
    mediaInfo.duration = null; // For live streams

    const loadRequest = new chrome.cast.media.LoadRequest(mediaInfo);
    loadRequest.autoplay = true;

    this.castSession.loadMedia(loadRequest)
        .then(() => {
            console.log('Media loaded and playing on Cast device.');
            this.castMediaSession = this.castSession!.getMediaSession();
            if (this.castMediaSession) {
              this.castMediaSession.addUpdateListener((isAlive) => {
                  if (!isAlive) {
                      this.castMediaSession = null; // Media session ended
                      console.log('Cast media session ended (isAlive is false).');
                  }
              });
            }
        })
        .catch((error: any) => { // error is of type chrome.cast.Error
            console.error('Error loading media on Cast device:', error);
            this.toastMessageEl.show(`Cast playback error: ${error.description || error.code || 'Unknown'}`, 3000);
            this.castMediaSession = null;
        });
  }


  // --- Render Methods ---
  override render() {
    const backgroundOrbs = TRACK_COLORS.slice(0, this.prompts.size).map((color, i) => {
        const promptArray = Array.from(this.prompts.values());
        const weight = promptArray[i] ? promptArray[i].weight : 0;
        const size = 5 + weight * 30; 
        const opacity = 0.05 + weight * 0.15; 
        const x = (i / Math.max(1, this.prompts.size -1 )) * 80 + 10; 
        const y = 30 + Math.random() * 20 - 10; 

        return {
            left: `${x}%`,
            top: `${y}%`,
            width: `${size}vmax`,
            height: `${size}vmax`,
            backgroundColor: ORB_COLORS[i % ORB_COLORS.length], 
            opacity: opacity.toString(),
            transform: `translate(-50%, -50%) rotate(${Math.random() * 360}deg)`,
        };
    });

    return html`
      <div id="background-gradient">
        ${backgroundOrbs.map(style => html`<div class="bg-orb" style=${unsafeCSS(`left:${style.left}; top:${style.top}; width:${style.width}; height:${style.height}; background-color:${style.backgroundColor}; opacity:${style.opacity}; transform:${style.transform}`)}></div>`)}
      </div>

      ${this.showWelcome ? html`<welcome-overlay @welcome-complete=${this.handleWelcomeComplete}></welcome-overlay>` : ''}
      <help-guide-panel .isOpen=${this.showHelp} @close-help=${() => this.showHelp = false}></help-guide-panel>

      <header class="app-header">
        <div class="logo-title">
          <span class="logo-icon">🎵</span>
          <h1>Steppa's BeatLab</h1>
        </div>
        <div class="global-controls">
            <div class="midi-selector-group">
                <label for="midi-device-select">MIDI:</label>
                <select id="midi-device-select" @change=${this.handleMidiDeviceChange} .value=${this.selectedMidiInputId || ''}>
                <option value="">-- Select MIDI Device --</option>
                ${this.availableMidiInputs.map(input => html`<option value=${input.id}>${input.name}</option>`)}
                </select>
                <button 
                    id="learn-midi-button"
                    @click=${this.toggleMidiLearnMode}
                    @mousedown=${this.handleMidiLearnButtonMouseDown}
                    @mouseup=${this.handleMidiLearnButtonMouseUpOrLeave}
                    @mouseleave=${this.handleMidiLearnButtonMouseUpOrLeave}
                    @touchstart=${this.handleMidiLearnButtonMouseDown}
                    @touchend=${this.handleMidiLearnButtonMouseUpOrLeave}
                    title="Click to toggle learn mode. Long press (1.5s) to clear all assignments for selected device."
                >Learn MIDI</button>
            </div>
            <settings-button title="Settings" @click=${this.toggleSettingsPanel} .isMidiLearnTarget=${false}></settings-button>
            <cast-button title="Cast Audio" @click=${this.toggleCast} .isCastingActive=${this.isCastingActive} ?disabled=${!this.isCastingAvailable}></cast-button>
            <help-button title="Help" @click=${this.toggleHelpPanel}></help-button>
        </div>
      </header>

      <main class="main-content">
        ${this.isMidiLearning ? html`
            <div class="midi-learn-instructions">
                ${this.midiLearnTarget 
                    ? `Listening for MIDI CC on "${this.midiLearnTarget === MIDI_LEARN_TARGET_DROP_BUTTON ? "Drop! Button" : this.midiLearnTarget === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON ? "Play/Pause Button" : this.prompts.get(this.midiLearnTarget)?.text || 'Unknown Target'}"... (Press Esc to deselect)`
                    : "Click a slider, Drop! button, or Play/Pause button, then move a MIDI control. (Press Esc to exit learn mode)"
                }
            </div>
        ` : ''}
        <div id="prompts-container" class=${classMap({'midi-learn-active': this.isMidiLearning})}>
          ${Array.from(this.prompts.values()).map(prompt => html`
            <prompt-controller
              .promptId=${prompt.promptId}
              .text=${prompt.text}
              .weight=${prompt.weight}
              .sliderColor=${prompt.color}
              ?ismidilearntarget=${this.isMidiLearning && this.midiLearnTarget === prompt.promptId}
              ?filtered=${this.filteredPrompts.has(prompt.text)}
              @prompt-changed=${this.handlePromptChanged}
              @prompt-removed=${this.handlePromptRemoved}
              @prompt-interaction=${(e: CustomEvent<{promptId: string}>) => this.handleMidiLearnTargetClick('prompt', e.detail.promptId, e)}
            ></prompt-controller>
          `)}
        </div>
        <add-prompt-button class="add-prompt-main" title="Add new prompt" @click=${this.handleAddPromptClick} ?disabled=${this.isDropEffectActive}></add-prompt-button>
      </main>
      
      <div id="settings-panel" class=${classMap({visible: this.showSettings})}>
        <h3>Settings</h3>
        <parameter-slider
            label="Temperature"
            .value=${this.temperature}
            min="0.1" max="2.0" step="0.05"
            @input=${this.handleTemperatureChange}
            ?disabled=${this.isDropEffectActive}
        ></parameter-slider>
        <div class="preset-buttons">
            <save-preset-button title="Save current state as preset" @click=${this.handleSavePreset}></save-preset-button>
            <load-preset-button title="Load preset from file" @click=${this.handleLoadPresetClick}></load-preset-button>
        </div>
      </div>


      <footer class="footer-controls">
        <play-pause-button 
            .playbackState=${this.playbackState}
            @click=${(e: Event) => { if (this.isMidiLearning) this.handleMidiLearnTargetClick('playpausebutton', MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON, e); else this.togglePlayPause(); }}
            ?ismidilearntarget=${this.isMidiLearning && this.midiLearnTarget === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON}
            title="Play/Pause Music (Spacebar)"
            ?disabled=${this.isDropEffectActive}
            >
        </play-pause-button>
        <div class="spacer"></div>
        <share-button title="Share current configuration" @click=${this.generateShareLink}></share-button>
        <drop-button 
            @click=${(e: Event) => { if (this.isMidiLearning) this.handleMidiLearnTargetClick('dropbutton', MIDI_LEARN_TARGET_DROP_BUTTON, e); else this.handleDropClick(); }}
            ?ismidilearntarget=${this.isMidiLearning && this.midiLearnTarget === MIDI_LEARN_TARGET_DROP_BUTTON}
            title="Trigger 'Drop!' effect"
            ?disabled=${this.isDropEffectActive || this.playbackState !== 'playing'}
            >
        </drop-button>
      </footer>
      <toast-message></toast-message>
    `;
  }

  static override styles = [defaultStyles, css`
    .bg-orb {
        position: absolute;
        border-radius: 50%;
        filter: blur(20px);
        transition: all 1s ease-in-out; 
        opacity: 0; 
    }
    #background-gradient {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -2;
        overflow: hidden;
        background: radial-gradient(ellipse at center, #331a38 0%, #1a101f 70%, #111 100%);
    }
    .app-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 25px;
      background-color: rgba(20, 20, 20, 0.6);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(255,255,255,0.1);
      width: 100%;
      box-sizing: border-box;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 100;
    }
    .logo-title {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .logo-icon {
        font-size: 1.8em;
    }
    .app-header h1 {
      font-size: 1.5em;
      margin: 0;
      color: #fff;
      font-weight: 500;
    }
    .global-controls {
      display: flex;
      align-items: center;
      gap: 10px; 
    }
    .global-controls settings-button,
    .global-controls help-button,
    .global-controls cast-button {
      width: 40px; 
      height: 40px;
    }
    .midi-selector-group {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        background-color: rgba(255,255,255,0.05);
        border-radius: 6px;
    }
    .midi-selector-group label {
        font-size: 0.9em;
        color: #ccc;
    }
    #midi-device-select {
        background-color: #333;
        color: #fff;
        border: 1px solid #555;
        border-radius: 4px;
        padding: 5px 8px;
        font-size: 0.85em;
    }
    #learn-midi-button {
        background-color: #5a5a5a;
        color: #fff;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85em;
        transition: background-color 0.2s;
    }
    #learn-midi-button:hover {
        background-color: #777;
    }
    #learn-midi-button.learning {
        background-color: #FFD700; 
        color: #000;
    }
    #learn-midi-button:disabled {
        background-color: #444;
        cursor: not-allowed;
        opacity: 0.7;
    }


    .main-content {
      display: flex;
      flex-direction: column; 
      align-items: center; 
      justify-content: flex-start; /* Align items to the start (top) */
      flex-grow: 1;
      width: 100%;
      padding: 80px 20px 20px 20px; 
      box-sizing: border-box;
      gap: 20px; /* Increased gap */
      overflow: hidden; 
    }
    #prompts-container {
      display: flex;
      flex-direction: column; /* Stack prompts vertically */
      gap: 15px; 
      padding: 10px; 
      overflow-y: auto; /* Allow vertical scrolling */
      overflow-x: hidden; /* Hide horizontal scrollbar */
      width: clamp(350px, 60vw, 550px); /* Responsive width for vertical layout */
      max-height: calc(100vh - 220px); /* Adjust max-height based on header/footer */
      min-height: 200px; /* Minimum height */
      align-items: stretch; 
      scrollbar-width: thin;
      scrollbar-color: #5200ff #2c2c2c;
      border-radius: 8px;
      background-color: rgba(0,0,0,0.1); 
      position: relative; 
    }
    #prompts-container::-webkit-scrollbar { width: 8px; }
    #prompts-container::-webkit-scrollbar-track { background: #2c2c2c; border-radius: 4px; }
    #prompts-container::-webkit-scrollbar-thumb { background-color: #5200ff; border-radius: 4px;}
    
    .midi-learn-instructions {
        /* Positioned absolutely relative to main-content or a specific wrapper if needed */
        /* For now, let's assume it's just above prompts-container if active */
        text-align: center;
        background-color: rgba(40,40,40,0.9);
        color: #FFD700;
        padding: 8px 15px;
        border-radius: 6px;
        font-size: 0.9em;
        z-index: 5; 
        white-space: nowrap;
        margin-bottom: -5px; /* Pull it closer to the container below */
    }

    prompt-controller {
        width: 100%; /* Prompt controller takes full width of its parent */
        /* Height will be auto based on its content */
        flex-shrink: 0; /* Prevent shrinking if not enough space in scroll */
    }

    .add-prompt-main {
      width: 60px; /* Slightly smaller add button */
      height: 60px;
      margin-top: 0; /* No specific margin here, gap from main-content handles it */
    }
    
    #settings-panel {
      position: fixed;
      bottom: 80px; 
      left: 50%;
      transform: translateX(-50%);
      width: clamp(300px, 60vw, 500px);
      background-color: rgba(30,30,30,0.9);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      color: #e0e0e0;
      padding: 20px;
      border-radius: 12px 12px 0 0; 
      box-shadow: 0 -5px 20px rgba(0,0,0,0.3);
      z-index: 200;
      transition: transform 0.3s ease-in-out, opacity 0.3s ease-in-out;
      transform: translate(-50%, 100%); 
      opacity: 0;
      pointer-events: none;
    }
    #settings-panel.visible {
      transform: translateX(-50%); 
      opacity: 1;
      pointer-events: auto;
    }
    #settings-panel h3 {
        text-align: center;
        margin-top: 0;
        margin-bottom: 15px;
        color: #fff;
        font-weight: 500;
    }
    .preset-buttons {
        display: flex;
        justify-content: center;
        gap: 15px;
        margin-top: 20px;
    }
    .preset-buttons save-preset-button,
    .preset-buttons load-preset-button {
        width: 50px; 
        height: 50px;
    }


    .footer-controls {
      display: flex;
      justify-content: space-between; 
      align-items: center;
      padding: 10px 20px;
      background-color: rgba(20,20,20,0.7);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-top: 1px solid rgba(255,255,255,0.1);
      width: 100%;
      box-sizing: border-box;
      position: fixed;
      bottom: 0;
      left: 0;
      z-index: 100;
    }
    .footer-controls play-pause-button,
    .footer-controls drop-button,
    .footer-controls share-button {
      width: 70px; 
      height: 70px;
    }
    .footer-controls .spacer {
        flex-grow: 1; 
    }
  `];
}


// Create and append the main element
const promptDjApp = document.createElement('prompt-dj');
document.body.appendChild(promptDjApp);

// Define the custom element tag name for type checking if needed elsewhere
declare global {
  interface HTMLElementTagNameMap {
    'prompt-dj': PromptDj;
    // Add other custom elements here if needed for global type checking
  }
}
