import type { PlaybackTarget, PlayRequest } from './target'
import { gateWorkletUrl } from './gate-worklet'
import type { MicSettings, OutputSettings } from '@shared/types'

interface Voice {
  source: AudioBufferSourceNode
  gain: GainNode
  startedAt: number
  offset: number
}

/**
 * The v1 audio graph.
 *
 *   mic -> gate -> compressor -> micGain -----+
 *                                             +--> cableBus -> cable sink  (Discord)
 *   pads ------------------------------------+
 *   pads ---------------------------------------> monitorBus -> monitor sink (you)
 *
 * The mic reaches the cable but never the monitor: hearing your own voice
 * 20 ms late is genuinely unbearable.
 *
 * Both sinks are MediaStreamAudioDestinationNodes fed into hidden <audio>
 * elements, because setSinkId lives on HTMLMediaElement -- it is the only way
 * to aim Web Audio at a specific Windows output device.
 */
export class LocalTarget implements PlaybackTarget {
  readonly kind = 'local' as const

  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null

  private cableBus: GainNode | null = null
  private cableLimiter: DynamicsCompressorNode | null = null
  private monitorBus: GainNode | null = null
  private cableDest: MediaStreamAudioDestinationNode | null = null
  private monitorDest: MediaStreamAudioDestinationNode | null = null
  private cableEl: HTMLAudioElement | null = null
  private monitorEl: HTMLAudioElement | null = null

  private micStream: MediaStream | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private micGate: AudioWorkletNode | null = null
  private micComp: DynamicsCompressorNode | null = null
  private micGain: GainNode | null = null

  private voices = new Map<string, Voice[]>()
  private gateReady = false

  private micSettings: MicSettings | null = null

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

    this.masterGain.connect(this.cableBus)
    this.cableBus.connect(this.cableLimiter)
    this.cableLimiter.connect(this.cableDest)
    this.monitorBus.connect(this.monitorDest)

    this.cableEl = this.makeSinkElement(this.cableDest.stream)
    this.monitorEl = this.makeSinkElement(this.monitorDest.stream)

    try {
      const url = gateWorkletUrl()
      await this.ctx.audioWorklet.addModule(url)
      URL.revokeObjectURL(url)
      this.gateReady = true
    } catch {
      // Without the worklet the gate is simply unavailable; everything else
      // still works, so this is not fatal.
      this.gateReady = false
    }
  }

  private makeSinkElement(stream: MediaStream): HTMLAudioElement {
    const el = new Audio()
    el.srcObject = stream
    el.autoplay = true
    el.volume = 1
    void el.play().catch(() => {
      /* retried on the next user gesture */
    })
    return el
  }

  /** Aims the two output buses at real Windows devices. */
  async setOutputDevices(output: OutputSettings): Promise<void> {
    if (!this.cableEl || !this.monitorEl || !this.cableBus || !this.monitorBus) return

    if (output.cableDeviceId) {
      try {
        await this.cableEl.setSinkId(output.cableDeviceId)
      } catch {
        /* device vanished; the picker shows it as missing */
      }
    }
    if (output.monitorDeviceId) {
      try {
        await this.monitorEl.setSinkId(output.monitorDeviceId)
      } catch {
        /* as above */
      }
    }

    this.cableBus.gain.value = output.cableGain
    this.monitorBus.gain.value = output.monitorEnabled ? output.monitorGain : 0
  }

  setMasterGain(value: number): void {
    if (this.masterGain) this.masterGain.gain.value = value
  }

  /**
   * Builds the mic branch. Every piece of Chromium's own processing is turned
   * off here on purpose -- we do the cleanup ourselves, downstream, so it lands
   * on the voice and not on the sound effects.
   */
  async setMic(settings: MicSettings): Promise<void> {
    if (!this.ctx || !this.cableBus) return

    const currentDevice = this.micStream?.getAudioTracks()[0]?.getSettings().deviceId ?? null
    const needsRebuild = !this.micStream || currentDevice !== settings.deviceId

    this.micSettings = settings

    if (!settings.enabled) {
      this.teardownMic()
      return
    }

    if (needsRebuild) {
      this.teardownMic()
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: settings.deviceId ? { exact: settings.deviceId } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1
          }
        })
      } catch {
        this.micStream = null
        return
      }

      this.micSource = this.ctx.createMediaStreamSource(this.micStream)
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
    this.micGate?.disconnect()
    this.micComp?.disconnect()
    this.micGain?.disconnect()
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.micSource = null
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
        /* already stopped */
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
