import type { Level } from './target'

/** Bottom of every meter. Quieter than this reads as silence. */
export const METER_FLOOR_DB = -60

export function toDb(linear: number): number {
  return linear > 0 ? 20 * Math.log10(linear) : -Infinity
}

/** 0..1 position of a linear level on a meter running from the floor to 0 dBFS. */
export function meterPosition(linear: number): number {
  const db = toDb(linear)
  if (db <= METER_FLOOR_DB) return 0
  return Math.min(1, 1 - db / METER_FLOOR_DB)
}

/**
 * Peak and RMS over the analyser's window. Float rather than byte data: bytes
 * have 8-bit resolution, which floors at about -42 dBFS -- exactly where the
 * noise gate threshold sits, so a byte meter could never show it.
 */
export function measure(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): Level {
  analyser.getFloatTimeDomainData(buf)
  let peak = 0
  let sumSquares = 0
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i]
    const abs = v < 0 ? -v : v
    if (abs > peak) peak = abs
    sumSquares += v * v
  }
  return { peak, rms: Math.sqrt(sumSquares / buf.length) }
}
