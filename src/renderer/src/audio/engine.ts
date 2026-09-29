import { LocalTarget } from './local-target'
import {
  hasLocalAudioControls,
  hasLevelMeters,
  type PlaybackTarget,
  type LocalAudioStatus,
  type Level
} from './target'
import type { Pad, MicSettings, OutputSettings } from '@shared/types'

/** Voice id for the setup wizard's test tone; never a real pad id (those are UUIDs). */
const TEST_TONE_ID = 'test-tone'

/**
 * Two rising chimes, three times over: easy to recognise in a voice channel,
 * and at -18 dBFS RMS it sits where pads are levelled to, so it sounds like a
 * real clip would.
 */
function makeTestTone(sampleRate: number): AudioBuffer {
  const notes = [660, 880, 660, 880, 660, 880]
  const noteSeconds = 0.3
  const gapSeconds = 0.1
  const amplitude = Math.pow(10, -18 / 20) * Math.SQRT2
  const fade = Math.floor(sampleRate * 0.01)

  const noteLength = Math.floor(sampleRate * noteSeconds)
  const stride = noteLength + Math.floor(sampleRate * gapSeconds)
  const buffer = new AudioBuffer({ length: stride * notes.length, sampleRate, numberOfChannels: 1 })
  const data = buffer.getChannelData(0)

  notes.forEach((freq, n) => {
    const start = n * stride
    for (let i = 0; i < noteLength; i++) {
      // Short fades so the edges do not click.
      const envelope = Math.min(1, i / fade, (noteLength - i) / fade)
      data[start + i] = amplitude * envelope * Math.sin((2 * Math.PI * freq * i) / sampleRate)
    }
  })
  return buffer
}

/**
 * Owns the active PlaybackTarget and the decoded-buffer cache. Everything in
 * the UI talks to this, never to a target directly, so swapping in a BotTarget
 * later touches only the constructor.
 */
class Engine {
  private target: PlaybackTarget = new LocalTarget()
  private buffers = new Map<string, AudioBuffer>()
  private decodeCtx: AudioContext | null = null
  private lastTriggered = new Map<string, number>()
  private ready = false
  private testTone: AudioBuffer | null = null

  async init(): Promise<void> {
    if (this.ready) return
    await this.target.init()
    this.ready = true
  }

  private getDecodeCtx(): AudioContext {
    if (!this.decodeCtx) this.decodeCtx = new AudioContext({ sampleRate: 48000 })
    return this.decodeCtx
  }

  /**
   * Decodes once and caches by content hash. Two pads pointing at the same clip
   * share one AudioBuffer.
   */
  async loadBuffer(hash: string, ext: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(hash)
    if (cached) return cached
    try {
      const raw = await window.api.library.read(hash, ext)
      const buffer = await this.getDecodeCtx().decodeAudioData(raw)
      this.buffers.set(hash, buffer)
      return buffer
    } catch {
      return null
    }
  }

  /**
   * Applies the pad's play mode, then hands off to the target.
   * Returns false when the trigger was swallowed by a cooldown or a toggle-off.
   */
  async trigger(pad: Pad): Promise<boolean> {
    await this.init()

    if (pad.cooldown > 0) {
      const last = this.lastTriggered.get(pad.id) ?? 0
      if (performance.now() - last < pad.cooldown * 1000) return false
    }

    if (pad.playMode === 'toggle' && this.target.isPlaying(pad.id)) {
      this.target.stop(pad.id)
      return false
    }
    if (pad.playMode === 'restart') {
      this.target.stop(pad.id)
    }

    const buffer = await this.loadBuffer(pad.hash, pad.ext)
    if (!buffer) return false

    this.lastTriggered.set(pad.id, performance.now())

    await this.target.play({
      padId: pad.id,
      buffer,
      gain: pad.gain,
      trimStart: pad.trimStart,
      trimEnd: pad.trimEnd,
      monitor: !pad.noMonitor
    })
    return true
  }

  stop(padId: string): void {
    this.target.stop(padId)
  }

  panic(): void {
    this.target.stopAll()
  }

  isPlaying(padId: string): boolean {
    return this.target.isPlaying(padId)
  }

  progress(padId: string): number | null {
    return this.target.progress(padId)
  }

  /**
   * Plays through the same path as a pad -- master, cable and monitor -- so a
   * tone that reaches the cable proves pads will too.
   */
  async playTestTone(): Promise<void> {
    await this.init()
    this.testTone ??= makeTestTone(48000)
    this.target.stop(TEST_TONE_ID)
    await this.target.play({
      padId: TEST_TONE_ID,
      buffer: this.testTone,
      gain: 1,
      trimStart: 0,
      trimEnd: null,
      monitor: true
    })
  }

  stopTestTone(): void {
    this.target.stop(TEST_TONE_ID)
  }

  isTestTonePlaying(): boolean {
    return this.target.isPlaying(TEST_TONE_ID)
  }

  async setOutput(output: OutputSettings): Promise<void> {
    await this.init()
    if (hasLocalAudioControls(this.target)) await this.target.setOutputDevices(output)
  }

  async setMic(mic: MicSettings): Promise<void> {
    await this.init()
    if (hasLocalAudioControls(this.target)) await this.target.setMic(mic)
  }

  async setMaster(value: number): Promise<void> {
    await this.init()
    if (hasLocalAudioControls(this.target)) this.target.setMasterGain(value)
  }

  /** Null for a target with no local devices to go wrong. */
  status(): LocalAudioStatus | null {
    return hasLocalAudioControls(this.target) ? this.target.status() : null
  }

  onStatusChange(listener: () => void): () => void {
    return hasLocalAudioControls(this.target) ? this.target.onStatusChange(listener) : () => {}
  }

  /** Null when the target cannot be metered. */
  levels(): { cable: Level; mic: Level | null } | null {
    if (!hasLevelMeters(this.target)) return null
    return { cable: this.target.cableLevel(), mic: this.target.micLevel() }
  }

  /** Drops a decoded buffer, e.g. after the pad using it was deleted. */
  evict(hash: string): void {
    this.buffers.delete(hash)
  }
}

export const engine = new Engine()
