/**
 * Emscripten minifies export names to single letters, and which letter is
 * which differs between builds: the two RNNoise builds in @jitsi/rnnoise-wasm
 * swap malloc, free and rnnoise_create around. Hard-coding letters would turn
 * any package update into a silent crash, so the real names are read from the
 * binary's own name section and matched to its exports.
 *
 * Returns debug name -> export name, e.g. "rnnoise_create" -> "h", plus
 * "memory" for the exported memory. Empty if the binary has no name section.
 */
export function wasmExportNames(bytes: Uint8Array): Record<string, string> {
  let p = 8 // magic + version
  const u32 = (): number => {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = bytes[p++]
      result |= (byte & 0x7f) << shift
      shift += 7
    } while (byte & 0x80)
    return result >>> 0
  }
  const str = (): string => {
    const n = u32()
    const s = new TextDecoder().decode(bytes.subarray(p, p + n))
    p += n
    return s
  }

  const exportedFuncs = new Map<number, string>()
  const funcNames = new Map<number, string>()
  const out: Record<string, string> = {}

  while (p < bytes.length) {
    const id = bytes[p++]
    const size = u32()
    const end = p + size
    if (id === 7) {
      const count = u32()
      for (let i = 0; i < count; i++) {
        const name = str()
        const kind = bytes[p++]
        const index = u32()
        if (kind === 0) exportedFuncs.set(index, name)
        if (kind === 2) out.memory = name
      }
    } else if (id === 0 && str() === 'name') {
      while (p < end) {
        const sub = bytes[p++]
        const subEnd = u32() + p
        if (sub === 1) {
          const count = u32()
          for (let i = 0; i < count; i++) {
            const index = u32()
            funcNames.set(index, str())
          }
        }
        p = subEnd
      }
    }
    p = end
  }

  for (const [index, exportName] of exportedFuncs) {
    const debugName = funcNames.get(index)
    if (debugName) out[debugName] = exportName
  }
  return out
}
