/**
 * @fileoverview A slider for adjusting and visualizing prompt weight.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, html, LitElement} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {styleMap} from 'lit/directives/style-map.js';

@customElement('weight-slider')
export class WeightSlider extends LitElement {
  static override styles = css`
    :host {
      cursor: ew-resize; 
      position: relative;
      width: 100%;
      display: flex;
      align-items: center;
      box-sizing: border-box;
      height: 24px; /* Increased height */
      touch-action: none; 
      padding: 4px 0; /* Increased padding for neumorphic depth */
      border-radius: var(--neumorph-radius-base, 12px); /* Rounded host for consistency */
    }
    .slider-container {
      position: relative;
      height: 12px; /* Slightly thinner track */
      width: 100%; 
      background-color: var(--neumorph-bg, #e6e7ee); /* Match app background */
      border-radius: var(--neumorph-radius-base, 12px); /* Rounded track */
      box-shadow: var(--neumorph-shadow-inset-soft); /* Inset track */
      overflow: hidden; 
    }
    #thumb {
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      height: 18px; /* Thumb slightly taller than track */
      border-radius: var(--neumorph-radius-base, 12px); 
      /* Extruded thumb */
      box-shadow: 
        2px 2px 4px var(--neumorph-shadow-color-dark, #a3b1c6),
        -2px -2px 4px var(--neumorph-shadow-color-light, #ffffff);
      transition: filter 0.2s ease-out, transform 0.2s ease-out; 
      border: 1px solid var(--neumorph-bg, #e6e7ee); /* Border to lift thumb */
    }
    #thumb.pulse-effect {
      animation: thumbPulseEffectHorizontalNeumorph 0.3s ease-out;
    }
    @keyframes thumbPulseEffectHorizontalNeumorph { 
      0% { filter: brightness(1); transform: translateY(-50%) scale(1); }
      50% { filter: brightness(1.1); transform: translateY(-50%) scale(1.05); }
      100% { filter: brightness(1); transform: translateY(-50%) scale(1); }
    }
  `;

  @property({type: Number}) value = 0; // Range 0-2
  @property({type: String}) sliderColor = 'var(--neumorph-accent-primary, #5200ff)'; 

  @query('.slider-container') private sliderContainer!: HTMLDivElement;
  @query('#thumb') private thumbElement!: HTMLDivElement;

  private dragStartPos = 0;
  private containerBounds: DOMRect | null = null;
  private activePointerId: number | null = null;
  @state() private _isThumbPulsing = false;
  private _previousValueForPulse = this.value;

  private boundHandlePointerMove: (e: PointerEvent) => void;
  private boundHandlePointerUpOrCancel: (e: PointerEvent) => void;

  constructor() {
    super();
    this.boundHandlePointerMove = this.handlePointerMove.bind(this);
    this.boundHandlePointerUpOrCancel = this.handlePointerUpOrCancel.bind(this);

    this.addEventListener('pointerdown', this.handlePointerDown);
    this.addEventListener('wheel', this.handleWheel, { passive: false }); 
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.activePointerId !== null) {
      try {
        this.releasePointerCapture(this.activePointerId);
      } catch (error) {
        // console.warn("Error releasing pointer capture on disconnect:", error);
      }
      document.body.removeEventListener('pointermove', this.boundHandlePointerMove);
      document.body.removeEventListener('pointerup', this.boundHandlePointerUpOrCancel);
      document.body.removeEventListener('pointercancel', this.boundHandlePointerUpOrCancel);
      document.body.classList.remove('dragging'); 
      this.activePointerId = null;
    }
    this.removeEventListener('pointerdown', this.handlePointerDown);
    this.removeEventListener('wheel', this.handleWheel);
  }

  override updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('value') && this.value !== this._previousValueForPulse) {
      this._previousValueForPulse = this.value;
      if (this.value > 0.005 && this.thumbElement) {
        this.thumbElement.classList.add('pulse-effect');
        setTimeout(() => {
          if (this.thumbElement) this.thumbElement.classList.remove('pulse-effect');
        }, 300);
      }
    }
  }

  private handlePointerDown(e: PointerEvent) {
    if (this.activePointerId !== null || e.button !== 0) { 
      return;
    }
    
    this.activePointerId = e.pointerId;
    try {
      this.setPointerCapture(e.pointerId);
    } catch(err) {
        console.warn("Failed to capture pointer:", err);
    }

    this.containerBounds = this.sliderContainer.getBoundingClientRect();
    this.dragStartPos = e.clientX; 
    document.body.classList.add('dragging'); 

    document.body.addEventListener('pointermove', this.boundHandlePointerMove);
    document.body.addEventListener('pointerup', this.boundHandlePointerUpOrCancel);
    document.body.addEventListener('pointercancel', this.boundHandlePointerUpOrCancel);

    this.updateValueFromPosition(e.clientX); 
  }

  private handlePointerMove(e: PointerEvent) {
    if (e.pointerId !== this.activePointerId) {
      return;
    }
    if (e.pointerType === 'touch' || document.body.classList.contains('dragging')) {
      e.preventDefault(); 
    }
    this.updateValueFromPosition(e.clientX);
  }

  private handlePointerUpOrCancel(e: PointerEvent) {
    if (e.pointerId !== this.activePointerId) {
      return;
    }
    try {
      this.releasePointerCapture(e.pointerId);
    } catch (error) {
      // console.warn("Error releasing pointer capture:", error);
    }
    this.activePointerId = null;
    document.body.classList.remove('dragging');
    this.containerBounds = null;

    document.body.removeEventListener('pointermove', this.boundHandlePointerMove);
    document.body.removeEventListener('pointerup', this.boundHandlePointerUpOrCancel);
    document.body.removeEventListener('pointercancel', this.boundHandlePointerUpOrCancel);
  }

  private handleWheel(e: WheelEvent) {
    e.preventDefault(); 
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY; 
    this.value = this.value + delta * 0.002; 
    this.value = Math.max(0, Math.min(2, this.value));
    this.dispatchInputEvent();
  }

  private updateValueFromPosition(clientX: number) {
    if (!this.containerBounds) return;
    const trackWidth = this.containerBounds.width;
    const trackLeft = this.containerBounds.left;
    const relativeX = clientX - trackLeft;
    const normalizedValue = Math.max(0, Math.min(trackWidth, relativeX)) / trackWidth;
    this.value = normalizedValue * 2;
    this.dispatchInputEvent();
  }

  private dispatchInputEvent() {
    this.dispatchEvent(new CustomEvent<number>('input', {detail: this.value, bubbles: true, composed: true}));
  }

  override render() {
    const thumbWidthPercent = (this.value / 2) * 100;
    const thumbStyle = styleMap({
      width: `${thumbWidthPercent}%`,
      display: this.value > 0.005 ? 'block' : 'none', 
      backgroundColor: this.sliderColor,
    });

    return html`
      <div class="slider-container">
        <div id="thumb" style=${thumbStyle}></div>
      </div>
    `;
  }
}