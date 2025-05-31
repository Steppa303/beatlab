/**
 * @fileoverview Component for a single prompt in the Prompt DJ UI.
 * Allows text input, weight adjustment, and removal of the prompt.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, html, LitElement, svg} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import type { Prompt } from './types.js'; 
import { WeightSlider } from './components/weight-slider.js';

@customElement('prompt-controller')
export class PromptController extends LitElement {
  static override styles = css`
    @keyframes promptAppear {
      from {
        opacity: 0;
        transform: translateY(10px) scale(0.98); /* Adjusted for vertical stacking */
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    :host {
      display: block;
      width: 100%; /* Take full width of its parent in vertical layout */
      transition: box-shadow 0.2s ease-out, transform 0.2s ease-out;
    }
    .prompt {
      position: relative;
      display: flex;
      flex-direction: column; /* Main direction is column */
      box-sizing: border-box;
      background-color: #2C2C2C; /* Darker background for prompt card */
      border-radius: 12px; /* Rounded corners for the card */
      padding: 15px; /* Padding inside the card */
      animation: promptAppear 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
      transition: transform 0.2s ease-out, box-shadow 0.2s ease-out, border 0.2s ease-out;
      border: 2px solid transparent;
    }
    :host([ismidilearntarget]) .prompt {
      border: 2px solid #FFD700;
      box-shadow: 0 0 10px #FFD700, 0 5px 15px rgba(0,0,0,0.4);
      transform: scale(1.02); /* Slightly larger when targeted */
    }
    .prompt:not([ismidilearntarget]):hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(0,0,0,0.35);
    }
    .prompt-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px; /* Space between header and slider */
      min-height: 2.5em; /* Ensure header has some min height */
    }
    .text-and-edit {
      display: flex;
      align-items: center;
      flex-grow: 1;
      overflow: hidden; /* Important for text ellipsis if not editing */
      margin-right: 10px;
    }
    #text-input, #static-text {
      font-family: 'Google Sans', sans-serif;
      font-size: 1em; /* Adjusted font size for better readability */
      font-weight: 500;
      padding: 5px 8px; 
      box-sizing: border-box;
      text-align: left;
      border: none;
      outline: none;
      -webkit-font-smoothing: antialiased;
      color: #fff;
      background-color: transparent;
      border-radius: 6px; /* Rounded corners for input/text area */
      flex-grow: 1;
      min-width: 0; 
      line-height: 1.4;
    }
    #static-text {
      white-space: normal; /* Allow text to wrap */
      word-wrap: break-word; /* Ensure long words break */
      cursor: text;
      min-height: 1.4em; /* Ensure it has some height even if empty */
      padding: 6px 8px;
    }
    #static-text:hover {
      background-color: rgba(255,255,255,0.08);
    }
    #text-input {
      background-color: rgba(0,0,0,0.25); 
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.15);
    }
    #text-input:focus {
      box-shadow: 0 0 0 2px #7e57c2; /* Focus similar to welcome overlay */
    }
    .controls-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .edit-save-button {
      background: none;
      border: none;
      color: #ccc;
      cursor: pointer;
      padding: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%; /* Circular button */
      width: 32px;
      height: 32px;
      transition: background-color 0.2s, color 0.2s;
    }
    .edit-save-button:hover {
      background-color: rgba(255,255,255,0.1);
      color: #fff;
    }
    .edit-save-button svg {
      width: 20px; 
      height: 20px;
      fill: currentColor;
    }
    .ratio-display {
      color: #c0c0c0; /* Lighter color for ratio */
      font-size: 0.85em; 
      white-space: nowrap;
      font-weight: 400;
      background-color: rgba(0,0,0,0.2);
      padding: 4px 8px;
      border-radius: 4px;
    }
    .remove-button {
      background: #D32F2F;
      color: #FFFFFF;
      border: none;
      border-radius: 50%;
      width: 30px; /* Slightly larger remove button */
      height: 30px;
      font-size: 16px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      opacity: 0.8;
      transition: opacity 0.15s, transform 0.15s, background-color 0.15s;
    }
    .remove-button:hover {
      opacity: 1;
      transform: scale(1.1);
      background-color: #E53935;
    }
    weight-slider {
      width: 100%; /* Slider takes full width */
      height: 22px; /* Increased height for better touch interaction */
      /* cursor is handled by weight-slider itself */
    }
    :host([filtered='true']) #static-text,
    :host([filtered='true']) #text-input {
      background-color: rgba(218, 32, 0, 0.7); /* More prominent filtered indication */
      color: #fff;
      border: 1px dashed #ff8a80;
    }
    :host([filtered='true']) {
      /* box-shadow: 0 0 10px 2px rgba(218, 32, 0, 0.7); */
    }
  `;

  @property({type: String, reflect: true}) promptId = '';
  @property({type: String}) text = '';
  @property({type: Number}) weight = 0;
  @property({type: String}) sliderColor = '#5200ff';
  @property({type: Boolean, reflect: true}) isMidiLearnTarget = false;
  @property({type: Boolean, reflect: true}) filtered = false;


  @state() private isEditingText = false;
  @query('#text-input') private textInputElement!: HTMLInputElement;
  @query('weight-slider') private weightSliderElement!: WeightSlider;
  private _originalTextBeforeEdit = ''; 

  override connectedCallback() {
    super.connectedCallback();
    // If the prompt is new (default text) and hasn't been updated yet, start in edit mode.
    // "New Prompt" is German "Neuer Prompt" in index.tsx
    if (this.text === 'Neuer Prompt' && !this.hasUpdated) {
      this.isEditingText = true;
      this._originalTextBeforeEdit = this.text;
    }
  }

  override firstUpdated() {
    // Main .prompt div handles clicks for learn target selection
    this.addEventListener('click', this.dispatchPromptInteraction);
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

  private dispatchPromptInteraction(e: Event) {
    // Only dispatch if the click is on the prompt card itself, not on interactive elements within
    // This is tricky because the slider is now part of it.
    // A simpler way for MIDI learn is to attach learn handlers to specific elements in the parent.
    // For now, clicking anywhere on the card except buttons/input might be okay.
    const target = e.target as HTMLElement;
    if (target.closest('button, input, weight-slider, [contenteditable="true"]')) {
        // If the click was on a button, input, or the slider, don't treat it as a "select this prompt for MIDI learn"
        // Let those elements handle their own click events.
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
        bubbles: true, // Ensure it bubbles up to prompt-dj
        composed: true,
      }),
    );
  }

  private saveText() {
    const newText = this.textInputElement.value.trim();
    // Only save and dispatch if text actually changed, or if it was the default "Neuer Prompt"
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
    if (this.isEditingText) {
      this.saveText();
    } else {
      this._originalTextBeforeEdit = this.text;
      this.isEditingText = true;
    }
  }

  private handleTextInputKeyDown(e: KeyboardEvent) {
    e.stopPropagation(); 
    if (e.key === 'Enter' && !e.shiftKey) { // Enter saves, Shift+Enter for newline (if textarea)
      e.preventDefault();
      this.saveText();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.text = this._originalTextBeforeEdit; 
      this.textInputElement.value = this.text; // Reset input field value as well
      this.isEditingText = false;
    }
  }
  
  private handleTextInputBlur(e: FocusEvent) {
    e.stopPropagation();
    // Save on blur only if it's a real blur, not just focus moving within component
    // or if a save attempt via Enter/Esc already happened.
    // For simplicity, always try to save if editing.
    if (this.isEditingText) {
        this.saveText();
    }
  }

  private handleStaticTextClick(e: MouseEvent) {
    e.stopPropagation();
    if (!this.isEditingText) {
      this._originalTextBeforeEdit = this.text;
      this.isEditingText = true;
    }
  }


  private updateWeight(event: CustomEvent<number>) {
    event.stopPropagation(); // Prevent this from being a promptInteraction event.
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
  
  // Method to be called from parent if add button creates this prompt
  public enterEditModeAfterCreation() {
    // "Neuer Prompt" is German, "New Prompt" might be from older versions or direct manipulation
    if (this.text === 'Neuer Prompt' || this.text === 'New Prompt') {
      this.isEditingText = true;
      this._originalTextBeforeEdit = this.text; 
    }
  }


  override render() {
    const textContent = this.isEditingText
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
    <div class="prompt">
      <div class="prompt-header">
        <div class="text-and-edit">
            ${textContent}
            <button 
                class="edit-save-button" 
                @click=${this.handleToggleEditSave} 
                aria-label=${this.isEditingText ? 'Save prompt text' : 'Edit prompt text'}
                title=${this.isEditingText ? 'Save (Enter)' : 'Edit (Click text or icon)'} >
                ${this.isEditingText ? this.renderSaveIcon() : this.renderEditIcon()}
            </button>
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
