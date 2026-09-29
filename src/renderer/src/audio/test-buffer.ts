/**
 * Just enough of an AudioBuffer for the pure analysis functions, which only
 * read channel data, length and sample rate. Node has no Web Audio.
 */
export function fakeBuffer(channels: Float32Array[], sampleRate = 48000): AudioBuffer {
  const length = channels[0]?.length ?? 0
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length,
    duration: length / sampleRate,
    getChannelData: (c: number) => channels[c]
  } as unknown as AudioBuffer
}

export function sine(
  seconds: number,
  amplitude: number,
  frequency = 1000,
  sampleRate = 48000
): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate))
  for (let i = 0; i < out.length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate)
  }
  return out
}

/** Deterministic white noise, so a failing test fails the same way twice. */
export function noise(seconds: number, amplitude: number, sampleRate = 48000): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate))
  let seed = 0x2545f491
  for (let i = 0; i < out.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    out[i] = amplitude * (seed / 0x80000000 - 1)
  }
  return out
}

export function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}
