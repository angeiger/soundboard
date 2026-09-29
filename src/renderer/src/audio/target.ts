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

/**
 * Optional capability: the target owns real Windows audio devices and a
 * microphone branch. LocalTarget does; a bot target would not.
 *
 * The engine feature-detects this rather than checking the concrete class,
 * which is what keeps PlaybackTarget a real seam.
 */
export interface LocalAudioControls {
  /** Aims the output buses at real devices. */
  setOutputDevices(output: OutputSettings): Promise<void>
  setMic(mic: MicSettings): Promise<void>
  setMasterGain(value: number): void
}

export function hasLocalAudioControls(
  target: PlaybackTarget
): target is PlaybackTarget & LocalAudioControls {
  const t = target as Partial<LocalAudioControls>
  return (
    typeof t.setOutputDevices === 'function' &&
    typeof t.setMic === 'function' &&
    typeof t.setMasterGain === 'function'
  )
}
