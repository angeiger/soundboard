import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/state/store'
import { engine } from '@/audio/engine'
import { guessCableDevice, recordingEndOf, baseLabel } from '@/audio/devices'
import { openLoopbackProbe, type LoopbackProbe } from '@/audio/loopback'
import { cableHealth, monitorHealth, micHealth, type Health } from '@/state/health'
import type { Level } from '@/audio/target'
import type { AudioDevice } from '@shared/types'
import { DevicePicker } from './DevicePicker'
import { Meter } from './Meter'

const VB_CABLE_URL = 'https://vb-audio.com/Cable/'

/** Quieter than -60 dBFS at the cable counts as nothing arriving. */
const SIGNAL_FLOOR = Math.pow(10, -60 / 20)

const STEPS = ['Virtual cable', 'Output', 'Headphones', 'Microphone', 'Test', 'Discord'] as const

/**
 * Discord's labels in English and German. The German ones come from German
 * Discord guides, not a German client -- if one does not match, the English
 * next to it and the explanation say what to look for.
 */
const DISCORD_ITEMS = [
  {
    en: 'Input Device',
    de: 'Eingabegerät',
    value: (recordingEnd: string): string => recordingEnd,
    why: 'Output, not Input — Discord listens at the far end of the cable.'
  },
  {
    en: 'Noise Suppression',
    de: 'Rauschunterdrückung',
    value: (): string => 'None (Keine)',
    why: 'Krisp is trained to delete exactly the kind of sound a soundboard plays. “Standard” is not off.'
  },
  {
    en: 'Echo Cancellation',
    de: 'Echounterdrückung',
    value: (): string => 'Off',
    why: 'It hears your sounds in both your speakers and your mic, decides they are echo, and cancels them.'
  },
  {
    en: 'Automatic Gain Control',
    de: 'Automatische Verstärkungsregelung',
    value: (): string => 'Off',
    why: 'It rides your volume up and down around every clip.'
  },
  {
    en: 'Advanced Voice Activity',
    de: 'Erweiterte Sprachaktivität',
    value: (): string => 'Off, if your Discord has it',
    why: 'It is trained to pass speech, so it can cut clips off mid-sound.'
  }
] as const

const sameDevice = (a: AudioDevice | null, b: AudioDevice | null): boolean =>
  Boolean(a && b && baseLabel(a) === baseLabel(b))

function Tick({ ok, children }: { ok: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <li className="flex items-start gap-2.5 text-[12.5px]">
      <span
        className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]"
        style={{
          borderColor: ok ? 'var(--neon-lime)' : '#2E2E3D',
          color: ok ? 'var(--neon-lime)' : 'transparent',
          background: ok ? 'rgba(182,255,0,.08)' : 'transparent'
        }}
        aria-hidden
      >
        ✓
      </span>
      <span className={ok ? 'text-txt' : 'text-txt-dim'}>{children}</span>
      <span className="sr-only">{ok ? '(done)' : '(not yet)'}</span>
    </li>
  )
}

