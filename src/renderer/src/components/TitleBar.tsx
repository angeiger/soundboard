import { useStore } from '@/state/store'
import { cableHealth } from '@/state/health'

const PILL = {
  ok: { color: 'var(--neon-lime)', border: 'rgba(182,255,0,.25)', bg: 'rgba(182,255,0,.06)' },
  warn: { color: 'var(--neon-amber)', border: 'rgba(255,176,32,.25)', bg: 'rgba(255,176,32,.06)' },
  bad: { color: '#FF6B6B', border: 'rgba(255,59,59,.35)', bg: 'rgba(255,59,59,.08)' }
}

export function TitleBar(): React.JSX.Element {
  const config = useStore((s) => s.config)
  const devices = useStore((s) => s.devices)
  const status = useStore((s) => s.audioStatus)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)

  const cable = cableHealth(config, devices, status)
  const [tone, text] =
    cable.state === 'ok'
      ? (['ok', `● routed to ${cable.device?.label.slice(0, 28) ?? 'cable'}`] as const)
      : cable.state === 'unset'
        ? (['warn', '● no output device set'] as const)
        : cable.state === 'missing'
          ? (['bad', '● output disconnected'] as const)
          : (['bad', '● output failed — open Settings'] as const)
  const pill = PILL[tone]

  return (
    <header className="drag-region flex h-10 items-center gap-3 border-b border-line bg-surface px-3.5">
      <span
        className="h-2 w-2 rounded-sm"
        style={{ background: 'var(--neon-cyan)', boxShadow: '0 0 10px var(--neon-cyan)' }}
      />
      <h1 className="text-[12px] font-medium uppercase tracking-[0.14em] text-txt-dim">
        Soundboard
      </h1>

      <span
        className="rounded-full border px-2 py-[3px] font-mono text-[10px] tracking-wide"
        style={{ color: pill.color, borderColor: pill.border, background: pill.bg }}
        title={cable.problem ?? undefined}
      >
        {text}
      </span>

      <div className="no-drag ml-auto flex items-center gap-1">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
        >
          Settings
        </button>
        <button
          type="button"
          className="px-3 py-1 text-txt-faint transition-colors hover:text-txt"
          onClick={() => void window.api.window.minimize()}
          aria-label="Minimise"
        >
          –
        </button>
        <button
          type="button"
          className="px-3 py-1 text-txt-faint transition-colors hover:text-txt"
          onClick={() => void window.api.window.toggleMaximize()}
          aria-label="Maximise"
        >
          ▢
        </button>
        <button
          type="button"
          className="px-3 py-1 text-txt-faint transition-colors hover:text-[#FF6B6B]"
          onClick={() => void window.api.window.close()}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </header>
  )
}
