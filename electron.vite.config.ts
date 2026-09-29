import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

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
    plugins: [react()],
    // electron-vite leaves the renderer unminified, which shipped react-dom at
    // 537 KB of its 730 KB total; our own code is ~150 KB, in proportion to
    // its source. Minified the bundle is ~280 KB. Main and preload stay
    // readable -- they are small and their stack traces are the useful ones.
    build: { minify: 'esbuild' }
  }
})
