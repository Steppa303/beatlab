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
} from '@google/genai';
import {decode, decodeAudioData, throttle} from './utils.js';
import { MidiController } from './midi-controller.js';
import type { Prompt, PlaybackState, AppLiveMusicGenerationConfig, PresetPrompt, Preset } from './types.js';
import { TRACK_COLORS, ORB_COLORS, CURRENT_PRESET_VERSION, MIDI_LEARN_TARGET_DROP_BUTTON, MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON } from './constants.js';

// Import components
import './components/weight-slider.js'; // Ensure WeightSlider is registered
import { WeightSlider } from './components/weight-slider.js'; // Import for type checking
import './components/parameter-slider.js'; // Ensure ParameterSlider is registered
import { ParameterSlider } from './components/parameter-slider.js'; // Import for type checking
import './components/toggle-switch.js'; // Ensure ToggleSwitch is registered
import { ToggleSwitch } from './components/toggle-switch.js'; // Import for type checking
import { IconButton } from './components/icon-button.js'; // Base class, ensure it's available
import './components/play-pause-button.js'; // Ensure PlayPauseButton is registered
import { PlayPauseButton } from './components/play-pause-button.js'; // Import for type checking
import './components/add-prompt-button.js'; // Ensure AddPromptButton is registered
import { AddPromptButton } from './components/add-prompt-button.js'; // Import for type checking
import './prompt-controller.js'; // Import PromptController to ensure it's registered

// The following components are still defined in this file but slated for extraction:
// SettingsButton, HelpButton, ShareButton, DropButton, SavePresetButton, LoadPresetButton,
// ToastMessage, HelpGuidePanel, WelcomeOverlay.

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

    interface CastContext {
      setOptions(options: any): void;
      addEventListener(type: CastContextEventType, handler: (event: SessionStateEventData | CastStateEventData) => void): void;
      removeEventListener(type: CastContextEventType, handler: (event: SessionStateEventData | CastStateEventData) => void): void;
      getCurrentSession(): CastSession | null;
      getCastState(): CastState;
      requestSession(): Promise<void | string>;
    }
    interface CastSession {
      getCastDevice(): { friendlyName: string };
      getSessionId(): string;
      getSessionState(): SessionState;
      addMessageListener(namespace: string, listener: (namespace: string, message: string) => void): void;
      removeMessageListener(namespace: string, listener: (namespace: string, message: string) => void): void;
      sendMessage(namespace: string, message: any): Promise<void | number>;
      endSession(stopCasting: boolean): Promise<void | string>;
      loadMedia(request: chrome.cast.media.LoadRequest): Promise<void | string>;
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
    __onGCastApiAvailable?: (available: boolean) => void;
  }
}


