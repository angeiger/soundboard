import { useStore } from '@/state/store'
import { positionToGain, gainToDisplay, formatGainDb } from '@/audio/volume'

export function BottomBar(): React.JSX.Element {
  const output = useStore((s) => s.config.output)
  const mic = useStore((s) => s.config.mic)
  const master = useStore((s) => s.config.master)
  const devices = useStore((s) => s.devices)
  const setMic = useStore((s) => s.setMic)
  const setMaster = useStore((s) => s.setMaster)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const panic = useStore((s) => s.panic)

  const masterPos = gainToDisplay(master)

  const cable = devices.outputs.find((d) => d.deviceId === output.cableDeviceId)
  const monitor = devices.outputs.find((d) => d.deviceId === output.monitorDeviceId)

  const label = (name: string | undefined, fallback: string): string =>
    name ? (name.length > 22 ? `${name.slice(0, 22)}…` : name) : fallback

  return (
    <div className="-mx-4 mt-auto flex items-center gap-3 border-t border-line px-4 pt-4">
      <button type="button" className="chip" onClick={() => setSettingsOpen(true)}>
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: cable ? 'var(--neon-lime)' : 'var(--neon-amber)',
            boxShadow: `0 0 8px ${cable ? 'var(--neon-lime)' : 'var(--neon-amber)'}`
          }}
        />
        Out&nbsp;<b className="font-medium text-txt">{label(cable?.label, 'not set')}</b>
      </button>

      <button type="button" className="chip" onClick={() => setSettingsOpen(true)}>
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: output.monitorEnabled && monitor ? 'var(--neon-cyan)' : '#4A4A5A',
            boxShadow: output.monitorEnabled && monitor ? '0 0 8px var(--neon-cyan)' : 'none'
          }}
        />
        Monitor&nbsp;
        <b className="font-medium text-txt">
          {output.monitorEnabled ? label(monitor?.label, 'not set') : 'off'}
        </b>
      </button>

      <button
        type="button"
        className="flex items-center gap-2 text-[11.5px] text-txt-dim transition-colors hover:text-txt"
        onClick={() => setMic({ enabled: !mic.enabled })}
        title="Mixes your microphone into the cable so Discord hears both you and the soundboard"
      >
        <span
          className="relative h-[17px] w-[30px] rounded-full border transition-colors"
          style={{
            background: mic.enabled ? 'rgba(0,240,255,.16)' : 'rgba(255,255,255,.04)',
            borderColor: mic.enabled ? 'rgba(0,240,255,.4)' : '#22222E'
          }}
        >
          <span
            className="absolute top-[2px] h-[11px] w-[11px] rounded-full transition-all"
            style={{
              right: mic.enabled ? '2px' : '15px',
              background: mic.enabled ? 'var(--neon-cyan)' : '#4A4A5A',
              boxShadow: mic.enabled ? '0 0 8px var(--neon-cyan)' : 'none'
            }}
          />
        </span>
        Mic passthrough
      </button>

      <div className="ml-auto flex items-center gap-2.5">
        <span className="text-[11.5px] text-txt-dim">Master</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={masterPos}
          onChange={(e) => setMaster(positionToGain(Number(e.target.value) / 100))}
          className="h-[3px] w-[110px] cursor-pointer appearance-none rounded-sm bg-line accent-[var(--neon-cyan)]"
          style={{
            background: `linear-gradient(to right, var(--neon-cyan) ${masterPos}%, #22222E ${masterPos}%)`
          }}
          title={`Master level — ${formatGainDb(master)}`}
        />
        <span
          className="w-12 font-mono text-[11px] tabular-nums text-txt"
          title={`${masterPos} of 100`}
        >
          {formatGainDb(master)}
        </span>
      </div>

      <button
        type="button"
        onClick={panic}
        className="rounded-lg border border-[rgba(255,59,59,.35)] bg-[rgba(255,59,59,.07)] px-3.5 py-1.5 font-mono text-[11.5px] font-medium tracking-wide text-[#FF6B6B] transition-all hover:bg-[rgba(255,59,59,.14)] hover:shadow-[0_0_18px_-6px_var(--neon-red)]"
        title="Stop every playing sound"
      >
        PANIC
      </button>
    </div>
  )
}
