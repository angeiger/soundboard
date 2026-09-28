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

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
