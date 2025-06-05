/**
 * @fileoverview A generic slider for parameters.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';

@customElement('parameter-slider')
export class ParameterSlider extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.5em; /* Increased gap */
      width: 100%;
      font-size: 0.95em; /* Slightly larger */
      color: var(--neumorph-text-color, #333740);
    }
    .label-value-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .label {
      font-weight: 500;
    }
    .value-display {
      font-variant-numeric: tabular-nums;
      color: var(--neumorph-text-color-light, #707070);
    }
    input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 10px; 
      background: var(--neumorph-bg, #e6e7ee); /* Slider track background */
      border-radius: var(--neumorph-radius-base, 12px);
      outline: none;
      cursor: ew-resize;
      margin: 0;
      box-shadow: var(--neumorph-shadow-inset-soft); /* Inset track */
    }
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 20px; 
      height: 20px;
      background: var(--neumorph-accent-interactive, var(--neumorph-accent-primary)); 
      border-radius: var(--neumorph-radius-round, 50%);
      cursor: ew-resize;
      border: 2px solid var(--neumorph-bg, #e6e7ee); /* Border to lift thumb */
      box-shadow: 
        2px 2px 4px var(--neumorph-shadow-color-dark, #a3b1c6),
        -2px -2px 4px var(--neumorph-shadow-color-light, #ffffff); /* Extruded thumb */
      margin-top: -5px; /* Adjust thumb position vertically */
    }
    input[type="range"]::-moz-range-thumb {
      width: 18px; 
      height: 18px;
      background: var(--neumorph-accent-interactive, var(--neumorph-accent-primary));
      border-radius: var(--neumorph-radius-round, 50%);
      cursor: ew-resize;
      border: 2px solid var(--neumorph-bg, #e6e7ee);
      box-shadow: 
        2px 2px 4px var(--neumorph-shadow-color-dark, #a3b1c6),
        -2px -2px 4px var(--neumorph-shadow-color-light, #ffffff);
    }
     :host([disabled]) input[type="range"],
     :host([disabled]) input[type="range"]::-webkit-slider-thumb,
     :host([disabled]) input[type="range"]::-moz-range-thumb {
        cursor: not-allowed;
        opacity: 0.6;
     }
     :host([disabled]) input[type="range"]::-webkit-slider-thumb,
     :host([disabled]) input[type="range"]::-moz-range-thumb {
        box-shadow: var(--neumorph-shadow-inset); /* Disabled thumb looks pressed in */
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
    // Use (this.value ?? 0) to ensure toFixed is called on a number.
    const displayValue = (this.value ?? 0).toFixed(this.step < 0.01 ? 3 : (this.step < 0.1 ? 2 : (this.step < 1 ? 1 : 0)));
    return html`
      <div class="label-value-container">
        <span class="label">${this.label}</span>
        <span class="value-display">${displayValue}</span>
      </div>
      <input
        type="range"
        .min=${this.min}
        .max=${this.max}
        .step=${this.step}
        .value=${(this.value ?? 0).toString()}
        @input=${this.handleInput}
        ?disabled=${this.disabled}
        aria-label=${this.label}
      />
    `;
  }
}