/**
 * @fileoverview Shared constants for the application.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const TRACK_COLORS = ['#FF4081', '#40C4FF', '#00BFA5', '#FFC107', '#AB47BC', '#FF7043', '#26A69A'];

export const ORB_COLORS = [
  'rgba(255, 64, 129, 0.2)', // Pink
  'rgba(64, 196, 255, 0.2)', // Light Blue
  'rgba(0, 191, 165, 0.2)',  // Teal
  'rgba(255, 193, 7, 0.15)', // Amber
  'rgba(171, 71, 188, 0.2)' // Purple
];

export const CURRENT_PRESET_VERSION = "1.1";

export const MIDI_LEARN_TARGET_DROP_BUTTON = 'global-drop-button';
export const MIDI_LEARN_TARGET_PLAY_PAUSE_BUTTON = 'global-play-pause-button';

// Constants for the "Drop!" effect using a temporary track
export const DROP_TRACK_DURATION = 8000; // ms for the drop track to be active with high weight
export const DROP_TRACK_INITIAL_WEIGHT = 1.8;
export const DROP_TRACK_COLOR = '#FFD700'; // Gold, distinct color for the drop track slider
export const DROP_PROMPT_TEMPLATE = "Create an intense, epic build-up and a powerful drop based on %STYLE%. The build-up should rise in energy and complexity, leading to a climactic release. After the drop, quickly fade out any elements specific to this build-up and drop, allowing the original %STYLE% to continue seamlessly.";
