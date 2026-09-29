# Implementation handoff

You are picking up a working Windows soundboard that plays into Discord voice chat.
This document specifies three features to build and a cleanup pass. Read sections 0
and 1 in full before writing any code — section 1 contains decisions that were
arrived at painfully and that a reasonable person would otherwise reverse.

---

## 0. Orientation

**What it is.** An Electron app. It mixes your microphone with sound pads and feeds
the result into a virtual audio cable (VB-CABLE) that Discord reads as a microphone.
Global hotkeys fire pads while a game has focus.

**Layout.**

```
src/main/        Electron main: hotkeys, config, file IO, soundpack zip, IPC
src/preload/     contextBridge surface (window.api)
src/renderer/    React UI + the entire audio engine
src/shared/      Types and defaults used by both sides
```

**Commands.**

```bash
npm run dev        # dev with HMR
npm run typecheck  # tsc over main, preload and renderer — must pass
npm run build      # typecheck + bundle to out/
npm run dist       # NSIS installer + latest.yml into dist/
```

**Audio graph** (`src/renderer/src/audio/local-target.ts`):

```
  mic -> gate -> compressor -> micGain --+
                                         +--> cableBus -> limiter -> cable sink
  pads ---------------------------------+
  pads ------------------------------------> monitorBus -> monitor sink
```

The mic reaches the cable but never the monitor. Hearing your own voice ~20 ms late
is intolerable; this is deliberate, not an oversight.

---

## 1. Invariants

Breaking any of these reintroduces a bug that took days to diagnose. Each is load
bearing.

### 1.1 Hotkeys use a low-level keyboard hook. Never `RegisterHotKey`.

`src/main/hotkeys.ts` uses `uiohook-napi`. Do not replace it with Electron's
`globalShortcut`, and do not "simplify" it that way.

`globalShortcut` wraps Win32 `RegisterHotKey`. A game can register raw input with
`RIDEV_NOHOTKEYS`, which suppresses **every** `RegisterHotKey` binding in the system
while that window holds the foreground. League of Legends does this. The observed
symptom was pads firing on the desktop, in the game client and while alt-tabbed, but
never inside a match — unaffected by display mode and unaffected by running elevated.

A low-level hook sits below the raw-input layer and is unaffected. It is also fine
with Riot Vanguard in practice: Discord's push-to-talk uses the same mechanism and
works in-game.

Consequences that are intentional, not bugs:

- Keystrokes are **not consumed**. The focused app still receives them.
- The UI requires a modifier, because a bare key would otherwise fire a pad while
  the user types in Discord. `F13`–`F24` and `Mouse3`–`Mouse5` are exempt.
- A combo can no longer be "taken" by another application.

### 1.2 Elevation is not required and must not be requested.

An earlier version warned that administrator rights were needed. That was a
misdiagnosis of 1.1. Do not add `requestedExecutionLevel`, and do not reintroduce an
elevation prompt.

### 1.3 Microphone processing happens on the mic branch, before mixing.

Discord's noise suppression, echo cancellation and AGC must be **off** — they cannot
distinguish a voice from a sound effect, and Krisp is specifically trained to delete
the kind of audio a soundboard plays. Cleanup therefore happens here instead, applied
only to the mic, never to pads. `getUserMedia` is called with `echoCancellation`,
`noiseSuppression` and `autoGainControl` all `false` on purpose.

### 1.4 `npmRebuild: false` stays in `electron-builder.yml`.

`uiohook-napi` is N-API with prebuilt binaries, so it is ABI-stable across Electron
versions and must not be rebuilt. `@electron/rebuild` also fails outright here,
because `node-gyp` cannot handle the space in `C:\Claude Code`. The `asarUnpack`
entry is likewise required — native binaries cannot load from inside an asar.

### 1.5 The installer filename must stay version-less.

`artifactName: ${productName}-setup.${ext}`. GitHub's
`/releases/latest/download/<name>` link resolves by exact filename, so putting the
version back in the name breaks the permanent download link that has already been
distributed. `electron-updater` reads the version from `latest.yml`.

### 1.6 Config changes need a migration.

`src/main/store.ts` has a `migrate()` function keyed on `CONFIG_VERSION` in
`src/shared/defaults.ts`. Changing a default does **not** affect existing users,
whose stored config wins the merge. If a change must reach existing installs, bump
`CONFIG_VERSION` and handle it in `migrate()`. There is a worked example there
already (bank hotkeys being forced off for v1 configs).

---

## 2. Working practices

### 2.1 Verify, do not assume

