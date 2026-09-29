/**
 * Volume sliders use a decibel taper instead of mapping position straight to
 * linear gain.
 *
 * Loudness is perceived roughly logarithmically, so a linear slider wastes most
 * of its travel: the step from 3% to 6% is a doubling, while everything between
 * 60% and 100% sounds much the same. In practice that pushes every usable
 * setting into the bottom sliver of the control, where it cannot be adjusted
 * precisely.
 *
 * Mapping position to decibels instead spreads the useful range across the
 * whole slider. A gain of 0.03 -- barely distinguishable from zero on a linear
 * control -- lands at position 49, right in the middle.
 *
 * Only the slider mapping changes. Stored config values are still linear gain,
 * so existing settings keep their meaning.
 */

/** Slider floor. Below this the control snaps to true silence. */
export const MIN_DB = -60

/** Slider position (0..1) to linear gain (0..1). */
export function positionToGain(position: number): number {
  const p = Math.min(1, Math.max(0, position))
  if (p <= 0) return 0
  return Math.pow(10, (MIN_DB * (1 - p)) / 20)
}

/** Linear gain back to slider position, for rendering a stored value. */
export function gainToPosition(gain: number): number {
  if (gain <= 0) return 0
  const db = 20 * Math.log10(gain)
  if (db <= MIN_DB) return 0
  return Math.min(1, 1 - db / MIN_DB)
}

/** Human-readable level for a linear gain, e.g. "-30.5 dB" or "muted". */
export function formatGainDb(gain: number): string {
  if (gain <= 0) return 'muted'
  const db = 20 * Math.log10(gain)
  if (db <= MIN_DB) return 'muted'
  const rounded = Math.round(db * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} dB`
}

/** 0-100 for display next to a slider. */
export function gainToDisplay(gain: number): number {
  return Math.round(gainToPosition(gain) * 100)
}
