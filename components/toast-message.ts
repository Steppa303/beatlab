/**
 * @fileoverview Toast message component.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';

@customElement('toast-message')
export class ToastMessage extends LitElement {
  static override styles = css`
    .toast {
      line-height: 1.5;
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: var(--neumorph-bg, #e6e7ee);
      color: var(--neumorph-text-color, #333740);
      padding: 12px 18px; /* Adjusted padding */
      border-radius: var(--neumorph-radius-base, 12px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 15px;
      min-width: 250px; /* Increased min-width */
      max-width: 80vw;
      transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease-out;
      z-index: 1100;
      opacity: 1;
      box-shadow: var(--neumorph-shadow-outset-strong); /* Extruded panel */
    }
    button { /* Neumorphic close button */
      width: 30px;
      height: 30px;
      border-radius: var(--neumorph-radius-round, 50%);
      border: none;
      color: var(--neumorph-text-color-light, #707070);
      background-color: var(--neumorph-bg, #e6e7ee);
      cursor: pointer;
      font-size: 1em;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--neumorph-shadow-outset);
      transition: box-shadow 0.2s ease-out, color 0.2s, transform 0.1s;
    }
    button:hover {
      color: var(--neumorph-text-color, #333740);
      box-shadow: var(--neumorph-shadow-outset-strong);
    }
    button:active {
      box-shadow: var(--neumorph-shadow-inset);
      transform: scale(0.95);
    }
    .toast:not(.showing) {
      transform: translate(-50%, 150%); /* Slide further down */
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

declare global {
  interface HTMLElementTagNameMap {
    'toast-message': ToastMessage;
  }
}