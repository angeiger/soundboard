import { describe, it, expect } from 'vitest'
import { analyzeLoudness, suggestGain, PEAK_CEILING_DB, TARGET_RMS_DB } from './loudness'
import { fakeBuffer, sine, noise, concat } from './test-buffer'

const db = (linear: number): number => 20 * Math.log10(linear)

describe('analyzeLoudness', () => {
  it('measures a sine at its true RMS', () => {
    // A sine's RMS is its amplitude over root two: 0.5 -> -9.03 dBFS.
    const { rmsDb, peak } = analyzeLoudness(fakeBuffer([sine(1, 0.5)]))
    expect(rmsDb).toBeCloseTo(db(0.5 / Math.SQRT2), 1)
    expect(peak).toBeCloseTo(0.5, 3)
  })

  it('does not measure a clip with leading silence as quiet', () => {
    const tone = sine(1, 0.5)
    // Real "silence" in a file is room tone or dither, not digital zero --
    // exact zeros would be excluded by any gate and prove nothing.
    const padded = concat(noise(2, Math.pow(10, -60 / 20)), tone)

    const plain = analyzeLoudness(fakeBuffer([tone])).rmsDb
    const withSilence = analyzeLoudness(fakeBuffer([padded])).rmsDb

    // Ungated, two seconds of silence in front would pull this down ~4.8 dB.
    expect(Math.abs(withSilence - plain)).toBeLessThan(0.1)
  })

  it('reports a silent buffer as -Infinity rather than a number', () => {
    expect(analyzeLoudness(fakeBuffer([new Float32Array(48000)])).rmsDb).toBe(-Infinity)
  })

  it('reads both channels of a stereo clip', () => {
    const quietLeft = new Float32Array(48000)
    const { peak } = analyzeLoudness(fakeBuffer([quietLeft, sine(1, 0.8)]))
    expect(peak).toBeCloseTo(0.8, 3)
  })
})

describe('suggestGain', () => {
  it('brings a loud clip down to the RMS target', () => {
    const loudness = analyzeLoudness(fakeBuffer([sine(1, 0.5)]))
    const after = loudness.rmsDb + db(suggestGain(loudness))
    expect(after).toBeCloseTo(TARGET_RMS_DB, 1)
  })

  it('lets the peak ceiling win over the RMS target', () => {
    // Quiet body (-30 dBFS RMS) with one transient at -3 dBFS. Reaching the
    // RMS target would need ~12 dB of gain and push that transient far past
    // full scale, so the ceiling has to decide instead.
    const body = sine(2, Math.pow(10, -30 / 20) * Math.SQRT2)
    body[48000] = Math.pow(10, -3 / 20)

    const loudness = analyzeLoudness(fakeBuffer([body]))
    const gain = suggestGain(loudness)

    expect(db(loudness.peak) + db(gain)).toBeCloseTo(PEAK_CEILING_DB, 2)
    expect(loudness.rmsDb + db(gain)).toBeLessThan(TARGET_RMS_DB)
  })

  it('stays inside the range the volume slider can show', () => {
    const whisper = analyzeLoudness(fakeBuffer([sine(1, 0.001)]))
    expect(suggestGain(whisper)).toBeLessThanOrEqual(2)
  })

  it('leaves silence at unity instead of dividing by zero', () => {
    expect(suggestGain({ peak: 0, rmsDb: -Infinity })).toBe(1)
  })
})
