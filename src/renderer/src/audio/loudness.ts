/**
 * Loudness matching for imported clips.
 *
 * A mastered audio file sits near -12 dBFS; a voice into a desk mic sits nearer
 * -20. Dropped onto a pad at unity gain, every clip therefore arrives roughly
 * twice as loud as the person triggering it. Rather than making people balance
 * each pad by hand, we measure the clip at import and pick a starting gain.
 */

/** Blocks quieter than this below the peak block are treated as silence. */
const GATE_REL_DB = -20

/** Where a clip should sit relative to full scale, in dBFS RMS. */
export const TARGET_RMS_DB = -18

/** Nothing may peak above this after gain, in dBFS. */
export const PEAK_CEILING_DB = -1.5

const BLOCK_SECONDS = 0.4

export interface Loudness {
  /** Absolute peak sample, 0..1. */
  peak: number
  /** Gated RMS in dBFS, or -Infinity for a silent buffer. */
  rmsDb: number
}

function toDb(linear: number): number {
  return linear > 0 ? 20 * Math.log10(linear) : -Infinity
}

/**
 * Gated RMS, loosely following the idea behind EBU R128: measure in short
 * blocks, discard the quiet ones, average what's left. Without the gate, a clip
 * with two seconds of silence in front measures far quieter than it sounds.
 */
export function analyzeLoudness(buffer: AudioBuffer): Loudness {
  const channels = Math.min(buffer.numberOfChannels, 2)
  const data: Float32Array[] = []
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c))

  const blockSize = Math.max(1, Math.floor(buffer.sampleRate * BLOCK_SECONDS))
  const blockCount = Math.max(1, Math.ceil(buffer.length / blockSize))

  const blockMeanSquares: number[] = []
  let peak = 0

  for (let b = 0; b < blockCount; b++) {
    const start = b * blockSize
    const end = Math.min(buffer.length, start + blockSize)
    if (end <= start) continue

    let sumSquares = 0
    let count = 0
    for (let i = start; i < end; i++) {
      for (let c = 0; c < channels; c++) {
        const v = data[c][i]
        sumSquares += v * v
        count++
        const abs = v < 0 ? -v : v
        if (abs > peak) peak = abs
      }
    }
    if (count > 0) blockMeanSquares.push(sumSquares / count)
  }

  if (blockMeanSquares.length === 0) return { peak, rmsDb: -Infinity }

  const loudestBlock = Math.max(...blockMeanSquares)
  if (loudestBlock <= 0) return { peak, rmsDb: -Infinity }

  // Relative gate: keep only blocks within GATE_REL_DB of the loudest one.
  const threshold = loudestBlock * Math.pow(10, GATE_REL_DB / 10)
  const kept = blockMeanSquares.filter((ms) => ms >= threshold)
  const pool = kept.length > 0 ? kept : blockMeanSquares

  const meanSquare = pool.reduce((a, b) => a + b, 0) / pool.length
  return { peak, rmsDb: toDb(Math.sqrt(meanSquare)) }
}

/**
 * Gain that brings a clip to TARGET_RMS_DB without letting it peak above
 * PEAK_CEILING_DB. The peak ceiling wins, so a heavily compressed clip ends up
 * slightly quieter than target rather than clipping.
 */
export function suggestGain(loudness: Loudness): number {
  if (!Number.isFinite(loudness.rmsDb) || loudness.peak <= 0) return 1

  const rmsGain = Math.pow(10, (TARGET_RMS_DB - loudness.rmsDb) / 20)
  const peakGain = Math.pow(10, (PEAK_CEILING_DB - toDb(loudness.peak)) / 20)

  // The editor's volume slider tops out at 200%, so keep the suggestion inside
  // a range the user can still see and adjust.
  return Math.min(2, Math.max(0.05, Math.min(rmsGain, peakGain)))
}
