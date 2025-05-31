/**
 * @fileoverview Cast button component.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, svg} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {IconButton} from './icon-button.js';

@customElement('cast-button')
export class CastButton extends IconButton {
  static override styles = [
    IconButton.styles,
    css`
      .icon-path-fill {
        fill: #FEFEFE;
      }
      :host([iscastingactive]) .icon-path-fill {
        fill: #64B5F6; /* Light blue when casting */
      }
    `
  ];

  @property({type: Boolean, reflect: true}) isCastingActive = false;

  private renderCastIconSvg() {
    return svg`
      <path class="icon-path-fill"
        d="M87.5 25H12.5C10.25 25 8.33333 26.9167 8.33333 29.1667V37.5H16.6667V33.3333H83.3333V70.8333H54.1667V79.1667H83.3333C85.5833 79.1667 87.5 77.25 87.5 75V29.1667C87.5 26.9167 85.5833 25 87.5 25ZM8.33333 70.8333V79.1667H20.8333C20.8333 74.4167 16.25 70.8333 8.33333 70.8333ZM8.33333 58.3333V64.5833C22.5833 64.5833 29.1667 71.1667 29.1667 79.1667H35.4167C35.4167 66.0833 23.4167 58.3333 8.33333 58.3333ZM8.33333 45.8333V52.0833C29.25 52.0833 41.6667 64.5 41.6667 79.1667H47.9167C47.9167 57.9167 30.5833 45.8333 8.33333 45.8333Z"
      />
    `;
  }

  override renderIcon() {
    return this.renderCastIconSvg();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cast-button': CastButton;
  }
}
