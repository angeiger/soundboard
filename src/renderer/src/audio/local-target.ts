import type {
  PlaybackTarget,
  PlayRequest,
  LocalAudioControls,
  LocalAudioStatus,
  LevelMeters,
  Level
} from './target'
import { gateWorkletUrl } from './gate-worklet'
import { measure } from './level'
import type { MicSettings, OutputSettings } from '@shared/types'

interface Voice {
  source: AudioBufferSourceNode
  gain: GainNode
  startedAt: number
  offset: number
}

/** ~43 ms at 48 kHz: long enough for a steady RMS, short enough to feel live. */
const METER_SIZE = 2048

/** Why setSinkId refused a device, worded to point at the fix. */
function describeSinkError(err: unknown): string {
  switch ((err as DOMException | null)?.name) {
    case 'NotFoundError':
      return 'This device is not connected any more.'
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Windows refused access to this device.'
    case 'AbortError':
      return 'Windows could not switch audio to this device.'
    default:
      return (err as Error | null)?.message || 'Audio could not be sent to this device.'
  }
}

/** Why getUserMedia failed, worded to point at the fix. */
function describeMicError(err: unknown): string {
  switch ((err as DOMException | null)?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Windows is blocking microphone access. Open Windows Settings → Privacy & security → Microphone and turn on “Let desktop apps access your microphone”.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'This microphone is not connected any more.'
    case 'NotReadableError':
    case 'AbortError':
      return 'Windows could not open this microphone. Another app may be holding it exclusively, or its driver has stopped.'
    default:
      return (err as Error | null)?.message || 'The microphone could not be opened.'
  }
}

/**
 * The v1 audio graph.
 *
 *   mic -> gate -> compressor -> micGain -----+
 *                                             +--> cableBus -> limiter -> cable sink  (Discord)
 *   pads ------------------------------------+
 *   pads ---------------------------------------> monitorBus -> monitor sink (you)
 *
 * The mic reaches the cable but never the monitor: hearing your own voice
 * 20 ms late is genuinely unbearable.
 *
 * Both sinks are MediaStreamAudioDestinationNodes fed into hidden <audio>
 * elements, because setSinkId lives on HTMLMediaElement -- it is the only way
 * to aim Web Audio at a specific Windows output device.
 *
 * Two analysers hang off the graph for the setup wizard's meters: one after
 * the limiter (exactly what Discord receives) and one on the raw mic.
 */
export class LocalTarget implements PlaybackTarget, LocalAudioControls, LevelMeters {
  readonly kind = 'local' as const

  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null

  private cableBus: GainNode | null = null
  private cableLimiter: DynamicsCompressorNode | null = null
  private cableTap: AnalyserNode | null = null
  private monitorBus: GainNode | null = null
  private cableDest: MediaStreamAudioDestinationNode | null = null
  private monitorDest: MediaStreamAudioDestinationNode | null = null
  private cableEl: HTMLAudioElement | null = null
  private monitorEl: HTMLAudioElement | null = null

  private micStream: MediaStream | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private micTap: AnalyserNode | null = null
  private micGate: AudioWorkletNode | null = null
  private micComp: DynamicsCompressorNode | null = null
  private micGain: GainNode | null = null

  private voices = new Map<string, Voice[]>()
  private gateReady = false

  private micSettings: MicSettings | null = null
  /** The deviceId the open stream was requested with (null: Windows default). */
  private micRequested: string | null = null
  /** setMic awaits getUserMedia; overlapping calls would each wire a mic in. */
  private micQueue: Promise<void> = Promise.resolve()

  private meterBuf = new Float32Array(METER_SIZE)

  private currentStatus: LocalAudioStatus = {
    cableError: null,
    monitorError: null,
    mic: { state: 'off', error: null },
    gateAvailable: true
  }
  private statusListeners = new Set<() => void>()