Every task below has acceptance criteria. Meet them by observing behaviour, not by
reasoning that the code looks correct. Several bugs in this codebase typechecked
cleanly and looked right:

- a relaunch helper that was killed by its own parent before it ran
- a hotkey suspend that left every binding unregistered on cancel
- a button rendered at 10 px in faint grey, effectively invisible
- durations formatted as `m:ss`, so every clip under a second read `0:00`

Take a screenshot of UI work and look at it.

### 2.2 Testing gotchas that will waste your time

**Single-instance lock.** The app calls `requestSingleInstanceLock()`. A second
instance silently focuses the first and exits with code 0. If the app "won't start",
check for an existing instance — including a stale `electron-vite preview` that owns
`%APPDATA%/soundboard`:

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '*soundboard*' }
```

**File locks during build.** A running instance locks files in `dist/win-unpacked`,
and `npm run dist` then fails with `Access is denied`. Kill instances first.

**Backgrounded processes.** Launching the app from a shell job that then exits kills
the app with it. Launch detached (`Start-Process` on Windows).

### 2.3 Commits and releases

Conventional prose commit messages explaining **why**, not what. Look at
`git log` for the established tone. Releases:

```bash
# bump version in package.json, then
npm run dist
gh release create vX.Y.Z dist/Soundboard-setup.exe dist/latest.yml \
  --title "Soundboard X.Y.Z" --notes-file <notes>
