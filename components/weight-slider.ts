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
      cursor: ew-resize; /* Horizontal resize cursor */
      position: relative;
      width: 100%;
      display: flex;
      align-items: center;
      box-sizing: border-box;
      height: 22px; 
      touch-action: none; 
      padding: 2px 0; /* Add some vertical padding for easier interaction */
    }
    .slider-container {
      position: relative;
      height: 14px; /* Height of the track */
      width: 100%; 
      background-color: #404040; /* Darker track for better contrast */
      border-radius: 7px; 
      overflow: hidden; /* Ensure thumb stays within bounds */
    }
    #thumb {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      border-radius: 7px; 
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.3); /* Inner shadow for depth */
      transition: filter 0.2s ease-out, transform 0.2s ease-out; 
    }
    #thumb.pulse-effect {
      animation: thumbPulseEffectHorizontal 0.3s ease-out;
    }
    @keyframes thumbPulseEffectHorizontal { /* Adjusted for horizontal slider */
      0% { filter: brightness(1.1) saturate(1.1); }
      50% { filter: brightness(1.4) saturate(1.4); transform: scaleX(1.02); } /* Scale X for horizontal emphasis */
      100% { filter: brightness(1.1) saturate(1.1); }
    }
  `;

  @property({type: Number}) value = 0; // Range 0-2
  @property({type: String}) sliderColor = '#5200ff'; // Default color if not provided

  @query('.slider-container') private sliderContainer!: HTMLDivElement;
  @query('#thumb') private thumbElement!: HTMLDivElement;

  private dragStartPos = 0;
  // private dragStartValue = 0; // Not strictly needed if calculating directly from position
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
    this.addEventListener('wheel', this.handleWheel, { passive: false }); // Wheel event for horizontal scroll
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
      document.body.classList.remove('dragging'); // Ensure dragging class is removed
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
    if (this.activePointerId !== null || e.button !== 0) { // Only main button
      return;
    }
    // e.preventDefault(); // Can cause issues with text selection if parent elements need it. Test thoroughly.
    
    this.activePointerId = e.pointerId;
    try {
      this.setPointerCapture(e.pointerId);
    } catch(err) {
        console.warn("Failed to capture pointer:", err);
    }

    this.containerBounds = this.sliderContainer.getBoundingClientRect();
    this.dragStartPos = e.clientX; // Use clientX for horizontal
    // this.dragStartValue = this.value;
    document.body.classList.add('dragging'); // Add class to body for global cursor changes

    document.body.addEventListener('pointermove', this.boundHandlePointerMove);
    document.body.addEventListener('pointerup', this.boundHandlePointerUpOrCancel);
    document.body.addEventListener('pointercancel', this.boundHandlePointerUpOrCancel);

    this.updateValueFromPosition(e.clientX); // Update value on initial press
  }

  private handlePointerMove(e: PointerEvent) {
    if (e.pointerId !== this.activePointerId) {
      return;
    }
    if (e.pointerType === 'touch' || document.body.classList.contains('dragging')) {
      e.preventDefault(); // Prevent scrolling page during horizontal drag
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
    e.preventDefault(); // Prevent page scroll
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY; // Prefer deltaX, fallback to deltaY for some trackpads
    this.value = this.value + delta * 0.002; // Adjusted sensitivity for horizontal scroll
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
      display: this.value > 0.005 ? 'block' : 'none', // Hide if value is near zero
      backgroundColor: this.sliderColor,
    });

    return html`
      <div class="slider-container">
        <div id="thumb" style=${thumbStyle}></div>
      </div>
    `;
  }
}
