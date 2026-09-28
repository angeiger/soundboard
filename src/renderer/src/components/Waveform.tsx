import { useEffect, useRef, useState } from 'react'
import { downsamplePeaks } from '@/audio/peaks'

interface Props {
  peaks: number[] | undefined
  duration: number
  trimStart: number
  trimEnd: number | null
  accent: string
  onChange: (trimStart: number, trimEnd: number | null) => void
}

type Handle = 'start' | 'end' | null

const HEIGHT = 96

/**
 * Waveform with draggable trim handles. Most clips people download have four
 * seconds of dead air at the front, so this is the difference between a pad
 * that lands and one that arrives late.
 */
export function Waveform({
  peaks,
  duration,
  trimStart,
  trimEnd,
  accent,
  onChange
}: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<Handle>(null)

  const end = trimEnd ?? duration

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const dpr = window.devicePixelRatio || 1
    const width = wrap.clientWidth
    canvas.width = width * dpr
    canvas.height = HEIGHT * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${HEIGHT}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, HEIGHT)

    const barCount = Math.floor(width / 3)
    const bars = peaks ? downsamplePeaks(peaks, barCount) : new Array(barCount).fill(0.25)
    const mid = HEIGHT / 2

    for (let i = 0; i < bars.length; i++) {
      const t = (i / bars.length) * duration
      const inRange = t >= trimStart && t <= end
      const h = Math.max(2, bars[i] * (HEIGHT - 12))

      ctx.fillStyle = inRange ? accent : '#2A2A38'
      ctx.globalAlpha = inRange ? 0.85 : 1
      ctx.fillRect(i * 3, mid - h / 2, 2, h)
    }
    ctx.globalAlpha = 1
  }, [peaks, duration, trimStart, end, accent])

  const posToTime = (clientX: number): number => {
    const wrap = wrapRef.current
    if (!wrap) return 0
    const rect = wrap.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: MouseEvent): void => {
      const t = posToTime(e.clientX)
      if (dragging === 'start') {
        onChange(Math.min(t, end - 0.05), trimEnd)
      } else {
        // Snapping the end back to null when it reaches the tail keeps
        // "play to the end" meaningful rather than a hardcoded timestamp.
        const clamped = Math.max(t, trimStart + 0.05)
        onChange(trimStart, clamped >= duration - 0.02 ? null : clamped)
      }
    }
    const onUp = (): void => setDragging(null)

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, duration, trimStart, trimEnd, end, onChange])

  const pct = (t: number): string => `${duration > 0 ? (t / duration) * 100 : 0}%`

  return (
    <div ref={wrapRef} className="relative select-none" style={{ height: HEIGHT }}>
      <canvas ref={canvasRef} className="block rounded-lg bg-bg" />

      <div
        className="pointer-events-none absolute inset-y-0 left-0 rounded-l-lg bg-black/55"
        style={{ width: pct(trimStart) }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 rounded-r-lg bg-black/55"
        style={{ left: pct(end) }}
      />

      {(['start', 'end'] as const).map((which) => {
        const t = which === 'start' ? trimStart : end
        return (
          <div
            key={which}
            role="slider"
            tabIndex={0}
            aria-label={which === 'start' ? 'Trim start' : 'Trim end'}
            aria-valuenow={Math.round(t * 100) / 100}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration * 100) / 100}
            onMouseDown={() => setDragging(which)}
            className="absolute inset-y-0 w-3 cursor-ew-resize"
            style={{ left: `calc(${pct(t)} - 6px)` }}
          >
            <span
              className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2"
              style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
            />
            <span
              className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg"
              style={{ background: accent }}
            />
          </div>
        )
      })}
    </div>
  )
}
