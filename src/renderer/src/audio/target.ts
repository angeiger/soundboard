/**
 * The seam between "something triggered a pad" and "sound came out".
 *
 * v1 ships LocalTarget (Web Audio -> virtual cable + headphones). A future
 * BotTarget sends the same calls over a WebSocket to a Discord bot sitting in
 * the voice channel. Nothing above this interface -- hotkeys, the pad grid,
 * the store -- knows or cares which one is active.
 */

import type { MicSettings, OutputSettings } from '@shared/types'

export interface PlayRequest {
  padId: string
  buffer: AudioBuffer
  /** Linear gain for this pad, before master. */
  gain: number
  trimStart: number
  trimEnd: number | null
  /** False routes the pad to the cable only, skipping local monitoring. */
  monitor: boolean
}

export interface PlaybackTarget {
  readonly kind: 'local' | 'bot'
  init(): Promise<void>
  /** Resolves once playback has actually started. */
  play(req: PlayRequest): Promise<void>
  stop(padId: string): void
  stopAll(): void
  isPlaying(padId: string): boolean
  /** Seconds elapsed for the newest voice of this pad, or null. */
  progress(padId: string): number | null
  dispose(): Promise<void>
}

export interface MicStatus {
  /** off: passthrough disabled. live: capturing. failed: could not open, or lost. */
  state: 'off' | 'live' | 'failed'
  /** Why it failed, worded for the person who has to fix it. */
  error: string | null
}

/**
 * What is and is not working. Every field here used to be a silent catch:
 * a device that refused audio, a mic that never opened, a gate that never
 * loaded -- all looked identical to working from the outside.
 */
export interface LocalAudioStatus {
  /** Why audio cannot reach the chosen cable device, or null when it can. */
  cableError: string | null
  monitorError: string | null
  mic: MicStatus
  /** False when the noise-gate worklet failed to load, leaving its controls inert. */
  gateAvailable: boolean
  /** False when RNNoise could not be loaded; the mic then passes through without it. */
  denoiseAvailable: boolean
  /** Why RNNoise is unavailable, for Settings to show. */
  denoiseError: string | null
}

/**
 * Optional capability: the target owns real Windows audio devices and a
 * microphone branch. LocalTarget does; a bot target would not.
 *
 * The engine feature-detects this rather than checking the concrete class,
 * which is what keeps PlaybackTarget a real seam.
 */
export interface LocalAudioControls {
  /** Aims the output buses at real devices. Failures land in status(). */
  setOutputDevices(output: OutputSettings): Promise<void>
  setMic(mic: MicSettings): Promise<void>
  setMasterGain(value: number): void
  status(): LocalAudioStatus
  /** Called whenever status() changes, including a mic unplugged mid-game. */
  onStatusChange(listener: () => void): () => void
}

export function hasLocalAudioControls(
  target: PlaybackTarget
): target is PlaybackTarget & LocalAudioControls {
  const t = target as Partial<LocalAudioControls>
  return (
    typeof t.setOutputDevices === 'function' &&
    typeof t.setMic === 'function' &&
    typeof t.setMasterGain === 'function' &&
    typeof t.status === 'function' &&
    typeof t.onStatusChange === 'function'
  )
}

/** Linear 0..1 levels over the last ~40 ms. */
export interface Level {
  peak: number
  rms: number
}

/** Optional capability: live levels, for the setup wizard's meters. */
export interface LevelMeters {
  /** What is being sent to Discord: the cable bus after the limiter. */
  cableLevel(): Level
  /** The raw microphone, before gate and compressor, or null with no mic open. */
  micLevel(): Level | null
}

export function hasLevelMeters(target: PlaybackTarget): target is PlaybackTarget & LevelMeters {
  const t = target as Partial<LevelMeters>
  return typeof t.cableLevel === 'function' && typeof t.micLevel === 'function'
}