function Note({
  tone,
  children
}: {
  tone: 'warn' | 'error' | 'ok' | 'info'
  children: React.ReactNode
}): React.JSX.Element {
  const styles = {
    warn: 'border-[rgba(255,176,32,.3)] bg-[rgba(255,176,32,.06)] text-[var(--neon-amber)]',
    error: 'border-[rgba(255,59,59,.35)] bg-[rgba(255,59,59,.07)] text-[#FF6B6B]',
    ok: 'border-[rgba(182,255,0,.25)] bg-[rgba(182,255,0,.05)] text-[var(--neon-lime)]',
    info: 'border-line bg-bg text-txt-dim'
  }[tone]
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 text-[12px] leading-relaxed ${styles}`}>
      {children}
    </div>
  )
}

function StepCable({
  hasCable,
  cable,
  labelsAvailable,
  justInstalled
}: {
  hasCable: boolean
  cable: AudioDevice | null
  labelsAvailable: boolean
  justInstalled: boolean
}): React.JSX.Element {
  if (!labelsAvailable) {
    return (
      <Note tone="error">
        Windows is hiding your audio device names from Soundboard, so it cannot tell whether
        the cable is installed. Open Windows Settings → Privacy &amp; security → Microphone,
        turn on “Let desktop apps access your microphone”, then restart Soundboard.
      </Note>
    )
  }

  if (hasCable) {
    return (
      <div className="flex flex-col gap-3">
        <Note tone="ok">Found: {cable ? baseLabel(cable) : 'a virtual cable'}</Note>
        {justInstalled && (
          <Note tone="warn">
            Installed it just now? Restart Windows before you carry on. The cable shows up
            straight away but behaves erratically until Windows restarts.
          </Note>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 text-[12.5px] leading-relaxed text-txt-dim">
      <p>
        Discord only transmits what arrives on a microphone input. A virtual cable lets
        Soundboard pose as one: Soundboard plays into <b className="text-txt">CABLE Input</b>,
        and Discord listens at the other end, <b className="text-txt">CABLE Output</b>.
        VB-CABLE is free and takes a minute.
      </p>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5">
        <li>
          <button
            type="button"
            className="text-[var(--neon-cyan)] underline underline-offset-2"
            onClick={() => void window.api.shell.openExternal(VB_CABLE_URL)}
          >
            Download VB-CABLE
          </button>{' '}
          and extract the zip.
        </li>
        <li>
          Right-click <span className="font-mono text-[11.5px] text-txt">VBCABLE_Setup_x64.exe</span>{' '}
          → <b className="text-txt">Run as administrator</b> → <b className="text-txt">Install Driver</b>.
        </li>
        <li>
          <b className="text-txt">Restart Windows.</b> This is required — the cable misbehaves until
          you do.
        </li>
      </ol>
      <Note tone="info">
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-amber)]" />
          Waiting for the cable… This step ticks itself off as soon as Windows reports it; you do
          not need to restart Soundboard.
        </span>
      </Note>
    </div>
  )
}

function StepTest({
  cable,
  recordingEnd,
  micLive,
  gateDb,
  master,
  toneReached,
  onToneResult,
  onUnmute
}: {
  cable: Health
  recordingEnd: AudioDevice | null
  micLive: boolean
  gateDb: number | null
  master: number
  toneReached: boolean
  /** Reports each run's verdict: true as soon as it arrives, false if it never did. */
  onToneResult: (reached: boolean) => void
  onUnmute: () => void
}): React.JSX.Element {
  const [playing, setPlaying] = useState(false)
  const [arrived, setArrived] = useState(false)
  const [voiceReached, setVoiceReached] = useState(false)
  /** Set when a tone finished without anything reaching the cable. */
  const [silentRun, setSilentRun] = useState(false)
  /** Set when a tone reached the cable but never came out of its far end. */
  const [lostInCable, setLostInCable] = useState(false)
  const [probeState, setProbeState] = useState<'none' | 'listening' | 'failed'>('none')
  const probeRef = useRef<LoopbackProbe | null>(null)
  const recordingEndId = recordingEnd?.deviceId ?? null

  // The interval below outlives renders, so it reads these through a ref.
  // Each run of the tone gets its own verdict: an earlier success must not
  // hide a later failure after the output was changed.
  const run = useRef({ playing: false, reached: false, arrived: false, onToneResult })
  run.current.onToneResult = onToneResult

  // Listen at the far end of the cable for as long as this step is open.
  useEffect(() => {
    if (!recordingEndId) return
    let cancelled = false
    openLoopbackProbe(recordingEndId).then(
      (probe) => {
        if (cancelled) return probe.close()
        probeRef.current = probe
        setProbeState('listening')
      },
      () => {
        if (!cancelled) setProbeState('failed')
      }
    )
    return () => {
      cancelled = true
      probeRef.current?.close()
      probeRef.current = null
      setProbeState('none')
    }
  }, [recordingEndId])

  // Never leave the tone running behind a closed step.
  useEffect(() => () => engine.stopTestTone(), [])

  // Detection runs apart from the meters and only sets state on a change.
  // Verdicts are reached when a tone *ends*, never while one is starting up,
  // so nothing flashes "failed" in the moment after Play is clicked.
  useEffect(() => {
    const gate = gateDb === null ? SIGNAL_FLOOR : Math.pow(10, gateDb / 20)
    const timer = setInterval(() => {
      const r = run.current
      const tone = engine.isTestTonePlaying()
      const levels = engine.levels()
      const loop = probeRef.current?.level()

      if (tone && !r.playing) {
        r.reached = false
        r.arrived = false
        setArrived(false)
        setSilentRun(false)
        setLostInCable(false)
      }
      if (tone && levels && levels.cable.rms > SIGNAL_FLOOR && !r.reached) {
        r.reached = true
        r.onToneResult(true)
      }
      if (tone && loop && loop.rms > SIGNAL_FLOOR && !r.arrived) {
        r.arrived = true
        setArrived(true)
      }
      if (!tone && levels?.mic && levels.mic.rms > gate && levels.cable.rms > SIGNAL_FLOOR) {
        setVoiceReached(true)
      }
      if (!tone && r.playing) {
        if (!r.reached) r.onToneResult(false)
        setSilentRun(!r.reached)
        setLostInCable(r.reached && Boolean(probeRef.current) && !r.arrived)
      }
      r.playing = tone
      setPlaying(tone)
    }, 50)
    return () => clearInterval(timer)
  }, [gateDb])

  const play = (): void => {
    if (engine.isTestTonePlaying()) engine.stopTestTone()
    else void engine.playTestTone()
  }

  const readCable = (): Level | null => engine.levels()?.cable ?? null
  const readMic = (): Level | null => engine.levels()?.mic ?? null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] leading-relaxed text-txt-dim">
        Play the test tone and watch it arrive at the cable — the same path your pads take. Then
        say something, to check your voice gets through too.
      </p>

      <div>
        <button
          type="button"
          onClick={play}
          className="rounded-lg border border-[rgba(0,240,255,.4)] bg-[rgba(0,240,255,.07)] px-4 py-2 text-[12.5px] font-medium text-[var(--neon-cyan)] transition-colors hover:bg-[rgba(0,240,255,.13)]"
        >
          {playing ? '■  Stop' : '▶  Play test tone'}
        </button>
      </div>

      <Meter label="Sent to Discord" read={readCable} />
      {micLive && (
        <Meter
          label="Your microphone"
          read={readMic}
          marker={gateDb ?? undefined}
          markerLabel={gateDb !== null ? `gate opens at ${gateDb} dB` : undefined}
        />
      )}

      <ul className="flex flex-col gap-2">
        <Tick ok={toneReached}>Test tone reached the cable</Tick>
        {recordingEnd && probeState !== 'failed' && (
          <Tick ok={arrived}>
            Arriving at {baseLabel(recordingEnd)}, where Discord listens
          </Tick>
        )}
        {micLive && <Tick ok={voiceReached}>Your voice reaches the cable</Tick>}
      </ul>

      {lostInCable && recordingEnd && !playing && (
        <Note tone="warn">
          The tone reached Soundboard’s output but never came out of {baseLabel(recordingEnd)}.
          Go back to the Output step and make sure it is set to the cable’s Input end.
        </Note>
      )}

      {silentRun && !playing && (
        <Note tone="error">
          Nothing reached the cable.{' '}
          {master <= 0.001 ? (
            <>
              The master volume is at zero.{' '}
              <button type="button" className="underline underline-offset-2" onClick={onUnmute}>
                Turn it up
              </button>
            </>
          ) : cable.problem ? (
            cable.problem
          ) : (
            'Go back to the Output step and check the device.'
          )}
        </Note>
      )}

      {micLive && gateDb !== null && !voiceReached && toneReached && (
        <p className="text-[11px] leading-relaxed text-txt-faint">
          Talking but the voice tick stays empty? Your voice has to cross the amber gate line on
          the microphone meter. Lower the gate in Settings if you speak quietly.
        </p>
      )}
    </div>
  )
}

export function SetupWizard(): React.JSX.Element {
  const config = useStore((s) => s.config)
  const devices = useStore((s) => s.devices)
  const status = useStore((s) => s.audioStatus)
  const setOutput = useStore((s) => s.setOutput)
  const setMic = useStore((s) => s.setMic)
  const setMaster = useStore((s) => s.setMaster)
  const refreshDevices = useStore((s) => s.refreshDevices)
  const closeSetup = useStore((s) => s.closeSetup)
  const completeSetup = useStore((s) => s.completeSetup)

  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0)
  const [toneReached, setToneReached] = useState(false)
  const [checks, setChecks] = useState<boolean[]>(() => DISCORD_ITEMS.map(() => false))
  const sawNoCable = useRef(false)
  const recordToneResult = useCallback((reached: boolean) => setToneReached(reached), [])

  const hasCable = devices.outputs.some((d) => d.isVirtualCable)
  const guess = guessCableDevice(devices.outputs)
  const cable = cableHealth(config, devices, status)
  const monitor = monitorHealth(config, devices, status)
  const mic = micHealth(config, devices, status)
  const recordingEnd = cable.device ? recordingEndOf(cable.device, devices.inputs) : null

  const windowsDefault = devices.outputs.find((d) => d.deviceId === 'default') ?? null
  const defaultIsCable = Boolean(windowsDefault?.isVirtualCable)
  const monitorIsCable = monitor.state !== 'off' && sameDevice(monitor.device, cable.device)
  const micIsLoop = mic.state !== 'off' && sameDevice(mic.device, recordingEnd)
  const micLive = config.mic.enabled && status?.mic.state === 'live'

  if (devices.loaded && !hasCable) sawNoCable.current = true

  const done = [
    hasCable,
    cable.state === 'ok',
    monitor.state === 'off' || (monitor.state === 'ok' && !monitorIsCable),
    mic.state === 'off' || (mic.state === 'ok' && !micIsLoop && (status === null || micLive)),
    toneReached,
    checks.every(Boolean)
  ]
  const firstUnfinished = done.findIndex((d) => !d)

  // Step 1 must tick itself off when the driver lands. devicechange is the
  // real signal; this poll is the fallback for drivers that do not fire it.
  useEffect(() => {
    if (step !== 0 || hasCable) return
    const timer = setInterval(() => void refreshDevices(), 2000)
    return () => clearInterval(timer)
  }, [step, hasCable, refreshDevices])

  // Sensible starting choices, made once, and never over something picked.
  useEffect(() => {
    if (step === 1 && !config.output.cableDeviceId && guess) {
      setOutput({ cableDeviceId: guess.deviceId })
    }
    if (step === 2 && !config.output.monitorDeviceId && windowsDefault) {
      setOutput({ monitorDeviceId: 'default' })
    }
    if (step === 3 && !config.mic.deviceId && devices.inputs.some((d) => d.deviceId === 'default')) {
      setMic({ deviceId: 'default' })
    }
    // Only on arriving at a step: re-running on every change would fight the
    // user's own choice.
  }, [step])

  const go = (to: number): void => {
    setStep(to)
    setReached((r) => Math.max(r, to))
  }

  const outputs = devices.outputs
  const inputs = devices.inputs
  const title = [
    'Install the virtual cable',
    'Send your sounds into the cable',
    'Hear your sounds yourself',
    'Mix in your microphone',
    'Check it reaches the cable',
    'Point Discord at the cable'
  ][step]

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-title"
    >
      <div className="flex max-h-full w-full max-w-[640px] flex-col rounded-xl border border-line bg-surface">
        <div className="flex items-center gap-3 border-b border-line px-5 pb-3 pt-4">
          <div>
            <div className="label">Setup · step {step + 1} of {STEPS.length}</div>
            <h2 id="setup-title" className="mt-1 text-[16px] font-medium">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="btn-ghost ml-auto"
            onClick={() => {
              engine.stopTestTone()
              closeSetup()
            }}
            title="Close for now. Setup opens again next time you start Soundboard, and from Settings."
          >
            Set up later
          </button>
        </div>

        <ol className="flex gap-1 px-5 pt-3" aria-label="Setup steps">
          {STEPS.map((name, i) => {
            const current = i === step
            const reachable = i <= reached
            const needsAttention = done[i] === false && i < reached && !current
            return (
              <li key={name} className="flex-1">
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => go(i)}
                  aria-current={current ? 'step' : undefined}
                  className="flex w-full flex-col gap-1.5 text-left disabled:cursor-default"
                >
                  <span
                    className="h-[3px] w-full rounded-full"
                    style={{
                      background: current
                        ? 'var(--neon-cyan)'
                        : needsAttention
                          ? 'var(--neon-amber)'
                          : done[i] && reachable
                            ? 'rgba(182,255,0,.6)'
                            : '#22222E',
                      boxShadow: current ? '0 0 10px var(--neon-cyan)' : 'none'
                    }}
                  />
                  <span
                    className={`text-[10.5px] font-medium ${
                      current ? 'text-[var(--neon-cyan)]' : reachable ? 'text-txt-dim' : 'text-txt-faint'
                    }`}
                  >
                    {needsAttention ? '! ' : done[i] && reachable && !current ? '✓ ' : ''}
                    {name}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        {/* A floor on the height keeps the card from jumping between steps. */}
        <div className="min-h-[260px] flex-1 overflow-y-auto px-5 py-4">
          {step === 0 && (
            <StepCable
              hasCable={hasCable}
              cable={guess}
              labelsAvailable={devices.labelsAvailable}
              justInstalled={hasCable && sawNoCable.current}
            />
          )}

          {step === 1 && (
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] leading-relaxed text-txt-dim">
                Pick the cable’s <b className="text-txt">Input</b> end — the playback side. Discord
                will listen at the other end, CABLE Output.
              </p>
              <DevicePicker
                label="Output to Discord"
                devices={outputs}
                value={config.output.cableDeviceId}
                onChange={(cableDeviceId) => setOutput({ cableDeviceId })}
                placeholder="Choose your virtual cable…"
                problem={cable.state === 'failed' || cable.state === 'missing' ? cable.problem : null}
              />
              {cable.device && !cable.device.isVirtualCable && (
                <Note tone="warn">
                  Discord cannot hear this device — it is not a virtual cable, and your own voice
                  would play out of it. Pick the cable unless you know you are using a different
                  one.
                </Note>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] leading-relaxed text-txt-dim">
                Your sounds also play to your own headphones, so you hear what your friends hear.
                Your voice never does — hearing yourself a split second late is unbearable.
              </p>
              <label className="flex items-center gap-2.5 text-[12px] text-txt-dim">
                <input
                  type="checkbox"
                  checked={config.output.monitorEnabled}
                  onChange={(e) => setOutput({ monitorEnabled: e.target.checked })}
                  className="accent-[var(--neon-cyan)]"
                />
                Play my sounds to me too
              </label>
              {config.output.monitorEnabled && (
                <DevicePicker
                  label="Your headphones"
                  devices={outputs}
                  value={config.output.monitorDeviceId}
                  onChange={(monitorDeviceId) => setOutput({ monitorDeviceId })}
                  placeholder="Choose your headphones…"
                  problem={
                    monitor.state === 'failed' || monitor.state === 'missing'
                      ? monitor.problem
                      : null
                  }
                />
              )}
              {monitorIsCable && (
                <Note tone="error">
                  That is the cable. You would hear nothing, and Discord would get every sound
                  twice. Pick your headphones or speakers.
                </Note>
              )}
              {defaultIsCable && (
                <Note tone="warn">
                  Windows’ default output is the cable, so your game and Discord audio are going
                  into it instead of your ears. Right-click the speaker icon in the taskbar →
                  Sound settings, and set your headphones or speakers as the output.
                </Note>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] leading-relaxed text-txt-dim">
                Discord now listens to the cable instead of your microphone, so Soundboard mixes
                your voice in. Choose your real microphone here — not in Discord.
              </p>
              <label className="flex items-center gap-2.5 text-[12px] text-txt-dim">
                <input
                  type="checkbox"
                  checked={config.mic.enabled}
                  onChange={(e) => setMic({ enabled: e.target.checked })}
                  className="accent-[var(--neon-cyan)]"
                />
                Mix my microphone into the cable
              </label>
              {config.mic.enabled ? (
                <DevicePicker
                  label="Microphone"
                  devices={inputs}
                  value={config.mic.deviceId}
                  onChange={(deviceId) => setMic({ deviceId })}
                  placeholder="Choose your microphone…"
                  problem={mic.state === 'failed' || mic.state === 'missing' ? mic.problem : null}
                />
              ) : (
                <Note tone="warn">
                  Your friends will not hear your voice. Discord’s input is the cable, and only
                  what Soundboard sends reaches it.
                </Note>
              )}
              {micIsLoop && (
                <Note tone="error">
                  That is the cable’s own output — Soundboard would be listening to itself and
                  feed every sound back round in a loop. Pick your real microphone.
                </Note>
              )}
              {config.mic.enabled && mic.device?.isVirtualCable && !micIsLoop && (
                <Note tone="warn">
                  This is a virtual device, not a microphone. Fine if you route your mic through
                  VoiceMeeter; otherwise pick your real microphone.
                </Note>
              )}
            </div>
          )}

          {step === 4 && (
            <StepTest
              cable={cable}
              recordingEnd={recordingEnd}
              micLive={micLive}
              gateDb={config.mic.gateEnabled ? config.mic.gateThreshold : null}
              master={config.master}
              toneReached={toneReached}
              onToneResult={recordToneResult}
              onUnmute={() => setMaster(0.5)}
            />
          )}

          {step === 5 && (
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] leading-relaxed text-txt-dim">
                In Discord, click the gear next to your name → <b className="text-txt">Voice &amp; Video</b>{' '}
                <span className="text-txt-faint">(German: Sprache &amp; Video)</span>. Match each
                setting, then tick it off here.
              </p>
              <ul className="flex flex-col gap-1.5">
                {DISCORD_ITEMS.map((item, i) => (
                  <li key={item.en}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-bg px-3.5 py-2">
                      <input
                        type="checkbox"
                        className="mt-[3px] accent-[var(--neon-cyan)]"
                        checked={checks[i]}
                        onChange={(e) =>
                          setChecks((c) => c.map((v, j) => (j === i ? e.target.checked : v)))
                        }
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[12.5px] text-txt">
                          {item.en}{' '}
                          <span className="text-txt-faint">({item.de})</span> →{' '}
                          <b className="font-medium text-[var(--neon-cyan)]">
                            {item.value(
                              recordingEnd ? baseLabel(recordingEnd) : 'CABLE Output (VB-Audio Virtual Cable)'
                            )}
                          </b>
                        </span>
                        <span className="text-[11px] leading-relaxed text-txt-faint">{item.why}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn-outline px-3"
                  onClick={() => void engine.playTestTone()}
                >
                  ▶ Play test tone
                </button>
                <span className="text-[11px] leading-relaxed text-txt-faint">
                  Discord’s input level meter should move while it plays.
                </span>
              </div>
              <Note tone="info">
                Leave Discord’s <b className="text-txt">Output Device</b> on your headphones —
                never the cable. Soundboard already cleans up your microphone with its own noise
                gate and compressor, so turning Discord’s processing off loses nothing.
              </Note>
              {defaultIsCable && (
                <Note tone="warn">
                  Windows’ default output is still the cable — if Discord’s output is set to
                  Default, you will not hear your friends.
                </Note>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-5 py-3.5">
          {step > 0 && (
            <button type="button" className="btn-ghost" onClick={() => go(step - 1)}>
              Back
            </button>
          )}
          <span className="ml-auto text-[11px] text-txt-faint">
            {!done[step]
              ? step === 4
                ? 'Play the tone to continue'
                : step === 5
                  ? 'Tick every setting to finish'
                  : ''
              : step === STEPS.length - 1 && firstUnfinished !== -1
                ? `${STEPS[firstUnfinished]} needs attention`
                : ''}
          </span>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              disabled={!done[step]}
              onClick={() => go(step + 1)}
              className="rounded-lg border border-[rgba(0,240,255,.4)] bg-[rgba(0,240,255,.08)] px-4 py-1.5 text-[12.5px] font-medium text-[var(--neon-cyan)] transition-colors hover:bg-[rgba(0,240,255,.14)] disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-txt-faint"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={firstUnfinished !== -1}
              onClick={() => {
                engine.stopTestTone()
                completeSetup()
              }}
              className="rounded-lg border border-[rgba(182,255,0,.4)] bg-[rgba(182,255,0,.08)] px-4 py-1.5 text-[12.5px] font-medium text-[var(--neon-lime)] transition-colors hover:bg-[rgba(182,255,0,.14)] disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-txt-faint"
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
