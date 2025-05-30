/**
 * @fileoverview MIDI Controller for Web MIDI API interactions.
 * Manages MIDI device selection and message handling.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Local type definitions for Web MIDI API removed, relying on global types.

export interface MidiInputInfo {
  id: string;
  name: string;
}
export class MidiController extends EventTarget {
  private midiAccess: MIDIAccess | null = null;
  private inputs: MIDIInput[] = [];
  private selectedInput: MIDIInput | null = null;

  constructor() {
    super();
  }

  public isMidiSupported(): boolean {
    return typeof navigator.requestMIDIAccess === 'function';
  }

  public initialize(): void {
    // Check for support but don't request access yet.
    if (!this.isMidiSupported()) {
      console.warn('Web MIDI API not supported in this browser.');
    }
    // Initial dispatch of (empty) inputs.
    // `requestMidiAccessAndListDevices` will dispatch again if/when access is granted.
    this.dispatchInputsChanged();
  }

  public async requestMidiAccessAndListDevices(): Promise<boolean> {
    if (!this.isMidiSupported()) {
      console.warn('Attempted to request MIDI access, but API is not supported.');
      this.dispatchInputsChanged(); // Ensure UI knows there are no inputs
      return false;
    }

    if (this.midiAccess) {
      console.log('MIDI access already granted.');
      this.updateInputList(); // Refresh list in case it changed
      return true;
    }

    try {
      console.log('Requesting MIDI access...');
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      console.log('MIDI access granted.');

      this.midiAccess.onstatechange = (event: MIDIConnectionEvent) => {
        console.log('MIDI state changed:', event.port.name, event.port.state);
        const previouslySelectedInputId = this.selectedInput?.id;
        this.updateInputList();
        // If the selected input is disconnected, we need to clear it.
        if (this.selectedInput && this.selectedInput.state === 'disconnected') {
            console.log(`Selected MIDI input disconnected: ${this.selectedInput.name}`);
            this.selectMidiInput(''); // Deselect it
        } else if (previouslySelectedInputId && !this.inputs.find(i => i.id === previouslySelectedInputId)) {
             // If the previously selected input is no longer in the list (e.g. unplugged)
            console.log(`Previously selected MIDI input ${previouslySelectedInputId} is no longer available.`);
            this.selectMidiInput(''); // Deselect it
        }
      };
      this.updateInputList();
      return true;
    } catch (error) {
      console.error('Failed to get MIDI access:', error);
      this.midiAccess = null; // Ensure it's reset on failure
      this.dispatchInputsChanged(); // Dispatch empty list on error
      return false;
    }
  }

  private updateInputList(): void {
    if (!this.midiAccess) {
      this.inputs = [];
    } else {
      this.inputs = Array.from(this.midiAccess.inputs.values());
    }
    this.dispatchInputsChanged();

    if (this.inputs.length === 0 && this.midiAccess) {
      // console.log('MIDI access granted, but no MIDI input devices found.');
    } else if (this.inputs.length > 0) {
      // console.log('Available MIDI inputs:', this.inputs.map(i => i.name).join(', '));
    }
  }

  private dispatchInputsChanged(): void {
    const availableInputs: MidiInputInfo[] = this.inputs
      .filter(input => input.state === 'connected') // Only list connected inputs
      .map(input => ({
        id: input.id,
        name: input.name || `MIDI Input ${input.id.substring(0, 8)}`, // Provide a default name if empty
    }));
    this.dispatchEvent(new CustomEvent('midi-inputs-changed', {
      detail: { inputs: availableInputs }
    }));
  }

  public selectMidiInput(inputId: string): void {
    // Remove listener from previously selected input
    if (this.selectedInput) {
      this.selectedInput.onmidimessage = null;
      console.log(`Stopped listening to MIDI input: ${this.selectedInput.name}`);
      this.selectedInput = null;
    }

    if (!inputId || !this.midiAccess) { // Also check for midiAccess
        if (!inputId) console.log('MIDI input deselected.');
        else console.log('Cannot select MIDI input: MIDI access not available.');
        this.selectedInput = null; // Ensure it's null
        return;
    }

    // Find and set new selected input
    this.selectedInput = this.inputs.find(input => input.id === inputId && input.state === 'connected') || null;

    if (this.selectedInput) {
      this.selectedInput.onmidimessage = this.onMidiMessage.bind(this);
      console.log(`Now listening to MIDI input: ${this.selectedInput.name}`);
    } else {
      console.warn(`MIDI input with ID '${inputId}' not found or not connected.`);
    }
  }

  private onMidiMessage(event: MIDIMessageEvent): void {
    // This will only be called if 'this.selectedInput' is set and has this handler
    const [status, data1, data2] = event.data;
    // Check for Control Change message (0xB0 - 0xBF for channels 1-16)
    if (status >= 0xB0 && status <= 0xBF) {
      const ccNumber = data1;
      const rawValue = data2; // 0-127

      // Normalize CC value (0-127) to a 0-2 range for the slider
      const normalizedValueForSlider = (rawValue / 127) * 2;

      this.dispatchEvent(new CustomEvent('midi-cc-received', {
        detail: {
          ccNumber: ccNumber,
          value: normalizedValueForSlider, // For sliders (0-2 range)
          rawValue: rawValue, // For buttons or other logic (0-127 range)
        }
      }));
    }
  }

  public hasActiveSelection(): boolean {
    return this.selectedInput !== null && this.selectedInput.state === 'connected';
  }

  destroy(): void {
    if (this.selectedInput) {
      this.selectedInput.onmidimessage = null;
      this.selectedInput = null;
    }
    if (this.midiAccess) {
      this.midiAccess.onstatechange = null; // Remove state change listener
      // MIDIAccess object does not have a close() method, but we can nullify our reference.
      this.midiAccess = null;
    }
    this.inputs = [];
    console.log('MIDI Controller destroyed, listeners removed.');
  }
}
