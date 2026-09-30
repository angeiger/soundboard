import { readFileSync } from 'fs'
import { createRequire } from 'module'
import type { Plugin } from 'vite'

const ID = 'virtual:rnnoise-wasm'
const RESOLVED = `\0${ID}`

/**
 * Provides `virtual:rnnoise-wasm`: a URL for the RNNoise binary.
 *
 * @jitsi/rnnoise-wasm ships two builds. The standalone rnnoise.wasm barely
 * suppresses anything (about 1 dB on -40 dBFS white noise, against 60+ for
 * the other), so the binary used is the one embedded as base64 in
 * rnnoise-sync.js -- the one Jitsi's own worklet runs. It is extracted here,
 * at build time, and emitted as a real .wasm asset: 1.4 MB of binary rather
 * than a 1.9 MB base64 chunk to parse, and a build that fails loudly if a
 * package update ever moves it.
 *
 * Under the dev server and Vitest there is no asset pipeline to emit into,
 * so the module exports a data: URL instead; loadDenoiseWasm reads either.
 */
export function rnnoiseWasm(): Plugin {
  let serving = false
  return {
    name: 'rnnoise-wasm',
    configResolved(config) {
      serving = config.command === 'serve'
    },
    resolveId(source) {
      return source === ID ? RESOLVED : undefined
    },
    load(id) {
      if (id !== RESOLVED) return undefined
      const require = createRequire(import.meta.url)
      const source = readFileSync(require.resolve('@jitsi/rnnoise-wasm/dist/rnnoise-sync.js'), 'utf-8')
      const base64 = /data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/.exec(source)?.[1]
      if (!base64) this.error('RNNoise binary not found in @jitsi/rnnoise-wasm/dist/rnnoise-sync.js')
      if (serving) return `export default ${JSON.stringify(`data:application/wasm;base64,${base64}`)}`
      const ref = this.emitFile({
        type: 'asset',
        name: 'rnnoise.wasm',
        source: Buffer.from(base64, 'base64')
      })
      return `export default import.meta.ROLLUP_FILE_URL_${ref}`
    }
  }
}
