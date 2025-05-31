/**
 * @fileoverview Save preset button component.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, svg} from 'lit';
import {customElement} from 'lit/decorators.js';
import {IconButton} from './icon-button.js';

@customElement('save-preset-button')
export class SavePresetButton extends IconButton {
  static override styles = [
    IconButton.styles,
    css` .icon-path { fill: #FEFEFE; } `
  ];
  private renderSaveIcon() {
    return svg`<path class="icon-path" d="M25 65 H75 V75 H25 Z M50 20 L70 45 H58 V20 H42 V45 H30 Z"/>`;
  }
  override renderIcon() { return this.renderSaveIcon(); }
}

declare global {
  interface HTMLElementTagNameMap {
    'save-preset-button': SavePresetButton;
  }
}
