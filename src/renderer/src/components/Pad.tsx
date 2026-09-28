import { useEffect, useRef, useState } from 'react'
import type { Pad as PadModel } from '@shared/types'
import { NEON_HEX, formatDuration } from '@/colors'
import { formatAccelerator } from '@/state/hotkey'
import { downsamplePeaks } from '@/audio/peaks'
import { engine } from '@/audio/engine'

const WAVE_BARS = 14

interface Props {
  pad: PadModel
  peaks: number[] | undefined
  playing: boolean
  onTrigger: () => void
  onEdit: () => void
}

export function Pad({ pad, peaks, playing, onTrigger, onEdit }: Props): React.JSX.Element {
  const [progress, setProgress] = useState(0)
  const raf = useRef<number | null>(null)

  const trimmedLength = (pad.trimEnd ?? pad.duration) - pad.trimStart

  /**
   * The progress bar is driven off the engine rather than a timer started at
   * click time, so it stays truthful when a Bluetooth monitor is 200 ms behind.
   */
  useEffect(() => {
    if (!playing) {
      setProgress(0)
      return
    }
    const tick = (): void => {
      const elapsed = engine.progress(pad.id)
      if (elapsed === null) {
        setProgress(0)
        return
      }
      setProgress(trimmedLength > 0 ? Math.min(1, elapsed / trimmedLength) : 0)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    }
  }, [playing, pad.id, trimmedLength])

  const bars = peaks ? downsamplePeaks(peaks, WAVE_BARS) : new Array(WAVE_BARS).fill(0.3)
  const accent = NEON_HEX[pad.color]

  return (
    <button
      type="button"
      className={`pad h-28 text-left ${playing ? 'pad--playing' : ''}`}
      style={{ ['--c' as string]: accent }}
      onClick={onTrigger}
      onContextMenu={(e) => {
        e.preventDefault()
        onEdit()
      }}
      title={`${pad.name}\nRight-click to edit`}
    >
      <span className="text-[19px] leading-none">{pad.glyph || '▶'}</span>

      <span className="pad-key">{formatAccelerator(pad.hotkey) || 'unbound'}</span>

      <span
        className="mt-auto truncate text-[13px] font-medium tracking-tight"
        style={{ color: playing ? accent : undefined }}
      >
        {pad.name}
      </span>

      <span className="mt-0.5 font-mono text-[10px] text-txt-faint">
        {playing
          ? `${formatDuration(progress * trimmedLength)} / ${formatDuration(trimmedLength)}`
          : formatDuration(trimmedLength)}
      </span>

      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 flex h-6 items-end gap-[2px] px-3 pb-2.5"
        style={{ opacity: playing ? 0.55 : 0.22 }}
      >
        {bars.map((v, i) => (
          <i
            key={i}
            className="flex-1 rounded-[1px]"
            style={{ height: `${Math.max(8, v * 100)}%`, background: accent }}
          />
        ))}
      </span>

      {playing && (
        <span
          className="pointer-events-none absolute bottom-0 left-0 h-[2px]"
          style={{
            width: `${progress * 100}%`,
            background: accent,
            boxShadow: `0 0 12px ${accent}`
          }}
        />
      )}
    </button>
  )
}
