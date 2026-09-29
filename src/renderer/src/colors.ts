import type { NeonColor } from '@shared/types'

export const NEON_HEX: Record<NeonColor, string> = {
  cyan: '#00F0FF',
  magenta: '#FF2E97',
  lime: '#B6FF00',
  violet: '#A855F7',
  amber: '#FFB020',
  blue: '#3B82F6',
  orange: '#FF6B35',
  red: '#FF3B3B'
}

/**
 * Soundboard clips are usually a second or two, so m:ss is the wrong unit --
 * it rendered every short clip, and every trim range, as a flat "0:00".
 * Seconds with one decimal below a minute, m:ss above it.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.0s'
  if (seconds < 60) return `${(Math.round(seconds * 10) / 10).toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
