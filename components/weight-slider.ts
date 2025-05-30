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
      height: 20px; /* Doubled height for the host */
      touch-action: none; /* Prevent default touch actions like scrolling */
    }
    .slider-container {
      position: relative;
      height: 12px; /* Doubled height for the track */
      width: 100%; /* Track takes full width of host */
      background-color: #555; /* Darker track for better contrast */
      border-radius: 6px; /* Adjusted radius */
    }
    #thumb {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      border-radius: 6px; /* Match container radius */
      box-shadow: 0 0 3px rgba(0, 0, 0, 0.7);
      transition: filter 0.3s ease-out, transform 0.3s ease-out; /* For pulse effect */
    }
    #thumb.pulse-effect {
      animation: thumbPulseEffect 0.3s ease-out;
    }
    @keyframes thumbPulseEffect {
      0% { filter: brightness(1.2) saturate(1.2); }
      50% { filter: brightness(1.6) saturate(1.6); transform: scaleY(1.1); } /* Slightly scale Y for emphasis */
      100% { filter: brightness(1.2) saturate(1.2); }
    }
  `;

  @property({type: Number}) value = 0; // Range 0-2
  @property({type: String}) sliderColor = '#5200ff'; // Default color if not provided

  @query('.slider-container') private sliderContainer!: HTMLDivElement;
  @query('#thumb') private thumbElement!: HTMLDivElement;


  private dragStartPos = 0;
  private dragStartValue = 0;
  private containerBounds: DOMRect | null = null;
  private activePointerId: number | null = null;
  @state() private _isThumbPulsing = false;
  private _previousValueForPulse = this.value;

  // Bound event handlers for robust removal
  private boundHandlePointerMove: (e: PointerEvent) => void;
  private boundHandlePointerUpOrCancel: (e: PointerEvent) => void;


  constructor() {
    super();
    this.boundHandlePointerMove = this.handlePointerMove.bind(this);
    this.boundHandlePointerUpOrCancel = this.handlePointerUpOrCancel.bind(this);

    this.addEventListener('pointerdown', this.handlePointerDown);
    this.addEventListener('wheel', this.handleWheel);
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
      if (this.value > 0.005 && this.thumbElement) { // Only pulse if thumb is visible
          this.thumbElement.classList.add('pulse-effect');
          setTimeout(() => {
            if (this.thumbElement) this.thumbElement.classList.remove('pulse-effect');
          }, 300); // Duration of the pulse animation
      }
    }
  }


  private handlePointerDown(e: PointerEvent) {
    if (this.activePointerId !== null) {
      return;
    }
    // e.preventDefault(); // Keep this commented unless issues arise with text selection etc. on desktop during drag

    this.activePointerId = e.pointerId;
    try {
      this.setPointerCapture(e.pointerId);
    } catch(err) {
        console.warn("Failed to capture pointer:", err);
        // Proceed without capture if it fails, common on some browsers or specific scenarios
    }


    this.containerBounds = this.sliderContainer.getBoundingClientRect();
    this.dragStartPos = e.clientX;
    this.dragStartValue = this.value;
    document.body.classList.add('dragging');

    document.body.addEventListener('pointermove', this.boundHandlePointerMove);
    document.body.addEventListener('pointerup', this.boundHandlePointerUpOrCancel);
    document.body.addEventListener('pointercancel', this.boundHandlePointerUpOrCancel);

    // Update value on initial press down as well
    this.updateValueFromPosition(e.clientX);
  }

  private handlePointerMove(e: PointerEvent) {
    if (e.pointerId !== this.activePointerId) {
      return;
    }
    // Prevent default behavior (like scrolling) during drag on touch devices
    if (e.pointerType === 'touch') {
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
    const delta = e.deltaY;
    this.value = this.value + delta * -0.005;
    this.value = Math.max(0, Math.min(2, this.value));
    this.dispatchInputEvent();
  }

  private updateValueFromPosition(clientX: number) {
    if (!this.containerBounds) return;

    const trackWidth = this.containerBounds.width;
    const trackLeft = this.containerBounds.left;

    const relativeX = clientX - trackLeft;
    const normalizedValue =
      Math.max(0, Math.min(trackWidth, relativeX)) / trackWidth;
    this.value = normalizedValue * 2;

    this.dispatchInputEvent();
  }

  private dispatchInputEvent() {
    this.dispatchEvent(new CustomEvent<number>('input', {detail: this.value}));
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
