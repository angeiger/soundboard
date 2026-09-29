import { describe, it, expect } from 'vitest'
import { computePeaks, downsamplePeaks, PEAK_BUCKETS } from './peaks'
import { fakeBuffer, sine } from './test-buffer'

describe('downsamplePeaks', () => {
  const ramp = Array.from({ length: PEAK_BUCKETS }, (_, i) => i / (PEAK_BUCKETS - 1))

  it('returns exactly the requested number of buckets', () => {
    for (const count of [1, 14, 300, PEAK_BUCKETS, 2000]) {
      expect(downsamplePeaks(ramp, count)).toHaveLength(count)
    }
  })

  it('keeps every value inside the input range', () => {
    for (const count of [14, 2000]) {
      for (const v of downsamplePeaks(ramp, count)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
        expect(Number.isNaN(v)).toBe(false)
      }
    }
  })

  it('keeps the loudest peak when reducing', () => {
    const spiky = new Array(PEAK_BUCKETS).fill(0.1)
    spiky[437] = 0.97
    expect(Math.max(...downsamplePeaks(spiky, 14))).toBe(0.97)
  })

  it('fills an empty input with silence', () => {
    expect(downsamplePeaks([], 14)).toEqual(new Array(14).fill(0))
  })
})

describe('computePeaks', () => {
  it('produces one 0..1 value per bucket, tracking the loudest sample', () => {
    const peaks = computePeaks(fakeBuffer([sine(1, 0.6)]))
    expect(peaks).toHaveLength(PEAK_BUCKETS)
    expect(Math.max(...peaks)).toBeCloseTo(0.6, 2)
    expect(Math.min(...peaks)).toBeGreaterThanOrEqual(0)
  })
})
