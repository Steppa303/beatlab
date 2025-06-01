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
      /* Specific styles for the text within the drop button's SVG */
      text {
        font-family: 'Arial Black', 'Impact', sans-serif; /* More impactful font */
        font-size: 36px; /* Adjusted for better fit and impact */
        font-weight: 900;
        fill: #FFD700; /* Gold color */
        paint-order: stroke;
        stroke: #000000cc; /* Dark stroke for better contrast */
        stroke-width: 1.5px;
        stroke-linecap: butt;
        stroke-linejoin: miter;
        text-shadow: 0 0 5px #000;
      }

      :host([active]) svg { /* Target the SVG for transform/filter for the icon's animation */
        animation: pulseDropButtonIcon 1s infinite ease-in-out;
      }

      @keyframes pulseDropButtonIcon {
        0% {
          transform: scale(1);
          filter: brightness(1.2) drop-shadow(0 0 3px #FFD700);
        }
        50% {
          transform: scale(1.10); /* Slightly less aggressive scale for icon */
          filter: brightness(2.0) drop-shadow(0 0 10px #FFFF00) drop-shadow(0 0 15px #FFD700) drop-shadow(0 0 20px #FF8C00);
        }
        100% {
          transform: scale(1);
          filter: brightness(1.2) drop-shadow(0 0 3px #FFD700);
        }
      }
    `
  ];

  private renderDropIcon() {
    // Text rendering with dominant-baseline and text-anchor for centering
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
