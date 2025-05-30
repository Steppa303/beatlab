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
}

export type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused';

// Extend LiveMusicGenerationConfig to include new parameters
export interface AppLiveMusicGenerationConfig extends GenAiLiveMusicGenerationConfig {
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
}

export interface Preset {
  version: string;
  prompts: PresetPrompt[];
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
