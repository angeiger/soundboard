import { LocalTarget } from './local-target'
import type { PlaybackTarget } from './target'
import type { Pad, MicSettings, OutputSettings } from '@shared/types'

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

  async setOutput(output: OutputSettings): Promise<void> {
    await this.init()
    if (this.target instanceof LocalTarget) await this.target.setOutputDevices(output)
  }

  async setMic(mic: MicSettings): Promise<void> {
    await this.init()
    if (this.target instanceof LocalTarget) await this.target.setMic(mic)
  }

  async setMaster(value: number): Promise<void> {
    await this.init()
    if (this.target instanceof LocalTarget) this.target.setMasterGain(value)
  }

  /** Drops a decoded buffer, e.g. after the pad using it was deleted. */
  evict(hash: string): void {
    this.buffers.delete(hash)
  }
}

export const engine = new Engine()
