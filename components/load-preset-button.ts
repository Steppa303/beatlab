/**
 * @fileoverview Load preset button component.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, svg} from 'lit';
import {customElement} from 'lit/decorators.js';
import {IconButton} from './icon-button.js';

@customElement('load-preset-button')
export class LoadPresetButton extends IconButton {
  static override styles = [
    IconButton.styles,
    css` .icon-path { fill: #FEFEFE; } `
  ];
  private renderLoadIcon() {
    return svg`<path class="icon-path" d="M20 25 H40 L45 20 H70 L75 25 V30 H20 V25 Z M20 35 H80 V70 H20 V35 Z"/>`;
  }
  override renderIcon() { return this.renderLoadIcon(); }
}

declare global {
  interface HTMLElementTagNameMap {
    'load-preset-button': LoadPresetButton;
  }
}