  async init(): Promise<void> {
    if (this.ctx) return

    // 48 kHz matches what Discord and every virtual cable driver expect, so
    // nothing has to resample downstream.
    this.ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })

    this.masterGain = this.ctx.createGain()

    this.cableBus = this.ctx.createGain()
    this.monitorBus = this.ctx.createGain()
    this.cableDest = this.ctx.createMediaStreamDestination()
    this.monitorDest = this.ctx.createMediaStreamDestination()

    // Brickwall limiter on the way out to Discord. Voice and pads are summed
    // here, so a loud clip landing mid-sentence would otherwise push the sum
    // past full scale and clip -- which everyone else hears, and we never do.
    this.cableLimiter = this.ctx.createDynamicsCompressor()
    this.cableLimiter.threshold.value = -3
    this.cableLimiter.knee.value = 0
    this.cableLimiter.ratio.value = 20
    this.cableLimiter.attack.value = 0.002
    this.cableLimiter.release.value = 0.12

    this.cableTap = this.ctx.createAnalyser()
    this.cableTap.fftSize = METER_SIZE

    this.masterGain.connect(this.cableBus)
    this.cableBus.connect(this.cableLimiter)
    this.cableLimiter.connect(this.cableDest)
    this.cableLimiter.connect(this.cableTap)
    this.monitorBus.connect(this.monitorDest)

    this.cableEl = this.makeSinkElement(this.cableDest.stream)
    this.monitorEl = this.makeSinkElement(this.monitorDest.stream)
    // Silent until a cable is chosen. Unrouted, the element plays into the
    // Windows default output -- your speakers -- and the mic is on by default,
    // so a fresh install would play your own voice back at you, or howl.
    this.cableEl.muted = true

    try {
      const url = gateWorkletUrl()
      await this.ctx.audioWorklet.addModule(url)
      URL.revokeObjectURL(url)
      this.gateReady = true
    } catch {
      // Everything else still works without the gate, so this is not fatal --
      // but its controls would silently do nothing, so Settings is told.
      this.gateReady = false
      this.updateStatus({ gateAvailable: false })
    }
  }

  private makeSinkElement(stream: MediaStream): HTMLAudioElement {
    const el = new Audio()
    el.srcObject = stream
    el.autoplay = true
    el.volume = 1
    void el.play().catch(() => {
      // Electron's default autoplay policy lets this through. Under a stricter
      // one the element would stay silent until the first gesture, so retry
      // then rather than never.
      const retry = (): void => void el.play().catch(() => undefined)
      window.addEventListener('pointerdown', retry, { once: true })
      window.addEventListener('keydown', retry, { once: true })
    })
    return el
  }

  status(): LocalAudioStatus {
    return this.currentStatus
  }

  onStatusChange(listener: () => void): () => void {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  private updateStatus(patch: Partial<LocalAudioStatus>): void {
    this.currentStatus = { ...this.currentStatus, ...patch }
    for (const listener of this.statusListeners) listener()
  }

  /** Aims the two output buses at real Windows devices. */
  async setOutputDevices(output: OutputSettings): Promise<void> {
    if (!this.cableEl || !this.monitorEl || !this.cableBus || !this.monitorBus) return

    const cableError = await this.routeSink('cable', output.cableDeviceId)
    const monitorError = output.monitorEnabled
      ? await this.routeSink('monitor', output.monitorDeviceId)
      : null

    // A refused device leaves the element on whatever it had before, which for
    // a fresh element is the speakers. Silence is the lesser failure there.
    if (this.cableEl) this.cableEl.muted = !output.cableDeviceId || cableError !== null
    this.cableBus.gain.value = output.cableGain
    this.monitorBus.gain.value = output.monitorEnabled ? output.monitorGain : 0

    this.updateStatus({ cableError, monitorError })
  }

  /**
   * A refused setSinkId leaves the element playing into whatever it had
   * before -- or nothing -- while every meter still shows signal, so the
   * reason is returned for the UI rather than swallowed.
   */
  private async routeSink(which: 'cable' | 'monitor', deviceId: string | null): Promise<string | null> {
    const el = which === 'cable' ? this.cableEl : this.monitorEl
    if (!el || !deviceId) return null
    try {
      await el.setSinkId(deviceId)
      return null
    } catch (err) {
      // Observed with Electron 38: after one refused switch, routing the same
      // element back to the device it had before resolves but stays silent,
      // while a different device works. The element cannot be trusted after
      // a failure, so replace it and let the next attempt start clean.
      this.replaceSinkElement(which)
      return describeSinkError(err)
    }
  }

  private replaceSinkElement(which: 'cable' | 'monitor'): void {
    const old = which === 'cable' ? this.cableEl : this.monitorEl
    const dest = which === 'cable' ? this.cableDest : this.monitorDest
    if (!old || !dest) return
    old.pause()
    old.srcObject = null
    const fresh = this.makeSinkElement(dest.stream)
    if (which === 'cable') {
      // Unrouted, a fresh element plays to the speakers; keep the mic off them.
      fresh.muted = true
      this.cableEl = fresh
    } else {
      this.monitorEl = fresh
    }
  }

  setMasterGain(value: number): void {
    if (this.masterGain) this.masterGain.gain.value = value
  }

  cableLevel(): Level {
    return this.cableTap ? measure(this.cableTap, this.meterBuf) : { peak: 0, rms: 0 }
  }

  micLevel(): Level | null {
    return this.micTap ? measure(this.micTap, this.meterBuf) : null
  }

  /**
   * Builds the mic branch. Every piece of Chromium's own processing is turned
   * off here on purpose -- we do the cleanup ourselves, downstream, so it lands
   * on the voice and not on the sound effects.
   */
  setMic(settings: MicSettings): Promise<void> {
    const run = (): Promise<void> => this.applyMic(settings)
    this.micQueue = this.micQueue.then(run, run)
    return this.micQueue
  }

  private async applyMic(settings: MicSettings): Promise<void> {
    if (!this.ctx || !this.cableBus) return

    // Compared against what was asked for, not what the track reports: with
    // no device chosen (null) the track reports the default's real id, so the
    // old comparison never matched and every settings change -- each step of
    // dragging the gate slider -- reopened the mic and rebuilt the chain.
    const needsRebuild = !this.micStream || this.micRequested !== settings.deviceId

    this.micSettings = settings

    if (!settings.enabled) {
      this.teardownMic()
      this.updateStatus({ mic: { state: 'off', error: null } })
      return
    }

    if (needsRebuild) {
      this.teardownMic()
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: settings.deviceId ? { exact: settings.deviceId } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1
          }
        })
      } catch (err) {
        // Without this the mic simply never reaches Discord and nothing says
        // why -- your friends just stop hearing you.
        this.updateStatus({ mic: { state: 'failed', error: describeMicError(err) } })
        return
      }

      this.micStream = stream
      this.micRequested = settings.deviceId
      // A USB mic pulled mid-game ends its track with no other signal at all.
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        if (this.micStream !== stream) return
        this.teardownMic()
        this.updateStatus({
          mic: { state: 'failed', error: 'The microphone was disconnected.' }
        })
      })

      this.micSource = this.ctx.createMediaStreamSource(stream)
      this.micTap = this.ctx.createAnalyser()
      this.micTap.fftSize = METER_SIZE
      this.micSource.connect(this.micTap)

      this.micGain = this.ctx.createGain()
      this.micComp = this.ctx.createDynamicsCompressor()
      this.micComp.knee.value = 12
      this.micComp.ratio.value = 3
      this.micComp.attack.value = 0.005
      this.micComp.release.value = 0.15

      let node: AudioNode = this.micSource

      if (this.gateReady) {
        this.micGate = new AudioWorkletNode(this.ctx, 'noise-gate')
        node.connect(this.micGate)
        node = this.micGate
      }

      node.connect(this.micComp)
      this.micComp.connect(this.micGain)
      this.micGain.connect(this.cableBus)
    }

    this.applyMicParams(settings)
    this.updateStatus({ mic: { state: 'live', error: null } })
  }

  private applyMicParams(settings: MicSettings): void {
    if (this.micGate) {
      const threshold = this.micGate.parameters.get('threshold')
      const enabled = this.micGate.parameters.get('enabled')
      if (threshold) threshold.value = settings.gateThreshold
      if (enabled) enabled.value = settings.gateEnabled ? 1 : 0
    }
    if (this.micComp) {
      // Bypassing means a threshold high enough that it never engages.
      this.micComp.threshold.value = settings.compressorEnabled ? -20 : 0
    }
    if (this.micGain) this.micGain.gain.value = settings.gain
  }

  private teardownMic(): void {
    this.micSource?.disconnect()
    this.micTap?.disconnect()
    this.micGate?.disconnect()
    this.micComp?.disconnect()
    this.micGain?.disconnect()
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.micSource = null
    this.micTap = null
    this.micGate = null
    this.micComp = null
    this.micGain = null
    this.micStream = null
  }

  async play(req: PlayRequest): Promise<void> {
    if (!this.ctx || !this.masterGain || !this.monitorBus) return
    if (this.ctx.state === 'suspended') await this.ctx.resume()

    const source = this.ctx.createBufferSource()
    source.buffer = req.buffer

    const gain = this.ctx.createGain()
    gain.gain.value = req.gain

    source.connect(gain)
    // masterGain feeds the cable bus; the monitor bus is tapped separately so
    // monitor level stays independent of what Discord hears.
    gain.connect(this.masterGain)
    if (req.monitor) gain.connect(this.monitorBus)

    const offset = Math.max(0, req.trimStart)
    const end = req.trimEnd ?? req.buffer.duration
    const duration = Math.max(0, end - offset)

    const voice: Voice = { source, gain, startedAt: this.ctx.currentTime, offset }
    const list = this.voices.get(req.padId) ?? []
    list.push(voice)
    this.voices.set(req.padId, list)

    source.onended = (): void => {
      gain.disconnect()
      const current = this.voices.get(req.padId)
      if (!current) return
      const i = current.indexOf(voice)
      if (i >= 0) current.splice(i, 1)
      if (current.length === 0) this.voices.delete(req.padId)
      this.updateDucking()
    }

    source.start(0, offset, duration)
    this.updateDucking()
  }

  /** Pulls the mic down while a pad is playing, if ducking is enabled. */
  private updateDucking(): void {
    if (!this.micGain || !this.ctx || !this.micSettings) return
    const s = this.micSettings
    if (!s.duckEnabled) {
      this.micGain.gain.setTargetAtTime(s.gain, this.ctx.currentTime, 0.05)
      return
    }
    const anyPlaying = this.voices.size > 0
    const target = anyPlaying ? s.gain * Math.pow(10, -s.duckAmount / 20) : s.gain
    this.micGain.gain.setTargetAtTime(target, this.ctx.currentTime, anyPlaying ? 0.03 : 0.25)
  }

  stop(padId: string): void {
    const list = this.voices.get(padId)
    if (!list) return
    for (const v of [...list]) {
      try {
        v.source.stop()
      } catch {
        // stop() throws only if the source was never started or has already
        // stopped; either way it is silent, which is what was asked for.
      }
    }
    this.voices.delete(padId)
    this.updateDucking()
  }

  stopAll(): void {
    for (const padId of [...this.voices.keys()]) this.stop(padId)
  }

  isPlaying(padId: string): boolean {
    return (this.voices.get(padId)?.length ?? 0) > 0
  }

  progress(padId: string): number | null {
    const list = this.voices.get(padId)
    if (!list || list.length === 0 || !this.ctx) return null
    const newest = list[list.length - 1]
    return this.ctx.currentTime - newest.startedAt
  }

  async dispose(): Promise<void> {
    this.stopAll()
    this.teardownMic()
    this.cableEl?.pause()
    this.monitorEl?.pause()
    await this.ctx?.close()
    this.ctx = null
  }
}
