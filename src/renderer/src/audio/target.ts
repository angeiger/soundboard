/**
 * The seam between "something triggered a pad" and "sound came out".
 *
 * v1 ships LocalTarget (Web Audio -> virtual cable + headphones). A future
 * BotTarget sends the same calls over a WebSocket to a Discord bot sitting in
 * the voice channel. Nothing above this interface -- hotkeys, the pad grid,
 * the store -- knows or cares which one is active.
 */

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
