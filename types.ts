

/**
 * @fileoverview Shared type definitions for the application.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LiveMusicGenerationConfig as GenAiLiveMusicGenerationConfig } from '@google/genai';

export interface Prompt {
  readonly promptId: string;
  text: string;
  weight: number;
  color: string;
  isDropTrack?: boolean; // Added for identifying the special drop track
}

export type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused';

// Extend LiveMusicGenerationConfig to include new parameters
export interface AppLiveMusicGenerationConfig extends GenAiLiveMusicGenerationConfig {
  // GenAiLiveMusicGenerationConfig is expected to have a 'prompts' field.
  // This interface adds or refines other custom fields if necessary.
  
  guidance?: number;
  bpm?: number;
  density?: number;
  brightness?: number;
  mute_bass?: boolean;
  mute_drums?: boolean;
  only_bass_and_drums?: boolean;
  music_generation_mode?: 'QUALITY' | 'DIVERSITY';
  systemInstruction?: string; // Added for system-level instructions
}

// Preset interfaces
export interface PresetPrompt {
  text: string;
  weight: number;
  // isDropTrack is not part of presets as it's a temporary runtime state
}

export interface Preset {
  version: string;
  prompts: PresetPrompt[]; // Presets still use 'prompts' for clarity in saved files
  temperature: number;
  guidance?: number;
  bpm?: number;
  density?: number;
  brightness?: number;
  muteBass?: boolean;
  muteDrums?: boolean;
  onlyBassAndDrums?: boolean;
  musicGenerationMode?: 'QUALITY' | 'DIVERSITY';
}
