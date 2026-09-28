import { useStore } from '@/state/store'

export function TitleBar(): React.JSX.Element {
  const output = useStore((s) => s.config.output)
  const devices = useStore((s) => s.devices)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)

  const cable = devices.outputs.find((d) => d.deviceId === output.cableDeviceId)
  const routed = Boolean(cable)

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
        style={{
          color: routed ? 'var(--neon-lime)' : 'var(--neon-amber)',
          borderColor: routed ? 'rgba(182,255,0,.25)' : 'rgba(255,176,32,.25)',
          background: routed ? 'rgba(182,255,0,.06)' : 'rgba(255,176,32,.06)'
        }}
      >
        {routed ? `● routed to ${cable?.label.slice(0, 28)}` : '● no output device set'}
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
