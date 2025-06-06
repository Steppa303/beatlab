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
import {decode, decodeAudioData as localDecodeAudioData, throttle, debounce} from './utils.js';
import { MidiController, type MidiInputInfo } from './midi-controller.js';
import type { Prompt, PlaybackState, AppLiveMusicGenerationConfig, PresetPrompt, Preset } from './types.js';
import { TRACK_COLORS, ORB_COLORS, CURRENT_PRESET_VERSION, MIDI_LEARN_TARGET_DROP_BUTTON, MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON, DROP_TRACK_DURATION, DROP_TRACK_INITIAL_WEIGHT, DROP_TRACK_COLOR, DROP_PROMPT_TEMPLATE } from './constants.js';

// Import components
import './components/weight-slider.js';
// import { WeightSlider } from './components/weight-slider.js'; // Type import not strictly needed if not directly referenced by type
import './components/parameter-slider.js';
import { ParameterSlider } from './components/parameter-slider.js';
import './components/toggle-switch.js';
// import { ToggleSwitch } from './components/toggle-switch.js';  // Type import not strictly needed
// import { IconButton } from './components/icon-button.js'; // Base class, not directly used by tag name in prompt-dj template
import './components/play-pause-button.js';
import { PlayPauseButton } from './components/play-pause-button.js';
import './components/add-prompt-button.js';
// import { AddPromptButton } from './components/add-prompt-button.js'; // Type import not strictly needed
import './prompt-controller.js';
import { PromptController as PromptControllerElement } from './prompt-controller.js';

// Import newly refactored components
import './components/settings-button.js';
import './components/cast-button.js';
import './components/help-button.js';
import './components/share-button.js';
import './components/drop-button.js';
import { DropButton } from './components/drop-button.js'; // Queried
import './components/save-preset-button.js';
import './components/load-preset-button.js';
import './components/toast-message.js';
import { ToastMessage } from './components/toast-message.js'; // Queried
import './components/help-guide-panel.js';
import { HelpGuidePanel } from './components/help-guide-panel.js'; // Queried
import './components/welcome-overlay.js';
import { WelcomeOverlay } from './components/welcome-overlay.js'; // Queried
import './components/tutorial-controller.js'; // Import TutorialController
import { TutorialController } from './components/tutorial-controller.js';


// Declare Cast SDK globals for TypeScript - Temporarily commented out to avoid ReferenceError
/*
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
    // cast?: typeof cast; // Make optional as it might not be loaded
    // chrome?: typeof chrome; // Make optional
    __onGCastApiAvailable?: (available: boolean, errorInfo?: any) => void;
    // webkitAudioContext for Safari
    webkitAudioContext: typeof AudioContext;
  }
}
*/

// window.__onGCastApiAvailable is now defined in index.html (but commented out)


// Use API_KEY as per guidelines
const ai = new GoogleGenAI({
  apiKey: process.env.API_KEY,
  apiVersion: 'v1alpha',
});

// Model for Lyria real-time music generation.
const activeModelName = 'models/lyria-realtime-exp';
const TUTORIAL_STORAGE_KEY = 'beatLabTutorialCompleted_v1.1';
const CAST_FEATURE_ENABLED = false; // Feature flag for Cast