// Use API_KEY as per guidelines
const ai = new GoogleGenAI({
  apiKey: process.env.API_KEY,
});
const model = 'lyria-realtime-exp';


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

  // Standard Cast Icon (Material Design Inspired)
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
            <p>Ziehe den farbigen Slider unter jedem Prompt, um dessen Einfluss (Gewichtung) auf die generierte Musik anzupassen. Werte reichen von 0 (kein Einfluss) bis 2 (starker Einfluss). Die aktuelle Ratio wird rechts neben dem Prompt-Text angezeigt. Dies ist auch per MIDI CC steuerbar (siehe MIDI-Sektion).</p>
            <h4>Musik starten/pausieren</h4>
            <p>Verwende den großen <strong>Play/Pause-Button (▶️/⏸️ unten links)</strong>. Beim ersten Start oder nach einer Unterbrechung kann es einen Moment dauern (Lade-Symbol), bis die Musik beginnt. Auch dieser Button ist per MIDI CC steuerbar.</p>
            <h4>"Drop!"-Effekt</h4>
            <p>Klicke den <strong>Drop!-Button ( unten rechts)</strong> für einen dynamischen Effekt! Die Musik baut Spannung auf und entlädt sich dann. Der Stil des Drops (z.B. intensiv, sanft, groovig) passt sich nun automatisch an die aktuell gespielte Musik an, um Übergänge natürlicher und wirkungsvoller zu gestalten. Auch dieser Button ist per MIDI CC steuerbar.</p>
            <h4>Cast-Funktion (Audio streamen)</h4>
            <p>Klicke auf das <strong>Cast-Icon (oben rechts)</strong>, um die Audioausgabe an ein Google Cast-fähiges Gerät (z.B. Chromecast, Google Home Lautsprecher) zu streamen. Die Audio-Chunks werden an einen Webservice gesendet, der einen kontinuierlichen Stream für das Cast-Gerät bereitstellt. Wenn die Verbindung aktiv ist, wird das Icon blau. Klicke erneut, um das Casting zu beenden. Während des Castings wird der Ton lokal stummgeschaltet.</p>
            <p><strong>Wichtig:</strong> Die Audioausgabe an das Cast-Gerät startet erst, nachdem die ersten Audio-Daten an den Webservice gesendet wurden. Dies kann zu einer kurzen Verzögerung führen. Die Qualität und Stabilität des Audio-Castings hängt von deiner Netzwerkverbindung, dem Cast-Gerät und dem Webservice (aktuell unter <code>https://chunkstreamer.onrender.com</code>) ab. Bei Problemen ("Failed to fetch"), prüfe die Browser-Konsole auf CORS- oder Mixed-Content-Fehler.</p>
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
              <!-- Removed other advanced settings from help for now, as they are not UI-editable -->
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
      background-color: rgba(10, 10, 10, 0.85); /* Slightly more opaque dark background */
      z-index: 2000; /* Highest z-index */
      backdrop-filter: blur(8px); /* Blur background for focus */
      -webkit-backdrop-filter: blur(8px);
      opacity: 0;
      animation: fadeInOverlay 0.5s 0.2s ease-out forwards;
    }
    @keyframes fadeInOverlay {
      to { opacity: 1; }
    }
    .panel {
      background-color: #2C2C2C; /* Darker panel background */
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
      font-size: 3em; /* Larger icon */
      margin-bottom: 15px;
    }

    h1 {
      font-size: 2em; /* Slightly larger */
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
      fill: #A0A0A0; /* Icon color */
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
          <li>${svg`<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>`} <span><strong>Starte den Drop!:</strong> Entfessle dynamische musikalische Momente.</span></li>
        </ul>

        <div class="prompt-section">
          <label for="first-prompt-input">Beginnen wir mit deinem ersten Sound. Welche Stimmung fühlst du gerade?</label>
          <input type="text" id="first-prompt-input" placeholder="z.B. Deep House Beat, Cinematic Strings, Lo-fi Hip Hop" @keypress=${this._handleKeyPress}>
        </div>
        
        <button class="start-button" @click=${this._handleSubmit}>Musik erstellen!</button>
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

    .midi-learn-button {
      background-color: #4CAF50; /* Green */
      color: white;
      border: none;
      padding: 0.8em 1.2em;
      border-radius: 6px;
      font-size: 2vmin;
      cursor: pointer;
      transition: background-color 0.2s, box-shadow 0.2s;
      min-width: 120px;
      text-align: center;
    }
    .midi-learn-button:hover {
      background-color: #45a049;
      box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);
    }
    .midi-learn-button.learning {
      background-color: #f44336; /* Red when learning */
    }
    .midi-learn-button.learning:hover {
      background-color: #d32f2f;
      box-shadow: 0 0 8px rgba(244, 67, 54, 0.5);
    }
    .midi-learn-button:disabled {
      background-color: #222;
      color: #777;
      cursor: not-allowed;
      box-shadow: none;
    }


    .header-actions { /* Now only contains settings button */
      display: flex;
      align-items: center;
      gap: 1.5vmin; 
    }
    .header-actions > settings-button,
    .header-actions > cast-button {
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

    .learn-mode-message-bar {
      width: 100%;
      background-color: rgba(255, 215, 0, 0.8); /* Gold, slightly transparent */
      color: #111;
      padding: 1vmin 2vmin;
      text-align: center;
      font-weight: 500;
      font-size: 2.2vmin;
      z-index: 90;
      position: relative; /* Ensure it's part of the flow */
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      /* Add transition for appearing/disappearing if needed */
      opacity: 0;
      max-height: 0;
      overflow: hidden;
      transition: opacity 0.3s ease-out, max-height 0.3s ease-out, padding 0.3s ease-out;
    }
    .learn-mode-message-bar.visible {
      opacity: 1;
      max-height: 100px; /* Ample height */
      padding: 1vmin 2vmin;
    }


    .content-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-grow: 1;
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
      /* overflow: hidden; */ /* Removed for diagnostics and to prevent clipping */
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
      cursor: pointer; /* Indicate clickable for MIDI learn */
    }
    
    .floating-add-button { /* Styles for the add-prompt-button when it's below prompts */
      display: block; 
      width: 21vmin;
      height: 21vmin;
      max-width: 150px;
      max-height: 150px;
      margin: 3vmin auto 1vmin auto; 
      flex-shrink: 0; 
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
      cursor: pointer; /* For MIDI learn */
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
      cursor: pointer; /* For MIDI learn */
    }

    .utility-button-cluster > share-button,
    .utility-button-cluster > help-button {
      width: 7vmin; 
      height: 7vmin;
      max-width: 50px; 
      max-height: 50px;
    }

    .main-ui-content { /* Wrapper for content that might be hidden by welcome screen */
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
    }
    .main-ui-content.hidden-by-welcome {
      /* visibility: hidden; /* Or apply blur/opacity effects */
      /* pointer-events: none; /* Not strictly needed if overlay is on top */
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
  private isConnecting = false;

  @query('toast-message') private toastMessage!: ToastMessage;
  @query('#presetFileInput') private fileInputForPreset!: HTMLInputElement;
  @query('#play-pause-main-button') private playPauseMainButton!: PlayPauseButton | null;
  @query('#drop-main-button') private dropMainButton!: DropButton | null;
  @query('cast-button') private castButtonElement!: CastButton | null;


  @state() private availableMidiInputs: Array<{id: string, name: string}> = [];
  @state() private selectedMidiInputId: string | null = null;
  @state() private showAdvancedSettings = false;
  @state() private temperature = 1.0; // Default, Min: 0, Max: 2, Step: 0.1
  @state() private showHelpPanel = false;
  @state() private globalSystemInstruction = "You are an AI music DJ creating live, evolving soundscapes based on user prompts. Strive for musicality and coherence.";
  
  // Advanced settings states (kept for preset/share functionality, not UI editable)
  @state() private guidance = 4.0; 
  @state() private bpm = 120; 
  @state() private density = 0.5; 
  @state() private brightness = 0.5; 
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

  // MIDI Learn states
  @state() private isMidiLearnActive = false;
  @state() private midiLearnTargetId: string | null = null; // Can be promptId or special ID for global controls
  @state() private midiCcToTargetMap = new Map<number, string>(); // ccNumber -> targetId
  @state() private learnModeMessage = '';
  private learnButtonLongPressTimeout: number | null = null;

  // Welcome Screen state
  @state() private showWelcomeScreen = false;

  // Cast SDK states
  @state() private isCastApiInitialized = false;
  @state() private isCastingActive = false;
  @state() private castApiState: cast.framework.CastState | null = null;
  private remotePlayer: cast.framework.RemotePlayer | null = null;
  private remotePlayerController: cast.framework.RemotePlayerController | null = null;
  @state() private isCastSessionReadyForMedia = false; 
  @state() private hasCastMediaBeenLoadedForCurrentSession = false; 
  @state() private isFirstChunkForCurrentCastSession = true; 
  
  // Web service casting
  private readonly audioStreamWebServiceUrl: string;
  private readonly audioChunkUploadUrl: string;
  private isLocalOutputMutedForCasting = false;

  // Define Drop Flavors
  private readonly DROP_FLAVORS = [
    {
      name: "energetic",
      keywords: ["techno", "house", "edm", "bass drop", "upbeat", "dance", "party", "rave", "fast", "hard", "driving", "power", "beat", "kick", "drum and bass", "trance", "dubstep"],
      prompt: "Intense build-up with rising synths and fast drum rolls, a short, sharp silence, followed by a powerful, deep bass drop and re-energized beat."
    },
    {
      name: "smooth",
      keywords: ["ambient", "chill", "soundscape", "pads", "ethereal", "relaxing", "calm", "soft", "gentle", "flowing", "atmospheric", "drone", "meditation", "space"],
      prompt: "A smooth, swelling crescendo of atmospheric pads and evolving textures, a gentle pause, then a warm, resonant sub-bass re-entry with a subtle rhythmic pulse."
    },
    {
      name: "groovy",
      keywords: ["funk", "funky", "soul", "disco", "groove", "rhythmic", "swing", "syncopated", "jam", "hip hop", "motown", "breakbeat"],
      prompt: "Funky filter sweeps and a building drum fill, a syncopated break, then a tight, punchy bassline and drum groove drop back in with extra percussive flair."
    },
    {
      name: "dramatic",
      keywords: ["epic", "orchestral", "cinematic", "tension", "soundtrack", "suspense", "grand", "sweeping", "classical", "strings", "choir", "film score"],
      prompt: "Dramatic orchestral swells and rising tension with powerful staccato hits, a moment of suspenseful silence, then a grand, impactful return of the main theme with added layers."
    }
  ];


  constructor() {
    super();
    this.prompts = new Map(); // No initial prompts by default
    this.nextPromptId = 0;
    this.outputNode.connect(this.audioContext.destination);
    this.midiController = new MidiController();
    this.handleMidiCcReceived = this.handleMidiCcReceived.bind(this);
    this.handleMidiInputsChanged = this.handleMidiInputsChanged.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.firstChunkReceivedTimestamp = 0;
    this.addEventListener('welcome-complete', this.handleWelcomeComplete as EventListener);

    // Bind Cast API callback to `this` context and assign to window
    const boundHandleCastApiAvailable = this.handleCastApiAvailable.bind(this);
    window['__onGCastApiAvailable'] = (isAvailable: boolean) => {
      boundHandleCastApiAvailable(isAvailable);
    };

    // Initialize Web Service URLs with fixed HTTPS
    this.audioChunkUploadUrl = 'https://chunkstreamer.onrender.com/upload-chunk';
    this.audioStreamWebServiceUrl = 'https://chunkstreamer.onrender.com/stream';
  }

  override async firstUpdated() {
    // Attempt to load shared state first, this will also handle auto-play if 'share' param exists
    const sharedStateLoaded = await this._loadStateFromUrl(); 

    const welcomeCompleted = localStorage.getItem('beatLabWelcomeCompleted') === 'true';

    if (!welcomeCompleted && !sharedStateLoaded && this.prompts.size === 0) { 
      this.showWelcomeScreen = true;
      this.prompts.clear(); 
      this.nextPromptId = 0;
    } else {
      this.showWelcomeScreen = false;
      if (!welcomeCompleted && (sharedStateLoaded || this.prompts.size > 0)) { 
        localStorage.setItem('beatLabWelcomeCompleted', 'true');
      }
      if (this.prompts.size === 0) { // Welcome was completed, or returning user, but no prompts (e.g. from URL)
        this.createInitialPrompt("Synthwave Groove"); 
      }
    }
    
    this.midiController.initialize(); 
    this.isMidiSupported = this.midiController.isMidiSupported();
    
    this.midiController.addEventListener('midi-cc-received', this.handleMidiCcReceived as EventListener);
    this.midiController.addEventListener('midi-inputs-changed', this.handleMidiInputsChanged as EventListener);
    this.addEventListener('prompt-interaction', this.handlePromptInteractionForLearn as EventListener);
    window.addEventListener('keydown', this.handleKeyDown);

    // Connect to session only if not showing welcome screen and not already playing due to share link
    if (!this.showWelcomeScreen && this.playbackState !== 'loading' && this.playbackState !== 'playing') {
      await this.connectToSession();
    }
  }

  override disconnectedCallback(): void {
      super.disconnectedCallback();
      if (this.dropTimeoutId) {
        clearTimeout(this.dropTimeoutId);
        this.dropTimeoutId = null;
      }
      this.midiController.destroy();
      this.midiController.removeEventListener('midi-cc-received', this.handleMidiCcReceived as EventListener);
      this.midiController.removeEventListener('midi-inputs-changed', this.handleMidiInputsChanged as EventListener);
      this.removeEventListener('prompt-interaction', this.handlePromptInteractionForLearn as EventListener);
      window.removeEventListener('keydown', this.handleKeyDown);
      this.removeEventListener('welcome-complete', this.handleWelcomeComplete as EventListener);


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
      if (this.learnButtonLongPressTimeout) {
        clearTimeout(this.learnButtonLongPressTimeout);
      }
      
      // Restore local audio output if muted for casting
      if (this.isLocalOutputMutedForCasting) {
          try {
            this.outputNode.connect(this.audioContext.destination);
          } catch (e) {
            console.warn("Error reconnecting outputNode on disconnect:", e);
          }
          this.isLocalOutputMutedForCasting = false;
          console.log("Local audio output restored on disconnect.");
      }


      // Clean up Cast SDK context listeners
      if (typeof cast !== 'undefined' && cast.framework && cast.framework.CastContext) {
        const castContext = cast.framework.CastContext.getInstance();
        if (castContext) {
            castContext.removeEventListener(
                cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
                this.handleCastSessionStateChange
            );
            castContext.removeEventListener(
                cast.framework.CastContextEventType.CAST_STATE_CHANGED,
                this.handleCastStateChange
            );
        }
      }
      if (this.remotePlayerController) {
          this.remotePlayerController.removeEventListener(
              cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
              this.handleRemotePlayerConnectedChanged
          );
      }
      window['__onGCastApiAvailable'] = undefined; // Clean up global callback
  }

  private handleCastApiAvailable(isAvailable: boolean) {
    this.isCastApiInitialized = false; // Assume not initialized until all checks pass
    let toastShown = false;

    if (isAvailable) {
      if (
        typeof window.cast !== 'undefined' &&
        typeof window.cast.framework !== 'undefined' &&
        typeof window.cast.framework.CastContext !== 'undefined' &&
        typeof window.chrome !== 'undefined' &&
        typeof window.chrome.cast !== 'undefined' &&
        typeof window.chrome.cast.media !== 'undefined' &&
        typeof chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID === 'string'
      ) {
        this.isCastApiInitialized = true; // Optimistically set to true
        try {
          const castContext = cast.framework.CastContext.getInstance();
          castContext.setOptions({
            receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
            autoJoinPolicy: chrome.cast.AutoJoinPolicy.TAB_AND_ORIGIN_SCOPED,
          });

          this.handleCastSessionStateChange = this.handleCastSessionStateChange.bind(this);
          this.handleCastStateChange = this.handleCastStateChange.bind(this);
          this.handleRemotePlayerConnectedChanged = this.handleRemotePlayerConnectedChanged.bind(this);

          castContext.addEventListener(
            cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
            this.handleCastSessionStateChange as (event: cast.framework.SessionStateEventData | cast.framework.CastStateEventData) => void
          );
          castContext.addEventListener(
            cast.framework.CastContextEventType.CAST_STATE_CHANGED,
            this.handleCastStateChange as (event: cast.framework.SessionStateEventData | cast.framework.CastStateEventData) => void
          );

          this.remotePlayer = new cast.framework.RemotePlayer();
          this.remotePlayerController = new cast.framework.RemotePlayerController(this.remotePlayer);
          this.remotePlayerController.addEventListener(
            cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
            this.handleRemotePlayerConnectedChanged
          );

          this.updateCastButtonVisualState(castContext.getCastState());
          console.log('Cast API initialized successfully.');
        } catch (err: any) {
          console.error('CRITICAL CAST INIT ERROR: Failed to initialize CastContext or set options. Cast button will be disabled. Error:', err);
          this.isCastApiInitialized = false; // Set back if specific init fails
          if (this.toastMessage) {
            this.toastMessage.show(`Cast API component init error: ${err.message || 'Unknown error'}`);
            toastShown = true;
          }
        }
      } else {
        // isAvailable was true, but some specific parts are missing
        if (this.toastMessage) {
          let reason = "Google Cast API partially loaded but key components are missing.";
          if (!(typeof window.cast !== 'undefined' && typeof window.cast.framework !== 'undefined' && typeof window.cast.framework.CastContext !== 'undefined')) {
            reason = "Cast Framework (window.cast.framework.CastContext) is missing.";
          } else if (!(typeof window.chrome !== 'undefined' && typeof window.chrome.cast !== 'undefined' && typeof window.chrome.cast.media !== 'undefined')) {
            reason = "Required Chrome Cast API parts (window.chrome.cast.media) are missing.";
          }
          this.toastMessage.show(reason);
          toastShown = true;
        } else {
          console.warn("Cast API status: Partially loaded but key components missing. (Toast not ready to display this).");
        }
      }
    } else {
      // isAvailable is false, SDK reported it's not available
      if (this.toastMessage) {
        this.toastMessage.show("Google Cast SDK reported: API not available. (May be unsupported browser or Cast is disabled/blocked).");
        toastShown = true;
      } else {
        console.warn("Cast API status: SDK reported 'not available'. (Toast not ready to display this).");
      }
    }

    if (!this.isCastApiInitialized && !toastShown && this.toastMessage) {
        this.toastMessage.show("Google Cast API could not be initialized. Please ensure you are using a supported browser (e.g., Chrome).");
    }
    this.requestUpdate(); 
  }

  private async handleCastClick() {
    if (!this.isCastApiInitialized) { 
        this.toastMessage.show("Cast API not available or not initialized. Try refreshing or check browser support.");
        return;
    }
     if (!window.cast || !window.chrome) { 
        this.toastMessage.show("Cast SDK objects (window.cast/chrome) missing.");
        return;
    }
    if (this.isMidiLearnActive) {
        this.toastMessage.show("Cannot cast while MIDI Learn is active.");
        return;
    }
     if (this.isDropActive) {
        this.toastMessage.show("Cannot cast during Drop sequence.");
        return;
    }

    try {
        const castContext = cast.framework.CastContext.getInstance();
        const castSession = castContext.getCurrentSession();

        if (castSession) { 
            await castSession.endSession(true);
            // Toast message will be handled by SESSION_ENDED
        } else { 
            this.toastMessage.show("Searching for Cast devices...");
            await castContext.requestSession();
            // Toast message for successful connection will be handled by SESSION_STARTED
            // and media loading logic in handleCastSessionStateChange
        }
    } catch (error: any) {
        console.error('Cast session request/end failed:', error);
        let message = "Cast operation failed.";
        if (error && error.code === 'cancel') message = "Cast selection cancelled."; 
        else if (error && error.message) message = `Cast error: ${error.message}`;
        else if (typeof error === 'string' && error === 'cancel') message = "Cast selection cancelled.";
        this.toastMessage.show(message);
        if (cast && cast.framework && cast.framework.CastContext.getInstance()){
            this.updateCastButtonVisualState(cast.framework.CastContext.getInstance().getCastState());
        }
    }
  }

  private async sendAudioChunkToWebService(chunkData: Uint8Array) {
    if (!this.isCastingActive) return;

    let currentUploadUrl = this.audioChunkUploadUrl;
    if (this.isFirstChunkForCurrentCastSession) {
      const params = new URLSearchParams({
        sampleRate: this.sampleRate.toString(),
        numChannels: '2', // Matches decodeAudioData
        bitsPerSample: '16' // Matches Int16Array usage in decodeAudioData
      });
      currentUploadUrl = `${this.audioChunkUploadUrl}?${params.toString()}`;
      console.log('Sending first chunk with params to:', currentUploadUrl);
    }

    try {
      const response = await fetch(currentUploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        body: chunkData
      });

      if (response.ok) {
        // console.log('Audio chunk sent successfully to web service.'); // Can be too verbose
        if (this.isFirstChunkForCurrentCastSession) {
          this.isFirstChunkForCurrentCastSession = false; 
        }

        if (this.isCastSessionReadyForMedia && !this.hasCastMediaBeenLoadedForCurrentSession) {
          const castSession = cast.framework.CastContext.getInstance().getCurrentSession();
          if (castSession) {
            this.toastMessage.show(`Audio data sent. Starting stream on ${castSession.getCastDevice().friendlyName}...`, 3000);
            const mediaInfo = new chrome.cast.media.MediaInfo(
              this.audioStreamWebServiceUrl, 
              'audio/wav'
            );
            mediaInfo.streamType = chrome.cast.media.StreamType.LIVE;
            
            const metadata = new chrome.cast.media.GenericMediaMetadata();
            metadata.title = "Steppa's BeatLab Live Mix";
            metadata.artist = "Prompt DJ";
            const iconUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎵</text></svg>');
            metadata.images = [{ url: iconUrl }];
            mediaInfo.metadata = metadata;

            const request = new chrome.cast.media.LoadRequest(mediaInfo);
            request.autoplay = true;

            castSession.loadMedia(request).then(
              () => {
                this.hasCastMediaBeenLoadedForCurrentSession = true;
                this.toastMessage.show(`Streaming to ${castSession.getCastDevice().friendlyName}.`);
                console.log('Successfully started live stream on Cast device from web service.');
              },
              (errorCode: any) => {
                console.error('Failed to load live stream on Cast device:', errorCode);
                this.toastMessage.show(`Error starting Cast stream: ${errorCode?.description || errorCode?.code || 'Unknown error'}`);
                this.hasCastMediaBeenLoadedForCurrentSession = false; 
                this.isFirstChunkForCurrentCastSession = true; 
              }
            );
          }
        }
      } else {
        console.error(`Error sending audio chunk to web service: ${response.status} ${response.statusText}`);
        const responseText = await response.text().catch(() => "Could not get error details.");
        this.toastMessage.show(`Chunk upload error: ${response.statusText} - ${responseText}. Check console for CORS/Network issues.`, 8000);
        if (this.isFirstChunkForCurrentCastSession && !this.hasCastMediaBeenLoadedForCurrentSession) {
            // Allow retry with params
        }
      }
    } catch (error: any) {
      console.error('Network error sending audio chunk:', error);
      this.toastMessage.show(`Network error sending audio chunk: ${error.message || 'Failed to fetch'}. Check console (CORS, Mixed Content, Network).`, 8000);
       if (this.isFirstChunkForCurrentCastSession && !this.hasCastMediaBeenLoadedForCurrentSession) {
            // Allow retry with params
       }
    }
  }

  private handleCastSessionStateChange(eventData: cast.framework.SessionStateEventData | cast.framework.CastStateEventData) {
    const event = eventData as cast.framework.SessionStateEventData; 
    if (!window.cast || !window.chrome || !event.session) {
        if (event.sessionState === cast.framework.SessionState.NO_SESSION) {
             this.isCastingActive = false;
             this.isCastSessionReadyForMedia = false;
             this.hasCastMediaBeenLoadedForCurrentSession = false;
             this.isFirstChunkForCurrentCastSession = true; 
             if (this.isLocalOutputMutedForCasting) {
                try { this.outputNode.connect(this.audioContext.destination); } catch(e) { /* ignore */ }
                this.isLocalOutputMutedForCasting = false;
                console.log("Local audio output restored (no session).");
             }
        }
        return;
    }

    const castSession = event.session;
    let deviceName = "device";
    if (castSession && castSession.getCastDevice() && castSession.getCastDevice().friendlyName) {
        deviceName = castSession.getCastDevice().friendlyName;
    }

    switch (event.sessionState) {
        case cast.framework.SessionState.SESSION_STARTED:
        case cast.framework.SessionState.SESSION_RESUMED:
            this.isCastingActive = true;
            this.isCastSessionReadyForMedia = true;
            this.hasCastMediaBeenLoadedForCurrentSession = false;
            this.isFirstChunkForCurrentCastSession = true; 

            if (this.audioContext.state === 'running' && !this.isLocalOutputMutedForCasting) {
                try {
                    this.outputNode.disconnect(this.audioContext.destination);
                } catch(e) {
                    // Ignore if already disconnected
                }
                this.isLocalOutputMutedForCasting = true;
                console.log("Local audio output muted for casting.");
            }
            this.toastMessage.show(`Connected to ${deviceName}. Waiting for audio data to start stream...`, 0); 
            break;
        case cast.framework.SessionState.SESSION_ENDED:
        case cast.framework.SessionState.SESSION_START_FAILED:
            const endedMessage = event.sessionState === cast.framework.SessionState.SESSION_ENDED ? "Casting session ended." : "Failed to start casting session.";
            this.toastMessage.show(endedMessage);
            this.isCastingActive = false;
            this.isCastSessionReadyForMedia = false;
            this.hasCastMediaBeenLoadedForCurrentSession = false;
            this.isFirstChunkForCurrentCastSession = true; 

            if (this.isLocalOutputMutedForCasting) {
                 try {
                    this.outputNode.connect(this.audioContext.destination);
                } catch(e) { /* ignore */ }
                this.isLocalOutputMutedForCasting = false;
                console.log("Local audio output restored.");
            }
            break;
        case cast.framework.SessionState.SESSION_ENDING:
            this.toastMessage.show("Ending cast session...");
            break;
    }
    if (cast && cast.framework && cast.framework.CastContext.getInstance()){
      this.updateCastButtonVisualState(cast.framework.CastContext.getInstance().getCastState());
    }
  }

  private handleCastStateChange(eventData: cast.framework.SessionStateEventData | cast.framework.CastStateEventData) {
    const event = eventData as cast.framework.CastStateEventData; 
    this.updateCastButtonVisualState(event.castState);
  }
  
  private updateCastButtonVisualState(currentCastApiState: cast.framework.CastState | null) {
    this.castApiState = currentCastApiState;
    if (this.castButtonElement) {
      this.castButtonElement.isCastingActive = this.isCastingActive;
    }
    this.requestUpdate();
  }

  private handleRemotePlayerConnectedChanged() {
    if (this.remotePlayer && this.remotePlayer.isConnected) {
        console.log('Remote player connected.');
    } else {
        console.log('Remote player disconnected.');
    }
  }


  private async handleWelcomeComplete(e: CustomEvent<{firstPromptText: string}>) {
    const firstPromptText = e.detail.firstPromptText.trim() || "Synthwave Groove"; // Default if empty
    this.showWelcomeScreen = false;
    localStorage.setItem('beatLabWelcomeCompleted', 'true');

    this.prompts.clear(); // Ensure clean slate
    this.nextPromptId = 0;
    this.createInitialPrompt(firstPromptText, 1.0);

    await this.connectToSession(); // Now connect to session with the new prompt
  }

  private createInitialPrompt(text: string, weight = 1.0) {
    const newPromptId = `prompt-${this.nextPromptId}`;
    const newColor = TRACK_COLORS[this.nextPromptId % TRACK_COLORS.length];
    this.nextPromptId++;
    const newPrompt: Prompt = {
      promptId: newPromptId,
      text: text,
      weight: weight,
      color: newColor,
    };
    this.prompts.set(newPromptId, newPrompt);
    this.prompts = new Map(this.prompts); // Trigger update
    // If session is already connected, send prompts. Otherwise, connectToSession will handle it.
    if (this.session && !this.connectionError) {
        this.setSessionPrompts();
    }
  }


  private handleKeyDown(e: KeyboardEvent) {
    if (this.showWelcomeScreen) return; // Don't process keydowns if welcome screen is active

    if (e.key === 'Escape') {
      if (this.isMidiLearnActive) {
        if (this.midiLearnTargetId) {
          this.midiLearnTargetId = null; // Deselect target
          this.updateLearnModeMessage();
          this.requestUpdate(); // Ensure UI updates for highlight
        } else {
          this.toggleMidiLearnMode(); // Exit learn mode
        }
        e.preventDefault();
      } else if (this.showHelpPanel) {
        this.toggleHelpPanel();
        e.preventDefault();
      } else if (this.showAdvancedSettings) {
        this.toggleAdvancedSettings();
        e.preventDefault();
      }
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
    const oldSelectedId = this.selectedMidiInputId;
    this.availableMidiInputs = newInputs;

    let newSelectedIdToSet: string | null = null;

    if (newInputs.length > 0) {
        const currentSelectedStillExists = this.selectedMidiInputId && newInputs.some(input => input.id === this.selectedMidiInputId);
        
        if (currentSelectedStillExists) {
            newSelectedIdToSet = this.selectedMidiInputId; // Keep current
        } else {
            newSelectedIdToSet = newInputs[0].id; // Auto-select first if current is gone or none was selected
        }
    } else { // No inputs available
        newSelectedIdToSet = null;
    }
    
    if (newSelectedIdToSet !== oldSelectedId) {
        this.selectedMidiInputId = newSelectedIdToSet;
        this.midiController.selectMidiInput(this.selectedMidiInputId || '');
        if (oldSelectedId && oldSelectedId !== newSelectedIdToSet) {
            this.clearAllMidiMappings("MIDI device changed.");
        }
    }
  }

  private handleMidiDeviceChange(event: Event) {
    const selectedId = (event.target as HTMLSelectElement).value;
    if (this.selectedMidiInputId && this.selectedMidiInputId !== selectedId) {
        this.clearAllMidiMappings("MIDI device changed.");
    }
    this.selectedMidiInputId = selectedId || null;
    if (this.selectedMidiInputId) {
        this.midiController.selectMidiInput(this.selectedMidiInputId);
    } else {
        this.midiController.selectMidiInput(''); // Deselect
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
                this.setGenerationConfiguration(); // Send initial config
                this.setSessionPrompts(); // Send initial prompts
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

                const audioChunk = e.serverContent.audioChunks[0];
                if (!audioChunk) return; 

                const rawChunkDataForService = decode(audioChunk.data);
                if (this.isCastingActive) { // This implies a cast session is active
                  await this.sendAudioChunkToWebService(rawChunkDataForService);
                }
                
                // Local playback logic
                if (!this.isLocalOutputMutedForCasting) {
                    const audioBuffer = await decodeAudioData(
                        rawChunkDataForService, // Use the already decoded data
                        this.audioContext,
                        this.sampleRate,
                        2, 
                    );
                    const source = this.audioContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(this.outputNode); 

                    const currentTime = this.audioContext.currentTime;

                    if (this.playbackState === 'loading') {
                        if (this.firstChunkReceivedTimestamp === 0) { 
                            this.firstChunkReceivedTimestamp = currentTime;
                            this.nextStartTime = currentTime + this.bufferTime;
                            console.log(`Initial buffer: first chunk received, scheduling for ${(this.nextStartTime ?? 0).toFixed(2)}s`);
                        }
                    }

                    if ((this.nextStartTime ?? 0) < currentTime) {
                        console.warn(`Audio under run: nextStartTime ${(this.nextStartTime ?? 0).toFixed(2)}s < currentTime ${currentTime.toFixed(2)}s. Resetting playback target.`);
                        this.playbackState = 'loading'; 
                        this.firstChunkReceivedTimestamp = currentTime; 
                        this.nextStartTime = currentTime + this.bufferTime;
                    }

                    source.start(this.nextStartTime ?? 0);
                    
                    if (this.playbackState === 'loading') {
                        if (this.firstChunkReceivedTimestamp > 0 && (currentTime >= this.firstChunkReceivedTimestamp + this.bufferTime - 0.1)) { 
                            console.log("Buffer period elapsed, transitioning to playing state.");
                            this.playbackState = 'playing';
                            this.firstChunkReceivedTimestamp = 0; 
                        }
                    }
                    this.nextStartTime = (this.nextStartTime ?? 0) + audioBuffer.duration;
                } else if (this.playbackState === 'loading' && this.isCastingActive && this.hasCastMediaBeenLoadedForCurrentSession) {
                    // If casting, locally muted, and media is loaded on Cast device,
                    // we transition to 'playing' state for UI/session control based on time,
                    // assuming the Cast device manages its own buffering.
                     if (this.firstChunkReceivedTimestamp === 0) {
                         this.firstChunkReceivedTimestamp = this.audioContext.currentTime; // Mark when loading started
                     }
                     if (this.audioContext.currentTime >= this.firstChunkReceivedTimestamp + this.bufferTime - 0.1) {
                        this.playbackState = 'playing';
                        this.firstChunkReceivedTimestamp = 0;
                        console.log("Buffer period elapsed (while casting), transitioning to playing state for session control.");
                     }
                }
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
        // Configuration and prompts are sent on `setupComplete`
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
        
        musicGenConfig.systemInstruction = `You are a master DJ. Execute the following musical drop sequence, making it fit cohesively with the existing musical style, described as: ${currentPlayingStyleDescription}. Emphasize its impact and musicality.`;
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
        // If already connected, ensure config and prompts are up-to-date before playing
        this.setGenerationConfiguration();
        this.setSessionPrompts();
      }


      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(err => console.error("Audio context resume failed:", err));
      }
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
    this.nextStartTime = 0; 
    this.firstChunkReceivedTimestamp = 0; 
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
    this.firstChunkReceivedTimestamp = 0; 
  }


  private async handleAddPrompt() {
    if (this.isDropActive) {
        this.toastMessage.show("Cannot add prompt during Drop sequence.");
        return;
    }
    if (this.isMidiLearnActive) {
        this.toastMessage.show("Cannot add prompt while MIDI Learn is active.");
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
        console.log("Attempted to remove active drop prompt. Drop logic will handle it.");
        return;
    }
    if (this.isMidiLearnActive && promptIdToRemove === this.midiLearnTargetId) {
        this.midiLearnTargetId = null; // Deselect if it was the target
        this.updateLearnModeMessage();
    }
    // Remove from MIDI CC map if it was mapped
    for (const [cc, targetId] of this.midiCcToTargetMap.entries()) {
        if (targetId === promptIdToRemove) {
            this.midiCcToTargetMap.delete(cc);
        }
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
    
    if (this.isDropActive && this.originalPromptWeightsBeforeDrop?.has(promptIdToRemove)) {
        this.originalPromptWeightsBeforeDrop.delete(promptIdToRemove);
    }

    this.setSessionPrompts();
  }

  private handleMidiCcReceived(event: CustomEvent<{ ccNumber: number, value: number, rawValue: number }>) {
    const { ccNumber, value, rawValue } = event.detail; // `value` is normalized 0-2, `rawValue` is 0-127

    if (this.isMidiLearnActive && this.midiLearnTargetId) {
      // Check if this CC is already mapped to something else
      if (this.midiCcToTargetMap.has(ccNumber) && this.midiCcToTargetMap.get(ccNumber) !== this.midiLearnTargetId) {
        this.toastMessage.show(`MIDI CC ${ccNumber} is already assigned. Clear it first or use another control.`);
        return;
      }

      this.midiCcToTargetMap.set(ccNumber, this.midiLearnTargetId);
      let targetName = this.midiLearnTargetId;
      if (this.midiLearnTargetId.startsWith('prompt-')) {
        targetName = `Track '${this.prompts.get(this.midiLearnTargetId)?.text || 'Unknown'}'`;
      } else if (this.midiLearnTargetId === MIDI_LEARN_TARGET_DROP_BUTTON) {
        targetName = 'Drop Button';
      } else if (this.midiLearnTargetId === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON) {
        targetName = 'Play/Pause Button';
      }
      this.toastMessage.show(`MIDI CC ${ccNumber} assigned to ${targetName}.`);
      this.midiLearnTargetId = null;
      this.updateLearnModeMessage();
      this.requestUpdate(); // Update UI (highlights)
      return;
    }

    if (this.isDropActive) return; // Don't allow MIDI control during drop

    const targetId = this.midiCcToTargetMap.get(ccNumber);
    if (targetId) {
      if (targetId.startsWith('prompt-')) {
        const prompt = this.prompts.get(targetId);
        if (prompt) {
          prompt.weight = value; // `value` is already normalized 0-2 for sliders
          this.prompts = new Map(this.prompts);
          this.setSessionPrompts();
        }
      } else if (targetId === MIDI_LEARN_TARGET_DROP_BUTTON) {
        if (rawValue > 64) { // Treat as button press
          this.handleDropClick();
        }
      } else if (targetId === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON) {
        if (rawValue > 64) { // Treat as button press
          this.handlePlayPause();
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

  // Keep other handlers (handleGuidanceChange etc.) for preset/share even if UI is removed
  private handleGuidanceChange(e: CustomEvent<number>) {
    if (this.isDropActive) { this.toastMessage.show("Settings locked during Drop."); (e.target as ParameterSlider).value = this.guidance; return; }
    this.guidance = e.detail;
    this.setGenerationConfiguration();
  }
  private handleBpmChange(e: CustomEvent<number>) {
    if (this.isDropActive) { this.toastMessage.show("Settings locked during Drop."); (e.target as ParameterSlider).value = this.bpm; return; }
    this.bpm = e.detail;
    this.setGenerationConfiguration();
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
  
  private _selectDropPromptText(): string {
    const activePrompts = Array.from(this.prompts.values())
        .filter(p => p.weight > 0.05 && (!this.isDropActive || p.promptId !== this.temporaryDropPromptId));

    const allActiveText = activePrompts.map(p => p.text.toLowerCase()).join(' ');

    if (allActiveText.trim() === '') {
        return this.DROP_FLAVORS[0].prompt; // Default energetic if no active text
    }

    for (const flavor of this.DROP_FLAVORS) {
        if (flavor.keywords.some(kw => allActiveText.includes(kw))) {
        return flavor.prompt;
        }
    }
    return this.DROP_FLAVORS[0].prompt; // Default to energetic
  }

  private async handleDropClick() {
    if (this.isMidiLearnActive) { this.setMidiLearnTarget(MIDI_LEARN_TARGET_DROP_BUTTON); return; }
    if (this.isDropActive) {
      this.toastMessage.show("Drop sequence already in progress!");
      return;
    }

    const selectedDropText = this._selectDropPromptText(); // Select drop text based on current music
    
    this.isDropActive = true; // Set state FIRST
    this.toastMessage.show("Drop sequence initiated! Brace yourself!");

    this.setGenerationConfiguration(); 

    this.originalPromptWeightsBeforeDrop = new Map();
    const newPromptsForDrop = new Map<string, Prompt>();

    this.prompts.forEach((prompt, id) => {
      this.originalPromptWeightsBeforeDrop!.set(id, prompt.weight);
      newPromptsForDrop.set(id, { ...prompt, weight: 0.05 }); 
    });

    this.temporaryDropPromptId = `drop-prompt-${Date.now()}`;
    newPromptsForDrop.set(this.temporaryDropPromptId, {
      promptId: this.temporaryDropPromptId,
      text: selectedDropText, 
      weight: 2.0, 
      color: TRACK_COLORS[4], 
    });

    this.prompts = newPromptsForDrop;
    this.setSessionPrompts(); 

    this.dropTimeoutId = window.setTimeout(async () => {
      const newPromptsAfterDrop = new Map<string, Prompt>();
      this.originalPromptWeightsBeforeDrop?.forEach((originalWeight, promptId) => {
        const currentPromptState = this.prompts.get(promptId); 
        if (currentPromptState && promptId !== this.temporaryDropPromptId) { 
           newPromptsAfterDrop.set(promptId, { ...currentPromptState, weight: originalWeight });
        }
      });
      
      this.prompts = newPromptsAfterDrop; 
      
      this.isDropActive = false; 
      
      this.setGenerationConfiguration(); 
      
      this.setSessionPrompts(); 

      this.originalPromptWeightsBeforeDrop = null;
      this.temporaryDropPromptId = null;
      this.dropTimeoutId = null;
      this.toastMessage.show("Drop sequence complete!");
    }, 8000); 
  }


  private _applyConfiguration(configData: Preset, source: 'preset' | 'share-link') {
    if (this.isDropActive) {
        this.toastMessage.show(`Cannot load ${source} during Drop sequence.`);
        return;
    }
    
    if (
        typeof configData.version !== 'string' || 
        !Array.isArray(configData.prompts) ||
        // configData.temperature can be undefined if missing, so check its type only if present
        (configData.temperature !== undefined && typeof configData.temperature !== 'number') ||
        !configData.prompts.every(p => typeof p.text === 'string' && (p.weight === undefined || typeof p.weight === 'number'))
    ) {
        throw new Error('Invalid configuration data structure.');
    }
    
    this.stopAudio(); 
    this.prompts.clear();
    this.nextPromptId = 0;
    this.filteredPrompts.clear();

    const newPromptsMap = new Map<string, Prompt>();
    configData.prompts.forEach((p: PresetPrompt) => { 
        const newPromptId = `prompt-${this.nextPromptId}`;
        const newColor = TRACK_COLORS[this.nextPromptId % TRACK_COLORS.length];
        this.nextPromptId++;
        newPromptsMap.set(newPromptId, {
        promptId: newPromptId,
        text: p.text,
        weight: p.weight ?? 0, // Default to 0 if weight is undefined
        color: newColor,
        });
    });
    this.prompts = newPromptsMap;
    
    // Apply other settings from preset/share link, using component defaults if not present in configData
    this.temperature = configData.temperature ?? 1.0;
    this.guidance = configData.guidance ?? 4.0;
    this.bpm = configData.bpm ?? 120;
    this.density = configData.density ?? 0.5;
    this.brightness = configData.brightness ?? 0.5;
    this.muteBass = configData.muteBass ?? false;
    this.muteDrums = configData.muteDrums ?? false;
    this.onlyBassAndDrums = configData.onlyBassAndDrums ?? false;
    this.musicGenerationMode = configData.musicGenerationMode ?? 'QUALITY';

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

  private async _loadStateFromUrl(): Promise<boolean> {
    const params = new URLSearchParams(window.location.search);
    const encodedSharedStateBase64 = params.get('share');

    if (encodedSharedStateBase64) {
        try {
            const sharedStateBase64 = decodeURIComponent(encodedSharedStateBase64);
            const jsonString = atob(sharedStateBase64);
            const parsedConfig = JSON.parse(jsonString) as Preset;
            
            this._applyConfiguration(parsedConfig, 'share-link');
            history.replaceState(null, '', window.location.pathname); // Clean URL

            // Autoplay logic
            if (this.playbackState === 'stopped' || this.playbackState === 'paused') {
                if (!this.isConnecting && !this.showWelcomeScreen) {
                    this.playbackState = 'loading';
                    this.firstChunkReceivedTimestamp = 0;

                    if (this.connectionError || !this.session) {
                        await this.connectToSession();
                        if (this.connectionError) {
                            if(this.playbackState === 'loading') this.playbackState = 'stopped';
                            this.firstChunkReceivedTimestamp = 0;
                            return true; // Shared state was processed, but playback failed
                        }
                    } else {
                        this.setGenerationConfiguration(); 
                        this.setSessionPrompts();          
                    }

                    if (this.audioContext.state === 'suspended') {
                        await this.audioContext.resume().catch(err => console.error("Audio context resume failed:", err));
                    }
                    this.loadAudio(); 
                    this.toastMessage.show('Playing shared session...');
                }
            }
            return true; // Shared state loaded
        } catch (e: any) {
            console.error('Error loading shared state from URL:', e);
            this.toastMessage.show(`Failed to load shared state: ${e.message || 'Invalid link'}`);
            history.replaceState(null, '', window.location.pathname);
            return false; // Error loading shared state
        }
    }
    return false; // No shared state in URL
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

  private handleLearnButtonMouseDown() {
    if (this.isMidiLearnActive || !this.selectedMidiInputId) return; // Only for clearing, not when already learning or no MIDI
    
    this.learnButtonLongPressTimeout = window.setTimeout(() => {
      this.clearAllMidiMappings("All MIDI assignments cleared via long press.");
    }, 2000); // 2 seconds for long press
  }

  private handleLearnButtonMouseUpOrOut() {
    if (this.learnButtonLongPressTimeout) {
      clearTimeout(this.learnButtonLongPressTimeout);
      this.learnButtonLongPressTimeout = null;
    }
  }

  private toggleMidiLearnMode() {
    if (!this.selectedMidiInputId) {
        this.toastMessage.show("Please select a MIDI device first.");
        return;
    }
    this.isMidiLearnActive = !this.isMidiLearnActive;
    if (!this.isMidiLearnActive) {
      this.midiLearnTargetId = null; // Clear target if exiting learn mode
      this.toastMessage.show("MIDI Learn mode deactivated.");
    } else {
        this.toastMessage.show("MIDI Learn mode activated!");
    }
    this.updateLearnModeMessage();
    this.requestUpdate(); // To update button text and highlights
  }

  private updateLearnModeMessage() {
    if (!this.isMidiLearnActive) {
      this.learnModeMessage = '';
      return;
    }
    if (this.midiLearnTargetId) {
      let targetName = this.midiLearnTargetId;
      if (this.midiLearnTargetId.startsWith('prompt-')) {
        targetName = `Track '${this.prompts.get(this.midiLearnTargetId)?.text || 'Unknown'}'`;
      } else if (this.midiLearnTargetId === MIDI_LEARN_TARGET_DROP_BUTTON) {
        targetName = 'Drop Button';
      } else if (this.midiLearnTargetId === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON) {
        targetName = 'Play/Pause Button';
      }
      this.learnModeMessage = `Move a knob/fader or press a button on your MIDI device for '${targetName}'. Press Esc to cancel selection.`;
    } else {
      this.learnModeMessage = "Click a track's slider, Drop, or Play/Pause button to assign a MIDI control. Click 'Learning...' button or Esc to finish.";
    }
  }

  private setMidiLearnTarget(targetId: string) {
    if (!this.isMidiLearnActive) return;
    this.midiLearnTargetId = targetId;
    this.updateLearnModeMessage();
    this.requestUpdate(); // To update highlights
  }
  
  // Called when a prompt-controller's main div is clicked
  private handlePromptInteractionForLearn(e: CustomEvent<{promptId: string; text: string}>) {
    if (this.isMidiLearnActive) {
      this.setMidiLearnTarget(e.detail.promptId);
    }
  }
  
  private handlePlayPauseButtonClickForLearn() {
    if (this.isMidiLearnActive) {
      this.setMidiLearnTarget(MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON);
    } else {
      this.handlePlayPause(); // Normal play/pause action
    }
  }

  private clearAllMidiMappings(toastMessageText = "All MIDI assignments cleared.") {
    if (this.midiCcToTargetMap.size > 0) {
        this.midiCcToTargetMap.clear();
        this.toastMessage.show(toastMessageText);
    }
     if (this.isMidiLearnActive && this.midiLearnTargetId) {
        this.midiLearnTargetId = null;
        this.updateLearnModeMessage();
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

    const mainUiClasses = {
        'main-ui-content': true,
        'hidden-by-welcome': this.showWelcomeScreen
    };

    return html`
      ${this.showWelcomeScreen ? html`<welcome-overlay @welcome-complete=${this.handleWelcomeComplete}></welcome-overlay>` : ''}

      <div class=${classMap(mainUiClasses)}>
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
              ?disabled=${!this.isMidiSupported || this.isRequestingMidiAccess || this.isDropActive || this.showWelcomeScreen }
              aria-label="Select MIDI Input Device">
              ${midiSelectorOptions}
              </select>
              ${this.selectedMidiInputId ? html`
                  <button 
                      class="midi-learn-button ${classMap({learning: this.isMidiLearnActive})}"
                      @click=${this.toggleMidiLearnMode}
                      @mousedown=${this.handleLearnButtonMouseDown}
                      @mouseup=${this.handleLearnButtonMouseUpOrOut}
                      @mouseleave=${this.handleLearnButtonMouseUpOrOut}
                      title=${this.isMidiLearnActive ? "Cancel MIDI Learn" : "Activate MIDI Learn (Hold to clear all mappings)"}
                      ?disabled=${this.isDropActive || this.showWelcomeScreen}>
                      ${this.isMidiLearnActive ? 'Learning... (Cancel)' : 'Learn MIDI'}
                  </button>
              ` : ''}
          </div>
          <div class="header-actions">
            <cast-button 
                @click=${this.handleCastClick} 
                ?disabled=${!this.isCastApiInitialized || this.isDropActive || this.showWelcomeScreen || (this.castApiState === cast.framework.CastState.CONNECTING)}
                aria-label=${this.isCastingActive ? "Stop Casting" : "Cast to device"}
                title=${this.isCastingActive ? "Stop Casting" : "Cast to device"}
                .isCastingActive=${this.isCastingActive} >
            </cast-button>
            <settings-button @click=${this.toggleAdvancedSettings} ?disabled=${this.isDropActive || this.showWelcomeScreen} aria-label="Toggle advanced settings"></settings-button>
          </div>
        </div>
        <div class="learn-mode-message-bar ${classMap({visible: this.isMidiLearnActive && this.learnModeMessage !== ''})}">
          ${this.learnModeMessage}
        </div>
        <div class="advanced-settings-panel ${classMap({visible: this.showAdvancedSettings})}">
          <div class="settings-grid">
              <parameter-slider
                  label="Temperature"
                  .value=${this.temperature}
                  min="0" max="2" step="0.1"
                  @input=${this.handleTemperatureChange}
                  ?disabled=${this.isDropActive || this.showWelcomeScreen}>
              </parameter-slider>
              <!-- Other advanced settings removed from UI -->
          </div>
          <a class="hide-settings-link" @click=${this.toggleAdvancedSettings}>Hide Advanced Settings</a>
        </div>
        <div class="content-area">
          <div id="prompts-container" @prompt-removed=${this.handlePromptRemoved}>
            ${this.renderPrompts()}
          </div>
          ${!this.showWelcomeScreen ? html`
            <add-prompt-button 
              class="floating-add-button"
              @click=${this.handleAddPrompt} 
              aria-label="Add new prompt track">
            </add-prompt-button>
          ` : ''}
        </div>
        <toast-message .message=${this.toastMessage?.message || ''} .showing=${this.toastMessage?.showing || false}></toast-message>
        
        ${!this.showWelcomeScreen ? html`
          <div class="bottom-left-utility-cluster">
            <play-pause-button
                id="play-pause-main-button" 
                @click=${this.handlePlayPauseButtonClickForLearn}
                .playbackState=${this.playbackState}
                .isMidiLearnTarget=${this.isMidiLearnActive && this.midiLearnTargetId === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON}
                aria-label=${this.playbackState === 'playing' ? 'Pause audio' : 'Play audio'}
              ></play-pause-button>
          </div>

          <div class="utility-button-cluster">
            <drop-button 
                id="drop-main-button"
                @click=${this.handleDropClick} 
                .isMidiLearnTarget=${this.isMidiLearnActive && this.midiLearnTargetId === MIDI_LEARN_TARGET_DROP_BUTTON}
                aria-label="Trigger Drop Effect">
            </drop-button>
            <share-button @click=${this.handleShareClick} aria-label="Share current configuration via link"></share-button>
            <help-button @click=${this.toggleHelpPanel} aria-label="Open help guide"></help-button>
          </div>
        ` : ''}
        
        <help-guide-panel .isOpen=${this.showHelpPanel} @close-help=${this.toggleHelpPanel}></help-guide-panel>
        
        <input type="file" id="presetFileInput" accept=".json" style="display: none;" @change=${this.handlePresetFileSelected}>
      </div> <!-- End of main-ui-content -->
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
        ?ismidilearntarget=${this.isMidiLearnActive && this.midiLearnTargetId === prompt.promptId}
        ?disabled=${(this.isDropActive && prompt.promptId !== this.temporaryDropPromptId) || this.showWelcomeScreen}
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

// Forward declarations for PromptController which is in its own file.
// Actual class is imported in prompt-dj.ts if needed, or its definition ensures it's registered.
declare class PromptController extends LitElement {
  promptId: string;
  text: string;
  weight: number;
  sliderColor: string;
  isMidiLearnTarget: boolean;
  filtered: boolean;
  disabled: boolean;
}


declare global {
  interface HTMLElementTagNameMap {
    'prompt-dj': PromptDj;
    'prompt-controller': PromptController;
    'add-prompt-button': AddPromptButton;
    'settings-button': SettingsButton;
    'cast-button': CastButton;
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
    'welcome-overlay': WelcomeOverlay;
  }

  interface MidiInputInfo {
    id: string;
    name: string;
  }

  interface HTMLElementEventMap {
    'midi-cc-received': CustomEvent<{ ccNumber: number, value: number, rawValue: number }>;
    'midi-inputs-changed': CustomEvent<{ inputs: MidiInputInfo[] }>;
    'close-help': CustomEvent<void>;
    'input': CustomEvent<number>; // For parameter-slider
    'change': CustomEvent<{checked: boolean}>; // For toggle-switch
    'prompt-interaction': CustomEvent<{promptId: string; text: string}>;
    'welcome-complete': CustomEvent<{firstPromptText: string}>;
  }

  // Window interface augmentation is now part of the main `declare global` block for Cast SDK types
}