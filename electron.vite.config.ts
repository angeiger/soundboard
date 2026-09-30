import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { rnnoiseWasm } from './build/rnnoise-wasm'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), rnnoiseWasm()],
    // electron-vite leaves the renderer unminified, which shipped react-dom at
    // 537 KB of its 730 KB total; our own code is ~150 KB, in proportion to
    // its source. Minified the bundle is ~280 KB. Main and preload stay
    // readable -- they are small and their stack traces are the useful ones.
    //
    // No inlining: Vite turns assets under 4 KB into data: URLs, and the CSP
    // only lets fonts load from 'self'. The smallest font subset is 2 KB, and
    // inlined it would be refused -- quietly, for the few scripts that need it.
    build: { minify: 'esbuild', assetsInlineLimit: 0 }
  }
})
