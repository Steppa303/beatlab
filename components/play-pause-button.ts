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
        stroke: #ffffff;
        stroke-width: 8;
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
      .icon-path {
        fill: #FEFEFE;
      }
      .play-icon-path {
        fill: #4CAF50; /* Green play icon */
      }
    `,
  ];

  private renderPause() {
    return svg`<path class="icon-path" d="M35 25 H45 V75 H35 Z M55 25 H65 V75 H55 Z" />`;
  }

  private renderPlay() {
    // Added play-icon-path class for specific styling
    return svg`<path class="icon-path play-icon-path" d="M30 20 L75 50 L30 80 Z" />`;
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
