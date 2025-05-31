/**
 * @fileoverview Drop button component.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {svg} from 'lit';
import {customElement} from 'lit/decorators.js';
import {IconButton} from './icon-button.js';

@customElement('drop-button')
export class DropButton extends IconButton {
  static override styles = [
    IconButton.styles,
  ];

  private renderDropIcon() {
    return svg`
      <text 
        x="50%" 
        y="50%" 
        dominant-baseline="middle" 
        text-anchor="middle" 
        font-family="Arial, sans-serif"
        font-size="38"  
        font-weight="bold" 
        fill="#FFD700">
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
