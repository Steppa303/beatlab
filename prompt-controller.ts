/**
 * @fileoverview Component for a single prompt in the Prompt DJ UI.
 * Allows text input, weight adjustment, and removal of the prompt.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, html, LitElement, svg} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import type { Prompt } from './types.js'; 
import { WeightSlider } from './components/weight-slider.js'; // Changed from type-only import

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
    :host { /* Base style for the host */
      display: block; /* Ensure it takes up block space */
      transition: box-shadow 0.2s ease-out, transform 0.2s ease-out;
      cursor: pointer; /* Indicate clickable for MIDI learn */
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
      transition: transform 0.2s ease-out, box-shadow 0.2s ease-out, border 0.2s ease-out; /* Added border transition */
      border: 2px solid transparent; /* For learn target highlight */
    }
    :host([ismidilearntarget]) .prompt {
      border: 2px solid #FFD700; /* Gold border */
      box-shadow: 0 0 10px #FFD700, 0 5px 15px rgba(0,0,0,0.4); /* Gold glow and enhanced shadow */
      transform: scale(1.01); /* Slightly larger when targeted */
    }
    .prompt:not([ismidilearntarget]):hover { /* Hover only if NOT learn target */
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
      /* cursor: pointer; Already set on host, inherited */
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
  @property({type: Boolean, reflect: true}) isMidiLearnTarget = false;
  @property({type: Boolean, reflect: true}) filtered = false; // To pass down for styling if needed


  @state() private isEditingText = false;
  @query('#text-input') private textInputElement!: HTMLInputElement;
  @query('weight-slider') private weightSliderElement!: WeightSlider;
  private _originalTextBeforeEdit = ''; // To revert on Escape

  override connectedCallback() {
    super.connectedCallback();
    if (this.text === 'New Prompt' && !this.hasUpdated) {
      this.isEditingText = true;
      this._originalTextBeforeEdit = this.text;
    }
  }

  override firstUpdated() {
    // The main .prompt div will handle clicks for learn target selection
    // No need for specific listener on weight-slider for this anymore
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
    // Check if the click was on the slider itself or the general prompt area.
    // This distinction might not be strictly necessary if the parent handles it well.
    // For now, any click on the .prompt div (which includes the slider) will trigger.
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
      }),
    );
  }

  private saveText() {
    const newText = this.textInputElement.value.trim();
    if (newText === this.text && this.text !== 'New Prompt') { 
      this.isEditingText = false;
      return;
    }
    this.text = newText === '' ? 'Untitled Prompt' : newText;
    this.dispatchPromptChange();
    this.isEditingText = false;
  }

  private handleToggleEditSave(e: Event) {
    e.stopPropagation(); // Prevent this click from also triggering prompt-interaction for learn mode
    if (this.isEditingText) {
      this.saveText();
    } else {
      this._originalTextBeforeEdit = this.text;
      this.isEditingText = true;
    }
  }

  private handleTextInputKeyDown(e: KeyboardEvent) {
    e.stopPropagation(); // Keep text input focused
    if (e.key === 'Enter') {
      e.preventDefault();
      this.saveText();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.text = this._originalTextBeforeEdit; 
      this.isEditingText = false;
    }
  }
  
  private handleTextInputBlur(e: FocusEvent) {
    e.stopPropagation();
    if (this.isEditingText) {
        this.saveText();
    }
  }

  private handleStaticTextDoubleClick(e: MouseEvent) {
    e.stopPropagation(); // Prevent this click from also triggering prompt-interaction for learn mode
    if (!this.isEditingText) {
      this._originalTextBeforeEdit = this.text;
      this.isEditingText = true;
    }
  }


  private updateWeight(event: CustomEvent<number>) {
    // Stop propagation if this event comes from the weight-slider directly,
    // as the main div click is already handled for learn target selection.
    // However, weight updates should always propagate.
    // event.stopPropagation();
    const newWeight = event.detail;
    if (this.weight === newWeight) {
      return;
    }
    this.weight = newWeight;
    this.dispatchPromptChange();
  }

  private dispatchPromptRemoved(e: Event) {
    e.stopPropagation(); // Prevent this click from also triggering prompt-interaction for learn mode
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
            @click=${(e: Event) => e.stopPropagation()}
            @keydown=${this.handleTextInputKeyDown}
            @blur=${this.handleTextInputBlur}
            spellcheck="false"
          />`
      : html`<span id="static-text" title=${this.text} @dblclick=${this.handleStaticTextDoubleClick}>${this.text}</span>`;

    return html`
    <div class="prompt" @click=${this.dispatchPromptInteraction}>
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
        <div class="ratio-display">RATIO: ${(this.weight ?? 0).toFixed(1)}</div>
        <button class="remove-button" @click=${this.dispatchPromptRemoved} aria-label="Remove prompt">✕</button>
      </div>
      <weight-slider
        .value=${this.weight}
        .sliderColor=${this.sliderColor}
        @input=${this.updateWeight}></weight-slider>
    </div>`;
  }
}