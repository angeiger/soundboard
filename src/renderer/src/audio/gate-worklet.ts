/**
 * Noise gate as an AudioWorklet, authored as a string so it can be registered
 * from a blob URL without a separate asset pipeline.
 *
 * This sits on the mic branch only. Discord's own suppression has to be turned
 * off (it would eat the soundboard clips along with the noise), so we clean the
 * mic ourselves before mixing -- which is strictly better, because we can
 * process voice and leave the sound effects untouched.
 *
 * Straightforward threshold gate with hysteresis and a smoothed envelope:
 * hold + release stop it chattering on speech tails, and the 6 dB gap between
 * open and close thresholds stops it flapping on a signal parked right at the
 * threshold.
 */
export const GATE_WORKLET_SOURCE = `
class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -45, minValue: -100, maxValue: 0 },
      { name: 'enabled', defaultValue: 1, minValue: 0, maxValue: 1 }
    ]
  }

  constructor() {
    super()
    this.envelope = 0
    this.gain = 0
    this.holdCounter = 0
    this.attackCoef = Math.exp(-1 / (sampleRate * 0.003))
    this.releaseCoef = Math.exp(-1 / (sampleRate * 0.12))
    this.holdSamples = Math.floor(sampleRate * 0.15)
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    const output = outputs[0]
    if (!input || input.length === 0) return true

    const enabled = parameters.enabled[0] >= 0.5
    const threshold = parameters.threshold[0]
    const openLevel = Math.pow(10, threshold / 20)
    const closeLevel = Math.pow(10, (threshold - 6) / 20)

    for (let ch = 0; ch < input.length; ch++) {
      const inCh = input[ch]
      const outCh = output[ch]
      if (!inCh || !outCh) continue

      if (!enabled) {
        outCh.set(inCh)
        continue
      }

      for (let i = 0; i < inCh.length; i++) {
        const abs = Math.abs(inCh[i])
        this.envelope = abs > this.envelope
          ? abs
          : this.envelope * this.releaseCoef + abs * (1 - this.releaseCoef)

        if (this.envelope > openLevel) {
          this.holdCounter = this.holdSamples
        } else if (this.envelope < closeLevel && this.holdCounter > 0) {
          this.holdCounter--
        }

        const wantOpen = this.holdCounter > 0
        const targetGain = wantOpen ? 1 : 0
        const coef = targetGain > this.gain ? this.attackCoef : this.releaseCoef
        this.gain = targetGain + (this.gain - targetGain) * coef

        outCh[i] = inCh[i] * this.gain
      }
    }
    return true
  }
}

registerProcessor('noise-gate', NoiseGateProcessor)
`

export function gateWorkletUrl(): string {
  return URL.createObjectURL(new Blob([GATE_WORKLET_SOURCE], { type: 'application/javascript' }))
}
