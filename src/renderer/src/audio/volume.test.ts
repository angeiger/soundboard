import { describe, it, expect } from 'vitest'
import { positionToGain, gainToPosition, gainToDisplay, formatGainDb, MIN_DB } from './volume'

describe('dB taper', () => {
  it('maps the ends of the slider to silence and unity', () => {
    expect(positionToGain(0)).toBe(0)
    expect(positionToGain(1)).toBe(1)
    expect(gainToPosition(0)).toBe(0)
    expect(gainToPosition(1)).toBe(1)
  })

  it('round-trips every slider position', () => {
    for (let step = 1; step <= 100; step++) {
      const p = step / 100
      expect(gainToPosition(positionToGain(p))).toBeCloseTo(p, 10)
    }
  })

  it('round-trips every gain the slider can represent', () => {
    const floor = Math.pow(10, MIN_DB / 20)
    for (const gain of [floor * 1.01, 0.003, 0.01, 0.03, 0.1, 0.25, 0.5, 0.8, 1]) {
      expect(positionToGain(gainToPosition(gain))).toBeCloseTo(gain, 10)
    }
  })

  it('puts a gain of 0.03 near the middle of the slider', () => {
    expect(Math.round(gainToPosition(0.03) * 100)).toBe(49)
    expect(gainToDisplay(0.03)).toBe(49)
  })

  it('treats anything at or below the floor as silence', () => {
    expect(gainToPosition(Math.pow(10, MIN_DB / 20))).toBe(0)
    expect(gainToPosition(1e-6)).toBe(0)
    expect(gainToPosition(-1)).toBe(0)
  })

  it('clamps out-of-range input instead of extrapolating', () => {
    expect(positionToGain(-0.5)).toBe(0)
    expect(positionToGain(1.5)).toBe(1)
    expect(gainToPosition(2)).toBe(1)
  })

  it('formats levels in decibels', () => {
    expect(formatGainDb(0)).toBe('muted')
    expect(formatGainDb(1)).toBe('0.0 dB')
    expect(formatGainDb(2)).toBe('+6.0 dB')
    expect(formatGainDb(Math.pow(10, -30 / 20))).toBe('-30.0 dB')
  })
})
