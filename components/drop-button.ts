/**
 * @fileoverview Drop button component.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, svg} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {IconButton} from './icon-button.js';

@customElement('drop-button')
export class DropButton extends IconButton {
  @property({type: Boolean, reflect: true}) active = false;

  static override styles = [
    IconButton.styles,
    css`
      :host svg text { /* Target text within this button's SVG specifically */
        font-family: 'Arial Black', 'Impact', sans-serif;
        font-size: 32px; /* Adjusted for neumorphic button size */
        font-weight: 900;
        fill: var(--neumorph-accent-drop, #FFC107); 
        paint-order: stroke;
        stroke: rgba(0,0,0,0.3); 
        stroke-width: 1px;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
      }

      :host([active]) { /* Neumorphic active state for the button itself */
        box-shadow: var(--neumorph-shadow-inset); /* Pressed-in look */
      }
      :host([active]) svg text {
        animation: pulseDropTextNeumorph 1s infinite ease-in-out;
      }

      @keyframes pulseDropTextNeumorph {
        0% {
          filter: brightness(1.1) drop-shadow(0 0 2px var(--neumorph-accent-drop));
          transform: scale(1);
        }
        50% {
          filter: brightness(1.3) drop-shadow(0 0 6px var(--neumorph-accent-drop));
          transform: scale(1.05);
        }
        100% {
          filter: brightness(1.1) drop-shadow(0 0 2px var(--neumorph-accent-drop));
          transform: scale(1);
        }
      }
    `
  ];

  private renderDropIcon() {
    return svg`
      <text 
        x="50%" 
        y="50%" 
        dominant-baseline="central" 
        text-anchor="middle">
        Drop!
      </text>
    `;
  }

  override renderIcon() {
    return this.renderDropIcon();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'drop-button': DropButton;
  }
}