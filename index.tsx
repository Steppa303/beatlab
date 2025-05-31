
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
  private readonly audioServiceBaseUrl: string; // e.g. https://chunkstreamer.onrender.com
  private readonly audioStreamWebServiceUrl: string; // Full URL for streaming
  private readonly audioChunkUploadUrl: string; // Full URL for uploading
  private readonly audioStreamResetUrl: string; // Full URL for resetting
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
    this.audioServiceBaseUrl = 'https://chunkstreamer.onrender.com';
    this.audioChunkUploadUrl = `${this.audioServiceBaseUrl}/upload-chunk`;
    this.audioStreamWebServiceUrl = `${this.audioServiceBaseUrl}/stream`;
    this.audioStreamResetUrl = `${this.audioServiceBaseUrl}/reset-stream`;
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
                this.handleCastSessionStateChange as (event: cast.framework.SessionStateEventData | cast.framework.CastStateEventData) => void
            );
            castContext.removeEventListener(
                cast.framework.CastContextEventType.CAST_STATE_CHANGED,
                this.handleCastStateChange as (event: cast.framework.SessionStateEventData | cast.framework.CastStateEventData) => void
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

  // --- START OF ADDED METHOD DEFINITIONS ---

  private handleMidiCcReceived(event: CustomEvent): void {
    console.log('handleMidiCcReceived called with:', event.detail);
    // Placeholder: Actual MIDI CC handling logic will go here.
    // For example, updating a prompt's weight or triggering an action.
    const { ccNumber, rawValue } = event.detail;
    const targetId = this.midiCcToTargetMap.get(ccNumber);

    if (targetId) {
        if (targetId === MIDI_LEARN_TARGET_DROP_BUTTON) {
            // Simulate drop button click if rawValue > 64
            if (rawValue > 64 && this.dropMainButton) {
                this.dropMainButton.click(); // Or call a method like this.triggerDrop()
                console.log(`MIDI CC ${ccNumber} triggered Drop!`);
            }
        } else if (targetId === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON) {
            // Simulate play/pause button click if rawValue > 64
            if (rawValue > 64 && this.playPauseMainButton) {
                this.playPauseMainButton.click(); // Or call a method like this.togglePlayPause()
                console.log(`MIDI CC ${ccNumber} triggered Play/Pause`);
            }
        } else {
            // It's a prompt ID
            const promptToUpdate = this.prompts.get(targetId);
            if (promptToUpdate) {
                const newWeight = (rawValue / 127) * 2;
                promptToUpdate.weight = newWeight;
                this.prompts = new Map(this.prompts); // Trigger update
                this.requestUpdate(); // Ensure UI for prompt updates
                // console.log(`MIDI CC ${ccNumber} updated prompt ${targetId} weight to ${newWeight.toFixed(2)}`);
                // Potentially send updated weights to the backend if music is playing
                if (this.playbackState === 'playing' || this.playbackState === 'loading') {
                    this.sendPromptsToSession();
                }
            }
        }
    }
  }

  private handleMidiInputsChanged(event: CustomEvent): void {
    console.log('handleMidiInputsChanged called with:', event.detail);
    this.availableMidiInputs = event.detail.inputs || [];
    // If the currently selected MIDI input is no longer available, deselect it.
    if (this.selectedMidiInputId && !this.availableMidiInputs.find(input => input.id === this.selectedMidiInputId)) {
        this.selectMidiInput(''); // Deselect
    }
    this.requestUpdate();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // console.log('handleKeyDown called with key:', event.key);
    if (event.key === 'Escape') {
        if (this.isMidiLearnActive) {
            if (this.midiLearnTargetId) {
                this.midiLearnTargetId = null; // Deselect target first
                this.learnModeMessage = "Click a track slider, Drop! button, or Play/Pause button to assign MIDI CC.";
            } else {
                this.toggleMidiLearnMode(); // Then deactivate learn mode
            }
            event.preventDefault();
        } else if (this.showHelpPanel) {
          this.showHelpPanel = false;
          event.preventDefault();
        }
    }
  }

  private handleWelcomeComplete(event: CustomEvent): void {
    console.log('handleWelcomeComplete called with detail:', event.detail);
    const { firstPromptText } = event.detail;
    if (firstPromptText && typeof firstPromptText === 'string' && firstPromptText.trim() !== '') {
        this.createInitialPrompt(firstPromptText.trim());
    } else {
        this.createInitialPrompt("Ambient Chill"); // Default if none provided
    }
    this.showWelcomeScreen = false;
    localStorage.setItem('beatLabWelcomeCompleted', 'true');
    // Now connect to session as welcome is complete
    if (this.playbackState !== 'playing' && this.playbackState !== 'loading') {
        this.connectToSession();
    }
  }

  private async _loadStateFromUrl(): Promise<boolean> {
    console.warn('_loadStateFromUrl not fully implemented.');
    // Placeholder: Actual logic to parse URL parameters and set state will go here.
    // This should parse prompts, temperature, etc., from URL query params.
    // Example: ?share={"prompts":[{"text":"Deep House","weight":1}],"temp":0.8}
    // Returns true if state was successfully loaded from URL, false otherwise.
    const params = new URLSearchParams(window.location.search);
    const shareData = params.get('share');
    if (shareData) {
        try {
            const decodedData = JSON.parse(atob(shareData));
            // ... apply decodedData to this.prompts, this.temperature, etc.
            console.log("Loaded state from URL:", decodedData);
            // Example: this.prompts = new Map(decodedData.prompts.map((p, i) => [`p${i}`, {...p, promptId: `p${i}`, color: TRACK_COLORS[i % TRACK_COLORS.length]}]));
            // this.temperature = decodedData.temperature || 1.0;
            // ... and other settings
            // if (decodedData.autoplay) { this.togglePlayPause(); }
            return true;
        } catch (e) {
            console.error("Failed to load state from URL:", e);
            if (this.toastMessage) this.toastMessage.show("Error: Could not load shared configuration from link.", 5000);
            return false;
        }
    }
    return false;
  }

  private createInitialPrompt(promptText: string = "New Prompt"): void {
    console.log('createInitialPrompt called with text:', promptText);
    if (this.prompts.size >= 7) { // Max 7 prompts
        if(this.toastMessage) this.toastMessage.show("Maximum number of prompts reached (7).", 3000);
        return;
    }
    const newPromptId = `prompt${this.nextPromptId++}`;
    const newPrompt: Prompt = {
      promptId: newPromptId,
      text: promptText,
      weight: this.prompts.size === 0 ? 1 : 0.5, // First prompt gets full weight, others start mid
      color: TRACK_COLORS[this.prompts.size % TRACK_COLORS.length],
    };
    this.prompts.set(newPromptId, newPrompt);
    this.prompts = new Map(this.prompts); // Force update for Lit
    this.requestUpdate();

    // If music is playing, send updated prompts to the session
    if (this.playbackState === 'playing' || this.playbackState === 'loading') {
      this.sendPromptsToSession();
    }
  }

  private handlePromptInteractionForLearn(event: CustomEvent): void {
    console.log('handlePromptInteractionForLearn called with:', event.detail);
    if (this.isMidiLearnActive) {
        this.midiLearnTargetId = event.detail.promptId;
        this.learnModeMessage = `Targeting prompt: "${event.detail.text}". Now move a MIDI controller.`;
        this.requestUpdate(); // To update highlighting on prompt-controller
    }
  }

  private async connectToSession(): Promise<void> {
    console.warn('connectToSession not fully implemented.');
    if (this.isConnecting || this.session) return;
    this.isConnecting = true;
    this.playbackState = 'loading'; // Visual cue

    try {
        // Placeholder: Actual session connection logic using GenAI SDK
        // this.session = await ai.liveMusic.createSession(...);
        // this.session.addEventListener('message', this.handleServerMessage.bind(this));
        // this.session.addEventListener('error', this.handleSessionError.bind(this));
        // this.session.addEventListener('close', this.handleSessionClose.bind(this));
        console.log("Attempting to connect to Lyra session...");
        // this.sendPromptsToSession(); // Send initial prompts
        this.connectionError = false;
        // this.playbackState = 'playing'; // Or 'paused' depending on desired initial state
    } catch (error) {
        console.error("Failed to connect to music session:", error);
        if(this.toastMessage) this.toastMessage.show(`Connection Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 5000);
        this.connectionError = true;
        this.playbackState = 'stopped';
    } finally {
        this.isConnecting = false;
        this.requestUpdate();
    }
  }

  private handleCastSessionStateChange(event: cast.framework.SessionStateEventData): void {
    console.log('Cast Session State Changed:', event.sessionState, event.session ? `ID: ${event.session.getSessionId()}` : 'No Session');
    const castContext = cast.framework.CastContext.getInstance();
    this.isCastSessionReadyForMedia = false; 

    switch (event.sessionState) {
        case cast.framework.SessionState.SESSION_STARTED:
            this.isCastingActive = true;
            this.hasCastMediaBeenLoadedForCurrentSession = false;
            this.isFirstChunkForCurrentCastSession = true; 
            if (event.session) {
                this.toastMessage.show(`Casting to ${event.session.getCastDevice().friendlyName}. Preparing audio stream...`);
                this.isCastSessionReadyForMedia = true; // Session is ready, media can be loaded.
                this.resetAudioStreamOnServer(); // Reset server stream for the new session
                this.loadMediaForCasting();
            }
            break;
        case cast.framework.SessionState.SESSION_ENDED:
        case cast.framework.SessionState.SESSION_START_FAILED:
            this.isCastingActive = false;
            this.isCastSessionReadyForMedia = false;
            this.hasCastMediaBeenLoadedForCurrentSession = false;
            if (this.isLocalOutputMutedForCasting) {
                this.outputNode.connect(this.audioContext.destination);
                this.isLocalOutputMutedForCasting = false;
                console.log("Local audio output restored after casting ended/failed.");
            }
            if (event.sessionState === cast.framework.SessionState.SESSION_ENDED) {
                this.toastMessage.show("Casting ended.");
            } else {
                 this.toastMessage.show(`Casting failed to start. ${event.error ? event.error.toString() : ''}`);
            }
            break;
        case cast.framework.SessionState.SESSION_RESUMED:
            this.isCastingActive = true;
            this.isCastSessionReadyForMedia = true; 
            // Potentially re-load media if needed, or assume it's still playing.
            // For a live stream, we might want to reset and reload.
            this.resetAudioStreamOnServer();
            this.loadMediaForCasting(); 
            this.toastMessage.show(`Casting resumed to ${event.session.getCastDevice().friendlyName}.`);
            break;
        case cast.framework.SessionState.SESSION_STARTING:
            this.toastMessage.show("Starting cast session...");
            break;
        case cast.framework.SessionState.SESSION_ENDING:
            this.toastMessage.show("Ending cast session...");
            break;
        // Other states like NO_SESSION, SESSION_SUSPENDED can be handled if needed
    }
    this.updateCastButtonVisualState(castContext.getCastState());
  }

  private handleCastStateChange(event: cast.framework.CastStateEventData): void {
    console.log('Cast State Changed:', event.castState);
    this.castApiState = event.castState;
    this.updateCastButtonVisualState(event.castState);
    if (event.castState === cast.framework.CastState.NO_DEVICES_AVAILABLE) {
        // this.toastMessage.show("No Cast devices found.", 3000);
    }
  }

  private handleRemotePlayerConnectedChanged(): void {
     if (this.remotePlayer) {
        console.log('Remote Player Connected Changed:', this.remotePlayer.isConnected);
        // This event might be useful for more fine-grained control or UI updates
        // related to the remote player's connection status.
        // For now, primary logic is in sessionStateChange.
        if(this.remotePlayer.isConnected && !this.isCastingActive) {
            // This can happen if auto-joined.
            // Consider aligning isCastingActive state.
        }
        if(!this.remotePlayer.isConnected && this.isCastingActive) {
            // If remote player disconnects unexpectedly while session was active
            console.warn("Remote player disconnected while casting was active.");
            // Potentially trigger a session end or UI update
        }
     }
  }

  private updateCastButtonVisualState(castState: cast.framework.CastState): void {
    if (this.castButtonElement) {
        const currentSession = cast.framework.CastContext.getInstance().getCurrentSession();
        this.castButtonElement.isCastingActive = !!(currentSession && 
            (currentSession.getSessionState() === cast.framework.SessionState.SESSION_STARTED ||
             currentSession.getSessionState() === cast.framework.SessionState.SESSION_RESUMED));
        
        // Disable button if no devices or not initialized
        this.castButtonElement.disabled = !this.isCastApiInitialized || castState === cast.framework.CastState.NO_DEVICES_AVAILABLE;
    }
  }

  private async loadMediaForCasting(): Promise<void> {
      const castSession = cast.framework.CastContext.getInstance().getCurrentSession();
      if (!castSession || !this.isCastSessionReadyForMedia || this.hasCastMediaBeenLoadedForCurrentSession) {
          if (this.hasCastMediaBeenLoadedForCurrentSession) console.log("Media already loaded for this cast session.");
          else console.log("Cast session not ready or media already loaded, skipping loadMediaForCasting.");
          return;
      }

      console.log("Preparing to load media for casting...");
      const mediaInfo = new chrome.cast.media.MediaInfo(this.audioStreamWebServiceUrl, 'audio/wav');
      mediaInfo.streamType = chrome.cast.media.StreamType.LIVE; // Important for live streams
      mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = "Steppa's BeatLab Live Stream";
      mediaInfo.metadata.artist = "AI Music DJ";
      // mediaInfo.duration = null; // For live streams

      const loadRequest = new chrome.cast.media.LoadRequest(mediaInfo);
      loadRequest.autoplay = true;

      try {
          this.toastMessage.show("Loading audio stream on Cast device...", 3000);
          await castSession.loadMedia(loadRequest);
          console.log('Media loaded successfully on Cast device.');
          this.hasCastMediaBeenLoadedForCurrentSession = true;
          this.isFirstChunkForCurrentCastSession = true; // Reset for the new media load

          // Mute local output if not already muted for casting
          if (!this.isLocalOutputMutedForCasting) {
              this.outputNode.disconnect(this.audioContext.destination);
              this.isLocalOutputMutedForCasting = true;
              console.log("Local audio output muted for casting.");
          }

      } catch (error: any) {
          console.error('Error loading media on Cast device:', error);
          this.toastMessage.show(`Failed to load media on Cast: ${error.description || error.message || 'Unknown error'}`);
          this.hasCastMediaBeenLoadedForCurrentSession = false; // Allow retry if needed
      }
  }
  
  private async sendChunkToWebService(chunk: Uint8Array, isFirstChunk: boolean): Promise<void> {
    if (!this.isCastingActive || !this.hasCastMediaBeenLoadedForCurrentSession) {
        // console.log("Not sending chunk: Casting not active or media not loaded.");
        return;
    }

    let uploadUrl = this.audioChunkUploadUrl;
    if (isFirstChunk) {
        // Append audio parameters for the first chunk of a new stream segment
        uploadUrl += `?sampleRate=${this.sampleRate}&numChannels=${this.outputNode.channelCount}&bitsPerSample=16`;
        console.log("Sending first chunk with params:", uploadUrl);
    }

    try {
        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
            },
            body: chunk,
        });
        if (!response.ok) {
            console.error(`Failed to send audio chunk to web service: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error("Error body:", errorBody);
            // Potentially show a toast or try to recover
        } else {
            // console.log("Audio chunk sent successfully to web service.");
        }
    } catch (error) {
        console.error('Error sending audio chunk to web service:', error);
        // Potentially show a toast
    }
  }

  private async resetAudioStreamOnServer(): Promise<void> {
    console.log("Requesting audio stream reset on server...");
    try {
        const response = await fetch(this.audioStreamResetUrl, { method: 'POST' });
        if (!response.ok) {
            console.error(`Failed to reset audio stream on server: ${response.status} ${response.statusText}`);
        } else {
            console.log("Audio stream successfully reset on server.");
        }
    } catch (error) {
        console.error('Error resetting audio stream on server:', error);
    }
  }
  
  private sendPromptsToSession() {
    console.warn('sendPromptsToSession not fully implemented.');
    // This method would format the current prompts and settings (like temperature)
    // and send them to the active LiveMusicSession.
    // Example:
    // if (this.session && (this.playbackState === 'playing' || this.playbackState === 'loading') && !this.isDropActive) {
    //   const activePrompts = Array.from(this.prompts.values())
    //       .filter(p => p.weight > 0)
    //       .map(p => ({ text: p.text, weight: p.weight }));
    //
    //   if (activePrompts.length > 0) {
    //     const config: AppLiveMusicGenerationConfig = {
    //       temperature: this.temperature,
    //       prompts: activePrompts,
    //       // ... other parameters like guidance, bpm, etc.
    //       systemInstruction: this.globalSystemInstruction,
    //       guidance: this.guidance,
    //       bpm: this.bpm,
    //       density: this.density,
    //       brightness: this.brightness,
    //       mute_bass: this.muteBass,
    //       mute_drums: this.muteDrums,
    //       only_bass_and_drums: this.onlyBassAndDrums,
    //       music_generation_mode: this.musicGenerationMode,
    //     };
    //     this.session.setPrompts(config);
    //     console.log("Prompts sent to session:", config);
    //   } else if (this.prompts.size > 0) { // All prompts have zero weight
    //     this.session.setPrompts({ prompts: [{text: "silence", weight: 1}] }); // Send silence
    //     console.log("All prompt weights are zero, sent silence to session.");
    //   }
    // }
  }
  
  private selectMidiInput(inputId: string): void {
    this.selectedMidiInputId = inputId;
    this.midiController.selectMidiInput(inputId);
    // Clear existing MIDI CC mappings when device changes
    this.midiCcToTargetMap.clear();
    if (inputId) {
        const selectedDevice = this.availableMidiInputs.find(d => d.id === inputId);
        this.toastMessage.show(`MIDI Input: ${selectedDevice ? selectedDevice.name : 'Selected'}`);
    } else {
        this.toastMessage.show('MIDI Input: None');
    }
    // Disable MIDI learn mode if no input is selected
    if (!inputId && this.isMidiLearnActive) {
        this.toggleMidiLearnMode();
    }
    this.requestUpdate(); // Update UI for button states, etc.
  }

  private toggleMidiLearnMode(): void {
    this.isMidiLearnActive = !this.isMidiLearnActive;
    if (this.isMidiLearnActive) {
        this.learnModeMessage = "Click a track slider, Drop! button, or Play/Pause button to assign MIDI CC.";
        this.toastMessage.show("MIDI Learn Mode Activated. Click an element, then move a MIDI controller.", 0); // Persists until cancelled
    } else {
        this.midiLearnTargetId = null; // Clear target when exiting learn mode
        this.learnModeMessage = "";
        this.toastMessage.hide(); // Hide persistent learn message
        this.toastMessage.show("MIDI Learn Mode Deactivated.", 3000);
    }
    this.requestUpdate();
  }


  // --- END OF ADDED METHOD DEFINITIONS ---


  override render() {
    const promptControllers = Array.from(this.prompts.values()).map(
        (prompt, index) => html`
        <prompt-controller
          .promptId=${prompt.promptId}
          .text=${prompt.text}
          .weight=${prompt.weight}
          .sliderColor=${TRACK_COLORS[index % TRACK_COLORS.length]}
          ?isMidiLearnTarget=${this.isMidiLearnActive && this.midiLearnTargetId === prompt.promptId}
          ?filtered=${this.filteredPrompts.has(prompt.promptId)}
          @prompt-changed=${this.handlePromptChange}
          @prompt-removed=${this.handlePromptRemoved}
          @prompt-interaction=${this.handlePromptInteractionForLearn} 
        ></prompt-controller>
      `,
    );

    const learnButtonText = this.isMidiLearnActive ? "Learning... (Cancel)" : "Learn MIDI";
    const learnButtonClasses = {
        'midi-learn-button': true,
        'learning': this.isMidiLearnActive,
    };

    return html`
      ${this.showWelcomeScreen ? html`<welcome-overlay></welcome-overlay>` : ''}
      
      <div class="main-ui-content ${this.showWelcomeScreen ? 'hidden-by-welcome' : ''}">
        <div class="background-orbs-container">
          <div class="orb orb1"></div>
          <div class="orb orb2"></div>
          <div class="orb orb3"></div>
          <div class="orb orb4"></div>
        </div>

        <header class="header-bar">
          <div class="header-left-controls">
            <select 
                class="midi-selector styled-select" 
                @change=${(e: Event) => this.selectMidiInput((e.target as HTMLSelectElement).value)}
                .value=${this.selectedMidiInputId || ''}
                aria-label="Select MIDI Input Device"
                ?disabled=${!this.isMidiSupported || this.availableMidiInputs.length === 0 || this.isRequestingMidiAccess || this.isDropActive || this.isMidiLearnActive}>
              <option value="">${this.isRequestingMidiAccess ? "Requesting Access..." : (this.availableMidiInputs.length > 0 ? "Select MIDI Device" : (this.isMidiSupported ? "No MIDI Devices Found" : "MIDI Not Supported"))}</option>
              ${this.availableMidiInputs.map(input => html`<option value=${input.id}>${input.name}</option>`)}
            </select>
            <button 
              class=${classMap(learnButtonClasses)}
              @click=${this.toggleMidiLearnMode}
              ?disabled=${!this.selectedMidiInputId || this.isDropActive || !this.midiAccessGranted}
              @pointerdown=${this.handleLearnButtonPress}
              @pointerup=${this.handleLearnButtonRelease}
              @pointerleave=${this.handleLearnButtonRelease}
              title=${this.selectedMidiInputId ? (this.isMidiLearnActive ? "Cancel MIDI Learn (Esc)" : "Start MIDI Learn Mode (Hold for 2s to clear all mappings)") : "Select a MIDI device to enable Learn Mode"}
            >${learnButtonText}</button>
          </div>
          <div class="header-actions">
            <cast-button 
                @click=${this.handleCastClick} 
                ?isCastingActive=${this.isCastingActive}
                aria-label="Cast audio to another device"
                title="Cast audio"
                ?disabled=${!this.isCastApiInitialized || this.castApiState === 'NO_DEVICES_AVAILABLE' || this.isMidiLearnActive || this.isDropActive}
            ></cast-button>
            <settings-button 
                @click=${() => this.showAdvancedSettings = !this.showAdvancedSettings}
                aria-label="Toggle advanced settings"
                title="Settings"
                ?disabled=${this.isDropActive || this.isMidiLearnActive}
            ></settings-button>
          </div>
        </header>

        <div class="advanced-settings-panel ${this.showAdvancedSettings ? 'visible' : ''}">
          <div class="settings-grid">
            <parameter-slider
              label="Temperature"
              .value=${this.temperature}
              min="0" max="2" step="0.05"
              @input=${(e: CustomEvent<number>) => { this.temperature = e.detail; this.sendPromptsToSession(); }}
              ?disabled=${this.isDropActive || this.isMidiLearnActive}
            ></parameter-slider>
            <!-- More advanced settings would go here if UI editable -->
             <div class="settings-grid-item">
                <label for="system-instruction-select">System Instruction Preset:</label>
                <select 
                    id="system-instruction-select" 
                    class="styled-select"
                    .value=${this.globalSystemInstruction}
                    @change=${this.handleSystemInstructionChange}
                    ?disabled=${this.isDropActive || this.isMidiLearnActive}
                    title="Choose a base behavior for the AI DJ">
                    <option value="You are an AI music DJ creating live, evolving soundscapes based on user prompts. Strive for musicality and coherence.">Default DJ</option>
                    <option value="You are a generative ambient soundscape creator. Focus on smooth transitions and evolving textures.">Ambient Soundscaper</option>
                    <option value="You are an experimental electronic music generator. Be surprising and unconventional.">Experimentalist</option>
                    <option value="You are a rhythmic beat and groove machine. Focus on strong percussive elements and basslines.">Groove Machine</option>
                    <option value="You are creating background music for focus and study. Keep it subtle and non-distracting.">Focus Music Generator</option>
                </select>
             </div>
          </div>
          <a class="hide-settings-link" @click=${() => this.showAdvancedSettings = false} ?hidden=${this.isDropActive || this.isMidiLearnActive}>Hide Settings</a>
        </div>

        <div class="learn-mode-message-bar ${this.isMidiLearnActive ? 'visible' : ''}" aria-live="polite">
          ${this.learnModeMessage}
        </div>

        <div class="content-area" role="main">
          <div id="prompts-container">
            ${promptControllers}
          </div>
          <add-prompt-button 
            class="floating-add-button" 
            @click=${() => this.createInitialPrompt()} 
            aria-label="Add new prompt"
            title="Add new prompt track"
            ?disabled=${this.isDropActive || this.isMidiLearnActive || this.prompts.size >= 7}
          ></add-prompt-button>
        </div>

        <div class="bottom-left-utility-cluster">
            <play-pause-button
                id="play-pause-main-button"
                .playbackState=${this.playbackState}
                @click=${this.togglePlayPause}
                aria-label=${this.playbackState === 'playing' ? 'Pause music' : 'Play music'}
                title=${this.playbackState === 'playing' ? 'Pause (Spacebar)' : 'Play (Spacebar)'}
                ?isMidiLearnTarget=${this.isMidiLearnActive && this.midiLearnTargetId === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON}
                ?disabled=${this.isDropActive || this.isMidiLearnActive || (!this.session && this.playbackState === 'stopped' && !this.connectionError)}
            ></play-pause-button>
        </div>

        <div class="utility-button-cluster">
            <drop-button 
                id="drop-main-button"
                @click=${this.triggerDropEffect} 
                aria-label="Trigger Drop Effect"
                title="Drop!"
                ?isMidiLearnTarget=${this.isMidiLearnActive && this.midiLearnTargetId === MIDI_LEARN_TARGET_DROP_BUTTON}
                ?disabled=${this.isDropActive || this.isMidiLearnActive || this.playbackState !== 'playing'}
            ></drop-button>
            <share-button @click=${this.shareConfiguration} title="Share current setup" aria-label="Share configuration" ?disabled=${this.isDropActive || this.isMidiLearnActive}></share-button>
            <help-button @click=${() => this.showHelpPanel = true} title="Show help guide" aria-label="Open help guide" ?disabled=${this.isDropActive || this.isMidiLearnActive}></help-button>
        </div>
        
        <help-guide-panel .isOpen=${this.showHelpPanel} @close-help=${() => this.showHelpPanel = false}></help-guide-panel>
        <toast-message></toast-message>
        <input type="file" id="presetFileInput" @change=${this.handlePresetFileSelected} accept=".json" style="display: none;" />
      </div>
    `;
  }

  // Event handlers for PromptController events (to be implemented or completed)
  private handlePromptChange(e: CustomEvent<Partial<Prompt>>) {
    const changedPrompt = e.detail;
    if (changedPrompt.promptId && this.prompts.has(changedPrompt.promptId)) {
      const existingPrompt = this.prompts.get(changedPrompt.promptId)!;
      const updatedPrompt = { ...existingPrompt, ...changedPrompt };
      this.prompts.set(changedPrompt.promptId, updatedPrompt);
      this.prompts = new Map(this.prompts); // Force update
      this.requestUpdate();
      if (this.playbackState === 'playing' || this.playbackState === 'loading') {
        this.sendPromptsToSession();
      }
    }
  }

  private handlePromptRemoved(e: CustomEvent<string>) {
    const promptIdToRemove = e.detail;
    if (this.prompts.has(promptIdToRemove)) {
      this.prompts.delete(promptIdToRemove);
      this.prompts = new Map(this.prompts); // Force update

      // Clear MIDI mapping if this prompt was a target
      this.midiCcToTargetMap.forEach((targetId, cc) => {
        if (targetId === promptIdToRemove) {
            this.midiCcToTargetMap.delete(cc);
        }
      });
      // If the removed prompt was the current learn target, clear it
      if (this.isMidiLearnActive && this.midiLearnTargetId === promptIdToRemove) {
          this.midiLearnTargetId = null;
          this.learnModeMessage = "Target removed. Click another element or move a MIDI controller for a new assignment.";
      }

      this.requestUpdate();
      if (this.playbackState === 'playing' || this.playbackState === 'loading') {
        this.sendPromptsToSession();
      }
      this.toastMessage.show("Prompt removed.", 2000);
    }
  }
  
  private handleSystemInstructionChange(e: Event) {
    const selectElement = e.target as HTMLSelectElement;
    this.globalSystemInstruction = selectElement.value;
    this.toastMessage.show(`System Instruction set to: ${selectElement.options[selectElement.selectedIndex].text}`, 3000);
    if (this.playbackState === 'playing' || this.playbackState === 'loading') {
      this.sendPromptsToSession(); // Resend prompts with new system instruction
    }
  }


  // Placeholder methods for other functionalities (to be implemented)
  private async togglePlayPause() {
    console.warn('togglePlayPause not fully implemented.');
     if (this.isDropActive) return;

    if (this.playbackState === 'playing') {
        this.playbackState = 'paused';
        if (this.session) this.session.pause(); // Pauses sending new audio from backend
        this.audioContext.suspend();
        this.toastMessage.show("Music Paused", 2000);
    } else if (this.playbackState === 'paused') {
        this.playbackState = 'playing';
        if (this.session) this.session.resume(); // Resumes sending new audio from backend
        this.audioContext.resume();
        this.toastMessage.show("Music Resumed", 2000);
    } else { // 'stopped' or 'loading' with error
        if (!this.session || this.connectionError) {
            await this.connectToSession(); // connectToSession will set to 'loading' then 'playing' or 'stopped' on error
        }
        // If connectToSession succeeds, it might auto-play or require another click.
        // For now, connectToSession might set to playing, or it should return status.
        // Assuming connectToSession handles setting playbackState to 'playing' if successful
        // and this.sendPromptsToSession() is called within it or after.
        if(this.audioContext.state === 'suspended') this.audioContext.resume();
    }
  }
  private triggerDropEffect() { console.warn('triggerDropEffect not fully implemented.'); }
  private shareConfiguration() { console.warn('shareConfiguration not fully implemented.'); }
  private handlePresetFileSelected(e: Event) { console.warn('handlePresetFileSelected not fully implemented.'); const target = e.target as HTMLInputElement; if(target.files) console.log(target.files[0]);}

  private handleLearnButtonPress(e: PointerEvent) {
    if (this.isMidiLearnActive || !this.selectedMidiInputId || !this.midiAccessGranted) return;
    // Start a timer for long-press to clear mappings
    this.learnButtonLongPressTimeout = window.setTimeout(() => {
        this.clearAllMidiMappings();
        this.learnButtonLongPressTimeout = null; // Clear the timeout ID
    }, 2000); // 2 seconds for long press
  }

  private handleLearnButtonRelease(e: PointerEvent) {
    if (this.learnButtonLongPressTimeout) {
        clearTimeout(this.learnButtonLongPressTimeout);
        this.learnButtonLongPressTimeout = null;
    }
  }
  private clearAllMidiMappings() {
    if (this.isMidiLearnActive) return; // Don't clear if learn mode is active for assignment
    this.midiCcToTargetMap.clear();
    this.toastMessage.show("All MIDI CC assignments cleared.", 3000);
    console.log("All MIDI CC assignments cleared.");
  }
}
