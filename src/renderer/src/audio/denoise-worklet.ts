import rnnoiseWasmUrl from 'virtual:rnnoise-wasm'
import { wasmExportNames } from './wasm-exports'

/**
 * RNNoise on the mic branch, as an AudioWorklet. Authored as a source string
 * and registered from a blob URL, exactly like the gate -- one mechanism for
 * both.
 *
 * Why it is here at all: Discord's Krisp has to stay off (it deletes sound
 * effects), and the gate only helps between sentences -- it is open by
 * definition while you talk. RNNoise runs continuously, so it takes out the
 * fan or hum underneath your voice as well.
 *
 * The mechanics that matter:
 *
 * - RNNoise works on 480-sample frames at 48 kHz; a worklet is handed 128 at
 *   a time. Input accumulates into a frame, each processed frame is queued,
 *   and 128 are taken off the queue per quantum. The queue starts with 448
 *   samples of silence -- the most that 128*q mod 480 ever reaches -- which is
 *   the smallest head start that never runs dry: 9.3 ms, on top of the 20 ms
 *   this RNNoise build delays by itself. 29 ms in all, measured.
 * - RNNoise expects int16-range floats, not +-1.0: scale up going in, down
 *   coming out, or the result is silence or distortion.
 * - A worklet cannot fetch, so the renderer passes the wasm bytes in through
 *   processorOptions and they are compiled here. The module needs just two
 *   imports, so it is instantiated directly rather than through Emscripten's
 *   loader. Its exports are minified letters that differ between builds, so
 *   the renderer resolves them from the binary's name section and passes
 *   the mapping along with the bytes.
 * - If anything about the wasm fails, the processor passes the mic through
 *   untouched and says so. It must never be the reason your mic goes silent.
 * - Switching on or off crossfades over 10 ms. Off is a straight pass-through
 *   with no added latency, but RNNoise keeps running so switching back on is
 *   immediate and clean.
 */
