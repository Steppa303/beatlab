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
      background-color: rgba(10, 10, 10, 0.85); 
      z-index: 2000; 
      backdrop-filter: blur(8px); 
      -webkit-backdrop-filter: blur(8px);
      opacity: 0;
      animation: fadeInOverlay 0.5s 0.2s ease-out forwards;
    }
    @keyframes fadeInOverlay {
      to { opacity: 1; }
    }
    .panel {
      background-color: #2C2C2C; 
      padding: 30px 40px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      color: #e0e0e0;
      width: clamp(320px, 90vw, 600px);
      text-align: center;
      border: 1px solid #444;
      transform: scale(0.95);
      opacity: 0;
      animation: popInPanel 0.5s 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }
    @keyframes popInPanel {
      to { transform: scale(1); opacity: 1; }
    }

    .app-icon {
      font-size: 3em; 
      margin-bottom: 15px;
    }

    h1 {
      font-size: 2em; 
      font-weight: 600;
      color: #fff;
      margin-top: 0;
      margin-bottom: 10px;
    }
    .tagline {
      font-size: 1.1em;
      color: #bbb;
      margin-bottom: 25px;
    }
    .features {
      list-style: none;
      padding: 0;
      margin: 0 0 25px 0;
      text-align: left;
    }
    .features li {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
      font-size: 1em;
      color: #ccc;
    }
    .features li svg {
      width: 22px;
      height: 22px;
      margin-right: 12px;
      fill: #A0A0A0; 
      flex-shrink: 0;
    }

    .prompt-section {
      margin-bottom: 25px;
    }
    .prompt-section label {
      display: block;
      font-size: 1em;
      color: #ddd;
      margin-bottom: 10px;
      font-weight: 500;
    }
    #first-prompt-input {
      width: 100%;
      padding: 12px 15px;
      border-radius: 8px;
      border: 1px solid #555;
      background-color: #1e1e1e;
      color: #fff;
      font-size: 1em;
      box-sizing: border-box;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    #first-prompt-input:focus {
      outline: none;
      border-color: #7e57c2;
      box-shadow: 0 0 0 3px rgba(126, 87, 194, 0.3);
    }
    .start-button {
      background: linear-gradient(45deg, #7e57c2, #AB47BC);
      color: white;
      border: none;
      padding: 12px 25px;
      border-radius: 8px;
      font-size: 1.1em;
      font-weight: 500;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      display: inline-block;
      box-shadow: 0 4px 15px rgba(126, 87, 194, 0.3);
    }
    .start-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(126, 87, 194, 0.4);
    }
    .start-button:active {
      transform: translateY(0px);
      box-shadow: 0 2px 10px rgba(126, 87, 194, 0.3);
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
