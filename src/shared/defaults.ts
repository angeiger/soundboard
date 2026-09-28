import type { Config, NeonColor, PlayMode } from './types'

export const NEON_COLORS: NeonColor[] = [
  'cyan',
  'magenta',
  'lime',
  'violet',
  'amber',
  'blue',
  'orange',
  'red'
]

export const PLAY_MODES: PlayMode[] = ['restart', 'overlap', 'toggle']

export const CONFIG_VERSION = 2

export const DEFAULT_BANK_ID = 'bank-default'

/**
 * Ctrl+Alt+Numpad0..9. Chosen because nothing in League (or any game) binds
 * these, RegisterHotKey accepts them, and they need no macro keyboard.
 */
export const SUGGESTED_HOTKEYS = [
  'Control+Alt+num1',
  'Control+Alt+num2',
  'Control+Alt+num3',
  'Control+Alt+num4',
  'Control+Alt+num5',
  'Control+Alt+num6',
  'Control+Alt+num7',
  'Control+Alt+num8',
  'Control+Alt+num9',
  'Control+Alt+num0'
]

export function defaultConfig(): Config {
  return {
    version: CONFIG_VERSION,
    banks: [{ id: DEFAULT_BANK_ID, name: 'Sounds', index: 0 }],
    pads: [],
    mic: {
      enabled: true,
      deviceId: null,
      gain: 1,
      gateThreshold: -45,
      gateEnabled: true,
      denoiseEnabled: true,
      compressorEnabled: true,
      duckAmount: 6,
      duckEnabled: false
    },
    output: {
      cableDeviceId: null,
      monitorDeviceId: null,
      cableGain: 1,
      // Lower by default: on Bluetooth the monitor lags 150-250ms behind and
      // a loud late echo of your own sound is worse than a quiet one.
      monitorGain: 0.6,
      monitorEnabled: true
    },
    master: 0.8,
    panicHotkey: 'Control+Alt+Escape',
    // Off by default: global bank switching takes three more combos away from
    // every other app, which is a bad trade for anyone running a single bank.
    bankHotkeysEnabled: false,
    launchMinimised: false,
    setupCompleted: false
  }
}
