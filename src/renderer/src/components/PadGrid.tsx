import { useState } from 'react'
import { useStore } from '@/state/store'
import { Pad } from './Pad'

export function PadGrid(): React.JSX.Element {
  const pads = useStore((s) => s.config.pads)
  const activeBankId = useStore((s) => s.activeBankId)
  const search = useStore((s) => s.searchQuery)
  const peaks = useStore((s) => s.peaks)
  const playing = useStore((s) => s.playing)
  const triggerPad = useStore((s) => s.triggerPad)
  const stopPad = useStore((s) => s.stopPad)
  const setEditingPad = useStore((s) => s.setEditingPad)
  const addPads = useStore((s) => s.addPads)

  const [dragging, setDragging] = useState(false)
  const brokenPads = useStore((s) => s.brokenPads)
  /** Files a drop or pick could not turn into pads, and why. */
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([])

  const add = async (paths: string[]): Promise<void> => {
    const result = await addPads(paths)
    setSkipped(result.skipped)
  }

  const query = search.trim().toLowerCase()
  const visible = pads
    .filter((p) => (query ? p.name.toLowerCase().includes(query) : p.bankId === activeBankId))
    .sort((a, b) => a.index - b.index)

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    // Electron exposes the real filesystem path on the File object, which is
    // what the main process needs to copy the audio into the library.
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.api.pathForFile(f))
      .filter((p): p is string => Boolean(p))
    if (paths.length > 0) void add(paths)
  }

  const pick = async (): Promise<void> => {
    const files = await window.api.library.pickFiles()
    if (files.length > 0) await add(files)
  }

  return (
    <div
      className="flex-1 overflow-y-auto"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {visible.map((pad) => (
          <Pad
            key={pad.id}
            pad={pad}
            peaks={peaks[pad.hash]}
            playing={playing.has(pad.id)}
            broken={brokenPads[pad.id]}
            onTrigger={() => void triggerPad(pad.id)}
            onEdit={() => setEditingPad(pad.id)}
            onStop={() => stopPad(pad.id)}
          />
        ))}

        <button
          type="button"
          onClick={() => void pick()}
          className={`flex h-28 items-center justify-center rounded-xl border border-dashed text-[11px] transition-colors ${
            dragging
              ? 'border-[var(--neon-cyan)] bg-[rgba(0,240,255,.05)] text-[var(--neon-cyan)]'
              : 'border-line text-txt-faint hover:border-line-hi hover:text-txt-dim'
          }`}
        >
          {dragging ? 'Release to add' : 'Drop audio here'}
        </button>
      </div>

      {skipped.length > 0 && (
        <div
          role="status"
          className="mt-3 flex items-start gap-3 rounded-lg border border-[rgba(255,176,32,.3)] bg-[rgba(255,176,32,.06)] px-3.5 py-2.5"
        >
          <div className="min-w-0 text-[12px] leading-relaxed text-[var(--neon-amber)]">
            {skipped.length === 1 ? 'One file was' : `${skipped.length} files were`} not added:
            <ul className="mt-0.5 text-txt-dim">
              {skipped.map((s) => (
                <li key={s.name} className="truncate">
                  <span className="text-txt">{s.name}</span> — {s.reason}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            className="btn-ghost ml-auto shrink-0"
            aria-label="Dismiss"
            onClick={() => setSkipped([])}
          >
            ✕
          </button>
        </div>
      )}

      {visible.length === 0 && query && (
        <p className="mt-8 text-center text-[13px] text-txt-faint">
          Nothing matches “{search}”
        </p>
      )}
    </div>
  )
}
