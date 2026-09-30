import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { DENOISE_WORKLET_SOURCE, loadDenoiseWasm, type DenoiseWasm } from './denoise-worklet'
import { wasmExportNames } from './wasm-exports'
import { noise } from './test-buffer'

/**
 * Runs the worklet source in Node with just enough of AudioWorkletGlobalScope
 * to host it, against the real RNNoise wasm, 128 samples at a time as the
 * audio thread would.
 */
interface Processor {
  process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean
  port: { onmessage: ((e: { data: unknown }) => void) | null }
}

function load(bundle: Partial<DenoiseWasm> | null): {
  node: Processor
  messages: { type: string; message?: string }[]
} {
  const messages: { type: string; message?: string }[] = []
  let Ctor: new (options: unknown) => Processor = null as never
  class AudioWorkletProcessor {
    port = { postMessage: (m: { type: string }) => messages.push(m), onmessage: null }
  }
  const registerProcessor = (_name: string, cls: typeof Ctor): void => {
    Ctor = cls
  }
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', DENOISE_WORKLET_SOURCE)(
    AudioWorkletProcessor,
    registerProcessor,
    48000
  )
  return { node: new Ctor({ processorOptions: bundle ?? {} }), messages }
}

function run(node: Processor, input: Float32Array, enabled: number): Float32Array {
  const out = new Float32Array(input.length)
  for (let i = 0; i + 128 <= input.length; i += 128) {
    const q = new Float32Array(128)
    node.process([[input.subarray(i, i + 128)]], [[q]], { enabled: new Float32Array([enabled]) })
    out.set(q, i)
  }
  return out
}

/** Mono 16-bit PCM WAV, as the Windows speech synthesiser writes it. */
function readWav(path: string): Float32Array {
  const buf = readFileSync(path)
  const dataAt = buf.indexOf('data') + 8
  const samples = new Float32Array((buf.length - dataAt) >> 1)
  for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(dataAt + i * 2) / 32768
  return samples
}

let bundle: DenoiseWasm
beforeAll(async () => {
  // The same loader the app uses, fed by the same Vite plugin.
  bundle = await loadDenoiseWasm()
})
const wasm = (): DenoiseWasm => bundle

/** Lag (in samples, 0..maxLag) at which `delayed` best matches `reference`. */
function bestLag(reference: Float32Array, delayed: Float32Array, maxLag: number): number {
  let best = 0
  let bestScore = -Infinity
  for (let lag = 0; lag <= maxLag; lag++) {
    let score = 0
    for (let i = 0; i + lag < delayed.length; i += 4) score += reference[i] * delayed[i + lag]
    if (score > bestScore) {
      bestScore = score
      best = lag
    }
  }
  return best
}

const rmsDb = (x: Float32Array): number => {
  let s = 0
  for (const v of x) s += v * v
  return 10 * Math.log10(s / x.length + 1e-20)
}

const speech = readWav(resolve('test-sounds/test-speech.wav'))

describe('denoise worklet', () => {
  it('loads RNNoise from the bytes the renderer passes in', () => {
    const { messages } = load(wasm())
    expect(messages).toContainEqual({ type: 'ready' })
  })

  it('passes the mic through untouched when the wasm is unusable', () => {
    // No bytes, bytes that are not a module, and a module whose names do not
    // match (a different build handed the wrong mapping).
    const garbage = new Uint8Array([0, 97, 115, 109, 9, 9, 9, 9]).buffer
    for (const bad of [
      null,
      { wasm: garbage, exports: bundle.exports },
      { wasm: bundle.wasm, exports: { ...bundle.exports, rnnoise_create: 'zz' } }
    ]) {
      const { node, messages } = load(bad)
      expect(messages[0]?.type).toBe('failed')
      const input = speech.subarray(0, 48000)
      expect(Array.from(run(node, input, 1))).toEqual(Array.from(input))
    }
  })

  it('is a straight pass-through, with no delay, when switched off', () => {
    const { node } = load(wasm())
    const input = speech.subarray(0, 96000)
    const out = run(node, input, 0)
    // After the 10 ms crossfade from its default of on, the output is the input.
    expect(Array.from(out.subarray(4800, 96000))).toEqual(Array.from(input.subarray(4800, 96000)))
  })

  it('adds 29 ms of latency when on: the queue plus RNNoise itself', () => {
    const { node } = load(wasm())
    const out = run(node, speech, 1)
    const lag = bestLag(speech, out, 2400)
    // 448 samples of queue -- the minimum for 128-sample quanta against
    // 480-sample frames -- plus this RNNoise build's own 960 (20 ms). The
    // handoff aimed for ~25 ms; the only build that gets there barely
    // suppresses anything (see below), so this is the honest figure.
    expect(lag).toBe(448 + 960)
    expect((lag / 48000) * 1000).toBeLessThan(30)
  })

  it('removes steady background noise, including underneath speech', () => {
    // A second of room noise before the first word, then speech over it:
    // -40 dBFS white noise, a loud fan or a noisy mic preamp.
    const lead = 48000
    const clean = new Float32Array(lead + speech.length)
    clean.set(speech, lead)
    const hum = noise(clean.length / 48000, Math.pow(10, -40 / 20) * Math.sqrt(3))
    const noisy = new Float32Array(clean.length)
    for (let i = 0; i < clean.length; i++) noisy[i] = clean[i] + hum[i]

    const out = run(load(wasm()).node, noisy, 1)
    const lag = bestLag(clean, out, 2400)

    // Between words: measured once RNNoise has had 0.3 s to settle.
    const before = rmsDb(noisy.subarray(14400, lead - 2400))
    const after = rmsDb(out.subarray(14400 + lag, lead - 2400 + lag))
    expect(before - after).toBeGreaterThan(15)

    // Under the words. Comparing samples with the clean voice would mostly
    // measure RNNoise's harmless reshaping of the voice itself, so instead
    // run the clean voice through too: what differs between the two outputs
    // is what survived of the noise.
    const outClean = run(load(wasm()).node, clean, 1)
    let noiseIn = 0
    let noiseLeft = 0
    for (let i = lead; i < clean.length - lag; i++) {
      noiseIn += hum[i] * hum[i]
      const r = out[i + lag] - outClean[i + lag]
      noiseLeft += r * r
    }
    expect(10 * Math.log10(noiseIn / noiseLeft)).toBeGreaterThan(6)
  })

  it('uses the RNNoise build that actually suppresses', () => {
    // The package ships two builds. The standalone rnnoise.wasm barely touches
    // white noise; guard against anyone "simplifying" back to it.
    const standalone = readFileSync(resolve('node_modules/@jitsi/rnnoise-wasm/dist/rnnoise.wasm'))
    const weak = {
      wasm: standalone.buffer.slice(standalone.byteOffset, standalone.byteOffset + standalone.byteLength),
      exports: wasmExportNames(new Uint8Array(standalone))
    }
    const white = noise(2, Math.pow(10, -40 / 20) * Math.sqrt(3))
    const cut = (b: DenoiseWasm): number =>
      rmsDb(white.subarray(48000)) - rmsDb(run(load(b).node, white, 1).subarray(48000))
    expect(cut(wasm())).toBeGreaterThan(40)
    expect(cut(weak)).toBeLessThan(10)
  })

  it('keeps the voice at its level instead of over-suppressing it', () => {
    const out = run(load(wasm()).node, speech, 1)
    const lag = bestLag(speech, out, 2400)
    const clean = speech.subarray(24000, speech.length - lag)
    const processed = out.subarray(24000 + lag)
    expect(Math.abs(rmsDb(processed) - rmsDb(clean))).toBeLessThan(2)
  })
})
