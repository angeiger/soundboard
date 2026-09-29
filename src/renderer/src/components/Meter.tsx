import { useEffect, useRef } from 'react'
import { meterPosition, toDb, METER_FLOOR_DB } from '@/audio/level'
import type { Level } from '@/audio/target'

const TICKS = [-48, -36, -24, -12, -6, 0]

/** Hold the peak marker this long before it starts to fall. */
const PEAK_HOLD_MS = 900

const position = (db: number): number => Math.max(0, Math.min(1, 1 - db / METER_FLOOR_DB))

/**
 * Horizontal level meter: an RMS bar with a held peak tick, -60..0 dBFS.
 *
 * It reads levels itself on every animation frame and writes straight to the
 * DOM, so a meter moving at 60 fps never re-renders the wizard around it.
 * The motion is the function here, not decoration, so it runs under
 * prefers-reduced-motion too.
 */
export function Meter({
  label,
  read,
  marker,
  markerLabel
}: {
  label: string
  read: () => Level | null
  /** A threshold to draw on the scale, in dBFS -- the noise gate, say. */
  marker?: number
  markerLabel?: string
}): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const peakRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const readRef = useRef(read)
  readRef.current = read

  useEffect(() => {
    let frame = 0
    let held = 0
    let heldAt = 0
    let lastShown = Number.NaN

    const tick = (now: number): void => {
      const level = readRef.current()
      const rms = level ? meterPosition(level.rms) : 0
      const peak = level ? meterPosition(level.peak) : 0

      if (peak >= held || now - heldAt > PEAK_HOLD_MS) {
        held = Math.max(peak, held - 0.015)
        if (peak >= held) heldAt = now
      }

      if (fillRef.current) fillRef.current.style.clipPath = `inset(0 ${(1 - rms) * 100}% 0 0)`
      if (peakRef.current) {
        peakRef.current.style.left = `${held * 100}%`
        peakRef.current.style.opacity = held > 0 ? '1' : '0'
      }
      if (readoutRef.current) {
        const db = level ? toDb(level.peak) : -Infinity
        const shown = db > METER_FLOOR_DB ? Math.round(db) : METER_FLOOR_DB
        readoutRef.current.textContent = db > METER_FLOOR_DB ? `${shown} dB` : '—'
        if (shown !== lastShown) {
          lastShown = shown
          trackRef.current?.setAttribute('aria-valuenow', String(shown))
        }
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="label">{label}</span>
        {marker !== undefined && markerLabel && (
          <span className="flex items-center gap-1.5 text-[10.5px] text-[var(--neon-amber)]">
            <i className="inline-block h-2.5 w-px bg-[var(--neon-amber)]" />
            {markerLabel}
          </span>
        )}
        <span
          ref={readoutRef}
          className="ml-auto font-mono text-[11px] tabular-nums text-txt-dim"
        >
          —
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-3 overflow-hidden rounded-[3px] border border-line bg-bg"
        role="meter"
        aria-label={label}
        aria-valuemin={METER_FLOOR_DB}
        aria-valuemax={0}
        aria-valuenow={METER_FLOOR_DB}
      >
        <div
          ref={fillRef}
          className="absolute inset-0"
          style={{
            clipPath: 'inset(0 100% 0 0)',
            // Colour by absolute level: cyan to -12 dB, amber to -3, red above.
            background:
              'linear-gradient(to right, var(--neon-cyan) 0%, var(--neon-cyan) 80%, var(--neon-amber) 80%, var(--neon-amber) 95%, var(--neon-red) 95%)'
          }}
        />
        <div
          ref={peakRef}
          className="absolute inset-y-0 w-[2px] -translate-x-full bg-txt"
          style={{ left: '0%', opacity: 0 }}
        />
        {marker !== undefined && (
          <div
            className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-[var(--neon-amber)] shadow-[0_0_0_1px_#08080C]"
            style={{ left: `${position(marker) * 100}%` }}
            title={markerLabel}
          />
        )}
      </div>

      <div className="relative h-3 font-mono text-[9.5px] text-txt-faint">
        {TICKS.map((db) => (
          <span
            key={db}
            className={`absolute tabular-nums ${db === 0 ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${position(db) * 100}%` }}
          >
            {db}
          </span>
        ))}
      </div>
    </div>
  )
}
