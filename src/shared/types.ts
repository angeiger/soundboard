/** Playback behaviour when a pad is triggered while already playing. */
export type PlayMode = 'restart' | 'overlap' | 'toggle'

export type NeonColor =
  | 'cyan'
  | 'magenta'
  | 'lime'
  | 'violet'
  | 'amber'
  | 'blue'
  | 'orange'
  | 'red'

export interface Pad {
  id: string
  bankId: string
  /** Display name, defaults to the source filename without extension. */
  name: string
  /** Content hash of the audio file; also its filename inside sounds/. */
  hash: string
  /** Original file extension, including the dot. */
  ext: string
  /** Full decoded duration in seconds, measured once at import. */
  duration: number
  /** Trim points in seconds. end === null means "play to the end". */
  trimStart: number
  trimEnd: number | null
  /** Linear gain, 0..2. 1 is unity. */
  gain: number
  playMode: PlayMode
  color: NeonColor
  /** Single emoji shown on the pad face. */
  glyph: string
  /** Accelerator string in Electron's globalShortcut format, or null. */
  hotkey: string | null
  /** Skip the local monitor path. Useful on high-latency Bluetooth output. */
  noMonitor: boolean
  /** Minimum seconds between triggers. 0 disables the cooldown. */
  cooldown: number
  /** Grid slot within the bank. */
  index: number
}

export interface Bank {
  id: string
  name: string
  index: number
}

export interface MicSettings {
  enabled: boolean
  deviceId: string | null
  gain: number
  /** Noise gate threshold in dBFS. Signal below this is attenuated. */
  gateThreshold: number
  gateEnabled: boolean
  /** RNNoise suppression on the mic branch only. */
  denoiseEnabled: boolean
  compressorEnabled: boolean
  /** Attenuation applied to the mic while a pad is playing, in dB. */
  duckAmount: number
  duckEnabled: boolean
}

export interface OutputSettings {
  /** The virtual cable device Discord listens to. */
  cableDeviceId: string | null
  /** Your own headphones. */
  monitorDeviceId: string | null
  cableGain: number
  monitorGain: number
  monitorEnabled: boolean
}

export interface Config {
  version: number
  banks: Bank[]
  pads: Pad[]
  mic: MicSettings
  output: OutputSettings
  master: number
  panicHotkey: string | null
  /** Bank switching via Ctrl+1..9. */
  bankHotkeysEnabled: boolean
  launchMinimised: boolean
  setupCompleted: boolean
}

/** What the main process sends the renderer when a hotkey fires. */
export interface TriggerEvent {
  padId: string
  source: 'hotkey' | 'click'
}

export interface AudioDevice {
  deviceId: string
  label: string
  kind: 'audioinput' | 'audiooutput'
  /** True when the label looks like a Bluetooth hands-free endpoint. */
  isHandsFree: boolean
  /** True when this looks like a VB-CABLE / VoiceMeeter virtual device. */
  isVirtualCable: boolean
}

/** A pad as it travels between machines: no ids, no device references. */
export interface PackPad {
  name: string
  /** Path inside the zip, e.g. "sounds/a3f9c1.mp3". */
  file: string
  duration: number
  trimStart: number
  trimEnd: number | null
  gain: number
  playMode: string
  color: string
  glyph: string
  cooldown: number
  index: number
  /** Carried so a shared pack gives everyone the same muscle memory. */
  hotkey: string | null
}

export interface PackManifest {
  format: string
  version: number
  name: string
  createdAt: string
  pads: PackPad[]
}

export interface HotkeyRegistrationResult {
  padId: string
  accelerator: string
  ok: boolean
  /** Populated when ok is false: 'taken' (another app holds it) or 'invalid'. */
  reason?: 'taken' | 'invalid' | 'conflict'
  /** When reason is 'conflict', the pad already using this accelerator. */
  conflictsWith?: string
}
