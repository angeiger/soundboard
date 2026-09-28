/** Number of buckets in a cached waveform. Enough detail for a 900px editor. */
export const PEAK_BUCKETS = 900

/**
 * Reduces a decoded buffer to a fixed-length array of 0..1 peak magnitudes.
 * Computed once at import and cached to disk, so reopening a bank never
 * re-decodes an mp3.
 */
export function computePeaks(buffer: AudioBuffer, buckets = PEAK_BUCKETS): number[] {
  const channels = Math.min(buffer.numberOfChannels, 2)
  const data: Float32Array[] = []
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c))

  const samplesPerBucket = Math.max(1, Math.floor(buffer.length / buckets))
  const peaks: number[] = new Array(buckets)

  for (let b = 0; b < buckets; b++) {
    const start = b * samplesPerBucket
    const end = Math.min(buffer.length, start + samplesPerBucket)
    let peak = 0
    for (let i = start; i < end; i++) {
      for (let c = 0; c < channels; c++) {
        const v = Math.abs(data[c][i])
        if (v > peak) peak = v
      }
    }
    peaks[b] = Math.round(peak * 1000) / 1000
  }
  return peaks
}

/** Resamples a cached peak array down to however many bars a pad face shows. */
export function downsamplePeaks(peaks: number[], count: number): number[] {
  if (peaks.length === 0) return new Array(count).fill(0)
  const step = peaks.length / count
  const out: number[] = new Array(count)
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * step)
    const end = Math.max(start + 1, Math.floor((i + 1) * step))
    let peak = 0
    for (let j = start; j < end && j < peaks.length; j++) {
      if (peaks[j] > peak) peak = peaks[j]
    }
    out[i] = peak
  }
  return out
}
