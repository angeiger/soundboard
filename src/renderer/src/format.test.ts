import { describe, it, expect } from 'vitest'
import { formatDuration } from './format'

describe('formatDuration', () => {
  it('shows sub-second clips in seconds, not as 0:00', () => {
    expect(formatDuration(0.87)).toBe('0.9s')
    expect(formatDuration(0.04)).toBe('0.0s')
    expect(formatDuration(2.35)).toBe('2.4s')
  })

  it('switches to m:ss at a minute', () => {
    expect(formatDuration(59.94)).toBe('59.9s')
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(125.7)).toBe('2:05')
  })

  it('survives garbage input', () => {
    expect(formatDuration(-1)).toBe('0.0s')
    expect(formatDuration(Number.NaN)).toBe('0.0s')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0.0s')
  })
})
