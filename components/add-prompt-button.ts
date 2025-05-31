/**
 * @fileoverview Add prompt button component.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, html, svg} from 'lit';
import {customElement} from 'lit/decorators.js';
import {IconButton} from './icon-button.js';

@customElement('add-prompt-button')
export class AddPromptButton extends IconButton {
  static override styles = [
    IconButton.styles,
    css`
      .icon-path {
        fill: #FFFFFF; /* Ensure plus icon is white */
      }
      /* Override base IconButton SVG styles for specific background */
      :host svg {
        width: 100%;
        height: 100%;
        transition: transform 0.2s cubic-bezier(0.25, 1.56, 0.32, 0.99), filter 0.2s ease-out;
      }
    `
  ];

  private renderAddIcon() {
    // Standard plus icon paths
    return svg`<path class="icon-path" d="M45 20 H55 V45 H80 V55 H55 V80 H45 V55 H20 V45 H45 Z" />`;
  }

  // Override renderSVG to change the background color
  protected override renderSVG() {
    return html` <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="45" fill="#1DB954" /> <!-- Green background -->
      <circle cx="50" cy="50" r="43.5" stroke="rgba(0,0,0,0.3)" stroke-width="3"/>
      ${this.renderIcon()}
    </svg>`;
  }


  override renderIcon() {
    return this.renderAddIcon();
  }
}