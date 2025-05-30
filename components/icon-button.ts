/**
 * @fileoverview Base class for icon buttons.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, html, LitElement, svg, type CSSResultGroup} from 'lit';
import {property} from 'lit/decorators.js';

export class IconButton extends LitElement {
  @property({type: Boolean, reflect: true}) isMidiLearnTarget = false;

  static override styles = css`
    :host {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none; /* Host itself doesn't receive clicks */
      border-radius: 50%; /* Ensure border radius is circular for the host */
      transition: box-shadow 0.2s ease-out, transform 0.2s ease-out;
    }
    :host(:hover) svg {
      transform: scale(1.2);
      filter: brightness(1.2);
    }
    :host(:active) svg { /* Press down effect */
      transform: scale(1.1);
      filter: brightness(0.9);
    }
    :host([isMidiLearnTarget]) {
      box-shadow: 0 0 0 3px #FFD700, 0 0 10px #FFD700; /* Gold outline and glow */
      transform: scale(1.05); /* Slightly larger when targeted */
    }
    svg {
      width: 100%;
      height: 100%;
      transition: transform 0.2s cubic-bezier(0.25, 1.56, 0.32, 0.99), filter 0.2s ease-out;
    }
    .hitbox {
      pointer-events: all; /* Hitbox receives clicks */
      position: absolute;
      width: 65%; /* Adjust as needed for comfortable click area */
      aspect-ratio: 1;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent; /* Remove tap highlight on mobile */
    }
  ` as CSSResultGroup;

  protected renderIcon() {
    return svg``;
  }

  private renderSVG() {
    return html` <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="45" fill="rgba(255,255,255,0.05)" />
      <circle cx="50" cy="50" r="43.5" stroke="rgba(0,0,0,0.3)" stroke-width="3"/>
      ${this.renderIcon()}
    </svg>`;
  }

  override render() {
    return html`${this.renderSVG()}<div class="hitbox"></div>`;
  }
}
