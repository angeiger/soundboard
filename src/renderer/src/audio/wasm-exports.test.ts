import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { wasmExportNames } from './wasm-exports'

const dist = (f: string): string => resolve('node_modules/@jitsi/rnnoise-wasm/dist', f)

describe('wasmExportNames', () => {
  it('reads the embedded build, where malloc is "e" and rnnoise_create is "h"', () => {
    const source = readFileSync(dist('rnnoise-sync.js'), 'utf-8')
    const base64 = /data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/.exec(source)?.[1]
    const names = wasmExportNames(new Uint8Array(Buffer.from(base64 as string, 'base64')))
    expect(names).toMatchObject({
      memory: 'c',
      __wasm_call_ctors: 'd',
      malloc: 'e',
      free: 'f',
      rnnoise_create: 'h',
      rnnoise_destroy: 'i',
      rnnoise_process_frame: 'j'
    })
  })

  it('reads the standalone build, whose letters are shuffled differently', () => {
    const names = wasmExportNames(new Uint8Array(readFileSync(dist('rnnoise.wasm'))))
    // Same letters, different functions: exactly why they are not hard-coded.
    expect(names.rnnoise_create).toBe('f')
    expect(names.malloc).toBe('g')
  })

  it('finds nothing in a module without a name section', () => {
    // The smallest valid module: magic and version only.
    expect(wasmExportNames(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))).toEqual({})
  })
})
