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
      /* Override IconButton's default icon fill for this specific button */
      :host svg .icon-path {
        fill: var(--neumorph-accent-secondary, #2575fc); /* Use a distinct neumorphic accent */
      }
      :host(:active) svg .icon-path {
         fill: var(--neumorph-accent-interactive, var(--neumorph-accent-primary));
      }
    `
  ];

  private renderAddIcon() {
    return svg`<path class="icon-path" d="M45 20 H55 V45 H80 V55 H55 V80 H45 V55 H20 V45 H45 Z" />`;
  }

  // renderSVG can be inherited from IconButton if no background circle override is needed
  // For neumorphism, the button body is styled by :host, not the SVG background.

  override renderIcon() {
    return this.renderAddIcon();
  }
}