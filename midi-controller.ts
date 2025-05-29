
/**
 * @fileoverview MIDI Controller for Web MIDI API interactions.
 * Manages MIDI device selection and message handling.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Local type definitions for Web MIDI API
declare namespace WebMidi {
  interface MIDIAccess extends EventTarget {
    inputs: Map<string, MIDIInput>;
    outputs: Map<string, MIDIOutput>;
    onstatechange: ((event: MIDIConnectionEvent) => void) | null;
    sysexEnabled: boolean;
  }

  interface MIDIPort extends EventTarget {
    id: string;
    manufacturer?: string;
    name?: string;
    type: MIDIPortType;
    version?: string;
    state: MIDIPortDeviceState;
    connection: MIDIPortConnectionState;
    onstatechange: ((event: MIDIConnectionEvent) => void) | null;
    open(): Promise<MIDIPort>;
    close(): Promise<MIDIPort>;
  }

  interface MIDIInput extends MIDIPort {
    type: "input";
    onmidimessage: ((event: MIDIMessageEvent) => void) | null;
  }

  interface MIDIOutput extends MIDIPort {
    type: "output";
    send(data: Uint8Array | number[], timestamp?: number): void;
    clear(): void;
  }

  type MIDIPortType = "input" | "output";
  type MIDIPortDeviceState = "disconnected" | "connected";
  type MIDIPortConnectionState = "open" | "closed" | "pending";

  interface MIDIMessageEvent extends Event {
    data: Uint8Array;
    receivedTime: number; // DOMHighResTimeStamp
  }

  interface MIDIConnectionEvent extends Event {
    port: MIDIPort;
  }
}

// End of local type definitions

export interface MidiInputInfo {
  id: string;
  name: string;
}
export class MidiController extends EventTarget {
  private midiAccess: WebMidi.MIDIAccess | null = null;
  private inputs: WebMidi.MIDIInput[] = [];
  private selectedInput: WebMidi.MIDIInput | null = null;

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    if (typeof navigator.requestMIDIAccess !== 'function') {
      console.warn('Web MIDI API not supported in this browser.');
      this.dispatchInputsChanged(); // Dispatch empty list
      return;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false }); // sysex not needed for CC
      this.updateInputList();

      this.midiAccess.onstatechange = (event: WebMidi.MIDIConnectionEvent) => {
        console.log('MIDI state changed:', event.port.name, event.port.state);
        this.updateInputList();
        // If the selected input is disconnected, we need to clear it.
        if (this.selectedInput && this.selectedInput.state === 'disconnected') {
            console.log(`Selected MIDI input disconnected: ${this.selectedInput.name}`);
            this.selectMidiInput(''); // Deselect it
        }
      };
    } catch (error) {
      console.error('Failed to get MIDI access:', error);
      this.dispatchInputsChanged(); // Dispatch empty list on error
    }
  }

  private updateInputList(): void {
    if (!this.midiAccess) {
      this.inputs = [];
      this.dispatchInputsChanged();
      return;
    }
    this.inputs = Array.from(this.midiAccess.inputs.values());
    this.dispatchInputsChanged();

    if (this.inputs.length === 0) {
      console.log('No MIDI input devices found.');
    } else {
      console.log('Available MIDI inputs:', this.inputs.map(i => i.name).join(', '));
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

    if (!inputId) {
        console.log('MIDI input deselected.');
        // No new input to select, so we are done.
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

  private onMidiMessage(event: WebMidi.MIDIMessageEvent): void {
    // This will only be called if 'this.selectedInput' is set and has this handler
    const [status, data1, data2] = event.data;
    // Check for Control Change message (0xB0 - 0xBF for channels 1-16)
    if (status >= 0xB0 && status <= 0xBF) {
      const ccNumber = data1;
      const ccValue = data2;

      // Normalize CC value (0-127) to a 0-2 range for the slider
      const normalizedValue = (ccValue / 127) * 2;

      this.dispatchEvent(new CustomEvent('midi-cc-received', {
        detail: {
          ccNumber: ccNumber,
          value: normalizedValue,
        }
      }));
    }
  }

  public hasActiveSelection(): boolean {
    return this.selectedInput !== null;
  }

  destroy(): void {
    if (this.selectedInput) {
      this.selectedInput.onmidimessage = null;
      this.selectedInput = null;
    }
    if (this.midiAccess) {
      this.midiAccess.onstatechange = null; // Remove state change listener
      // MIDIAccess object does not have a close() method.
    }
    this.inputs = [];
    console.log('MIDI Controller destroyed, listeners removed.');
  }
}
