/**
 * @fileoverview Add prompt button component.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, svg} from 'lit';
import {customElement} from 'lit/decorators.js';
import {IconButton} from './icon-button.js';

@customElement('add-prompt-button')
export class AddPromptButton extends IconButton {
  static override styles = [
    IconButton.styles,
    css`
      .icon-path {
        fill: #FEFEFE;
      }
    `
  ];

  private renderAddIcon() {
    return svg`<path class="icon-path" d="M45 20 H55 V45 H80 V55 H55 V80 H45 V55 H20 V45 H45 Z" />`;
  }

  override renderIcon() {
    return this.renderAddIcon();
  }
}
