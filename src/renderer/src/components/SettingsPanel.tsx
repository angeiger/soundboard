import { useStore } from '@/state/store'
import { positionToGain, gainToDisplay, formatGainDb } from '@/audio/volume'
import { cableHealth, monitorHealth, micHealth, type Health } from '@/state/health'
import { DevicePicker } from './DevicePicker'

const VB_CABLE_URL = 'https://vb-audio.com/Cable/'

/** Only a real failure is worth a red line under the picker; unset has its own placeholder. */
const problemOf = (h: Health): string | null =>
  h.state === 'failed' || h.state === 'missing' ? h.problem : null

/**
 * Version and update status. Without a version on screen anywhere there was
 * no way to tell which of four hand-copied builds someone was running.
 */
function AboutSection(): React.JSX.Element {
  const version = useStore((s) => s.appVersion)
  const update = useStore((s) => s.update)
  const checkForUpdates = useStore((s) => s.checkForUpdates)
  const installUpdate = useStore((s) => s.installUpdate)

  const line = ((): { text: string; tone: string } => {
    switch (update.state) {
      case 'unsupported':
        return { text: 'Updates only work in the installed app.', tone: 'text-txt-faint' }
      case 'idle':
        return { text: 'Checks for updates shortly after it starts.', tone: 'text-txt-faint' }
      case 'checking':
        return { text: 'Checking for updates…', tone: 'text-txt-dim' }
      case 'up-to-date': {
        const at = new Date(update.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        return { text: `Up to date · checked ${at}`, tone: 'text-[var(--neon-lime)]' }
      }
      case 'downloading':
        return {
          text: `Downloading ${update.version} · ${Math.floor(update.percent)}%`,
          tone: 'text-[var(--neon-cyan)]'
        }
      case 'downloaded':
        return { text: `${update.version} is downloaded and ready.`, tone: 'text-[var(--neon-lime)]' }
      case 'error':
        return { text: update.message, tone: 'text-[var(--neon-amber)]' }
    }
  })()

  const busy = update.state === 'checking' || update.state === 'downloading'

  return (
    <section className="border-t border-line pt-5">
      <div className="label mb-2">About</div>
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-txt">Soundboard {version}</p>
          <p className={`mt-0.5 text-[11.5px] ${line.tone}`}>{line.text}</p>
          {update.state === 'error' && (
            <p className="mt-0.5 break-all font-mono text-[10.5px] text-txt-faint">{update.detail}</p>
          )}
        </div>
        {update.state === 'downloaded' ? (
          <button
            type="button"
            className="ml-auto shrink-0 rounded-lg border border-[rgba(182,255,0,.4)] bg-[rgba(182,255,0,.08)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--neon-lime)] transition-colors hover:bg-[rgba(182,255,0,.15)]"
            onClick={() => void installUpdate()}
          >
            Restart to update
          </button>
        ) : (
          <button
            type="button"
            className="btn-outline ml-auto shrink-0 px-3"
            disabled={busy || update.state === 'unsupported'}
            onClick={() => void checkForUpdates()}
          >
            Check for updates
          </button>
        )}
      </div>
      {update.state === 'downloading' && (
        <div className="mt-2.5 h-[3px] overflow-hidden rounded-sm bg-line">
          <div
            className="h-full bg-[var(--neon-cyan)] transition-[width] duration-300"
            style={{ width: `${update.percent}%` }}
          />
        </div>
      )}
    </section>
  )
}

export function SettingsPanel(): React.JSX.Element {
  const config = useStore((s) => s.config)
  const output = config.output
  const mic = config.mic
  const devices = useStore((s) => s.devices)
  const status = useStore((s) => s.audioStatus)
  const setOutput = useStore((s) => s.setOutput)
  const setMic = useStore((s) => s.setMic)
  const bankHotkeys = config.bankHotkeysEnabled
  const setBankHotkeys = useStore((s) => s.setBankHotkeys)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const openSetup = useStore((s) => s.openSetup)

  const hasCable = devices.outputs.some((d) => d.isVirtualCable)
  const gateAvailable = status?.gateAvailable ?? true
  const denoiseAvailable = status?.denoiseAvailable ?? true

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

        <section className="mb-5 flex items-center gap-3 rounded-lg border border-line bg-bg px-3.5 py-2.5">
          <p className="text-[12px] leading-relaxed text-txt-dim">
            New headset, reinstalled VB-CABLE, or friends cannot hear you?
          </p>
          <button type="button" className="btn-outline ml-auto shrink-0 px-3" onClick={openSetup}>
            Run setup again
          </button>
        </section>

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
            label="Output to Discord"
            devices={devices.outputs}
            value={output.cableDeviceId}
            onChange={(cableDeviceId) => setOutput({ cableDeviceId })}
            placeholder="Choose your virtual cable…"
            problem={problemOf(cableHealth(config, devices, status))}
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
            label="Monitor (your headphones)"
            devices={devices.outputs}
            value={output.monitorDeviceId}
            onChange={(monitorDeviceId) => setOutput({ monitorDeviceId })}
            placeholder="Choose your headphones…"
            problem={problemOf(monitorHealth(config, devices, status))}
          />
          <div className="mt-2.5">
            <div className="label mb-1.5">
              Monitor volume · {formatGainDb(output.monitorGain)}
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={gainToDisplay(output.monitorGain)}
              onChange={(e) =>
                setOutput({ monitorGain: positionToGain(Number(e.target.value) / 100) })
              }
              className="h-[3px] w-full cursor-pointer appearance-none rounded-sm"
              style={{
                background: `linear-gradient(to right, var(--neon-cyan) ${gainToDisplay(output.monitorGain)}%, #22222E ${gainToDisplay(output.monitorGain)}%)`
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
            These fire from anywhere, including inside a game and while you type —
            and on a German keyboard, Ctrl+Alt+7, 8 and 9 are how you type{' '}
            {'{ [ ]'}. So this stays off unless you actually use several banks. Pads
            themselves default to Ctrl+Alt+Numpad, which nothing else uses.
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
            label="Microphone"
            devices={devices.inputs}
            value={mic.deviceId}
            onChange={(deviceId) => setMic({ deviceId })}
            placeholder="Choose your microphone…"
            problem={problemOf(micHealth(config, devices, status))}
          />

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
                checked={mic.gateEnabled && gateAvailable}
                disabled={!gateAvailable}
                onChange={(e) => setMic({ gateEnabled: e.target.checked })}
                className="accent-[var(--neon-cyan)]"
              />
              Noise gate
              {!gateAvailable && (
                <span className="text-[11px] text-[#FF6B6B]">failed to load — restart Soundboard</span>
              )}
              <span className="ml-auto font-mono text-[11px] text-txt-faint">
                {mic.gateThreshold} dB
              </span>
            </label>
            <input
              type="range"
              min={-80}
              max={-10}
              aria-label="Noise gate threshold"
              value={mic.gateThreshold}
              disabled={!mic.gateEnabled || !gateAvailable}
              onChange={(e) => setMic({ gateThreshold: Number(e.target.value) })}
              className="h-[3px] w-full cursor-pointer appearance-none rounded-sm disabled:opacity-40"
              style={{
                background: `linear-gradient(to right, var(--neon-cyan) ${((mic.gateThreshold + 80) / 70) * 100}%, #22222E ${((mic.gateThreshold + 80) / 70) * 100}%)`
              }}
            />

            <div>
              <label className="flex items-center gap-2.5 text-[12px] text-txt-dim">
                <input
                  type="checkbox"
                  checked={mic.denoiseEnabled && denoiseAvailable}
                  disabled={!denoiseAvailable}
                  onChange={(e) => setMic({ denoiseEnabled: e.target.checked })}
                  className="accent-[var(--neon-cyan)]"
                />
                Noise removal
                {!denoiseAvailable && (
                  <span className="text-[11px] text-[#FF6B6B]" title={status?.denoiseError ?? undefined}>
                    failed to load — your mic works without it
                  </span>
                )}
              </label>
              <p className="ml-[26px] mt-0.5 text-[11px] leading-relaxed text-txt-faint">
                Takes out steady background noise — a fan, hum, a noisy room — even while you
                talk, which the gate cannot. Adds about 30 ms to your voice.
              </p>
            </div>

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

        <AboutSection />
      </div>
    </div>
  )
}
