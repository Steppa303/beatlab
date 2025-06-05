/**
 * @fileoverview Base class for icon buttons.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, html, LitElement, svg, type CSSResultGroup} from 'lit';
import {property} from 'lit/decorators.js';

export class IconButton extends LitElement {
  @property({type: Boolean, reflect: true}) isMidiLearnTarget = false;
  @property({type: Boolean, reflect: true}) disabled = false;

  static override styles = css`
    :host {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--neumorph-radius-round, 50%);
      transition: box-shadow 0.15s ease-out, transform 0.15s ease-out, opacity 0.2s ease-out;
      cursor: pointer;
      background-color: var(--neumorph-bg, #e6e7ee);
      box-shadow: var(--neumorph-shadow-outset);
      /* pointer-events: none; /* Host itself doesn't receive clicks if hitbox is used */
    }
    :host([disabled]) {
      opacity: 0.6;
      cursor: not-allowed;
      box-shadow: var(--neumorph-shadow-inset); /* Disabled buttons look pressed in */
    }
    :host(:not([disabled]):hover) {
      box-shadow: var(--neumorph-shadow-outset-strong);
    }
    :host(:not([disabled]):active) { 
      box-shadow: var(--neumorph-shadow-inset);
      transform: scale(0.95);
    }
    :host([isMidiLearnTarget]) {
      box-shadow: 
        var(--neumorph-shadow-outset), /* Base shadow */
        0 0 0 3px var(--neumorph-accent-primary, #5200ff),  /* Glow outline */
        0 0 10px var(--neumorph-accent-primary, #5200ff); /* Outer glow */
      transform: scale(1.05); 
    }
    svg {
      width: 60%; /* Adjust icon size within button */
      height: 60%;
      transition: transform 0.2s cubic-bezier(0.25, 1.56, 0.32, 0.99), filter 0.2s ease-out;
      fill: var(--neumorph-text-color-light, #707070); /* Default icon color */
    }
    :host(:not([disabled]):hover) svg {
      fill: var(--neumorph-text-color, #333740);
    }
     :host(:not([disabled]):active) svg {
      fill: var(--neumorph-accent-interactive, var(--neumorph-accent-primary));
    }

    /* Hitbox is removed, clicks are handled by the host directly now for simplicity with neumorphism */
    /* .hitbox removed */
  ` as CSSResultGroup;

  protected renderIcon() {
    // Subclasses will provide their specific icon paths here.
    // The <g> wrapper can be used if common transforms/styles apply to all icon paths.
    return svg``;
  }

  protected renderSVG() {
    // Simplified SVG structure for Neumorphism. 
    // The button's body itself provides the neumorphic look.
    // The icon is just placed inside.
    return html` 
      <svg
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg">
        ${this.renderIcon()}
      </svg>`;
  }

  override render() {
    // Removed hitbox, host handles click.
    return html`${this.renderSVG()}`;
  }
}