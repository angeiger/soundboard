import { useStore } from '@/state/store'
import { NEON_HEX, formatDuration } from '@/colors'
import { NEON_COLORS, PLAY_MODES } from '@shared/defaults'
import type { PlayMode } from '@shared/types'
import { HotkeyCapture } from './HotkeyCapture'
import { Waveform } from './Waveform'

const PLAY_MODE_HINT: Record<PlayMode, string> = {
  restart: 'Pressing again cuts the current one off and starts over',
  overlap: 'Every press layers another copy on top',
  toggle: 'Press once to play, again to stop'
}

export function PadEditor({ padId }: { padId: string }): React.JSX.Element | null {
  const pad = useStore((s) => s.config.pads.find((p) => p.id === padId))
  const peaks = useStore((s) => (pad ? s.peaks[pad.hash] : undefined))
  const updatePad = useStore((s) => s.updatePad)
  const deletePad = useStore((s) => s.deletePad)
  const triggerPad = useStore((s) => s.triggerPad)
  const normalizePad = useStore((s) => s.normalizePad)
  const setEditingPad = useStore((s) => s.setEditingPad)

  if (!pad) return null
  const accent = NEON_HEX[pad.color]

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-8"
      onClick={() => setEditingPad(null)}
    >
      <div
        className="w-full max-w-[640px] rounded-xl border border-line bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <input
            className="field flex-1 text-[15px] font-medium"
            value={pad.name}
            onChange={(e) => updatePad(pad.id, { name: e.target.value })}
          />
          <input
            className="field w-16 text-center text-[18px]"
            value={pad.glyph}
            maxLength={2}
            placeholder="▶"
            onChange={(e) => updatePad(pad.id, { glyph: e.target.value })}
            title="Emoji shown on the pad"
          />
          <button type="button" className="btn-ghost" onClick={() => setEditingPad(null)}>
            ✕
          </button>
        </div>

        <div className="mb-1.5 flex items-center justify-between">
          <span className="label">Trim</span>
          <span className="font-mono text-[10px] text-txt-faint">
            {formatDuration(pad.trimStart)} → {formatDuration(pad.trimEnd ?? pad.duration)}
            <span className="ml-2 text-txt-dim">
              ({formatDuration((pad.trimEnd ?? pad.duration) - pad.trimStart)})
            </span>
          </span>
        </div>

        <Waveform
          peaks={peaks}
          duration={pad.duration}
          trimStart={pad.trimStart}
          trimEnd={pad.trimEnd}
          accent={accent}
          onChange={(trimStart, trimEnd) => updatePad(pad.id, { trimStart, trimEnd })}
        />

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="label mb-1.5">Hotkey</div>
            <HotkeyCapture
              value={pad.hotkey}
              onChange={(hotkey) => updatePad(pad.id, { hotkey })}
            />
          </div>

          <div>
            <div className="label mb-1.5">Play mode</div>
            <div className="flex gap-1.5">
              {PLAY_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updatePad(pad.id, { playMode: mode })}
                  title={PLAY_MODE_HINT[mode]}
                  className={`flex-1 rounded-lg border px-2 py-2 text-[11.5px] capitalize transition-colors ${
                    pad.playMode === mode
                      ? 'text-[color:var(--c)]'
                      : 'border-line text-txt-dim hover:border-line-hi hover:text-txt'
                  }`}
                  style={
                    pad.playMode === mode
                      ? {
                          ['--c' as string]: accent,
                          borderColor: accent,
                          background: `color-mix(in srgb, ${accent} 8%, transparent)`
                        }
                      : undefined
                  }
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="label mb-1.5">Volume · {Math.round(pad.gain * 100)}%</div>
            <input
              type="range"
              min={0}
              max={200}
              step={1}
              value={Math.round(pad.gain * 100)}
              onChange={(e) => updatePad(pad.id, { gain: Number(e.target.value) / 100 })}
              className="h-[3px] w-full cursor-pointer appearance-none rounded-sm"
              style={{
                background: `linear-gradient(to right, ${accent} ${(pad.gain / 2) * 100}%, #22222E ${(pad.gain / 2) * 100}%)`
              }}
            />
            <button
              type="button"
              className="btn-outline mt-3 w-full"
              onClick={() => void normalizePad(pad.id)}
              title="Measure this clip and set its volume to sit just under a speaking voice"
            >
              Match to voice level
            </button>
          </div>

          <div>
            <div className="label mb-1.5">
              Cooldown · {pad.cooldown === 0 ? 'off' : `${pad.cooldown.toFixed(1)}s`}
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(pad.cooldown * 10)}
              onChange={(e) => updatePad(pad.id, { cooldown: Number(e.target.value) / 10 })}
              className="h-[3px] w-full cursor-pointer appearance-none rounded-sm"
              style={{
                background: `linear-gradient(to right, ${accent} ${pad.cooldown * 10}%, #22222E ${pad.cooldown * 10}%)`
              }}
              title="Minimum gap between triggers, for friendship preservation"
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="label mb-1.5">Colour</div>
          <div className="flex gap-2">
            {NEON_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => updatePad(pad.id, { color: c })}
                className="h-6 w-6 rounded-md border-2 transition-transform hover:scale-110"
                style={{
                  background: NEON_HEX[c],
                  borderColor: pad.color === c ? '#E8E8F0' : 'transparent'
                }}
              />
            ))}
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2.5 text-[12px] text-txt-dim">
          <input
            type="checkbox"
            checked={pad.noMonitor}
            onChange={(e) => updatePad(pad.id, { noMonitor: e.target.checked })}
            className="accent-[var(--neon-cyan)]"
          />
          Don’t play this one to my own headphones
          <span className="text-txt-faint">— useful on Bluetooth, where you hear it late</span>
        </label>

        <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
          <button
            type="button"
            className="rounded-lg border px-3.5 py-1.5 text-[12px] transition-colors"
            style={{
              borderColor: accent,
              color: accent,
              background: `color-mix(in srgb, ${accent} 8%, transparent)`
            }}
            onClick={() => void triggerPad(pad.id)}
          >
            Preview
          </button>
          <button
            type="button"
            className="ml-auto rounded-lg border border-[rgba(255,59,59,.3)] px-3.5 py-1.5 text-[12px] text-[#FF6B6B] transition-colors hover:bg-[rgba(255,59,59,.1)]"
            onClick={() => deletePad(pad.id)}
          >
            Delete pad
          </button>
        </div>
      </div>
    </div>
  )
}