// Default styles
const defaultStyles = css`
  :host {
    /* Neumorphic color palette and variables */
    --neumorph-bg: #e6e7ee;
    --neumorph-bg-darker: #dde0e9; /* For inset elements */
    --neumorph-shadow-color-light: rgba(255, 255, 255, 0.8);
    --neumorph-shadow-color-dark: rgba(163, 177, 198, 0.6);
    --neumorph-text-color: #333740;
    --neumorph-text-color-light: #707070;
    --neumorph-accent-primary: #6a11cb; /* Adjusted purple for better contrast */
    --neumorph-accent-secondary: #2575fc; /* Brighter blue as secondary */
    --neumorph-accent-drop: #FFC107; /* Softer gold for drop */
    --neumorph-accent-interactive: var(--neumorph-accent-primary); /* Default interactive color */
    --neumorph-radius-base: 12px;
    --neumorph-radius-large: 20px;
    --neumorph-radius-round: 50%;
    --neumorph-shadow-distance: 5px;
    --neumorph-shadow-blur: 10px;
    --neumorph-shadow-distance-strong: 8px;
    --neumorph-shadow-blur-strong: 15px;

    /* Default neumorphic shadow for extruded elements */
    --neumorph-shadow-outset:
      var(--neumorph-shadow-distance) var(--neumorph-shadow-distance) var(--neumorph-shadow-blur) var(--neumorph-shadow-color-dark),
      calc(var(--neumorph-shadow-distance) * -1) calc(var(--neumorph-shadow-distance) * -1) var(--neumorph-shadow-blur) var(--neumorph-shadow-color-light);

    /* Stronger outset shadow */
    --neumorph-shadow-outset-strong:
      var(--neumorph-shadow-distance-strong) var(--neumorph-shadow-distance-strong) var(--neumorph-shadow-blur-strong) var(--neumorph-shadow-color-dark),
      calc(var(--neumorph-shadow-distance-strong) * -1) calc(var(--neumorph-shadow-distance-strong) * -1) var(--neumorph-shadow-blur-strong) var(--neumorph-shadow-color-light);

    /* Default neumorphic shadow for inset elements */
    --neumorph-shadow-inset:
      inset var(--neumorph-shadow-distance) var(--neumorph-shadow-distance) var(--neumorph-shadow-blur) var(--neumorph-shadow-color-dark),
      inset calc(var(--neumorph-shadow-distance) * -1) calc(var(--neumorph-shadow-distance) * -1) var(--neumorph-shadow-blur) var(--neumorph-shadow-color-light);
    
    /* Softer inset for text fields */
    --neumorph-shadow-inset-soft:
      inset 2px 2px 4px var(--neumorph-shadow-color-dark),
      inset -2px -2px 4px var(--neumorph-shadow-color-light);

    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100vh; 
    min-height: 100vh;
    max-height: 100vh;
    background-color: var(--neumorph-bg);
    color: var(--neumorph-text-color);
    font-family: 'Google Sans', sans-serif;
    box-sizing: border-box;
    overflow: hidden;
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
  // private readonly CAST_NAMESPACE = 'urn:x-cast:com.google.cast.media'; // Temporarily unused
  private readonly FUNNY_LOADING_MESSAGES = [
    "🎵 Synthesizer werden vorgewärmt...",
    "🎧 Beats werden sorgfältig verteilt...",
    "🎶 Noten werden liebevoll abgestaubt...",
    "🎤 Mikrofone werden ausgerichtet...",
    "🎛️ Regler werden aufgedreht...",
    "✨ Magie wird in die Kabel geleitet...",
    "🔊 Soundwellen machen sich startklar...",
    "🚀 Der Countdown zum Groove läuft...",
    "🎼 Komponiere epische Klanglandschaften...",
    "🤖 Die KI-Musen küssen dich gleich...",
  ];


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
  @state() private isScreenFlashActive = false;


  @state() private temperature = 1.1;

  // Cast related state - will not be actively used if CAST_FEATURE_ENABLED is false
  // Types will be 'any' if global Cast types are commented out
  @state() private castContext: any | null = null;
  @state() private castSession: any | null = null;
  @state() private remotePlayer: any | null = null;
  @state() private remotePlayerController: any | null = null;
  @state() private isCastingAvailable = false;
  @state() private isCastingActive = false;

  @state() private isTutorialActive = false;
  @state() private forceTutorialFromUrl = false;
  @state() private hasHadFirstSuccessfulPlay = false;


  // --- Internal Class Members ---
  private nextPromptIdCounter = 0;
  private activeSession: LiveMusicSession | null = null;
  private audioContext: AudioContext;
  private outputGainNode: GainNode;
  private nextAudioChunkStartTime = 0;
  private midiController: MidiController;
  private sessionSetupComplete = false;
  private boundHandleCastApiReadyEvent: (event: CustomEvent<{available: boolean, errorInfo?: any}>) => void;
  private loadingMessageInterval: number | null = null;
  private currentLoadingMessageIndex = 0;
  private sliderJiggleTimeout: number | null = null;
  private dropTrackId: string | null = null;
  private dropEffectTimer: number | null = null;
  
  private initialAppHeight: number = 0; // Default to 0, will be set
  private debouncedViewportResizeHandler: (() => void) | null = null;


  // --- Queries for DOM Elements ---
  @query('play-pause-button') private playPauseButtonEl!: PlayPauseButton;
  @query('drop-button') private dropButtonEl!: DropButton;
  @query('add-prompt-button') private addPromptButtonEl!: HTMLElement;
  @query('tutorial-controller') private tutorialControllerEl!: TutorialController;
  @query('toast-message') private toastMessageEl!: ToastMessage;
  @query('#prompts-container') private promptsContainerEl!: HTMLElement;
  @query('#settings-panel') private settingsPanelEl!: HTMLElement;
  @query('help-guide-panel') private helpGuidePanelEl!: HelpGuidePanel;
  @query('welcome-overlay') private welcomeOverlayEl!: WelcomeOverlay;
  @query('#midi-device-select') private midiDeviceSelectEl!: HTMLSelectElement; // Now inside settings panel
  @query('#learn-midi-button') private learnMidiButtonEl!: HTMLButtonElement; // Now inside settings panel


  constructor() {
    super();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('forceTutorial') === 'true') {
      this.forceTutorialFromUrl = true;
      // Clear relevant local storage items immediately if forcing tutorial
      localStorage.removeItem(TUTORIAL_STORAGE_KEY);
      localStorage.removeItem('prompts'); // Start with fresh prompts for forced tutorial
      localStorage.removeItem('beatLabWelcomeShown'); // Don't show welcome if tutorial is forced
      console.log('Tutorial is being forced by URL parameter. Relevant localStorage cleared.');
    }

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: this.SAMPLE_RATE,
    });
    this.outputGainNode = this.audioContext.createGain();
    this.outputGainNode.connect(this.audioContext.destination);
    this.midiController = new MidiController();
    this.initializeMidi();
    
    this.checkTutorialStatusAndLoadPrompts();


    this.handleSessionMessage = this.handleSessionMessage.bind(this);
    this.handleSessionError = this.handleSessionError.bind(this);
    this.handleSessionClose = this.handleSessionClose.bind(this);
    
    if (CAST_FEATURE_ENABLED) {
        this.boundHandleCastApiReadyEvent = this.handleCastApiReady.bind(this) as EventListener;
        document.addEventListener('cast-api-ready', this.boundHandleCastApiReadyEvent);
    } else {
        this.boundHandleCastApiReadyEvent = () => {}; // No-op if Cast is disabled
    }

    if (this.forceTutorialFromUrl) {
      this.showWelcome = false; // Don't show welcome overlay if tutorial is forced
    } else if (!this.isTutorialActive && !localStorage.getItem('beatLabWelcomeShown')) {
        this.showWelcome = true;
    }

    // Listener for prompt controllers requesting app height reset
    this.addEventListener('request-app-height-reset', () => this.setHostHeight());
  }


  private checkTutorialStatusAndLoadPrompts() {
    if (this.forceTutorialFromUrl) {
      this.isTutorialActive = true;
      this.prompts = new Map(); // Start fresh for tutorial
      this.nextPromptIdCounter = 0;
      // The localStorage items were already cleared in constructor
      console.log('Forced tutorial: Initializing with empty prompts.');
    } else {
      const permanentlySkipTutorial = localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true';
      if (permanentlySkipTutorial) {
        this.isTutorialActive = false;
        this.loadInitialPrompts();
      } else {
        this.isTutorialActive = true;
        this.prompts = new Map(); // Start fresh for tutorial
        this.nextPromptIdCounter = 0;
      }
    }
  }

  private setHostHeight() {
    if (this.initialAppHeight > 0) {
        this.style.height = `${this.initialAppHeight}px`;
        this.style.minHeight = `${this.initialAppHeight}px`;
        this.style.maxHeight = `${this.initialAppHeight}px`;
    }
  }

  private handleViewportResize() {
    if (this.initialAppHeight === 0) { 
        if (window.visualViewport) { 
            this.initialAppHeight = window.innerHeight;
            if (this.initialAppHeight === 0) return; 
        } else {
            return; 
        }
    }

    const visualViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const currentWindowInnerHeight = window.innerHeight;
    
    const isLikelyGenuineResize = 
        Math.abs(visualViewportHeight - currentWindowInnerHeight) < 50 && 
        Math.abs(currentWindowInnerHeight - this.initialAppHeight) > 50;

    if (isLikelyGenuineResize) {
      this.initialAppHeight = currentWindowInnerHeight;
    }
    
    this.setHostHeight();
  }


  // --- Lifecycle Methods ---
  override connectedCallback() {
    super.connectedCallback();
    this.audioContext.resume();
    document.addEventListener('keydown', this.handleGlobalKeyDown);

    // JS Height Fix:
    requestAnimationFrame(() => {
      // Capture initial height only once or if it hasn't been set properly
      if (this.initialAppHeight === 0) {
         this.initialAppHeight = window.innerHeight;
      }
      this.setHostHeight(); // Apply it immediately
    });
    
    if (window.visualViewport) {
      this.debouncedViewportResizeHandler = debounce(() => this.handleViewportResize(), 150);
      window.visualViewport.addEventListener('resize', this.debouncedViewportResizeHandler);
    } else {
      console.warn('window.visualViewport API not available. Keyboard overlay behavior might be less reliable.');
      // Fallback for older browsers, though less effective for keyboard
      window.addEventListener('resize', debounce(() => {
        if (this.initialAppHeight === 0) this.initialAppHeight = window.innerHeight; // Ensure it's set
        this.handleViewportResize(); // Let the main logic handle it
      }, 150));
    }
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
    
    if (CAST_FEATURE_ENABLED && (window as any).cast && (window as any).cast.framework) {
        if (this.castContext) {
            this.castContext.removeEventListener(
                (window as any).cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
                this.handleCastSessionStateChange.bind(this) // Ensure bound listener for removal
            );
            this.castContext.removeEventListener(
                (window as any).cast.framework.CastContextEventType.CAST_STATE_CHANGED,
                this.handleCastStateChange.bind(this) // Ensure bound listener for removal
            );
        }
        if (this.remotePlayerController) {
            this.remotePlayerController.removeEventListener(
                (window as any).cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
                this.handleRemotePlayerConnectChange.bind(this) // Ensure bound listener for removal
            );
        }
        document.removeEventListener('cast-api-ready', this.boundHandleCastApiReadyEvent);
    }
    document.removeEventListener('keydown', this.handleGlobalKeyDown);
    this.clearLoadingMessageInterval();
    if (this.sliderJiggleTimeout) {
        clearTimeout(this.sliderJiggleTimeout);
        this.sliderJiggleTimeout = null;
    }
    if (this.dropEffectTimer) {
        clearTimeout(this.dropEffectTimer);
        this.dropEffectTimer = null;
    }

    // JS Height Fix: Cleanup listener
    if (this.debouncedViewportResizeHandler && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.debouncedViewportResizeHandler);
    }
    // Could also remove the fallback window.resize listener if it was added
  }

  override firstUpdated() {
    this.loadStateFromURL();
    this.updateMidiLearnButtonState();
  }

  // --- Initialization & Setup ---

  private loadInitialPrompts() {
    // This is called only if tutorial is NOT active or already completed
    // and not forced by URL
    if (this.isTutorialActive) return; 

    const storedPrompts = localStorage.getItem('prompts');
    if (storedPrompts) {
      try {
        const parsedPromptsArray: PresetPrompt[] = JSON.parse(storedPrompts);
        const newPrompts = new Map<string, Prompt>();
        parsedPromptsArray.forEach(p => {
          const id = this.generateNewPromptId();
          newPrompts.set(id, { ...p, promptId: id, color: this.getUnusedRandomColor(Array.from(newPrompts.values()).map(pr => pr.color)), isDropTrack: false });
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

    // If tutorial is active (even forced), numToCreate is 0.
    // Default prompts are only created if tutorial is not active.
    const numToCreate = this.isTutorialActive ? 0 : Math.min(2, defaultTexts.length);
    const newPrompts = new Map<string, Prompt>();
    for (let i = 0; i < numToCreate; i++) {
      const id = this.generateNewPromptId();
      newPrompts.set(id, {
        promptId: id,
        text: defaultTexts[i],
        weight: i === 0 ? 1.0 : 0.0,
        color: this.getUnusedRandomColor(Array.from(newPrompts.values()).map(p => p.color)),
        isDropTrack: false,
      });
    }
    this.prompts = newPrompts;
    this.recalculateNextPromptIdCounter();
    this.savePromptsToLocalStorage();
  }


  private async connectToSession(): Promise<boolean> {
    if (this.activeSession && this.sessionSetupComplete) {
      console.log('Session already active and setup.');
      // If session is already active and setup, playbackState is NOT changed here.
      // The caller (startAudioStream) will handle setting to 'loading' if needed.
      return true;
    }
    // If we are already trying to load (e.g. multiple rapid clicks on play while it's connecting)
    if (this.playbackState === 'loading' && this.loadingMessageInterval) {
        console.warn('Connection attempt skipped, already loading (connectToSession guard).');
        return false; // Indicate that we didn't proceed due to already loading
    }

    this.playbackState = 'loading'; // Set to loading *before* attempting connection
    this.startLoadingMessageSequence(); // Start messages (will check hasHadFirstSuccessfulPlay)
    this.sessionSetupComplete = false; // Must be reset before new connection attempt

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
      // playbackState is now 'loading', sessionSetupComplete is false.
      // It will transition to 'playing' in handleSessionMessage upon receiving the first audio chunk after setupComplete.
      return true;
    } catch (error: any) {
      console.error('Failed to connect to Lyria session:', error);
      this.toastMessageEl.show(`Error connecting: ${error.message || 'Unknown error'}`);
      this.playbackState = 'stopped'; // On error, revert to stopped
      this.clearLoadingMessageInterval(); // Stop loading messages
      this.activeSession = null; // Clear session
      this.sessionSetupComplete = false; // Ensure this is false
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
      this.toastMessageEl.show(`Prompt: "${filteredText}" wurde gefiltert. Grund: ${reason}. Wird ignoriert.`);
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

        if (CAST_FEATURE_ENABLED && this.isCastingActive && this.castSession) {
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
          this.startLoadingMessageSequence(); // Restart messages if underrun, respects hasHadFirstSuccessfulPlay
          this.nextAudioChunkStartTime = currentTime + this.BUFFER_AHEAD_TIME_SECONDS; // Try to re-buffer
        }

        source.start(this.nextAudioChunkStartTime);
        this.nextAudioChunkStartTime += audioBuffer.duration;

        // Transition to playing state if we were loading and setup is complete
        if (this.playbackState === 'loading' && this.sessionSetupComplete) {
            this.playbackState = 'playing';
            this.clearLoadingMessageInterval();
            if (!this.hasHadFirstSuccessfulPlay) {
                this.toastMessageEl.show("▶️ Wiedergabe gestartet!", 2000);
            }
            if (this.sliderJiggleTimeout) {
                clearTimeout(this.sliderJiggleTimeout);
                this.sliderJiggleTimeout = null;
            }
            this.hasHadFirstSuccessfulPlay = true; // Mark first successful play
             // Notify tutorial if active
            if (this.isTutorialActive && this.tutorialControllerEl) {
              this.tutorialControllerEl.notifyAppEvent('playbackStarted');
            }
        }

      } catch (error) {
        console.error('Error processing audio chunk:', error);
        this.toastMessageEl.show('Fehler bei der Audioverarbeitung.');
         if (this.playbackState === 'loading') {
            this.playbackState = 'paused'; // Fallback to paused if audio processing fails during loading
            this.clearLoadingMessageInterval();
        }
      }
    }
  }

  private handleSessionError(error: any) {
    console.error('LiveMusicSession Error:', error);
    this.toastMessageEl.show(`Session-Fehler: ${error.message || 'Verbindung verloren'}. Bitte erneut versuchen.`);
    this.playbackState = 'stopped';
    this.clearLoadingMessageInterval();
    if (this.sliderJiggleTimeout) {
        clearTimeout(this.sliderJiggleTimeout);
        this.sliderJiggleTimeout = null;
    }
    this.activeSession = null;
    this.sessionSetupComplete = false;
    this.nextAudioChunkStartTime = 0;
    // Do not reset hasHadFirstSuccessfulPlay here, as it's a session error, not a full UI reset.
  }

  private handleSessionClose(event: any) {
    console.log('LiveMusicSession Closed:', event);
    if (this.playbackState !== 'stopped') {
      // this.toastMessageEl.show('Music session closed.');
    }
    this.playbackState = 'stopped';
    this.clearLoadingMessageInterval();
    if (this.sliderJiggleTimeout) {
        clearTimeout(this.sliderJiggleTimeout);
        this.sliderJiggleTimeout = null;
    }
    this.activeSession = null;
    this.sessionSetupComplete = false;
    this.nextAudioChunkStartTime = 0;
    // Do not reset hasHadFirstSuccessfulPlay here.
  }


  // --- Audio Playback Control ---
  private async togglePlayPause() {
    if (this.isDropEffectActive) {
        this.toastMessageEl.show("Bitte warte, bis der 'Drop!'-Effekt beendet ist.", 2000);
        return;
    }

    if (this.playbackState === 'playing') {
      this.pauseAudioStream();
    } else {
      await this.startAudioStream();
    }
  }

 private async startAudioStream() {
    if (this.playbackState === 'loading' && this.loadingMessageInterval && !this.hasHadFirstSuccessfulPlay) {
        console.warn('Start audio stream attempt skipped, already showing initial loading messages.');
        return;
    }

    const wasPausedOrStopped = this.playbackState === 'paused' || this.playbackState === 'stopped';

    if (!(await this.connectToSession())) {
      return;
    }

    if (this.activeSession) {
        try {
            if (this.playbackState !== 'playing' && this.playbackState !== 'loading') {
                this.playbackState = 'loading';
                this.startLoadingMessageSequence(); // Respects hasHadFirstSuccessfulPlay
            }

            if (wasPausedOrStopped) {
                this.nextAudioChunkStartTime = 0;
            }

            console.log('Calling session.play()');
            this.activeSession.play();
            this.audioContext.resume();
            this.outputGainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            this.outputGainNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.2);

            await this.sendPromptsToSession();
            await this.updatePlaybackParameters();

            if (this.sliderJiggleTimeout) clearTimeout(this.sliderJiggleTimeout);
            this.sliderJiggleTimeout = window.setTimeout(() => {
                if (this.playbackState === 'loading' && this.prompts.size > 0 && this.activeSession && this.sessionSetupComplete) {
                    console.log("Playback stuck in loading, attempting 'slider jiggle' fix...");
                    const firstPromptEntry = Array.from(this.prompts.entries())[0];
                    if (firstPromptEntry) {
                        const [promptId, prompt] = firstPromptEntry;
                        const originalWeight = prompt.weight;
                        let newWeight = originalWeight + 0.0011;
                        if (newWeight > 2.0) newWeight = originalWeight - 0.0011;
                        if (newWeight < 0) newWeight = 0.0011;

                        const updatedPrompt = { ...prompt, weight: newWeight };
                        this.prompts = new Map(this.prompts).set(promptId, updatedPrompt);
                        this.sendPromptsToSession();
                        setTimeout(() => {
                            const currentPrompt = this.prompts.get(promptId);
                            if (currentPrompt && currentPrompt.weight !== originalWeight) {
                                const revertedPrompt = { ...currentPrompt, weight: originalWeight };
                                this.prompts = new Map(this.prompts).set(promptId, revertedPrompt);
                                this.sendPromptsToSession();
                                console.log("'Slider jiggle' completed.");
                            }
                        }, 50);
                    }
                }
                this.sliderJiggleTimeout = null;
            }, 3000);

        } catch (error: any) {
            console.error("Error trying to play session:", error);
            this.toastMessageEl.show(`Playback-Fehler: ${error.message}`);
            this.playbackState = 'stopped';
            this.clearLoadingMessageInterval();
            if (this.sliderJiggleTimeout) clearTimeout(this.sliderJiggleTimeout);
            this.sliderJiggleTimeout = null;
            this.nextAudioChunkStartTime = 0;
        }
    } else {
        console.error("Cannot start audio stream: session not active after connectToSession call.");
        this.toastMessageEl.show("Fehler: Musik-Session nicht verfügbar.");
        this.playbackState = 'stopped';
        this.clearLoadingMessageInterval();
        if (this.sliderJiggleTimeout) clearTimeout(this.sliderJiggleTimeout);
        this.sliderJiggleTimeout = null;
        this.nextAudioChunkStartTime = 0;
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
    this.clearLoadingMessageInterval(); 
    if (this.sliderJiggleTimeout) {
        clearTimeout(this.sliderJiggleTimeout);
        this.sliderJiggleTimeout = null;
    }
  }

  private stopAudioStreamResetSession() {
    if (this.activeSession) {
      console.log('Calling session.stop() and resetting context.');
      this.activeSession.stop();
      this.activeSession.resetContext();
    }
    this.outputGainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.nextAudioChunkStartTime = 0;
    this.playbackState = 'stopped';
    this.clearLoadingMessageInterval();
    if (this.sliderJiggleTimeout) {
        clearTimeout(this.sliderJiggleTimeout);
        this.sliderJiggleTimeout = null;
    }
    this.activeSession = null;
    this.sessionSetupComplete = false;
    
    // Clear drop effect state if a full reset happens
    if (this.dropEffectTimer) {
        clearTimeout(this.dropEffectTimer);
        this.dropEffectTimer = null;
    }
    if (this.dropTrackId && this.prompts.has(this.dropTrackId)) {
        // Remove from prompts map directly, UI will update on next render
        this.prompts.delete(this.dropTrackId);
        // No need to call new Map(this.prompts) if prompts is already being re-assigned or updated elsewhere
        // that would trigger a Lit update. However, to be safe for isolated calls:
        this.prompts = new Map(this.prompts);
    }
    this.dropTrackId = null;
    this.isDropEffectActive = false; 

    this.requestUpdate();
  }

  private startLoadingMessageSequence() {
    this.clearLoadingMessageInterval(); 
    this.currentLoadingMessageIndex = 0; 

    // Only show funny messages if playback hasn't succeeded yet (first time play)
    if (!this.hasHadFirstSuccessfulPlay) {
        this.toastMessageEl.show(this.FUNNY_LOADING_MESSAGES[this.currentLoadingMessageIndex], 0);
        this.currentLoadingMessageIndex = (this.currentLoadingMessageIndex + 1) % this.FUNNY_LOADING_MESSAGES.length;

        this.loadingMessageInterval = window.setInterval(() => {
            if (this.playbackState === 'loading' && !this.hasHadFirstSuccessfulPlay) { // Added check here too
                this.toastMessageEl.show(this.FUNNY_LOADING_MESSAGES[this.currentLoadingMessageIndex], 0);
                this.currentLoadingMessageIndex = (this.currentLoadingMessageIndex + 1) % this.FUNNY_LOADING_MESSAGES.length;
            } else {
                this.clearLoadingMessageInterval(); 
            }
        }, 3500);
    }
  }

  private clearLoadingMessageInterval() {
    if (this.loadingMessageInterval) {
        clearInterval(this.loadingMessageInterval);
        this.loadingMessageInterval = null;
    }
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


  private async handleAddPromptClick() {
    if (this.isDropEffectActive) return;
    if (this.prompts.size >= 7 && !this.isTutorialActive) { // Allow more during tutorial if needed by steps
      this.toastMessageEl.show('Maximal 7 Prompts erreicht.', 3000);
      return;
    }
    const newId = this.generateNewPromptId();
    const newPrompt: Prompt = {
      promptId: newId,
      text: 'Neuer Prompt',
      weight: 0.0, // Default weight
      color: this.getUnusedRandomColor(Array.from(this.prompts.values()).map(p => p.color)),
      isDropTrack: false,
    };

    if (this.isTutorialActive && this.prompts.size === 0) {
        newPrompt.weight = 1.0; // Set first tutorial prompt's weight to 1
    }

    this.prompts = new Map(this.prompts).set(newId, newPrompt);
    this.savePromptsToLocalStorage();
    this.sendPromptsToSession();

    await this.updateComplete; // Wait for Lit to re-render

    const promptElement = this.shadowRoot?.querySelector(`prompt-controller[promptid="${newId}"]`) as PromptControllerElement | null;
    if (promptElement) {
        if (!this.isTutorialActive) { // Only enter edit mode automatically if not in tutorial
            promptElement.enterEditModeAfterCreation?.();
        }
        if (this.promptsContainerEl) { // Scroll into view if container exists
          promptElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        // Notify tutorial controller that a prompt was created
        if (this.isTutorialActive && this.tutorialControllerEl) {
           this.tutorialControllerEl.notifyAppEvent('promptCreated', {
             promptId: newId,
             element: promptElement,
             isEmpty: this.prompts.size === 1, // True if it's the first prompt
             initialWeight: newPrompt.weight // Pass initial weight
           });
        }
    }
  }

  private handlePromptChanged(e: CustomEvent<Partial<Prompt> & {promptId: string}>) {
    if (this.isDropEffectActive) return;
    const { promptId, ...changes } = e.detail;
    const existingPrompt = this.prompts.get(promptId);
    if (existingPrompt) {
      const updatedPrompt: Prompt = { ...existingPrompt, ...changes, isDropTrack: existingPrompt.isDropTrack }; // Preserve isDropTrack
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

      if (this.isTutorialActive && this.tutorialControllerEl) {
        if (changes.weight !== undefined) {
          this.tutorialControllerEl.notifyAppEvent('promptWeightChanged', { promptId, newWeight: changes.weight });
        }
        if (changes.text !== undefined) {
          this.tutorialControllerEl.notifyAppEvent('promptTextChanged', { promptId, newText: changes.text });
        }
      }
    }
  }

  private handlePromptRemoved(e: CustomEvent<string>) {
    if (this.isDropEffectActive && e.detail !== this.dropTrackId) return; // Allow drop track to be removed by its own logic
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

      // If the drop track was removed manually during its effect
      if (promptIdToRemove === this.dropTrackId) {
          if (this.dropEffectTimer) {
              clearTimeout(this.dropEffectTimer);
              this.dropEffectTimer = null;
          }
          this.dropTrackId = null;
          this.isDropEffectActive = false;
      }
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
      this.toastMessageEl.show(`Fehler beim Aktualisieren der Prompts: ${error.message}`);
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
    // Don't save prompts if tutorial is active and hasn't created any prompts yet by user,
    // or if tutorial is active but not yet on the completion step.
    if (this.isTutorialActive && this.prompts.size === 0 && this.tutorialControllerEl?.currentStepId !== 'completion') {
        return;
    }
    const promptsToStore: PresetPrompt[] = Array.from(this.prompts.values())
      .filter(p => !p.isDropTrack) // Don't save temporary drop track
      .map(p => ({
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
        this.toastMessageEl.show(`Fehler beim Aktualisieren der Parameter: ${error.message}`);
      }
    }
  }

  private toggleSettingsPanel() {
    this.showSettings = !this.showSettings;
    // If opening settings, ensure MIDI learn button state is correct.
    if (this.showSettings) {
        this.updateComplete.then(() => this.updateMidiLearnButtonState());
    }
  }
  private toggleHelpPanel() {
    this.showHelp = !this.showHelp;
  }
  private handleWelcomeComplete(e: CustomEvent<{firstPromptText: string}>) {
    this.showWelcome = false;
    localStorage.setItem('beatLabWelcomeShown', 'true');
    if (!this.isTutorialActive) { // Only create defaults if tutorial isn't managing prompts
        this.createDefaultPrompts(e.detail.firstPromptText);
    }
  }


  // --- "Drop!" Effect ---
  private async handleDropClick() {
    if (!this.activeSession || !this.sessionSetupComplete || this.playbackState !== 'playing') {
      this.toastMessageEl.show("Bitte starte zuerst die Wiedergabe, um 'Drop!' zu nutzen.", 3000);
      return;
    }
    if (this.isDropEffectActive) {
      this.toastMessageEl.show("'Drop!'-Effekt läuft bereits.", 2000);
      return;
    }

    const activeUserPrompts = Array.from(this.prompts.values()).filter(p => p.weight > 0.01 && !p.isDropTrack);
    if (activeUserPrompts.length === 0 && !this.isTutorialActive) { // Allow drop in tutorial even without active prompts for testing
        this.toastMessageEl.show("Aktiviere zuerst Prompts für den Drop!-Effekt.", 3000);
        return;
    }
    
    this.isDropEffectActive = true;
    this.isScreenFlashActive = true;
    setTimeout(() => { this.isScreenFlashActive = false; }, 300); // Flash duration

    const currentStyle = activeUserPrompts.length > 0 
      ? activeUserPrompts.map(p => p.text).join(' and ')
      : "the current sound"; // Fallback style if no active prompts (e.g., during tutorial step)
    
    const dropPromptText = DROP_PROMPT_TEMPLATE.replace(/%STYLE%/g, currentStyle);


    const newDropId = this.generateNewPromptId();
    const dropPrompt: Prompt = {
      promptId: newDropId,
      text: dropPromptText,
      weight: DROP_TRACK_INITIAL_WEIGHT,
      color: DROP_TRACK_COLOR,
      isDropTrack: true, // Mark as drop track
    };

    this.dropTrackId = newDropId;
    this.prompts = new Map(this.prompts).set(newDropId, dropPrompt);
    await this.sendPromptsToSession(); // Send with the new drop prompt

    if (this.dropEffectTimer) {
      clearTimeout(this.dropEffectTimer);
    }

    this.dropEffectTimer = window.setTimeout(async () => {
      if (this.dropTrackId) {
        const currentDropPromptExists = this.prompts.has(this.dropTrackId);
        if (currentDropPromptExists) {
          this.prompts.delete(this.dropTrackId);
          this.prompts = new Map(this.prompts); // Trigger update
          await this.sendPromptsToSession(); // Send without the drop prompt
        }
        this.dropTrackId = null;
      }
      this.isDropEffectActive = false;
      this.dropEffectTimer = null;
      this.requestUpdate('isDropEffectActive'); // Ensure UI reflects change
    }, DROP_TRACK_DURATION);
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

      if (this.isMidiLearning && this.midiLearnTarget) {
        this.assignMidiCcToLearnTarget(ccNumber);
        return; // Don't process the CC value for control if we just learned it
      }

      const targetId = this.midiCcMap.get(ccNumber);

      if (targetId) {
        if (targetId === MIDI_LEARN_TARGET_DROP_BUTTON) {
          if (rawValue > 64) this.handleDropClick();
        } else if (targetId === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON) {
          if (rawValue > 64) this.togglePlayPause();
        } else {
          const prompt = this.prompts.get(targetId);
          if (prompt && !prompt.isDropTrack) { // Don't allow MIDI control of drop track weight
            const newWeight = Math.max(0, Math.min(2, value));
            if (prompt.weight !== newWeight) {
                prompt.weight = newWeight;
                this.prompts = new Map(this.prompts);
                this.sendPromptsToSession();
                this.savePromptsToLocalStorage();
                 if (this.isTutorialActive && this.tutorialControllerEl) {
                    this.tutorialControllerEl.notifyAppEvent('promptWeightChanged', { promptId: targetId, newWeight });
                }
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
            this.toastMessageEl.show(`MIDI-Gerät ${this.availableMidiInputs.find(i => i.id === newId)?.name || newId} ausgewählt.`, 2000);
        } else if (this.midiController.isMidiSupported()){
            this.toastMessageEl.show('MIDI-Zugriff verweigert oder keine Geräte gefunden. Bitte Browser-Berechtigungen prüfen.', 4000);
            this.selectedMidiInputId = null;
        } else {
            this.toastMessageEl.show('Web MIDI API nicht unterstützt in diesem Browser.', 4000);
            this.selectedMidiInputId = null;
        }
    } else {
        this.midiController.selectMidiInput('');
        this.toastMessageEl.show('MIDI-Eingang abgewählt.', 2000);
    }
    this.isMidiLearning = false;
    this.midiLearnTarget = null;
    this.updateMidiLearnButtonState();
    this.loadMidiMappings();
  }

  private toggleMidiLearnMode() {
    if (!this.selectedMidiInputId && !this.isMidiLearning) {
        this.toastMessageEl.show('Bitte zuerst ein MIDI-Eingangsgerät auswählen.', 3000);
        return;
    }
    this.isMidiLearning = !this.isMidiLearning;
    if (!this.isMidiLearning) {
      this.midiLearnTarget = null;
      this.saveMidiMappings();
      this.toastMessageEl.hide(); // Hide any "move a control" messages
    } else {
      // Initial message for learn mode will be set by handleMidiLearnTargetClick or displayed by default
    }
    this.updateMidiLearnButtonState();
  }

  private handleMidiLearnTargetClick(targetType: 'prompt' | 'dropbutton' | 'playpausebutton', id: string, e: Event) {
    if (!this.isMidiLearning) return;
    e.stopPropagation();

    const targetPrompt = this.prompts.get(id);
    if (targetPrompt?.isDropTrack && targetType === 'prompt') {
        this.toastMessageEl.show("Der 'Drop!' Track kann nicht per MIDI gesteuert werden.", 2500);
        return;
    }

    if (this.midiLearnTarget === id) {
      this.midiLearnTarget = null;
      this.toastMessageEl.show(`Zielauswahl aufgehoben. Klicke ein Element an oder Esc zum Beenden.`, 0);
    } else {
      this.midiLearnTarget = id;
      const targetName =
        id === MIDI_LEARN_TARGET_DROP_BUTTON ? "Drop! Button" :
        id === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON ? "Play/Pause Button" :
        `Prompt "${this.prompts.get(id)?.text}"`;
      this.toastMessageEl.show(`"${targetName}" ausgewählt. Jetzt einen MIDI-Controller bewegen. (Esc zum Abbrechen)`, 0);
    }
  }

  private assignMidiCcToLearnTarget(ccNumber: number) {
    if (!this.isMidiLearning || !this.midiLearnTarget) return;

    // Remove existing assignment for this CC number
    this.midiCcMap.delete(ccNumber);
    // Remove existing assignment for this target
    this.midiCcMap.forEach((target, cc) => {
        if (target === this.midiLearnTarget) {
            this.midiCcMap.delete(cc);
        }
    });

    this.midiCcMap.set(ccNumber, this.midiLearnTarget);
    const targetName = this.midiLearnTarget === MIDI_LEARN_TARGET_DROP_BUTTON ? "Drop! Button"
                     : this.midiLearnTarget === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON ? "Play/Pause Button"
                     : `Prompt "${this.prompts.get(this.midiLearnTarget)?.text}"`;
    this.toastMessageEl.show(`MIDI CC ${ccNumber} zugewiesen zu ${targetName}. Klicke nächstes Ziel an.`, 2500);

    this.midiLearnTarget = null; // Deselect target, ready for next
    this.saveMidiMappings();
  }

  private updateMidiLearnButtonState() {
    // this.learnMidiButtonEl might not exist if settings panel is closed when this is called.
    // Check for its existence before trying to manipulate it.
    if (!this.learnMidiButtonEl) return;

    if (this.isMidiLearning) {
      this.learnMidiButtonEl.textContent = 'Learning... (Abbrechen)';
      this.learnMidiButtonEl.classList.add('learning');
      this.learnMidiButtonEl.style.setProperty('box-shadow', 'var(--neumorph-shadow-inset)');
      this.learnMidiButtonEl.style.setProperty('background', 'var(--neumorph-accent-primary)');
      this.learnMidiButtonEl.style.setProperty('color', 'white');


    } else {
      this.learnMidiButtonEl.textContent = 'Learn MIDI';
      this.learnMidiButtonEl.classList.remove('learning');
      this.learnMidiButtonEl.style.removeProperty('box-shadow');
      this.learnMidiButtonEl.style.removeProperty('background');
      this.learnMidiButtonEl.style.removeProperty('color');
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
          this.toastMessageEl.show('MIDI-Lernziel abgewählt. Wähle ein anderes oder Esc zum Beenden.', 0);
        } else {
          this.isMidiLearning = false;
          this.updateMidiLearnButtonState();
          this.toastMessageEl.show('MIDI-Lernmodus beendet.', 2000);
          this.saveMidiMappings();
        }
      }
    } else {
        // Global spacebar for play/pause if no input field is focused
        if (e.key === ' ' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) ) {
            e.preventDefault();
            // Allow tutorial to intercept space if needed
            if (this.isTutorialActive && this.tutorialControllerEl?.interceptSpacebar()) {
                return;
            }
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
    const oldMappingsCount = this.midiCcMap.size;
    this.midiCcMap.clear();

    if (this.selectedMidiInputId) {
        localStorage.removeItem(`midiMappings_${this.selectedMidiInputId}`);
        if (showToast && oldMappingsCount > 0) { // Only show toast if mappings were actually cleared
            const selectedOption = this.midiDeviceSelectEl?.options[this.midiDeviceSelectEl.selectedIndex];
            const deviceName = selectedOption ? selectedOption.text : 'das ausgewählte Gerät';
            if (deviceName !== '-- Select MIDI Device --') { // Check if a device was actually selected
                 this.toastMessageEl.show(`Alle MIDI-Zuweisungen für ${deviceName} gelöscht.`, 2500);
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

    const promptData = Array.from(this.prompts.values())
      .filter(p => !p.isDropTrack) // Don't include temporary drop track in share link
      .map(p => ({t: p.text, w: p.weight.toFixed(2)}));
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
      this.toastMessageEl.show('Link in Zwischenablage kopiert! Wiedergabe startet automatisch.', 3000);
    } catch (err) {
      console.error('Failed to copy link:', err);
      this.toastMessageEl.show('Fehler beim Kopieren des Links. Siehe Konsole.', 3000);
    }
  }

  private loadStateFromURL() {
    const params = new URLSearchParams(window.location.search);
    const isShareLink = params.has('p') || params.has('v');

    if (isShareLink) {
        console.log('Share link detected. Overriding tutorial/welcome state.');
        this.isTutorialActive = false;
        this.showWelcome = false;
        localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
        localStorage.setItem('beatLabWelcomeShown', 'true');

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
                        color: this.getUnusedRandomColor(Array.from(newPrompts.values()).map(p => p.color)),
                        isDropTrack: false,
                    });
                });
                this.prompts = newPrompts;
                this.recalculateNextPromptIdCounter(); // Ensure counter is correct after loading
                this.savePromptsToLocalStorage(); // Save loaded prompts
            } catch (e) { console.error('Error parsing prompts from URL', e); }
        }

        if (params.has('temp')) this.temperature = parseFloat(params.get('temp')!);
        // Potentially load other sharedConfig parameters here if needed from URL (guid, bpm, etc.)
        // For now, they are only read by getSharedConfigFromState when sending to API

        if (params.has('play') && params.get('play') === '1') {
            this.hasHadFirstSuccessfulPlay = false;
            setTimeout(() => this.startAudioStream(), 500);
        }
    } else if (this.isTutorialActive) {
        // Not a share link, but tutorial is active (e.g., normal first visit or forced)
        if (this.forceTutorialFromUrl) {
            console.log('Forced tutorial: Normal URL state loading skipped.');
        } else {
            console.log('Tutorial active (and not a share link): Normal URL state loading skipped.');
        }
    }
    // If not a share link AND tutorial is not active, `loadInitialPrompts` (called from constructor via checkTutorialStatus)
    // would have already loaded prompts from localStorage or created defaults.
    // No further action needed for URL parameters in that case by this method.
}


  private handleSavePreset() {
    const presetPrompts: PresetPrompt[] = Array.from(this.prompts.values())
      .filter(p => !p.isDropTrack) // Don't save temporary drop track
      .map(p => ({
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
    this.toastMessageEl.show('Preset gespeichert!', 2000);
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
                this.toastMessageEl.show(`Fehler beim Laden des Presets: ${err.message}`, 4000);
            }
        }
    };
    input.click();
  }

  private applyPreset(preset: Preset) {
    if (this.isTutorialActive) {
        this.toastMessageEl.show('Presets können nach Abschluss des Tutorials geladen werden.', 3000);
        return;
    }
    if (!preset.version || preset.version !== CURRENT_PRESET_VERSION) {
        this.toastMessageEl.show(`Preset Version nicht kompatibel. Erwartet ${CURRENT_PRESET_VERSION}, erhalten ${preset.version}. Versuche bestmögliche Anwendung.`, 4000);
    }

    const newPrompts = new Map<string, Prompt>();
    preset.prompts.forEach(pp => {
        const id = this.generateNewPromptId();
        newPrompts.set(id, {
            promptId: id,
            text: pp.text,
            weight: pp.weight,
            color: this.getUnusedRandomColor(Array.from(newPrompts.values()).map(p => p.color)),
            isDropTrack: false,
        });
    });
    this.prompts = newPrompts;
    this.recalculateNextPromptIdCounter();

    this.temperature = preset.temperature ?? this.temperature;

    this.savePromptsToLocalStorage();
    this.updatePlaybackParameters();
    this.toastMessageEl.show('Preset geladen!', 2000);
    
    // When loading a preset, DON'T reset hasHadFirstSuccessfulPlay
    // So toasts don't show up again.
    if (this.playbackState === 'playing' || this.playbackState === 'loading') {
        this.stopAudioStreamResetSession(); // Stops music, does NOT reset the flag
        this.nextAudioChunkStartTime = 0;
        setTimeout(() => this.startAudioStream(), 200);
    } else {
        // If not playing, the flag remains as it was.
    }
  }

  // --- Cast Functionality ---
  private handleCastApiReady(event: CustomEvent<{available: boolean, errorInfo?: any}>) {
    if (!CAST_FEATURE_ENABLED) return;
    
    const { available, errorInfo } = event.detail;
    const gWindow = window as any; // Use 'any' for gWindow when Cast types are commented out

    if (available) {
        console.log('Cast API is available via event. Initializing CastContext.');
        try {
            if (typeof gWindow.cast === 'undefined' || typeof gWindow.chrome === 'undefined' ||
                !gWindow.chrome.cast || !gWindow.cast.framework) {
                console.error("Critical: 'gWindow.cast' or 'gWindow.chrome' global not defined even after SDK reported 'available'. This indicates a deeper issue with Cast SDK loading or environment.");
                this.isCastingAvailable = false;
                this.toastMessageEl?.show('Cast-Initialisierung fehlgeschlagen (SDK-Globale fehlen).', 5000);
                return;
            }

            this.castContext = gWindow.cast.framework.CastContext.getInstance();
            const castOptions/*: cast.framework.CastOptions*/ = { // Type annotation commented out
                receiverApplicationId: gWindow.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
                autoJoinPolicy: gWindow.chrome.cast.AutoJoinPolicy.TAB_AND_ORIGIN_SCOPED
            };
            this.castContext.setOptions(castOptions);

            this.isCastingAvailable = this.castContext.getCastState() !== gWindow.cast.framework.CastState.NO_DEVICES_AVAILABLE;

            this.castContext.addEventListener(
                gWindow.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
                this.handleCastSessionStateChange.bind(this)
            );
            this.castContext.addEventListener(
                gWindow.cast.framework.CastContextEventType.CAST_STATE_CHANGED,
                this.handleCastStateChange.bind(this)
            );

            this.remotePlayer = new gWindow.cast.framework.RemotePlayer();
            this.remotePlayerController = new gWindow.cast.framework.RemotePlayerController(this.remotePlayer);
            this.remotePlayerController.addEventListener(
                gWindow.cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
                this.handleRemotePlayerConnectChange.bind(this)
            );
            console.log('CastContext initialized successfully.');

        } catch (e: any) {
            console.error("Error initializing CastContext (post-API ready event):", e);
            this.toastMessageEl?.show(`Fehler bei Cast-Initialisierung: ${e.message || 'Unbekannter Fehler'}. Aktualisiere die Seite.`, 5000);
            this.isCastingAvailable = false;
        }
    } else {
        console.error("Cast API not available (reported by SDK via event).", errorInfo);
        this.isCastingAvailable = false;
        if (this.toastMessageEl) {
          this.toastMessageEl.show(`Google Cast API nicht verfügbar. ${errorInfo?.description || errorInfo?.errorType || ''}`, 3000);
        }
    }
  }

  private handleCastSessionStateChange(event: any /*cast.framework.SessionStateEventData*/) { // Type annotation commented out
    if (!CAST_FEATURE_ENABLED || !(window as any).cast || !(window as any).cast.framework) return;
    
    const gWindow = window as any;
    console.log('Cast session state changed:', event.sessionState);
    this.castSession = this.castContext?.getCurrentSession() || null;
    this.isCastingActive = !!this.castSession && this.castSession.getSessionState() === gWindow.cast.framework.SessionState.SESSION_STARTED;
    this.updateMuteState();
    if (this.isCastingActive && this.castSession) {
        this.toastMessageEl.show(`Casting zu ${this.castSession.getCastDevice().friendlyName}`, 3000);
        this.resetCastStream();
        this.castMediaSession = null;
        if (this.playbackState === 'playing' || this.playbackState === 'loading') {
            this.startCastPlaybackIfNeeded();
        }
    } else if (event.sessionState === gWindow.cast.framework.SessionState.SESSION_ENDED) {
        this.toastMessageEl.show('Casting beendet.', 2000);
        this.castMediaSession = null;
    } else if (event.sessionState === gWindow.cast.framework.SessionState.SESSION_START_FAILED) {
        this.toastMessageEl.show('Casting konnte nicht gestartet werden.', 3000);
        this.castMediaSession = null;
    }
  }

  private handleCastStateChange(event: any /*cast.framework.CastStateEventData*/) { // Type annotation commented out
    if (!CAST_FEATURE_ENABLED || !(window as any).cast || !(window as any).cast.framework) return;
    
    const gWindow = window as any;
    console.log('Cast state changed:', event.castState);
    this.isCastingAvailable = event.castState !== gWindow.cast.framework.CastState.NO_DEVICES_AVAILABLE;
  }

  private handleRemotePlayerConnectChange() {
    if (!CAST_FEATURE_ENABLED) return;
    // This event can be used for more detailed player state, but basic connection is handled by session state.
    // console.log('Remote player connection changed. Connected:', this.remotePlayer?.isConnected);
  }

  private async toggleCast() {
    if (!CAST_FEATURE_ENABLED) {
        this.toastMessageEl.show('Cast-Funktion ist temporär deaktiviert.', 3000);
        return;
    }
    
    if (!this.castContext) {
        this.toastMessageEl.show('Cast nicht initialisiert. Bitte Seite neu laden.', 3000);
        console.error('CastContext not initialized, cannot toggle cast.');
        return;
    }

    if (this.isCastingActive && this.castSession) {
        try {
            await this.castSession.endSession(true);
        } catch (error: any) {
            console.error('Error ending cast session:', error);
            this.toastMessageEl.show(`Fehler beim Beenden des Castings: ${error.description || error.code || 'Unbekannt'}`, 3000);
        }
    } else if (this.isCastingAvailable) {
        try {
            await this.castContext.requestSession();
        } catch (error: any) {
            console.error('Error requesting cast session:', error);
            this.toastMessageEl.show(`Cast Verbindungsfehler: ${error.description || error.code || 'Unbekannter Fehler'}`, 3000);
        }
    } else {
        this.toastMessageEl.show('Keine Cast-Geräte verfügbar.', 3000);
    }
  }

  private updateMuteState() {
    if (CAST_FEATURE_ENABLED && this.isCastingActive) {
        this.outputGainNode.gain.value = 0;
    } else {
        this.outputGainNode.gain.value = 1;
    }
  }

  private async resetCastStream() {
    if (!CAST_FEATURE_ENABLED) return;
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
    if (!CAST_FEATURE_ENABLED || !this.isCastingActive) return;
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
        this.toastMessageEl.show('Casting-Verbindungsfehler.', 2000);
    }
  }

  private castMediaSession: any | null = null; // Type chrome.cast.media.Media | null commented out

  private startCastPlaybackIfNeeded() {
    if (!CAST_FEATURE_ENABLED || !this.castSession) return;
    
    const gWindow = window as any;
    if (!gWindow.chrome || !gWindow.chrome.cast || !gWindow.chrome.cast.media ) return;
    
    const PlayerState = gWindow.chrome.cast.media.PlayerState;
    if (!PlayerState) {
        console.warn('Cannot start cast playback: chrome.cast.media.PlayerState is not available.');
        return;
    }

    if (this.castMediaSession && typeof this.castMediaSession.getPlayerState === 'function') {
        const playerState = this.castMediaSession.getPlayerState();
        if (playerState === PlayerState.PLAYING ||
            playerState === PlayerState.BUFFERING) {
            return;
        }
    }

    console.log('Cast: Attempting to load media for playback.');
    const mediaInfo = new gWindow.chrome.cast.media.MediaInfo(this.CAST_STREAM_URL, 'audio/wav');
    mediaInfo.streamType = gWindow.chrome.cast.media.StreamType.LIVE;
    mediaInfo.metadata = new gWindow.chrome.cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = "Steppa's BeatLab Live Stream";
    mediaInfo.duration = null;

    const loadRequest = new gWindow.chrome.cast.media.LoadRequest(mediaInfo);
    loadRequest.autoplay = true;

    this.castSession.loadMedia(loadRequest)
        .then(() => {
            console.log('Media loaded and playing on Cast device.');
            this.castMediaSession = this.castSession!.getMediaSession();
            if (this.castMediaSession) {
              this.castMediaSession.addUpdateListener((isAlive: boolean) => {
                  if (!isAlive) {
                      this.castMediaSession = null;
                      console.log('Cast media session ended (isAlive is false).');
                  }
              });
            }
        })
        .catch((error: any) => {
            console.error('Error loading media on Cast device:', error);
            this.toastMessageEl.show(`Cast Wiedergabefehler: ${error.description || error.code || 'Unbekannt'}`, 3000);
            this.castMediaSession = null;
        });
  }

  private commonTutorialEndLogic() {
    if (this.prompts.size === 0) {
      this.createDefaultPrompts("Ambient Chill with a Lo-Fi Beat"); // This calls savePromptsToLocalStorage
    } else {
      this.savePromptsToLocalStorage(); // Explicitly save if prompts were created
    }
  }
  
  private handleTutorialSessionEnd() { // Called by 'tutorial-complete' or 'tutorial-skip'
    this.isTutorialActive = false;
    this.commonTutorialEndLogic();
    // No localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
  }
  
  private handleTutorialPermanentlySkip() { // Called by 'tutorial-request-permanent-skip'
    this.isTutorialActive = false;
    localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    this.commonTutorialEndLogic();
  }


  private getTutorialTargets() {
    return {
        addPromptButton: () => this.addPromptButtonEl,
        playPauseButton: () => this.playPauseButtonEl,
        promptsContainer: () => this.promptsContainerEl,
        getPromptController: (promptId: string) => this.shadowRoot?.querySelector(`prompt-controller[promptid="${promptId}"]`) as PromptControllerElement | null,
        getPromptWeightSlider: (promptId: string) => {
            const pc = this.shadowRoot?.querySelector(`prompt-controller[promptid="${promptId}"]`) as PromptControllerElement | null;
            return pc?.shadowRoot?.querySelector('weight-slider') as HTMLElement | null;
        },
        getPromptTextInput: (promptId: string) => { // Existing: Returns input if editing, else static text.
            const pcEl = this.shadowRoot?.querySelector(`prompt-controller[promptid="${promptId}"]`) as PromptControllerElement | null;
            if (!pcEl || !pcEl.shadowRoot) return null;
            const inputElement = pcEl.shadowRoot.querySelector('#text-input') as HTMLInputElement | null;
            if (inputElement) return inputElement;
            return pcEl.shadowRoot.querySelector('#static-text') as HTMLElement | null;
        },
        getPromptStaticTextDisplay: (promptId: string) => { // New: Specifically targets #static-text
            const pcEl = this.shadowRoot?.querySelector(`prompt-controller[promptid="${promptId}"]`) as PromptControllerElement | null;
            if (!pcEl || !pcEl.shadowRoot) return null;
            return pcEl.shadowRoot.querySelector('#static-text') as HTMLElement | null;
        }
    };
  }


  // --- Render Methods ---
  override render() {
    const backgroundOrbs = TRACK_COLORS.slice(0, this.prompts.size).map((color, i) => {
        const promptArray = Array.from(this.prompts.values());
        const promptEntry = promptArray[i];
        if (!promptEntry) return null;
        
        const weight = promptEntry.isDropTrack && this.isDropEffectActive 
                       ? DROP_TRACK_INITIAL_WEIGHT 
                       : promptEntry.weight;
        
        // Softer neumorphic orbs: larger, more blurred, less opacity
        let size = 50 + weight * 50; // Larger base size
        let opacity = 0.02 + weight * 0.05; // Much lower opacity
        const x = (i / Math.max(1, this.prompts.size -1 )) * 80 + 10; // Spread remains similar
        const y = 40 + Math.random() * 20 - 10; // Y position adjusted

        let orbAnimationClass = 'soft-pulse'; // Default soft pulse
        let finalTransform = `translate(-50%, -50%) rotate(${Math.random() * 360}deg) scale(1)`;

        if (this.isDropEffectActive) {
            size = (50 + weight * 50) * (1.5 + Math.random() * 1); 
            opacity = Math.min(0.3, (0.02 + weight * 0.05) * (2 + Math.random() * 2)); 
            orbAnimationClass = 'drop-orb-animate-neumorph';
        }

        return {
            left: `${x}%`,
            top: `${y}%`,
            width: `${size}vmax`,
            height: `${size}vmax`,
            // Use a desaturated/lighter version of orb colors for neumorphism
            backgroundColor: promptEntry.isDropTrack ? 'hsla(45, 100%, 70%, 0.5)' : `hsla(${i*60}, 70%, 80%, ${opacity})`,
            opacity: opacity.toString(),
            transform: finalTransform, 
            animationClass: orbAnimationClass,
        };
    }).filter(orb => orb !== null);

    return html`
      <div id="drop-flash-overlay" class=${classMap({active: this.isScreenFlashActive})}></div>
      <div id="background-gradient" class=${classMap({'drop-effect-active': this.isDropEffectActive})}>
        ${backgroundOrbs.map(style => html`<div class="bg-orb ${style.animationClass}" style=${unsafeCSS(`left:${style.left}; top:${style.top}; width:${style.width}; height:${style.height}; background-color:${style.backgroundColor}; opacity:${style.opacity}; transform:${style.transform}`)}></div>`)}
      </div>

      ${this.showWelcome && !this.isTutorialActive ? html`<welcome-overlay @welcome-complete=${this.handleWelcomeComplete}></welcome-overlay>` : ''}
      <help-guide-panel .isOpen=${this.showHelp} @close-help=${() => this.showHelp = false}></help-guide-panel>
      ${this.isTutorialActive ? html`
        <tutorial-controller
            .targets=${this.getTutorialTargets()}
            .initialPromptsCount=${this.prompts.size}
            @tutorial-complete=${this.handleTutorialSessionEnd}
            @tutorial-skip=${this.handleTutorialSessionEnd}
            @tutorial-request-permanent-skip=${this.handleTutorialPermanentlySkip}
            ?isActive=${this.isTutorialActive}
        ></tutorial-controller>
      ` : ''}


      <header class="app-header">
        <div class="logo-title">
          <span class="logo-icon">🎵</span>
          <h1>Steppa's BeatLab</h1>
        </div>
        <div class="global-controls">
            <settings-button title="Einstellungen" @click=${this.toggleSettingsPanel} .isMidiLearnTarget=${false}></settings-button>
            ${CAST_FEATURE_ENABLED ? html`
                <cast-button title="Audio Casten" @click=${this.toggleCast} .isCastingActive=${this.isCastingActive} ?disabled=${!this.isCastingAvailable}></cast-button>
            ` : ''}
            <help-button title="Hilfe" @click=${this.toggleHelpPanel}></help-button>
        </div>
      </header>

      <main class="main-content">
        ${this.isMidiLearning && this.showSettings ? html`
            <div class="midi-learn-instructions">
                ${this.midiLearnTarget
                    ? `Höre auf MIDI CC für "${this.midiLearnTarget === MIDI_LEARN_TARGET_DROP_BUTTON ? "Drop! Button" : this.midiLearnTarget === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON ? "Play/Pause Button" : this.prompts.get(this.midiLearnTarget)?.text || 'Unbekanntes Ziel'}"... (Esc zum Abwählen)`
                    : "Klicke einen Slider, Drop!- oder Play/Pause-Button an, dann bewege einen MIDI-Controller. (Esc zum Beenden des Lernmodus)"
                }
            </div>
        ` : ''}
        <div id="prompts-container" class=${classMap({'midi-learn-active': this.isMidiLearning && !this.showSettings /* Only apply if settings panel not open for prompt selection */})}>
          ${Array.from(this.prompts.values()).map(prompt => html`
            <prompt-controller
              .promptId=${prompt.promptId}
              .text=${prompt.text}
              .weight=${prompt.weight}
              .sliderColor=${prompt.color}
              ?isDropTrack=${!!prompt.isDropTrack}
              ?ismidilearntarget=${this.isMidiLearning && this.midiLearnTarget === prompt.promptId}
              ?filtered=${this.filteredPrompts.has(prompt.text)}
              @prompt-changed=${this.handlePromptChanged}
              @prompt-removed=${this.handlePromptRemoved}
              @prompt-interaction=${(e: CustomEvent<{promptId: string}>) => this.handleMidiLearnTargetClick('prompt', e.detail.promptId, e)}
            ></prompt-controller>
          `)}
        </div>
      </main>

      <div id="settings-panel" class=${classMap({visible: this.showSettings})}>
        <h3>Einstellungen</h3>
        <div class="settings-section midi-settings-section">
            <h4>MIDI-Steuerung</h4>
            <div class="midi-selector-group">
                <label for="midi-device-select">MIDI-Gerät:</label>
                <select id="midi-device-select" @change=${this.handleMidiDeviceChange} .value=${this.selectedMidiInputId || ''}>
                <option value="">-- MIDI-Gerät wählen --</option>
                ${this.availableMidiInputs.map(input => html`<option value=${input.id}>${input.name}</option>`)}
                </select>
                <button
                    id="learn-midi-button"
                    class="neumorph-button"
                    @click=${this.toggleMidiLearnMode}
                    @mousedown=${this.handleMidiLearnButtonMouseDown}
                    @mouseup=${this.handleMidiLearnButtonMouseUpOrLeave}
                    @mouseleave=${this.handleMidiLearnButtonMouseUpOrLeave}
                    @touchstart=${this.handleMidiLearnButtonMouseDown}
                    @touchend=${this.handleMidiLearnButtonMouseUpOrLeave}
                    title="Klicken zum Lernmodus. Lang drücken (1.5s) zum Löschen aller Zuweisungen für das Gerät."
                >Learn MIDI</button>
            </div>
        </div>
        <div class="settings-section">
            <h4>Wiedergabe-Parameter</h4>
            <parameter-slider
                label="Temperatur"
                .value=${this.temperature}
                min="0.1" max="2.0" step="0.05"
                @input=${this.handleTemperatureChange}
                ?disabled=${this.isDropEffectActive}
            ></parameter-slider>
        </div>
        <div class="settings-section preset-buttons">
            <save-preset-button title="Aktuellen Zustand als Preset speichern" @click=${this.handleSavePreset}></save-preset-button>
            <load-preset-button title="Preset aus Datei laden" @click=${this.handleLoadPresetClick}></load-preset-button>
        </div>
      </div>


      <footer class="footer-controls">
        <play-pause-button
            .playbackState=${this.playbackState}
            @click=${(e: Event) => { if (this.isMidiLearning && this.showSettings) this.handleMidiLearnTargetClick('playpausebutton', MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON, e); else this.togglePlayPause(); }}
            ?ismidilearntarget=${this.isMidiLearning && this.midiLearnTarget === MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON}
            title="Musik Start/Pause (Leertaste)"
            ?disabled=${this.isDropEffectActive}
            >
        </play-pause-button>
        <div class="footer-center-spacer">
            <add-prompt-button
                title="Neuen Prompt hinzufügen"
                @click=${this.handleAddPromptClick}
                ?disabled=${this.isDropEffectActive || (this.prompts.size >= 7 && !this.isTutorialActive) }>
            </add-prompt-button>
        </div>
        <share-button title="Aktuelle Konfiguration teilen" @click=${this.generateShareLink}></share-button>
        <drop-button
            @click=${(e: Event) => { if (this.isMidiLearning && this.showSettings) this.handleMidiLearnTargetClick('dropbutton', MIDI_LEARN_TARGET_DROP_BUTTON, e); else this.handleDropClick(); }}
            ?ismidilearntarget=${this.isMidiLearning && this.midiLearnTarget === MIDI_LEARN_TARGET_DROP_BUTTON}
            title="'Drop!'-Effekt auslösen"
            ?disabled=${this.isDropEffectActive || this.playbackState !== 'playing'}
            ?active=${this.isDropEffectActive}
            >
        </drop-button>
      </footer>
      <toast-message></toast-message>
    `;
  }

  static override styles = [defaultStyles, css`
    #drop-flash-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: var(--neumorph-accent-secondary); /* Use a neumorph accent */
        opacity: 0;
        pointer-events: none;
        z-index: 9999; 
    }
    #drop-flash-overlay.active {
        animation: screenFlashAnimationNeumorph 0.3s ease-out forwards;
    }
    @keyframes screenFlashAnimationNeumorph {
      0% { opacity: 0; }
      40% { opacity: 0.4; } /* Softer flash */
      100% { opacity: 0; }
    }

    .bg-orb {
        position: absolute;
        border-radius: 50%;
        filter: blur(60px); /* Much more blur for softer orbs */
        transition: all 3s ease-in-out; /* Slower transition */
        opacity: 0; 
    }
    .bg-orb.soft-pulse {
        animation: softPulseOrb 10s infinite alternate ease-in-out;
    }
    @keyframes softPulseOrb {
        0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.03; }
        100% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.08; }
    }
    .bg-orb.drop-orb-animate-neumorph {
        animation: dropOrbPulseNeumorph 1.5s cubic-bezier(0.68, -0.55, 0.27, 1.55);
        filter: blur(40px); /* Slightly less blur during drop */
    }
    @keyframes dropOrbPulseNeumorph {
        0% { 
            transform: translate(-50%, -50%) scale(0.9); 
            opacity: var(--start-opacity, 0.1);
        }
        50% { 
            transform: translate(-50%, -50%) scale(1.3); 
            opacity: var(--peak-opacity, 0.25);
        }
        100% { 
            transform: translate(-50%, -50%) scale(1); 
            opacity: var(--start-opacity, 0.1);
        }
    }

    #background-gradient {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -2;
        overflow: hidden;
        background-color: var(--neumorph-bg); /* Solid neumorph background */
    }
    .app-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 25px; /* Increased padding */
      background-color: var(--neumorph-bg);
      /* Subtle shadow to lift header */
      box-shadow: 0px 3px 8px rgba(163, 177, 198, 0.2);
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
        gap: 12px;
    }
    .logo-icon {
        font-size: 2em;
        color: var(--neumorph-accent-primary);
    }
    .app-header h1 {
      font-size: 1.6em;
      margin: 0;
      color: var(--neumorph-text-color);
      font-weight: 600; /* Slightly bolder for neumorphism */
    }
    .global-controls {
      display: flex;
      align-items: center;
      gap: 15px; /* Increased gap */
    }
    .global-controls settings-button,
    .global-controls help-button,
    .global-controls cast-button {
      width: 44px; /* Standardized neumorphic icon button size */
      height: 44px;
    }
    
    .main-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      flex-grow: 1;
      width: 100%;
      padding: 90px 20px 110px 20px; /* Adjusted top padding for fixed header, bottom for footer */
      box-sizing: border-box;
      gap: 25px; /* Increased gap */
      overflow: hidden; 
      position: relative; 
    }
    #prompts-container {
      display: flex;
      flex-direction: column;
      gap: 20px; /* Increased gap */
      padding: 15px;
      overflow-y: auto;
      overflow-x: hidden;
      width: clamp(350px, 55vw, 500px); /* Adjusted width */
      flex-grow: 1; 
      min-height: 0; 
      align-items: stretch;
      /* Neumorphic inset container */
      background-color: var(--neumorph-bg);
      border-radius: var(--neumorph-radius-large);
      box-shadow: var(--neumorph-shadow-inset);
      scrollbar-width: thin;
      scrollbar-color: var(--neumorph-shadow-color-dark) var(--neumorph-bg-darker);
    }
    #prompts-container::-webkit-scrollbar { width: 8px; }
    #prompts-container::-webkit-scrollbar-track { background: var(--neumorph-bg-darker); border-radius: 4px; }
    #prompts-container::-webkit-scrollbar-thumb { background-color: var(--neumorph-shadow-color-dark); border-radius: 4px;}

    .midi-learn-instructions {
        text-align: center;
        background-color: var(--neumorph-bg-darker);
        color: var(--neumorph-accent-primary);
        padding: 10px 18px;
        border-radius: var(--neumorph-radius-base);
        font-size: 0.9em;
        font-weight: 500;
        z-index: 5; 
        white-space: normal;
        word-break: break-word;
        margin-bottom: 10px; 
        width: clamp(350px, 55vw, 500px); 
        box-sizing: border-box;
        flex-shrink: 0;
        box-shadow: var(--neumorph-shadow-inset);
    }

    prompt-controller {
        width: 100%;
        flex-shrink: 0;
    }

    #settings-panel {
      position: fixed;
      bottom: 95px; /* Above footer + small gap */
      left: 50%;
      width: clamp(340px, 55vw, 500px); 
      background-color: var(--neumorph-bg);
      color: var(--neumorph-text-color);
      padding: 25px;
      border-radius: var(--neumorph-radius-large) var(--neumorph-radius-large) 0 0;
      box-shadow: var(--neumorph-shadow-outset-strong); /* Extruded panel */
      z-index: 200;
      transition: transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease-in-out;
      transform: translate(-50%, 105%); /* Start off-screen below */
      opacity: 0;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      gap: 25px; 
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
        color: var(--neumorph-text-color);
        font-weight: 600;
        font-size: 1.4em;
    }
    .settings-section {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    .settings-section h4 { 
        margin: 0 0 8px 0;
        font-size: 1.1em;
        font-weight: 500;
        color: var(--neumorph-text-color-light);
        border-bottom: 1px solid var(--neumorph-shadow-color-dark);
        padding-bottom: 8px;
    }
    .midi-selector-group {
        display: flex;
        flex-direction: column; 
        align-items: stretch; 
        gap: 12px;
    }
    .midi-selector-group label {
        font-size: 0.95em;
        color: var(--neumorph-text-color);
        margin-bottom: 4px; 
    }
    #midi-device-select {
        background-color: var(--neumorph-bg);
        color: var(--neumorph-text-color);
        border: none;
        border-radius: var(--neumorph-radius-base);
        padding: 10px 12px; 
        font-size: 0.95em;
        width: 100%; 
        box-shadow: var(--neumorph-shadow-inset-soft);
    }
    #midi-device-select:focus {
        outline: none;
        box-shadow: var(--neumorph-shadow-inset-soft), 0 0 0 2px var(--neumorph-accent-primary);
    }
    .neumorph-button { /* General class for neumorphic buttons in settings etc. */
        background: var(--neumorph-bg);
        color: var(--neumorph-text-color);
        border: none;
        padding: 10px 15px;
        border-radius: var(--neumorph-radius-base);
        cursor: pointer;
        font-size: 0.95em;
        font-weight: 500;
        transition: box-shadow 0.2s ease-out, background-color 0.2s, color 0.2s;
        text-align: center;
        box-shadow: var(--neumorph-shadow-outset);
    }
    .neumorph-button:hover:not(:disabled) {
        box-shadow: var(--neumorph-shadow-outset-strong);
    }
    .neumorph-button:active:not(:disabled),
    .neumorph-button.learning { /* For learn midi button active state */
        box-shadow: var(--neumorph-shadow-inset);
        color: var(--neumorph-accent-primary);
    }
    .neumorph-button:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        box-shadow: var(--neumorph-shadow-inset); /* Disabled buttons look pressed in */
    }

    .preset-buttons {
        display: flex;
        justify-content: center;
        gap: 20px;
        margin-top: 10px; 
    }
    .preset-buttons save-preset-button,
    .preset-buttons load-preset-button {
        width: 55px; /* Slightly larger for better touch */
        height: 55px;
    }


    .footer-controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 25px;
      background-color: var(--neumorph-bg);
      box-shadow: 0px -3px 8px rgba(163, 177, 198, 0.2); /* Subtle top shadow */
      width: 100%;
      box-sizing: border-box;
      position: fixed;
      bottom: 0;
      left: 0;
      z-index: 100;
      height: 100px; 
    }
    .footer-controls play-pause-button,
    .footer-controls drop-button,
    .footer-controls share-button,
    .footer-controls add-prompt-button {
      width: 70px; /* Keep footer buttons prominent */
      height: 70px;
    }
    .footer-center-spacer {
        flex-grow: 1;
        display: flex;
        justify-content: center;
        align-items: center;
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
    'toast-message': ToastMessage;
    'help-guide-panel': HelpGuidePanel;
    'welcome-overlay': WelcomeOverlay;
    'drop-button': DropButton;
    'tutorial-controller': TutorialController;
  }
}