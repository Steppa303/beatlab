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
      gap: 0.3em;
      width: 100%;
      font-size: 0.9em; /* Slightly smaller than main UI text */
    }
    .label-value-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #ccc; /* Lighter text for labels */
    }
    .label {
      font-weight: 500;
    }
    .value-display {
      font-variant-numeric: tabular-nums;
    }
    input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 10px; /* Slightly thinner than prompt sliders */
      background: #282828; /* Darker track */
      border-radius: 5px;
      outline: none;
      cursor: ew-resize;
      margin: 0;
    }
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px; /* Thumb size */
      height: 18px;
      background: #7e57c2; /* Purple thumb color like screenshot */
      border-radius: 50%;
      cursor: ew-resize;
      border: 2px solid #fff; /* White border for contrast */
      box-shadow: 0 0 3px rgba(0,0,0,0.5);
    }
    input[type="range"]::-moz-range-thumb {
      width: 16px; /* Adjusted for Firefox */
      height: 16px;
      background: #7e57c2;
      border-radius: 50%;
      cursor: ew-resize;
      border: 2px solid #fff;
      box-shadow: 0 0 3px rgba(0,0,0,0.5);
    }
     :host([disabled]) input[type="range"],
     :host([disabled]) input[type="range"]::-webkit-slider-thumb,
     :host([disabled]) input[type="range"]::-moz-range-thumb {
        cursor: not-allowed;
        opacity: 0.5;
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