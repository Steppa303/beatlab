/**
 * @fileoverview Welcome overlay component.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, html, LitElement, svg} from 'lit';
import {customElement, property, query} from 'lit/decorators.js';

@customElement('welcome-overlay')
export class WelcomeOverlay extends LitElement {
  @query('#first-prompt-input') private firstPromptInput!: HTMLInputElement;

  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(230, 231, 238, 0.6); /* Frosted glass neumorph */
      z-index: 2000; 
      backdrop-filter: blur(8px); 
      -webkit-backdrop-filter: blur(8px);
      opacity: 0;
      animation: fadeInOverlayNeumorph 0.5s 0.2s ease-out forwards;
    }
    @keyframes fadeInOverlayNeumorph {
      to { opacity: 1; }
    }
    .panel {
      background-color: var(--neumorph-bg, #e6e7ee); 
      padding: 35px 45px; /* Increased padding */
      border-radius: var(--neumorph-radius-large, 20px);
      box-shadow: var(--neumorph-shadow-outset-strong); /* Extruded panel */
      color: var(--neumorph-text-color, #333740);
      width: clamp(340px, 90vw, 650px); /* Wider panel */
      text-align: center;
      transform: scale(0.95);
      opacity: 0;
      animation: popInPanelNeumorph 0.5s 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }
    @keyframes popInPanelNeumorph {
      to { transform: scale(1); opacity: 1; }
    }

    .app-icon {
      font-size: 3.5em; 
      margin-bottom: 20px;
      color: var(--neumorph-accent-primary, #5200ff);
    }

    h1 {
      font-size: 2.2em; 
      font-weight: 600;
      color: var(--neumorph-text-color, #333740);
      margin-top: 0;
      margin-bottom: 12px;
    }
    .tagline {
      font-size: 1.2em;
      color: var(--neumorph-text-color-light, #707070);
      margin-bottom: 30px;
    }
    .features {
      list-style: none;
      padding: 0;
      margin: 0 0 30px 0;
      text-align: left;
    }
    .features li {
      display: flex;
      align-items: center;
      margin-bottom: 15px;
      font-size: 1.05em;
      color: var(--neumorph-text-color, #333740);
    }
    .features li svg {
      width: 24px;
      height: 24px;
      margin-right: 15px;
      fill: var(--neumorph-text-color-light, #707070); 
      flex-shrink: 0;
    }

    .prompt-section {
      margin-bottom: 30px;
    }
    .prompt-section label {
      display: block;
      font-size: 1.05em;
      color: var(--neumorph-text-color, #333740);
      margin-bottom: 12px;
      font-weight: 500;
    }
    #first-prompt-input { /* Neumorphic input */
      width: 100%;
      padding: 14px 18px;
      border-radius: var(--neumorph-radius-base, 12px);
      border: none;
      background-color: var(--neumorph-bg, #e6e7ee);
      color: var(--neumorph-text-color, #333740);
      font-size: 1em;
      box-sizing: border-box;
      transition: box-shadow 0.2s;
      box-shadow: var(--neumorph-shadow-inset-soft);
    }
    #first-prompt-input:focus {
      outline: none;
      box-shadow: var(--neumorph-shadow-inset-soft), 0 0 0 3px var(--neumorph-accent-primary, #5200ff);
    }
    .start-button { /* Neumorphic button */
      background: var(--neumorph-bg, #e6e7ee);
      color: var(--neumorph-accent-primary, #5200ff);
      border: none;
      padding: 14px 28px;
      border-radius: var(--neumorph-radius-base, 12px);
      font-size: 1.15em;
      font-weight: 600;
      cursor: pointer;
      transition: box-shadow 0.2s ease-out, transform 0.15s ease-out, color 0.2s;
      display: inline-block;
      box-shadow: var(--neumorph-shadow-outset);
    }
    .start-button:hover {
      box-shadow: var(--neumorph-shadow-outset-strong);
      color: var(--neumorph-accent-secondary, #2575fc);
    }
    .start-button:active {
      box-shadow: var(--neumorph-shadow-inset);
      transform: scale(0.98);
    }
  `;

  private _handleSubmit() {
    const firstPromptText = this.firstPromptInput.value;
    this.dispatchEvent(new CustomEvent('welcome-complete', {
      detail: { firstPromptText },
      bubbles: true,
      composed: true
    }));
  }

  private _handleKeyPress(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this._handleSubmit();
    }
  }

  override render() {
    return html`
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div class="app-icon">🎵</div>
        <h1 id="welcome-title">Willkommen bei Steppa's BeatLab!</h1>
        <p class="tagline">Gestalte deinen Sound mit KI & MIDI</p>
        
        <ul class="features">
          <li>${svg`<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`} <span><strong>Beschreibe deine Musik:</strong> Tippe Stimmungen, Genres oder Instrumente ein.</span></li>
          <li>${svg`<svg viewBox="0 0 24 24"><path d="M4 18h16v-2H4v2zm0-5h16v-2H4v2zm0-5h16V6H4v2z"/></svg>`} <span><strong>Mische deine Tracks:</strong> Passe die Slider an, um deine Sound-Ebenen zu mischen.</span></li>
          <li>${svg`<svg viewBox="0 0 24 24"><path d="M20 18H4V6h16v12zM6 8h2v2H6V8zm0 4h2v2H6v-2zm0 4h2v2H6v-2zm10-8h2v2h-2V8zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2zM10 8h2v2h-2V8zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg>`} <span><strong>MIDI-Steuerung:</strong> Verbinde deinen Controller für interaktives Mixen.</span></li>
          <li>${svg`<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>`} <span><strong>Drop & Share:</strong> Nutze den "Drop!"-Effekt und teile deine Kreationen.</span></li>
        </ul>

        <div class="prompt-section">
          <label for="first-prompt-input">Starte mit deinem ersten Sound:</label>
          <input 
            type="text" 
            id="first-prompt-input" 
            value="Ambient Chill with a Lo-Fi Beat" 
            @keydown=${this._handleKeyPress}
            placeholder="z.B. Epic Movie Score, Funky Bassline, Relaxing Waves...">
        </div>
        <button class="start-button" @click=${this._handleSubmit}>Let's Go!</button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'welcome-overlay': WelcomeOverlay;
  }
}