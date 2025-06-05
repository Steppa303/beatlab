/**
 * @fileoverview Component for a single prompt in the Prompt DJ UI.
 * Allows text input, weight adjustment, and removal of the prompt.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, html, LitElement, svg, unsafeCSS} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import type { Prompt } from './types.js'; 
import { WeightSlider } from './components/weight-slider.js';
import { DROP_TRACK_COLOR } from './constants.js'; // Import for gold color

@customElement('prompt-controller')
export class PromptController extends LitElement {
  static override styles = css`
    @keyframes promptAppear {
      from {
        opacity: 0;
        transform: translateY(10px) scale(0.98); 
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    :host {
      display: block;
      width: 100%; 
      transition: box-shadow 0.2s ease-out, transform 0.2s ease-out;
    }
    .prompt {
      position: relative;
      display: flex;
      flex-direction: column; 
      box-sizing: border-box;
      background-color: var(--neumorph-bg, #e6e7ee); /* Use CSS var */
      border-radius: var(--neumorph-radius-large, 20px); /* Use CSS var */
      padding: 18px; /* Slightly increased padding */
      animation: promptAppear 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
      box-shadow: var(--neumorph-shadow-outset); /* Use CSS var */
      transition: transform 0.2s ease-out, box-shadow 0.2s ease-out;
    }
    :host([ismidilearntarget]) .prompt:not(.drop-track-active) {
      box-shadow: 
        var(--neumorph-shadow-outset-strong), /* Base shadow */
        0 0 0 3px var(--neumorph-accent-primary, #5200ff),  /* Glow outline */
        0 0 10px var(--neumorph-accent-primary, #5200ff); /* Outer glow */
      transform: scale(1.02); 
    }
    .prompt:not(.drop-track-active):not([ismidilearntarget]):hover {
      transform: translateY(-2px);
      box-shadow: var(--neumorph-shadow-outset-strong); /* Use CSS var */
    }

    /* Styles for active drop track */
    .prompt.drop-track-active {
      background-color: var(--neumorph-accent-drop, #FFD700); 
      box-shadow: 0 0 10px var(--neumorph-accent-drop), var(--neumorph-shadow-inset);
      animation: promptAppear 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards, 
                   dropTrackPulseNeumorph 1.5s infinite ease-in-out 0.4s; 
    }
    @keyframes dropTrackPulseNeumorph {
      0% { transform: scale(1); opacity: 0.9; }
      50% { transform: scale(1.015); opacity: 1; box-shadow: 0 0 15px var(--neumorph-accent-drop), var(--neumorph-shadow-inset); }
      100% { transform: scale(1); opacity: 0.9; }
    }
    .drop-track-text-display {
      font-family: 'Arial Black', 'Impact', sans-serif;
      font-size: 1.8em;
      font-weight: 900;
      color: #805500; /* Darker gold text */
      text-align: center;
      width: 100%;
      padding: 5px 0; 
      margin: auto 0; 
      line-height: 1.2;
      text-shadow: 1px 1px 0px rgba(255,255,255,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-grow: 1; 
    }


    .prompt-header {
      display: flex;
      justify-content: space-between;
      align-items: center; 
      gap: 10px;
      margin-bottom: 15px; 
      min-height: 2.5em; 
    }
    .text-and-edit {
      display: flex;
      align-items: center;
      flex-grow: 1;
      overflow: hidden; 
      margin-right: 10px; 
    }
    #text-input, #static-text {
      font-family: 'Google Sans', sans-serif;
      font-size: 1.05em; /* Slightly larger for prominence */
      font-weight: 500;
      padding: 8px 10px; 
      box-sizing: border-box;
      text-align: left;
      border: none;
      outline: none;
      -webkit-font-smoothing: antialiased;
      color: var(--neumorph-text-color, #333740);
      background-color: var(--neumorph-bg, #e6e7ee); /* Match card background */
      border-radius: var(--neumorph-radius-base, 12px);
      flex-grow: 1;
      min-width: 0; 
      line-height: 1.4;
      box-shadow: var(--neumorph-shadow-inset-soft); /* Inset style */
    }
    #static-text {
      white-space: normal; 
      word-wrap: break-word; 
      cursor: text;
      min-height: 1.4em; 
      padding: 9px 10px; /* Adjust to match input */
    }
    #static-text:hover {
      background-color: var(--neumorph-bg-darker, #dde0e9); /* Slightly darker on hover */
    }
    #text-input:focus {
      box-shadow: var(--neumorph-shadow-inset-soft), 0 0 0 2px var(--neumorph-accent-primary, #5200ff); 
    }
    .controls-group {
      display: flex;
      align-items: center;
      gap: 10px; /* Increased gap */
      flex-shrink: 0;
    }
    .edit-save-button, .remove-button {
      background: var(--neumorph-bg, #e6e7ee);
      border: none;
      color: var(--neumorph-text-color-light, #707070);
      cursor: pointer;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--neumorph-radius-round, 50%);
      width: 36px; /* Neumorphic button size */
      height: 36px;
      transition: box-shadow 0.2s ease-out, color 0.2s, transform 0.1s ease-out;
      box-shadow: var(--neumorph-shadow-outset);
    }
    .prompt:not(.drop-track-active) .edit-save-button:hover, 
    .prompt:not(.drop-track-active) .remove-button:hover {
      color: var(--neumorph-accent-primary, #5200ff);
      box-shadow: var(--neumorph-shadow-outset-strong);
    }
    .prompt:not(.drop-track-active) .edit-save-button:active, 
    .prompt:not(.drop-track-active) .remove-button:active {
      box-shadow: var(--neumorph-shadow-inset);
      transform: scale(0.95);
    }
    .edit-save-button svg {
      width: 20px; 
      height: 20px;
      fill: currentColor;
    }
    .remove-button {
      color: var(--neumorph-text-color-light, #707070); /* Default color */
    }
    .prompt:not(.drop-track-active) .remove-button:hover {
      color: #E53935; /* Red on hover for remove */
    }
    .ratio-display {
      color: var(--neumorph-text-color-light, #707070); 
      font-size: 0.9em; 
      white-space: nowrap;
      font-weight: 500;
      background-color: var(--neumorph-bg-darker, #dde0e9);
      padding: 5px 10px;
      border-radius: var(--neumorph-radius-base, 12px);
      box-shadow: var(--neumorph-shadow-inset-soft);
    }
    .drop-track-active .ratio-display {
        color: #805500; 
        background-color: rgba(255,255,255,0.4);
    }
    weight-slider {
      width: 100%; 
      height: 24px; 
      margin-top: 5px; /* Add some space above slider */
    }
    :host([filtered='true']) #static-text:not(.drop-track-text-display),
    :host([filtered='true']) #text-input {
      background-color: var(--neumorph-bg, #e6e7ee);
      color: var(--neumorph-text-color, #333740);
      box-shadow: var(--neumorph-shadow-inset-soft), inset 0 0 0 2px #E53935; /* Red inset border */
    }
  `;

  @property({type: String, reflect: true}) promptId = '';
  @property({type: String}) text = '';
  @property({type: Number}) weight = 0;
  @property({type: String}) sliderColor = '#5200ff';
  @property({type: Boolean, reflect: true}) isMidiLearnTarget = false;
  @property({type: Boolean, reflect: true}) filtered = false;
  @property({type: Boolean, reflect: true}) isDropTrack = false;


  @state() private isEditingText = false;
  @query('#text-input') private textInputElement!: HTMLInputElement;
  @query('weight-slider') private weightSliderElement!: WeightSlider;
  private _originalTextBeforeEdit = ''; 

  override connectedCallback() {
    super.connectedCallback();
  }

  override firstUpdated() {
    this.addEventListener('click', this.dispatchPromptInteraction);
  }

  override updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('isEditingText') && this.isEditingText && !this.isDropTrack) {
      requestAnimationFrame(() => {
        if (this.textInputElement) {
          // Dispatch event to parent to ensure app height is set before focusing and scrolling
          this.dispatchEvent(new CustomEvent('request-app-height-reset', {
            bubbles: true,
            composed: true
          }));
          
          this.textInputElement.focus();
          this.textInputElement.select();
          
          // Ensure the focused input scrolls into view if potentially obscured by an overlaying keyboard
          setTimeout(() => {
            this.textInputElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 150); // Delay to allow keyboard to potentially appear and host to resize
        }
      });
    }
  }

  private dispatchPromptInteraction(e: Event) {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, weight-slider, [contenteditable="true"]')) {
        return;
    }
    this.dispatchEvent(new CustomEvent('prompt-interaction', {
        detail: { promptId: this.promptId, text: this.text },
        bubbles: true,
        composed: true
      }));
  }

  private dispatchPromptChange() {
    this.dispatchEvent(
      new CustomEvent<Partial<Prompt>>('prompt-changed', {
        detail: {
          promptId: this.promptId,
          text: this.text,
          weight: this.weight,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private saveText() {
    const newText = this.textInputElement.value.trim();
    if (newText === this.text && this.text !== 'Neuer Prompt') { 
      this.isEditingText = false;
      return;
    }
    this.text = newText === '' ? 'Untitled Prompt' : newText;
    this.dispatchPromptChange();
    this.isEditingText = false;
  }

  private handleToggleEditSave(e: Event) {
    e.stopPropagation(); 
    if (this.isDropTrack) return; // Drop track text is not editable
    if (this.isEditingText) {
      this.saveText();
    } else {
      this._originalTextBeforeEdit = this.text;
      this.isEditingText = true;
    }
  }

  private handleTextInputKeyDown(e: KeyboardEvent) {
    e.stopPropagation(); 
    if (this.isDropTrack) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.saveText();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.text = this._originalTextBeforeEdit; 
      this.textInputElement.value = this.text; 
      this.isEditingText = false;
    }
  }
  
  private handleTextInputBlur(e: FocusEvent) {
    e.stopPropagation();
    if (this.isDropTrack) return;
    if (this.isEditingText) {
        this.saveText();
    }
  }

  private handleStaticTextClick(e: MouseEvent) {
    e.stopPropagation();
    if (this.isDropTrack) return;
    if (!this.isEditingText) {
      this._originalTextBeforeEdit = this.text;
      this.isEditingText = true;
    }
  }


  private updateWeight(event: CustomEvent<number>) {
    event.stopPropagation(); 
    const newWeight = event.detail;
    if (this.weight === newWeight) {
      return;
    }
    this.weight = newWeight;
    this.dispatchPromptChange();
  }

  private dispatchPromptRemoved(e: Event) {
    e.stopPropagation();
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
  
  public enterEditModeAfterCreation() {
    if (this.isDropTrack) return;
    if (this.text === 'Neuer Prompt' || this.text === 'New Prompt') {
      this.isEditingText = true;
      this._originalTextBeforeEdit = this.text; 
    }
  }


  override render() {
    const textContent = this.isDropTrack
      ? html`<span class="drop-track-text-display" aria-label="Drop in progress">Drop!</span>`
      : this.isEditingText
        ? html`<input
              type="text"
              id="text-input"
              .value=${this.text}
              placeholder="Dein Sound-Prompt..."
              @click=${(e: Event) => e.stopPropagation()}
              @keydown=${this.handleTextInputKeyDown}
              @blur=${this.handleTextInputBlur}
              spellcheck="false"
              aria-label="Prompt text input"
            />`
        : html`<span id="static-text" title="Click to edit: ${this.text}" @click=${this.handleStaticTextClick} aria-label="Prompt text: ${this.text}">${this.text}</span>`;

    return html`
    <div class="prompt ${classMap({'drop-track-active': this.isDropTrack})}">
      <div class="prompt-header">
        <div class="text-and-edit">
            ${textContent}
            ${!this.isDropTrack ? html`
              <button 
                  class="edit-save-button" 
                  @click=${this.handleToggleEditSave} 
                  aria-label=${this.isEditingText ? 'Save prompt text' : 'Edit prompt text'}
                  title=${this.isEditingText ? 'Save (Enter)' : 'Edit (Click text or icon)'} >
                  ${this.isEditingText ? this.renderSaveIcon() : this.renderEditIcon()}
              </button>
            ` : ''}
        </div>
        <div class="controls-group">
          <div class="ratio-display">Ratio: ${(this.weight ?? 0).toFixed(1)}</div>
          <button class="remove-button" @click=${this.dispatchPromptRemoved} aria-label="Remove prompt" title="Remove prompt">✕</button>
        </div>
      </div>
      <weight-slider
        .value=${this.weight}
        .sliderColor=${this.sliderColor}
        @input=${this.updateWeight}
        aria-label="Prompt weight slider"
      ></weight-slider>
    </div>`;
  }
}