export const DENOISE_WORKLET_SOURCE = `
const FRAME = 480
const PRIME = 448
const QUEUE = 4096
const FADE = 480
const SCALE = 32768

class DenoiseProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'enabled', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' }]
  }

  constructor(options) {
    super()
    this.ready = false
    this.disposed = false
    this.frame = new Float32Array(FRAME)
    this.fill = 0
    this.queue = new Float32Array(QUEUE)
    this.head = 0
    this.count = PRIME
    this.mix = 1
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'dispose') this.dispose()
    }
    try {
      if (sampleRate !== 48000) throw new Error('RNNoise needs 48 kHz, got ' + sampleRate)
      const opts = (options && options.processorOptions) || {}
      const bytes = opts.wasm
      const names = opts.exports
      if (!bytes || !names) throw new Error('no wasm bytes')
      let memory = null
      const imports = {
        a: {
          // emscripten_resize_heap
          a: (requested) => {
            try {
              memory.grow(Math.ceil((requested - memory.buffer.byteLength) / 65536))
              return 1
            } catch (e) {
              return 0
            }
          },
          // emscripten_memcpy_big
          b: (dest, src, num) => {
            new Uint8Array(memory.buffer).copyWithin(dest, src, src + num)
          }
        }
      }
      const raw = new WebAssembly.Instance(new WebAssembly.Module(bytes), imports).exports
      const fn = (name) => {
        const f = raw[names[name]]
        if (typeof f !== 'function') throw new Error('wasm has no ' + name)
        return f
      }
      memory = raw[names.memory]
      if (!memory) throw new Error('wasm exports no memory')
      this.ex = {
        malloc: fn('malloc'),
        free: fn('free'),
        create: fn('rnnoise_create'),
        destroy: fn('rnnoise_destroy'),
        process: fn('rnnoise_process_frame')
      }
      fn('__wasm_call_ctors')()
      this.memory = memory
      this.state = this.ex.create(0) // default model
      this.inPtr = this.ex.malloc(FRAME * 4)
      this.outPtr = this.ex.malloc(FRAME * 4)
      if (!this.state || !this.inPtr || !this.outPtr) throw new Error('RNNoise could not allocate')
      this.ready = true
      this.port.postMessage({ type: 'ready' })
    } catch (err) {
      this.port.postMessage({ type: 'failed', message: String((err && err.message) || err) })
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    if (this.ready) {
      this.ex.destroy(this.state)
      this.ex.free(this.inPtr)
      this.ex.free(this.outPtr)
      this.ready = false
    }
  }

  runFrame() {
    const heap = new Float32Array(this.memory.buffer)
    const inAt = this.inPtr >> 2
    const outAt = this.outPtr >> 2
    for (let i = 0; i < FRAME; i++) heap[inAt + i] = this.frame[i] * SCALE
    this.ex.process(this.state, this.outPtr, this.inPtr)
    // The heap may have grown -- and moved -- during the call.
    const out = new Float32Array(this.memory.buffer)
    let tail = (this.head + this.count) % QUEUE
    for (let i = 0; i < FRAME; i++) {
      this.queue[tail] = out[outAt + i] / SCALE
      tail = (tail + 1) % QUEUE
    }
    this.count += FRAME
  }

  process(inputs, outputs, parameters) {
    if (this.disposed) return false
    const output = outputs[0] && outputs[0][0]
    if (!output) return true
    const input = inputs[0] && inputs[0][0]

    if (!this.ready) {
      // Failed to load: pass the mic through untouched.
      if (input) output.set(input)
      else output.fill(0)
      return true
    }

    const n = output.length
    for (let i = 0; i < n; i++) {
      this.frame[this.fill++] = input ? input[i] : 0
      if (this.fill === FRAME) {
        this.runFrame()
        this.fill = 0
      }
    }

    const want = parameters.enabled[0] >= 0.5 ? 1 : 0
    for (let i = 0; i < n; i++) {
      const wet = this.queue[this.head]
      this.head = (this.head + 1) % QUEUE
      if (this.mix !== want) {
        this.mix += want > this.mix ? 1 / FADE : -1 / FADE
        if (this.mix < 0) this.mix = 0
        if (this.mix > 1) this.mix = 1
      }
      const dry = input ? input[i] : 0
      output[i] = this.mix === 1 ? wet : this.mix === 0 ? dry : wet * this.mix + dry * (1 - this.mix)
    }
    this.count -= n
    return true
  }
}

registerProcessor('denoise', DenoiseProcessor)
`

export function denoiseWorkletUrl(): string {
  return URL.createObjectURL(new Blob([DENOISE_WORKLET_SOURCE], { type: 'application/javascript' }))
}

export interface DenoiseWasm {
  wasm: ArrayBuffer
  /** Debug name -> minified export name, for the worklet. */
  exports: Record<string, string>
}

const REQUIRED = ['__wasm_call_ctors', 'malloc', 'free', 'rnnoise_create', 'rnnoise_destroy', 'rnnoise_process_frame', 'memory']

/**
 * The RNNoise binary, read on the renderer thread and handed to the worklet,
 * which cannot fetch for itself. build/rnnoise-wasm.ts explains which binary
 * and why; in a packaged build it is a .wasm asset beside the bundle, read
 * like any other file of the page's own.
 */
export async function loadDenoiseWasm(): Promise<DenoiseWasm> {
  let bytes: Uint8Array
  if (rnnoiseWasmUrl.startsWith('data:')) {
    const binary = atob(rnnoiseWasmUrl.slice(rnnoiseWasmUrl.indexOf(',') + 1))
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  } else {
    const response = await fetch(rnnoiseWasmUrl)
    if (!response.ok) throw new Error(`RNNoise binary: HTTP ${response.status}`)
    bytes = new Uint8Array(await response.arrayBuffer())
  }

  const names = wasmExportNames(bytes)
  const missing = REQUIRED.filter((n) => !names[n])
  if (missing.length > 0) throw new Error(`RNNoise binary lacks ${missing.join(', ')}`)
  return { wasm: bytes.buffer as ArrayBuffer, exports: names }
}
