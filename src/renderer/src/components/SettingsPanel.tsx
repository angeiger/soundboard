import { useStore } from '@/state/store'
import type { AudioDevice } from '@shared/types'

const VB_CABLE_URL = 'https://vb-audio.com/Cable/'

function DevicePicker({
  devices,
  value,
  onChange,
  placeholder
}: {
  devices: AudioDevice[]
  value: string | null
  onChange: (deviceId: string) => void
  placeholder: string
}): React.JSX.Element {
  const selected = devices.find((d) => d.deviceId === value)
  return (
    <div className="flex flex-col gap-1.5">
      <select
        className="field cursor-pointer"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
      </select>

      {selected?.isHandsFree && (
        <p className="text-[11px] text-[var(--neon-amber)]">
          This is the Bluetooth hands-free endpoint — output drops to mono telephone
          quality. Pick the stereo entry instead.
        </p>
      )}
    </div>
  )
}

export function SettingsPanel(): React.JSX.Element {
  const output = useStore((s) => s.config.output)
  const mic = useStore((s) => s.config.mic)
  const devices = useStore((s) => s.devices)
  const setOutput = useStore((s) => s.setOutput)
  const setMic = useStore((s) => s.setMic)
  const bankHotkeys = useStore((s) => s.config.bankHotkeysEnabled)
  const setBankHotkeys = useStore((s) => s.setBankHotkeys)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)

  const hasCable = devices.outputs.some((d) => d.isVirtualCable)
  const micDevice = devices.inputs.find((d) => d.deviceId === mic.deviceId)

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-8"
      onClick={() => setSettingsOpen(false)}
    >
      <div
        className="max-h-full w-full max-w-[560px] overflow-y-auto rounded-xl border border-line bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center">
          <h2 className="text-[15px] font-medium">Settings</h2>
          <button
            type="button"
            className="btn-ghost ml-auto"
            onClick={() => setSettingsOpen(false)}
          >
            ✕
          </button>
        </div>

        {!hasCable && (
          <div className="mb-5 rounded-lg border border-[rgba(255,176,32,.3)] bg-[rgba(255,176,32,.06)] p-3.5">
            <p className="text-[12.5px] text-[var(--neon-amber)]">
              No virtual audio cable found.
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-txt-dim">
              Discord can only transmit what arrives on a microphone input, so the
              soundboard needs a virtual cable to pose as one. Install VB-CABLE, reboot,
              then set Discord’s input device to “CABLE Output”.
            </p>
            <button
              type="button"
              className="mt-2.5 text-[12px] text-[var(--neon-cyan)] underline underline-offset-2"
              onClick={() => void window.api.shell.openExternal(VB_CABLE_URL)}
            >
              Download VB-CABLE
            </button>
          </div>
        )}

        <section className="mb-5">
          <div className="label mb-2">Output to Discord</div>
          <DevicePicker
            devices={devices.outputs}
            value={output.cableDeviceId}
            onChange={(cableDeviceId) => setOutput({ cableDeviceId })}
            placeholder="Choose your virtual cable…"
          />
          <p className="mt-1.5 text-[11px] text-txt-faint">
            Set Discord’s input device to the matching “CABLE Output” recording device.
          </p>
        </section>

        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Monitor (your headphones)</span>
            <label className="flex items-center gap-2 text-[11.5px] text-txt-dim">
              <input
                type="checkbox"
                checked={output.monitorEnabled}
                onChange={(e) => setOutput({ monitorEnabled: e.target.checked })}
                className="accent-[var(--neon-cyan)]"
              />
              Enabled
            </label>
          </div>
          <DevicePicker
            devices={devices.outputs}
            value={output.monitorDeviceId}
            onChange={(monitorDeviceId) => setOutput({ monitorDeviceId })}
            placeholder="Choose your headphones…"
          />
          <div className="mt-2.5">
            <div className="label mb-1.5">
              Monitor volume · {Math.round(output.monitorGain * 100)}%
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(output.monitorGain * 100)}
              onChange={(e) => setOutput({ monitorGain: Number(e.target.value) / 100 })}
              className="h-[3px] w-full cursor-pointer appearance-none rounded-sm"
              style={{
                background: `linear-gradient(to right, var(--neon-cyan) ${output.monitorGain * 100}%, #22222E ${output.monitorGain * 100}%)`
              }}
            />
            <p className="mt-1.5 text-[11px] text-txt-faint">
              On Bluetooth your own monitor lags 150–250 ms behind what your friends
              hear. Keeping it quiet makes that much less distracting.
            </p>
          </div>
        </section>

        <section className="mb-5 border-t border-line pt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Hotkeys</span>
            <label className="flex items-center gap-2 text-[11.5px] text-txt-dim">
              <input
                type="checkbox"
                checked={bankHotkeys}
                onChange={(e) => setBankHotkeys(e.target.checked)}
                className="accent-[var(--neon-cyan)]"
              />
              Switch banks with Ctrl+Alt+1-9
            </label>
          </div>
          <p className="text-[11px] leading-relaxed text-txt-faint">
            A global hotkey is taken away from every other application while
            Soundboard runs, so this stays off unless you actually use several banks.
            Pads themselves default to Ctrl+Alt+Numpad, which nothing else uses.
          </p>
        </section>

        <section className="mb-5 border-t border-line pt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Microphone</span>
            <label className="flex items-center gap-2 text-[11.5px] text-txt-dim">
              <input
                type="checkbox"
                checked={mic.enabled}
                onChange={(e) => setMic({ enabled: e.target.checked })}
                className="accent-[var(--neon-cyan)]"
              />
              Mix into cable
            </label>
          </div>

          <DevicePicker
            devices={devices.inputs}
            value={mic.deviceId}
            onChange={(deviceId) => setMic({ deviceId })}
            placeholder="Choose your microphone…"
          />

          {micDevice?.isHandsFree && (
            <p className="mt-1.5 text-[11px] text-[var(--neon-amber)]">
              Using a Bluetooth headset mic forces the headset into hands-free mode, which
              drops everything you hear to mono telephone quality. A separate wired or USB
              mic keeps the headset in stereo.
            </p>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-txt-faint">
            Discord’s own noise suppression, echo cancellation and auto gain must be
            turned off — they cannot tell your voice from a sound effect and will eat the
            clips. The cleanup below runs on the mic branch only, before mixing, so your
            sounds pass through untouched.
          </p>

          <div className="mt-3 flex flex-col gap-2.5">
            <label className="flex items-center gap-2.5 text-[12px] text-txt-dim">
              <input
                type="checkbox"
                checked={mic.gateEnabled}
                onChange={(e) => setMic({ gateEnabled: e.target.checked })}
                className="accent-[var(--neon-cyan)]"
              />
              Noise gate
              <span className="ml-auto font-mono text-[11px] text-txt-faint">
                {mic.gateThreshold} dB
              </span>
            </label>
            <input
              type="range"
              min={-80}
              max={-10}
              value={mic.gateThreshold}
              disabled={!mic.gateEnabled}
              onChange={(e) => setMic({ gateThreshold: Number(e.target.value) })}
              className="h-[3px] w-full cursor-pointer appearance-none rounded-sm disabled:opacity-40"
              style={{
                background: `linear-gradient(to right, var(--neon-cyan) ${((mic.gateThreshold + 80) / 70) * 100}%, #22222E ${((mic.gateThreshold + 80) / 70) * 100}%)`
              }}
            />

            <label className="flex items-center gap-2.5 text-[12px] text-txt-dim">
              <input
                type="checkbox"
                checked={mic.compressorEnabled}
                onChange={(e) => setMic({ compressorEnabled: e.target.checked })}
                className="accent-[var(--neon-cyan)]"
              />
              Compressor
            </label>

            <label className="flex items-center gap-2.5 text-[12px] text-txt-dim">
              <input
                type="checkbox"
                checked={mic.duckEnabled}
                onChange={(e) => setMic({ duckEnabled: e.target.checked })}
                className="accent-[var(--neon-cyan)]"
              />
              Duck my mic while a sound plays
              <span className="ml-auto font-mono text-[11px] text-txt-faint">
                −{mic.duckAmount} dB
              </span>
            </label>
          </div>
        </section>
      </div>
    </div>
  )
}
