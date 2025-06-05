/**
 * @fileoverview Play/Pause button component.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, svg} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {IconButton} from './icon-button.js';
import type {PlaybackState} from '../types.js';

@customElement('play-pause-button')
export class PlayPauseButton extends IconButton {
  @property({type: String}) playbackState: PlaybackState = 'stopped';

  static override styles = [
    IconButton.styles,
    css`
      .loader {
        stroke: var(--neumorph-text-color-light, #707070); /* Loader color */
        stroke-width: 8; /* Kept original thickness */
        stroke-linecap: round;
        animation: spin linear 1s infinite;
        transform-origin: center;
        transform-box: fill-box;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(359deg);
        }
      }
      /* Icon path fill is handled by IconButton's base SVG style, but can be overridden */
      .play-icon-path {
        fill: var(--neumorph-accent-secondary, #2575fc); /* Play icon accent */
      }
      .pause-icon-path {
        fill: var(--neumorph-text-color, #333740); /* Pause icon neutral */
      }
      :host(:active) .play-icon-path,
      :host(:active) .pause-icon-path {
         fill: var(--neumorph-accent-interactive, var(--neumorph-accent-primary));
      }
    `,
  ];

  private renderPause() {
    return svg`<path class="pause-icon-path" d="M35 25 H45 V75 H35 Z M55 25 H65 V75 H55 Z" />`;
  }

  private renderPlay() {
    return svg`<path class="play-icon-path" d="M30 20 L75 50 L30 80 Z" />`;
  }

  private renderLoading() {
    return svg`<circle class="loader" cx="50" cy="50" r="30" fill="none" stroke-dasharray="100 100" />`;
  }

  override renderIcon() {
    if (this.playbackState === 'playing') {
      return this.renderPause();
    } else if (this.playbackState === 'loading') {
      return this.renderLoading();
    } else {
      return this.renderPlay();
    }
  }
}