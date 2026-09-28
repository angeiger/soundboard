import { useEffect, useState } from 'react'
import { captureHotkey, formatAccelerator } from '@/state/hotkey'
import { useStore } from '@/state/store'

interface Props {
  value: string | null
  onChange: (accelerator: string | null) => void
}

/**
 * Records a new hotkey. Global bindings are released for the duration, because
 * a combo already held by RegisterHotKey never reaches the renderer's keydown
 * handler -- without this you could never rebind an existing pad.
 */
export function HotkeyCapture({ value, onChange }: Props): React.JSX.Element {
  const [listening, setListening] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const resyncHotkeys = useStore((s) => s.resyncHotkeys)

  useEffect(() => {
    if (!listening) return

    void window.api.hotkeys.suspend()

    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      if (e.code === 'Escape') {
        setListening(false)
        setWarning(null)
        return
      }

      const captured = captureHotkey(e)
      if (!captured) return

      if (!captured.safe) {
        setWarning('Needs a modifier — a bare key would be stolen from every other app')
        return
      }

      onChange(captured.accelerator)
      setListening(false)
      setWarning(null)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      // Whether the user picked a combo or hit Escape, global bindings have to
      // come back. onChange also triggers a sync, but cancelling does not.
      resyncHotkeys()
    }
  }, [listening, onChange, resyncHotkeys])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setListening((v) => !v)}
          className={`flex-1 rounded-lg border px-3 py-2 font-mono text-[12px] transition-colors ${
            listening
              ? 'border-[var(--neon-cyan)] bg-[rgba(0,240,255,.07)] text-[var(--neon-cyan)]'
              : 'border-line bg-bg text-txt hover:border-line-hi'
          }`}
        >
          {listening ? 'Press a combo…  (Esc to cancel)' : formatAccelerator(value) || 'Unbound'}
        </button>

        {value && !listening && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onChange(null)}
            title="Clear hotkey"
          >
            Clear
          </button>
        )}
      </div>

      {warning && <p className="text-[11px] text-[var(--neon-amber)]">{warning}</p>}
    </div>
  )
}
