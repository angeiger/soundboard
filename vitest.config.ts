import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import { rnnoiseWasm } from './build/rnnoise-wasm'

export default defineConfig({
  plugins: [rnnoiseWasm()],
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
