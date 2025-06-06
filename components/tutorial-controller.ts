/**
 * @fileoverview Interactive tutorial controller for Steppa's BeatLab.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { css, html, LitElement, svg, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import type { PromptController as PromptControllerElement } from '../prompt-controller.js';
import type { PlayPauseButton } from './play-pause-button.js';


export type TutorialStepId =
  | 'welcome'
  | 'createFirstTrack_HighlightAdd'
  | 'createFirstTrack_EnterName'
  | 'createFirstTrack_ConfirmCreation'
  | 'playTrack_HighlightPlay'
  | 'creativePauseHint'
  | 'createSecondTrack_HighlightAdd'
  | 'createSecondTrack_EnterName'
  | 'mixTrack_SetToOne'
  | 'mixTrack_ListenToOne'
  | 'mixTrack_SetToOnePointFour'
  | 'mixTrack_ListenToOnePointFourAndConclude'
  | 'completion';

interface TutorialStepConfig {
  id: TutorialStepId;
  highlightTarget?: () => HTMLElement | null | undefined;
  tooltipText?: string;
  popup?: {
    title: string;
    text: string;
    buttonText: string;
  };
  autoAdvanceDelay?: number; // ms
  waitForEvent?: 'promptCreated' | 'playbackStarted' | 'promptWeightChanged' | 'promptTextChanged';
  eventDetailCondition?: (detail: any) => boolean; // e.g., detail.isEmpty === true for first prompt
  onEnter?: () => void;
  customContent?: () => unknown;
}

interface HighlightStyle {
  display: string;
  top?: string;
  left?: string;
  width?: string;
  height?: string;
  transform?: string;
}

interface TooltipStyle extends HighlightStyle {
  '--arrow-visibility'?: string;
  '--arrow-top'?: string;
  '--arrow-left'?: string;
  '--arrow-transform'?: string;
}

const ARROW_SIZE = 10; // Arrow size in px
const TOOLTIP_OFFSET = 15; // Offset from target in px


@customElement('tutorial-controller')
export class TutorialController extends LitElement {
  @property({ type: Boolean, reflect: true }) isActive = false;
  @property({ type: Number }) initialPromptsCount = 0;
  @property({ attribute: false }) targets: {
    addPromptButton?: () => HTMLElement | null | undefined;
    playPauseButton?: () => PlayPauseButton | null | undefined; // Typed
    promptsContainer?: () => HTMLElement | null | undefined;
    getPromptController?: (promptId: string) => PromptControllerElement | null;
    getPromptWeightSlider?: (promptId: string) => HTMLElement | null;
    getPromptTextInput?: (promptId: string) => HTMLElement | null;
    getPromptStaticTextDisplay?: (promptId: string) => HTMLElement | null; // Added
  } = {};

  @state() private currentStepIndex = 0;
  @state() private highlightStyle: HighlightStyle = { display: 'none' };
  @state() private tooltipStyle: TooltipStyle = { display: 'none' };
  @state() private tooltipText = '';
  @state() private currentPopup: TutorialStepConfig['popup'] | null = null;
  @state() private showSkipButton = false;
  @state() private dontShowAgainChecked = false;


  private resizeObserver!: ResizeObserver;
  private firstPromptId: string | null = null;
  private secondPromptId: string | null = null;
  private boundUpdateHighlight: () => void;

  private steps: TutorialStepConfig[] = [
    {
      id: 'welcome',
      popup: {
        title: 'Hey!',
        text: "Bock auf eigene Beats? Wir starten bei Null!",
        buttonText: "Los geht's!",
      },
      onEnter: () => this.showSkipButton = false,
    },
    {
      id: 'createFirstTrack_HighlightAdd',
      highlightTarget: () => this.targets.addPromptButton?.(),
      tooltipText: "Klick hier & leg deinen ersten Track an!",
      waitForEvent: 'promptCreated',
      eventDetailCondition: (detail) => detail.isEmpty === true,
      onEnter: () => {
        this.showSkipButton = true;
        this.targets.addPromptButton?.()?.addEventListener('click', this.handleTentativeAdvance, { once: true });
      }
    },
    {
      id: 'createFirstTrack_EnterName',
      highlightTarget: () => this.firstPromptId ? this.targets.getPromptController?.(this.firstPromptId) : null,
      tooltipText: "Klick den Text 'Neuer Prompt' innerhalb dieser Karte, gib 'Trompete' ein & drück Enter!",
      waitForEvent: 'promptTextChanged',
      eventDetailCondition: (detail) => detail.promptId === this.firstPromptId && detail.newText.trim() !== '' && detail.newText.trim().toLowerCase() !== 'neuer prompt' && detail.newText.trim().toLowerCase() !== 'untitled prompt',
      onEnter: () => {
        // User needs to click the text area inside the highlighted card.
        // The prompt-controller will handle focusing the input.
      }
    },
    {
      id: 'createFirstTrack_ConfirmCreation',
      tooltipText: "Awesome! Dein erster Track ist hier.",
      highlightTarget: () => this.firstPromptId ? this.targets.getPromptController?.(this.firstPromptId) : null,
      autoAdvanceDelay: 2500,
    },
    {
        id: 'playTrack_HighlightPlay',
        highlightTarget: () => this.targets.playPauseButton?.(),
        tooltipText: "Drück Play & hör dir deinen Sound an!",
        waitForEvent: 'playbackStarted',
        onEnter: () => {
            this.targets.playPauseButton?.()?.addEventListener('click', this.handleTentativeAdvance, { once: true });
        }
    },
    {
        id: 'creativePauseHint',
        tooltipText: "Sound lädt kurz...",
        highlightTarget: () => this.targets.playPauseButton?.(),
        autoAdvanceDelay: 2500,
        onEnter: () => {
          const playButton = this.targets.playPauseButton?.();
          if (playButton && playButton.playbackState && playButton.playbackState !== 'loading') {
             if (this.steps[this.currentStepIndex]?.id === 'creativePauseHint') {
                this.advanceStep();
            }
          }
        }
    },
    {
        id: 'createSecondTrack_HighlightAdd',
        highlightTarget: () => this.targets.addPromptButton?.(),
        tooltipText: "Läuft! Füg jetzt einen zweiten Track hinzu!",
        waitForEvent: 'promptCreated',
        eventDetailCondition: (detail) => detail.promptId !== this.firstPromptId && !this.secondPromptId,
        onEnter: () => {
            this.targets.addPromptButton?.()?.addEventListener('click', this.handleTentativeAdvance, { once: true });
        }
    },
    {
      id: 'createSecondTrack_EnterName',
      highlightTarget: () => this.secondPromptId ? this.targets.getPromptController?.(this.secondPromptId) : null,
      tooltipText: "Klick den Text 'Neuer Prompt' in der neuen Karte, gib 'House' ein & drück Enter!",
      waitForEvent: 'promptTextChanged',
      eventDetailCondition: (detail) => detail.promptId === this.secondPromptId && detail.newText.trim() !== '' && detail.newText.trim().toLowerCase() !== 'neuer prompt' && detail.newText.trim().toLowerCase() !== 'untitled prompt',
    },
    {
      id: 'mixTrack_SetToOne',
      highlightTarget: () => this.secondPromptId ? this.targets.getPromptWeightSlider?.(this.secondPromptId) : null,
      tooltipText: "Zieh den Regler auf ca. 1.0. Lausche der Veränderung!",
      waitForEvent: 'promptWeightChanged',
      eventDetailCondition: (detail) => detail.promptId === this.secondPromptId && detail.newWeight >= 0.95 && detail.newWeight <= 1.05,
      onEnter: () => {
        this.targets.getPromptWeightSlider?.(this.secondPromptId!)?.addEventListener('pointerdown', this.handleTentativeAdvance, { once: true });
      }
    },
    {
      id: 'mixTrack_ListenToOne',
      tooltipText: "Hörst du's? Gleich geht's weiter...",
      highlightTarget: () => this.targets.promptsContainer?.(),
      autoAdvanceDelay: 10000, 
      onEnter: () => this.clearHighlightAndTooltip(false),
    },
    {
      id: 'mixTrack_SetToOnePointFour',
      highlightTarget: () => this.secondPromptId ? this.targets.getPromptWeightSlider?.(this.secondPromptId) : null,
      tooltipText: "Super! Jetzt zieh ihn auf ca. 1.4. Wie klingt's jetzt?",
      waitForEvent: 'promptWeightChanged',
      eventDetailCondition: (detail) => detail.promptId === this.secondPromptId && detail.newWeight >= 1.35 && detail.newWeight <= 1.45,
      onEnter: () => {
        this.targets.getPromptWeightSlider?.(this.secondPromptId!)?.addEventListener('pointerdown', this.handleTentativeAdvance, { once: true });
      }
    },
    {
      id: 'mixTrack_ListenToOnePointFourAndConclude',
      tooltipText: "Hör genau! Merkst du den Unterschied? Füge weitere Spuren hinzu, sei kreativ und lass deiner Fantasie freien Lauf – alles ist möglich!",
      highlightTarget: () => this.targets.promptsContainer?.(),
      autoAdvanceDelay: 10000, 
      onEnter: () => this.clearHighlightAndTooltip(false),
    },
    {
      id: 'completion',
      popup: {
        title: 'Nice!',
        text: "Basics sitzen. Es gibt vielfältige Möglichkeiten, deine Tracks zu benennen – sei es mit Instrumenten (z.B. 'Klavier', 'Drums'), Musikstilen ('Jazz', 'Techno', 'Ambient') oder Stimmungen ('düster', 'fröhlich', 'episch'). Nutze die Slider dynamisch, um deine Sounds zu mischen und experimentiere, was passiert! Leg los – deine Bühne!",
        buttonText: 'Tutorial schließen',
      },
      onEnter: () => {
        this.clearHighlightAndTooltip();
        this.showSkipButton = false;
      }
    },
  ];

  public get currentStepId(): TutorialStepId | undefined {
    if (!this.isActive || this.currentStepIndex < 0 || this.currentStepIndex >= this.steps.length) {
      return undefined;
    }
    return this.steps[this.currentStepIndex]?.id;
  }

  handleTentativeAdvance = () => {
    const currentStepConfig = this.steps[this.currentStepIndex];
    if (currentStepConfig.waitForEvent) {
        this.clearHighlightAndTooltip();
    }
  }


  constructor() {
    super();
    this.boundUpdateHighlight = this.updateHighlightInternal.bind(this);
    this.resizeObserver = new ResizeObserver(this.boundUpdateHighlight);
  }

  connectedCallback() {
    super.connectedCallback();
    // Event listeners are handled by notifyAppEvent called from PromptDj
    window.addEventListener('resize', this.boundUpdateHighlight);
    window.addEventListener('scroll', this.boundUpdateHighlight, true);
    this.requestUpdate();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.boundUpdateHighlight);
    window.removeEventListener('scroll', this.boundUpdateHighlight, true);
  }

  protected override firstUpdated() {
    if (this.isActive) {
      setTimeout(() => {
        if (this.isActive) { // Double check isActive in case it changed during the timeout
            this.startTutorial();
        }
      }, 0); // Yield to browser, then start tutorial
    }
  }

  private startTutorial() {
    this.currentStepIndex = 0;
    this.firstPromptId = null;
    this.secondPromptId = null;
    this.dontShowAgainChecked = false; // Reset for new tutorial session
    this.executeStep();
  }

  private advanceStep() {
    const prevStepConfig = this.steps[this.currentStepIndex];
    // Clean up tentative advance listeners for specific elements
    const targetElement = prevStepConfig?.highlightTarget?.();
    if (targetElement && (
      targetElement === this.targets.addPromptButton?.() ||
      targetElement === this.targets.playPauseButton?.() ||
      (this.secondPromptId && targetElement === this.targets.getPromptWeightSlider?.(this.secondPromptId))
    )) {
        targetElement.removeEventListener('click', this.handleTentativeAdvance);
        targetElement.removeEventListener('pointerdown', this.handleTentativeAdvance);
    }


    if (this.currentStepIndex < this.steps.length - 1) {
      this.currentStepIndex++;
      this.executeStep();
    } else {
      // This case should ideally be handled by the completion popup logic
      // but as a fallback, treat as normal completion.
      this.finishTutorial(false);
    }
  }

  private executeStep() {
    const stepConfig = this.steps[this.currentStepIndex];
    if (!stepConfig) return;

    this.clearHighlightAndTooltip();
    this.currentPopup = null;

    stepConfig.onEnter?.();

    if (stepConfig.popup) {
      this.currentPopup = stepConfig.popup;
    } else if (stepConfig.highlightTarget) {
      const target = stepConfig.highlightTarget();
      if (target) {
        this.setupHighlightAndTooltip(target, stepConfig.tooltipText || '');
      } else {
        console.warn(`Tutorial: Target for step ${stepConfig.id} not found.`);
         // If target is not found, but there's tooltip text, show centered tooltip
        if (stepConfig.tooltipText) {
            this.tooltipText = stepConfig.tooltipText;
            this.tooltipStyle = { display: 'block', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
        }
      }
    } else if (stepConfig.tooltipText) { // Centered tooltip if no highlight target but text exists
        this.tooltipText = stepConfig.tooltipText;
        this.tooltipStyle = { display: 'block', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }


    if (stepConfig.customContent) {
        // Render custom content if provided
    }

    if (stepConfig.autoAdvanceDelay && !stepConfig.waitForEvent) {
      setTimeout(() => {
        // Check if we are still on the same step before auto-advancing
        if (this.steps[this.currentStepIndex]?.id === stepConfig.id) {
            this.advanceStep();
        }
      }, stepConfig.autoAdvanceDelay);
    }
    this.requestUpdate();
  }

  // This method is called by PromptDj directly
  public notifyAppEvent(eventType: string, detail?: any) {
    if (!this.isActive) return;
    const stepConfig = this.steps[this.currentStepIndex];

    if (stepConfig && stepConfig.waitForEvent === eventType) {
       // If there's a condition, it must be met
       if (stepConfig.eventDetailCondition && !stepConfig.eventDetailCondition(detail)) {
        return;
      }
      // Store prompt IDs if applicable
      if (eventType === 'promptCreated') {
          if (detail.isEmpty && !this.firstPromptId) { // Assuming 'isEmpty' means it's the first prompt
            this.firstPromptId = detail.promptId;
          } else if (!detail.isEmpty && this.firstPromptId && detail.promptId !== this.firstPromptId && !this.secondPromptId) {
            this.secondPromptId = detail.promptId;
          }
      }
      this.advanceStep();
    }
  }


  interceptSpacebar(): boolean {
    const stepConfig = this.steps[this.currentStepIndex];
    if (this.isActive && stepConfig?.highlightTarget?.() === this.targets.playPauseButton?.()) {
        this.handleTentativeAdvance(); // Clear tooltip, wait for event
        // Let PromptDj handle the actual play/pause action
    }
    return false; // Always allow PromptDj to process spacebar
  }


  private setupHighlightAndTooltip(targetElement: HTMLElement, text: string) {
    this.tooltipText = text;
    this.resizeObserver.disconnect(); // Stop observing old targets
    this.resizeObserver.observe(targetElement);
    this.resizeObserver.observe(this.ownerDocument.body); // Also observe body for global layout changes
    this.updateHighlightInternal(); // Initial positioning
  }

  private updateHighlightInternal = () => {
    let currentTargetElement: HTMLElement | null = null;
    const stepConfig = this.steps[this.currentStepIndex];

    // Ensure we only proceed if the tutorial is active and the current step configuration exists
    if (!this.isActive || !stepConfig) {
      this.clearHighlightAndTooltip();
      return;
    }
    
    if (stepConfig.highlightTarget) {
        currentTargetElement = stepConfig.highlightTarget();
    }

    if (!currentTargetElement || (!this.tooltipText && !stepConfig.popup && !stepConfig.highlightTarget) ) {
      this.clearHighlightAndTooltip();
      return;
    }

    const rect = currentTargetElement.getBoundingClientRect();
    // If element is not visible or has no dimensions, clear and return
    if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) {
        this.clearHighlightAndTooltip();
        return;
    }

    // Determine padding based on the step ID to make the highlight box slightly larger
    // for confirmation steps or steps where interaction is less direct.
    const padding = (stepConfig?.id.startsWith('createFirstTrack_ConfirmCreation') || stepConfig?.id.startsWith('mixTrack_ListenTo') || stepConfig?.id.startsWith('mixTrack_ListenToOnePointFourAndConclude')) ? 8 : 4;
    this.highlightStyle = {
      display: 'block',
      top: `${rect.top - padding + window.scrollY}px`,
      left: `${rect.left - padding + window.scrollX}px`,
      width: `${rect.width + padding * 2}px`,
      height: `${rect.height + padding * 2}px`,
    };

    if (!this.tooltipText) {
        this.tooltipStyle = { display: 'none' };
        this.requestUpdate();
        return;
    }

    // Calculate tooltip position (logic from before)
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let ttTop = rect.bottom + TOOLTIP_OFFSET + window.scrollY;
    let ttLeft = rect.left + rect.width / 2 + window.scrollX;
    let arrowVis = 'visible';
    let arrowTopStyle = '-5px'; // Arrow pointing up from top of tooltip
    let arrowLeftStyle = '50%';
    let arrowTransformStyle = 'translateX(-50%) rotate(45deg)';

    // Estimate tooltip dimensions (could be improved by measuring actual element)
    const estTooltipHeight = this.tooltipText.length > 50 ? (this.tooltipText.length > 100 ? 100 : 80) : 60;
    const estTooltipWidth = Math.min(250, Math.max(100,this.tooltipText.length * 6 + 30));


    // Prefer bottom, then top. Then adjust horizontal.
    if (ttTop - window.scrollY + estTooltipHeight > viewportHeight) { // Not enough space below
      ttTop = rect.top - estTooltipHeight - TOOLTIP_OFFSET + window.scrollY; // Position above
      arrowTopStyle = 'calc(100% - 5px)'; // Arrow pointing down from bottom of tooltip
      arrowTransformStyle = 'translateX(-50%) rotate(225deg)';
    }

    // Adjust left position and arrow for horizontal overflow
    let finalTransform = 'translateX(-50%)'; // Default: center tooltip under/over target center
    if (ttLeft - window.scrollX - (estTooltipWidth / 2) < TOOLTIP_OFFSET) { // Too far left
        ttLeft = TOOLTIP_OFFSET + window.scrollX;
        finalTransform = ''; // Align left edge of tooltip
        arrowLeftStyle = `${rect.left + rect.width / 2 - ttLeft + window.scrollX - (ARROW_SIZE / 2)}px`;
    } else if (ttLeft - window.scrollX + (estTooltipWidth / 2) > viewportWidth - TOOLTIP_OFFSET) { // Too far right
        ttLeft = viewportWidth - estTooltipWidth - TOOLTIP_OFFSET + window.scrollX;
        finalTransform = ''; // Align left edge of tooltip
        arrowLeftStyle = `${(rect.left + rect.width / 2) - (ttLeft - window.scrollX) - (ARROW_SIZE / 2)}px`;
    }


    this.tooltipStyle = {
      display: 'block',
      top: `${ttTop}px`,
      left: `${ttLeft}px`,
      transform: finalTransform,
      '--arrow-visibility': arrowVis,
      '--arrow-top': arrowTopStyle,
      '--arrow-left': arrowLeftStyle,
      '--arrow-transform': arrowTransformStyle,
    };
    this.requestUpdate();
  }

  private clearHighlightAndTooltip(clearText = true) {
    this.highlightStyle = { display: 'none' };
    this.tooltipStyle = { display: 'none' };
    if(clearText) this.tooltipText = '';
    this.resizeObserver.disconnect(); // Important to stop observing when cleared
    this.requestUpdate();
  }

  private handlePopupAction() {
    const currentStepConfig = this.steps[this.currentStepIndex];
    if (currentStepConfig.popup) {
      this.currentPopup = null; // Hide the popup
      if (currentStepConfig.id === 'completion') {
        if (this.dontShowAgainChecked) {
          this.dispatchEvent(new CustomEvent('tutorial-request-permanent-skip', {
            bubbles: true,
            composed: true,
          }));
          // Clean up internal state as if tutorial is finishing
          this.isActive = false;
          this.clearHighlightAndTooltip();
        } else {
          this.finishTutorial(false); // Normal completion, dispatches 'tutorial-complete'
        }
      } else {
        // For other popups (like 'welcome'), just advance.
        this.advanceStep();
      }
    }
  }


  private skipTutorial() {
    this.finishTutorial(true);
  }

  private finishTutorial(skipped: boolean) {
    this.isActive = false;
    this.clearHighlightAndTooltip();
    this.currentPopup = null;
    this.dispatchEvent(new CustomEvent(skipped ? 'tutorial-skip' : 'tutorial-complete', {
      bubbles: true,
      composed: true,
    }));
  }

  static override styles = css`
    :host {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none; 
      z-index: 2000; 
    }

    .popup-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(230, 231, 238, 0.6); /* Frosted glass neumorph */
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto; 
      animation: fadeInNeumorph 0.3s ease-out;
    }

    .popup-panel {
      background-color: var(--neumorph-bg, #e6e7ee);
      color: var(--neumorph-text-color, #333740);
      padding: 25px 35px;
      border-radius: var(--neumorph-radius-large, 20px);
      text-align: center;
      box-shadow: var(--neumorph-shadow-outset-strong); /* Extruded panel */
      max-width: 90vw;
      width: 380px;
    }
    .popup-panel h3 {
      margin-top: 0;
      font-size: 1.8em;
      font-weight: 600;
    }
    .popup-panel p {
      font-size: 1.05em;
      line-height: 1.6;
      margin-bottom: 25px;
    }
    .popup-panel .checkbox-container {
      margin-top: 18px;
      margin-bottom: 25px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      font-size: 0.95em;
    }
    .popup-panel .checkbox-container input[type="checkbox"] {
      accent-color: var(--neumorph-accent-primary, #5200ff);
      width: 18px;
      height: 18px;
      cursor: pointer;
      /* Basic neumorphic checkbox styling if possible, though limited */
      appearance: none;
      -webkit-appearance: none;
      background-color: var(--neumorph-bg, #e6e7ee);
      border-radius: 4px;
      box-shadow: var(--neumorph-shadow-inset-soft);
      position: relative;
    }
    .popup-panel .checkbox-container input[type="checkbox"]:checked {
       background-color: var(--neumorph-accent-primary, #5200ff);
       box-shadow: var(--neumorph-shadow-outset);
    }
    .popup-panel .checkbox-container input[type="checkbox"]:checked::before {
      content: '✔';
      color: white;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 12px;
    }
    .popup-panel .checkbox-container label {
      cursor: pointer;
    }
    .popup-panel button { /* Neumorphic button */
      background: var(--neumorph-bg, #e6e7ee);
      color: var(--neumorph-accent-primary, #5200ff);
      border: none;
      padding: 12px 24px;
      border-radius: var(--neumorph-radius-base, 12px);
      font-size: 1.05em;
      font-weight: 500;
      cursor: pointer;
      transition: box-shadow 0.2s ease-out, transform 0.15s ease-out;
      box-shadow: var(--neumorph-shadow-outset);
    }
    .popup-panel button:hover {
      box-shadow: var(--neumorph-shadow-outset-strong);
    }
    .popup-panel button:active {
      box-shadow: var(--neumorph-shadow-inset);
      transform: scale(0.98);
    }

    .highlight-box {
      position: fixed; 
      border: none; /* Remove border, use shadow for highlight */
      border-radius: var(--neumorph-radius-base, 12px); /* Match target rounding */
      box-shadow: 
        0 0 0 3px var(--neumorph-accent-primary, #5200ff), /* Inner glow */
        0 0 15px 5px var(--neumorph-accent-primary, #5200ff); /* Outer glow */
      pointer-events: none;
      transition: top 0.15s, left 0.15s, width 0.15s, height 0.15s, opacity 0.15s;
      z-index: 2001;
      opacity: 1;
    }
     :host([isActive]) .highlight-box.pulsate {
        animation: pulsateHighlightNeumorph 1.5s infinite ease-in-out;
    }
    @keyframes pulsateHighlightNeumorph {
        0% { box-shadow: 0 0 0 3px var(--neumorph-accent-primary, #5200ff), 0 0 15px 5px var(--neumorph-accent-primary, #5200ff); transform: scale(1); }
        50% { box-shadow: 0 0 0 4px var(--neumorph-accent-primary, #5200ff), 0 0 25px 8px var(--neumorph-accent-primary, #5200ff); transform: scale(1.02); }
        100% { box-shadow: 0 0 0 3px var(--neumorph-accent-primary, #5200ff), 0 0 15px 5px var(--neumorph-accent-primary, #5200ff); transform: scale(1); }
    }


    .tooltip {
      position: fixed; 
      background-color: var(--neumorph-bg, #e6e7ee);
      color: var(--neumorph-text-color, #333740);
      padding: 12px 18px;
      border-radius: var(--neumorph-radius-base, 12px);
      font-size: 1em;
      line-height: 1.5;
      box-shadow: var(--neumorph-shadow-outset); /* Tooltip as extruded panel */
      z-index: 2002;
      max-width: 280px;
      pointer-events: none; 
      transition: top 0.15s, left 0.15s, opacity 0.15s, transform 0.15s;
      opacity: 1;
    }
    .tooltip::after { /* Arrow styled to match neumorphic panel */
        content: '';
        position: absolute;
        width: ${ARROW_SIZE}px;
        height: ${ARROW_SIZE}px;
        background-color: var(--neumorph-bg, #e6e7ee);
        visibility: var(--arrow-visibility, visible);
        top: var(--arrow-top);
        left: var(--arrow-left);
        transform: var(--arrow-transform);
        clip-path: polygon(0% 0%, 100% 100%, 0% 100%);
        /* Add subtle shadow to arrow if possible, or ensure it blends well */
         box-shadow: 1px 1px 2px var(--neumorph-shadow-color-dark, #a3b1c6); /* Example for arrow */
    }

    .skip-button { /* Neumorphic skip button */
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: var(--neumorph-bg, #e6e7ee);
        color: var(--neumorph-text-color-light, #707070);
        border: none;
        padding: 10px 18px;
        border-radius: var(--neumorph-radius-base, 12px);
        font-size: 0.9em;
        font-weight: 500;
        cursor: pointer;
        z-index: 2003;
        pointer-events: auto;
        transition: box-shadow 0.2s ease-out, color 0.2s, transform 0.15s;
        box-shadow: var(--neumorph-shadow-outset);
    }
    .skip-button:hover {
        box-shadow: var(--neumorph-shadow-outset-strong);
        color: #E53935; /* Red on hover */
    }
    .skip-button:active {
        box-shadow: var(--neumorph-shadow-inset);
        transform: scale(0.98);
    }

    @keyframes fadeInNeumorph {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;

  override render() {
    if (!this.isActive) {
      return nothing;
    }

    const stepConfig = this.steps[this.currentStepIndex];
    const isPulsating = stepConfig?.highlightTarget?.() && (
        stepConfig.id === 'createFirstTrack_HighlightAdd' ||
        stepConfig.id === 'createFirstTrack_EnterName' ||
        stepConfig.id === 'playTrack_HighlightPlay' ||
        stepConfig.id === 'createSecondTrack_HighlightAdd' ||
        stepConfig.id === 'createSecondTrack_EnterName' ||
        stepConfig.id === 'mixTrack_SetToOne' ||
        stepConfig.id === 'mixTrack_SetToOnePointFour'
    );


    return html`
      ${this.currentPopup ? html`
        <div class="popup-overlay" @click=${(e: Event) => { if (e.target === e.currentTarget && this.currentPopup?.buttonText) this.handlePopupAction();}}>
          <div class="popup-panel">
            <h3>${this.currentPopup.title}</h3>
            <p>${this.currentPopup.text}</p>
            ${this.currentPopup.title === 'Nice!' /* Only show checkbox on completion popup */ ? html`
              <div class="checkbox-container">
                <input type="checkbox" id="dont-show-again" .checked=${this.dontShowAgainChecked} @change=${(e: Event) => this.dontShowAgainChecked = (e.target as HTMLInputElement).checked}>
                <label for="dont-show-again">Nicht mehr anzeigen</label>
              </div>
            ` : nothing}
            <button @click=${this.handlePopupAction}>${this.currentPopup.buttonText}</button>
          </div>
        </div>
      ` : nothing}

      ${this.highlightStyle.display === 'block' && stepConfig?.highlightTarget ? html`
        <div class="highlight-box ${isPulsating ? 'pulsate' : ''}" style=${styleMap(this.highlightStyle as any)}></div>
      ` : nothing}

      ${this.tooltipText && this.tooltipStyle.display === 'block' ? html`
        <div class="tooltip" style=${styleMap(this.tooltipStyle as any)}>${this.tooltipText}</div>
      ` : nothing}

      ${this.showSkipButton ? html`
        <button class="skip-button" @click=${this.skipTutorial}>Tutorial überspringen</button>
      `: nothing}

      ${stepConfig?.customContent ? stepConfig.customContent() : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'tutorial-controller': TutorialController;
  }
}