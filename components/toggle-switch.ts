/**
 * @fileoverview A generic toggle switch.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';

@customElement('toggle-switch')
export class ToggleSwitch extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.9em;
      color: #ccc;
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    :host([disabled]) {
        cursor: not-allowed;
        opacity: 0.5;
    }
    .switch {
      position: relative;
      display: inline-block;
      width: 44px; /* Slightly smaller */
      height: 24px; /* Slightly smaller */
    }
    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #4A4A4A; /* Darker grey for off state */
      transition: .3s;
      border-radius: 24px;
    }
    .slider:before {
      position: absolute;
      content: "";
      height: 18px; /* Smaller knob */
      width: 18px;  /* Smaller knob */
      left: 3px;    /* Adjusted position */
      bottom: 3px;  /* Adjusted position */
      background-color: white;
      transition: .3s;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    input:checked + .slider {
      background-color: #7e57c2; /* Purple when on, matching param sliders */
    }
    input:focus + .slider {
      box-shadow: 0 0 1px #7e57c2;
    }
    input:checked + .slider:before {
      transform: translateX(20px); /* Adjusted travel distance */
    }
    :host([disabled]) .slider {
        cursor: not-allowed;
    }
    .label {
      font-weight: 500;
    }
  `;

  @property({type: String}) label = '';
  @property({type: Boolean, reflect: true}) checked = false;
  @property({type: Boolean, reflect: true}) disabled = false;

  private _onClick() {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.dispatchEvent(new CustomEvent('change', {
      detail: { checked: this.checked },
      bubbles: true,
      composed: true,
    }));
  }

  override render() {
    return html`
      <label class="label" @click=${this._onClick}>${this.label}</label>
      <div class="switch" @click=${this._onClick}>
        <input type="checkbox" .checked=${this.checked} ?disabled=${this.disabled} aria-label=${this.label}>
        <span class="slider"></span>
      </div>
    `;
  }
}
