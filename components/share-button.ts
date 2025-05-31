/**
 * @fileoverview Share button component.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {svg} from 'lit';
import {customElement} from 'lit/decorators.js';
import {IconButton} from './icon-button.js';

@customElement('share-button')
export class ShareButton extends IconButton {
  static override styles = [
    IconButton.styles,
  ];

  private renderShareText() {
    return svg`
      <text 
        x="50%" 
        y="50%" 
        dominant-baseline="middle" 
        text-anchor="middle" 
        font-family="Arial, sans-serif"
        font-size="30"  
        font-weight="bold" 
        fill="#FEFEFE">
        Share
      </text>
    `;
  }
  override renderIcon() {
    return this.renderShareText();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'share-button': ShareButton;
  }
}