```

`latest.yml` must be attached to every release or auto-update breaks.

---

## 3. Task A — First-run setup wizard

**Priority: highest.** Three non-technical users are about to install this. The
current setup path is "follow a web page and hope", and every failure mode is silent.

### 3.1 Existing hook

`Config.setupCompleted: boolean` already exists in `src/shared/types.ts` and defaults
to `false`. Nothing reads it. Use it.

### 3.2 Behaviour

Show the wizard when `setupCompleted === false`. It must also be re-openable from
Settings, because people reinstall VB-CABLE or change headsets.

Steps, each blocking the next until satisfied:

1. **Virtual cable check.** Detect using the existing `isVirtualCable` flag from
   `src/renderer/src/audio/devices.ts`. If absent: explain *why* a cable is needed
   (Discord only transmits what arrives on a microphone input), link to
   <https://vb-audio.com/Cable/>, and state that a reboot is required. Poll
   `navigator.mediaDevices.devicechange` so the step self-satisfies after install
   without a restart of the app.

2. **Output device.** Preselect via `guessCableDevice()`. Let the user override.

3. **Monitor device.** Default to their current system output. Warn on a hands-free
   Bluetooth endpoint — `AudioDevice.isHandsFree` already detects this.

4. **Microphone.** Same warning applies: selecting a Bluetooth headset mic forces the
   headset into hands-free mode and degrades everything they hear.

5. **Signal test.** The important step. Play a test tone through the cable while
   showing a **live input meter** reading the cable bus, so the user can see signal
   reaching the cable before opening Discord. Also show a mic meter so they can
   confirm passthrough. Do not let this step be passed without observing signal.

6. **Discord checklist.** Input device `CABLE Output`; Noise Suppression, Echo
   Cancellation and Automatic Gain Control all off. Note that the user's Discord may
   be in German — `RELEASE_NOTES.md` and the published setup guide have the German
   strings.

### 3.3 Implementation notes

The meter needs an `AnalyserNode` tapped off `cableBus` and the mic chain in
`LocalTarget`. Do **not** add another `instanceof LocalTarget` check in `engine.ts` —
see task D.1, which you should do first so this lands cleanly.

Use `requestAnimationFrame` with `getByteTimeDomainData` and render a peak/RMS bar.
Respect `prefers-reduced-motion` only for decorative motion; a meter is functional.

### 3.4 Acceptance

- Fresh install (delete `%APPDATA%/soundboard`) shows the wizard on first launch
- Completing it sets `setupCompleted` and it does not reappear
- Re-openable from Settings
- With VB-CABLE absent, step 1 blocks and explains itself
- Installing VB-CABLE while the wizard is open advances step 1 without an app restart
- The meter visibly responds to a triggered pad and to speech
- Selecting a Bluetooth hands-free endpoint shows the warning

---

## 4. Task B — electron-updater

**Priority: medium.** Four people on manually distributed builds will drift apart in
version, with no way to tell who is on what.

### 4.1 Groundwork already done

- `publish:` block in `electron-builder.yml` (provider github, owner `angeiger`,
  repo `soundboard`)
- `latest.yml` is generated by every `npm run dist` and attached to every release
- The permanent download URL is stable (invariant 1.5)

### 4.2 Implementation

Add `electron-updater` to `dependencies` (not dev — it runs in main).

In `src/main`, on app ready:

- Guard with `app.isPackaged`. `autoUpdater` does not work in dev and throws
  confusingly.
- `autoUpdater.autoDownload = true`, `autoUpdater.autoInstallOnAppQuit = true`.
- Do **not** call `quitAndInstall()` without asking. Surface a dismissible banner in
  the renderer when `update-downloaded` fires, offering restart. A soundboard that
  restarts itself mid-game would be worse than a stale version.
- Forward `error`, `update-available`, `download-progress` and `update-downloaded`
  to the renderer over IPC. Follow the existing pattern in `src/main/ipc.ts` and
  `src/preload/index.ts`.
- Add a manual "Check for updates" button in Settings showing the current version.
  There is currently no version displayed anywhere in the UI, which makes support
  impossible.

### 4.3 Gotchas

- **The app is unsigned.** Do not set `publisherName`; electron-updater would then
  try to verify a signature that does not exist and refuse the update.
- `quitAndInstall()` interacts with `requestSingleInstanceLock()`. Verify the app
  actually comes back after updating rather than exiting silently — this exact class
  of failure has already happened once here.
- Update failures must be visible. A silent catch leaves users stranded on an old
  build with no signal.

### 4.4 Testing

You cannot test this against a hypothetical release. Either:

- publish a real pre-release with a bumped version and install the older build, or
- point `dev-app-update.yml` at a local file server.

State in your report which method you used and what you observed. "Should work" is
not acceptance.

### 4.5 Acceptance

- Packaged app on version N detects a published version N+1
- Download progresses and completes
- Banner appears, restart applies the update, **and the app relaunches**
- Declining leaves the app fully usable
- Network failure surfaces an error rather than failing silently
- Current version visible in Settings

---

## 5. Task C — RNNoise on the mic branch

**Priority: lowest** of the three. Build it only if microphone noise has actually been
reported; the existing gate and compressor already handle a lot.

### 5.1 Existing hook

`MicSettings.denoiseEnabled` already exists and defaults to `true`, but nothing reads
it and no UI exposes it. Wire it up, and add the toggle to Settings beside the
existing gate and compressor controls.

### 5.2 Why it belongs here

Discord's Krisp is off and cannot come back (invariant 1.3). The noise gate handles
silence between sentences but does nothing about noise *underneath* speech, because
it is open by definition while the user talks. RNNoise runs continuously.

### 5.3 Implementation notes

Use `@jitsi/rnnoise-wasm` or equivalent. The mechanics that will bite you:

- **RNNoise processes 480-sample frames at 48 kHz.** `AudioWorkletProcessor` delivers
  128 samples per quantum. You need a ring buffer to accumulate 480 in, and to emit
  processed audio 480 out, with the phase offset that implies.
- **The AudioContext is already 48 kHz** (`local-target.ts`), so no resampling is
  needed. Do not change that sample rate; 48 kHz is what Discord and every virtual
  cable driver expect.
- **RNNoise expects PCM scaled to int16 range** (roughly ±32768) as floats, not
  ±1.0. Scale on the way in and back on the way out. Getting this wrong produces
  either silence or extreme distortion.
- **You cannot `fetch()` the wasm inside an AudioWorklet.** Load the binary on the
  renderer thread and pass the `ArrayBuffer` through `processorOptions`, then
  instantiate inside the worklet.
- The existing gate worklet in `src/renderer/src/audio/gate-worklet.ts` is authored
  as a source string and registered from a blob URL. Follow that pattern or replace
  both with a proper worklet asset pipeline — but do not leave two different
  mechanisms in place.

Place it **after** the gate and **before** the compressor.

### 5.4 Acceptance

- Toggle in Settings enables and disables it live, without restarting the audio graph
- Measurable noise reduction on a recording with steady background noise
- Voice remains natural — over-suppression is worse than the noise
- Sound pads are **unaffected**; verify by capturing the cable output with a pad
  playing and confirming it is bit-similar with the toggle on and off
- Added latency stays under ~25 ms
- Failure to load the wasm disables the feature gracefully; it must not break the
  mic path

---

## 6. Task D — Cleanup

Do D.1 before Task A. The rest can be done in any order.

### D.1 Remove `instanceof LocalTarget` from the engine

`src/renderer/src/audio/engine.ts` lines ~99–109 branch on the concrete target type
to reach `setOutputDevices`, `setMic` and `setMasterGain`. This defeats the
`PlaybackTarget` abstraction, which exists so a Discord-bot target can be added
later without touching anything above it.

Introduce an optional capability interface (e.g. `LocalAudioControls`) that a target
may implement, and have `engine` feature-detect it. Task A will need to add a meter
tap; doing it through three more `instanceof` checks would compound the problem.

### D.2 De-duplicate the accelerator format

The accelerator string format is defined **twice** and the two must agree exactly or
hotkeys silently never match:

- `src/main/hotkeys.ts` — builds accelerators from uiohook keycodes
- `src/renderer/src/state/hotkey.ts` — builds them from browser `KeyboardEvent.code`

Both also implement `MODIFIERLESS_SAFE` separately. Move the shared vocabulary —
token names, modifier order (`Control`, `Alt`, `Shift`, `Super`), and the
modifierless-safe rule — into `src/shared/`. The two keycode tables must stay
separate (different input sources), but everything downstream of them should not be.

Add a test asserting both produce identical output for the same physical combo.

### D.3 Delete dead code

Verified unused (declaration and implementation only, no call sites):

- `capturingPadId` and `setCapturingPad` in `src/renderer/src/state/store.ts`
- `HotkeyRegistrationResult.reason: 'taken'` in `src/shared/types.ts` — impossible
  since the hook replaced `RegisterHotKey`; remove the variant and its comment
- `Config.launchMinimised` — never read. Either implement it or remove it.

Do **not** delete `denoiseEnabled` or `setupCompleted`; they are the hooks for
tasks C and A.

### D.4 Banks cannot be renamed or deleted

`renameBank` and `deleteBank` exist in the store with no UI calling them. This is a
missing feature rather than dead code: a user can create a bank and then never get
rid of it. Add a context menu or an edit affordance on bank rows. `deleteBank`
already refuses to remove the last bank and prunes orphaned sounds — read it before
wiring it up.

Similarly `stopPad` has no caller. Decide whether a pad should be stoppable
individually from the UI (right-click while playing, say) or remove it.

### D.5 Move `formatDuration` out of `colors.ts`

`src/renderer/src/colors.ts` contains a duration formatter. Move it to a `format.ts`
or similar. Trivial, but it is the kind of thing that makes a file untrustworthy.

### D.6 Establish a test suite

There are currently **no tests**. Add a runner (Vitest fits the Vite setup) and cover
the pure logic, which is where the real bugs have been:

- `audio/volume.ts` — the dB taper; assert `positionToGain`/`gainToPosition`
  round-trips and that gain 0.03 maps near position 49
- `audio/loudness.ts` — gated RMS and `suggestGain`; assert a clip with leading
  silence is not measured as quiet, and that the peak ceiling wins over the RMS target
- `audio/peaks.ts` — `downsamplePeaks` bucket count and range
- `state/hotkey.ts` — accelerator round-trip (see D.2)
- `main/soundpack.ts` — zip round-trip preserving gain, trim and hotkey; plus the
  path-traversal guard in `isSafeEntryPath`

Do not chase coverage of React components.

### D.7 Audit silent failures

There are many `catch {}` blocks with a comment saying the failure is acceptable.
Most are genuinely fine (best-effort cleanup). Some are not — notably device
selection in `LocalTarget.setOutputDevices`, where a failed `setSinkId` leaves audio
going nowhere with no indication. Surface that one in the UI.

Review each, and either justify it in a comment or surface the error.

### D.8 Renderer bundle size

The renderer bundle is ~630 KB and Vite warns about it. Not urgent, but check what
is in it before adding more — the waveform and audio code should be small, so
investigate before assuming it is irreducible.

---

## 7. Definition of done

- [ ] `npm run typecheck` passes
- [ ] `npm run dist` produces an installer
- [ ] The packaged app launches and the UI renders (screenshot it)
- [ ] Every acceptance criterion above met by **observation**, with a note saying how
      each was verified
- [ ] Hotkeys still fire inside a League of Legends practice-tool game — this is the
      one behaviour most easily broken by an innocent-looking change to `hotkeys.ts`
      or to the packaging config
- [ ] No new `instanceof` checks against concrete playback targets
- [ ] `README.md` updated if any invariant in section 1 changed, with the reasoning
- [ ] Anything you could not verify is stated plainly as unverified

If you find one of the invariants in section 1 is wrong, say so with evidence rather
than working around it. One of them was already wrong once, and the cost of leaving
it unchallenged was several days.
