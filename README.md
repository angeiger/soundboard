# Soundboard

A neon-dark soundboard for Discord voice chat. Windows only.

## Why it's built this way

**Global hotkeys use a low-level keyboard hook, not `RegisterHotKey`.** This was
originally the other way round, on the theory that Riot's Vanguard is hostile to
`SetWindowsHookEx`-style hooks. That turned out to be both wrong and fatal.

A game can register raw input with `RIDEV_NOHOTKEYS`, which suppresses *every*
`RegisterHotKey` binding in the system while that window holds the foreground. League
does this. The result was pads that fired on the desktop, in the League client and
while alt-tabbed, but never inside a match — identical across all three display modes,
and unchanged by running elevated.

A low-level hook sits below the raw-input layer and is unaffected. It is also fine with
Vanguard in practice: Discord's push-to-talk uses the same mechanism and works in-game,
as do OBS and most streaming tools. Unlike DLL injection, the callback runs in our
process and never touches the game's — which is what anti-cheat actually objects to.

Consequences of the hook, all deliberate:

- keystrokes are **not** consumed, so a binding is never stolen from other apps. The
  UI still requires a modifier, because a bare key would now fire a pad while you type
  in Discord. F13–F24 and mouse buttons 3–5 are exempt.
- mouse buttons are bindable, which `RegisterHotKey` could not do
- numpad keys are mapped from both their NumLock-on and NumLock-off scancodes, since
  Windows reports different codes for the same physical key
- Shift as a *sole* modifier lags a beat and is unreliable; nothing defaults to it

Elevation is **not** required. An earlier version warned that it was, which was a
misdiagnosis of the above.

**Mic cleanup happens here, not in Discord.** Discord applies noise suppression, echo
cancellation and auto gain to whatever arrives on the input device, and cannot tell your
voice from a sound effect — Krisp is trained to delete exactly the kind of audio a
soundboard plays, and AEC cancels the clips because it sees them in both the mic and the
speaker path. So Discord's processing must be off, and we run a noise gate, RNNoise
and a compressor on the mic branch *before* mixing instead. Sound effects pass through
untouched.

The gate only helps between sentences — it is open by definition while you talk.
RNNoise runs continuously, so it also takes out the fan or hum *underneath* your
voice. It costs 29 ms: RNNoise works on 480-sample frames and Web Audio hands over 128
at a time, which needs a 448-sample head start (9.3 ms), and this RNNoise build delays
by 20 ms on its own. The binary is the one `@jitsi/rnnoise-wasm` embeds in
`rnnoise-sync.js`, extracted at build time by `build/rnnoise-wasm.ts`. Its standalone
`rnnoise.wasm` would be 10 ms faster, but it barely suppresses anything — about 1 dB
on white noise against 60+. A test fails if anyone switches back to it.

**Playback goes through a swappable target.** `PlaybackTarget` (`src/renderer/src/audio/
target.ts`) is the seam between "a pad was triggered" and "sound came out". v1 ships
`LocalTarget`; a future `BotTarget` sends the same calls to a Discord bot sitting in the
voice channel. Nothing above that interface knows which is active.

## Audio graph

```
  mic -> gate -> denoise -> compressor -> micGain --+
                                                    +--> cableBus -> limiter -> cable sink (Discord)
  pads --------------------------------------------+
  pads -----------------------------------------------> monitorBus -> monitor sink (you)
```

The mic reaches the cable but never the monitor — hearing your own voice 20 ms late is
unbearable. Both sinks are `MediaStreamAudioDestinationNode`s feeding hidden `<audio>`
elements, because `setSinkId` lives on `HTMLMediaElement` and is the only way to aim Web
Audio at a specific Windows output device. The limiter is there because voice and pads
are summed: a loud clip landing mid-sentence would otherwise clip, and only the people
listening would hear it.

The gate and RNNoise are AudioWorklets, each authored as a source string and loaded
from a blob URL. Worklets are governed by the CSP's `script-src`, not `worker-src` — with
`blob:` only on `worker-src`, the gate was refused and never ran, and nothing said so.
RNNoise also needs `'wasm-unsafe-eval'`, which permits compiling WebAssembly and nothing
else. Both are in `src/renderer/index.html`. If either worklet fails to load, the mic
still works without it and Settings says what failed.

## Fonts

Inter and JetBrains Mono ship inside the app: `src/renderer/src/fonts.css`, with the
files from the `@fontsource-variable` packages. They used to come from Google Fonts on
every launch, which meant a request to Google each time and fallback fonts offline. The
CSP now allows no remote host at all.

Two things in there are deliberate. The `@font-face` rules declare only the weights
Google served — Inter 400 to 600, JetBrains Mono 500 and 700 — because the UI is tuned
to what that does to every other weight: bold Inter draws at 600, regular mono at 500.
Declaring the files' full range would quietly restyle the whole app. And
`assetsInlineLimit` is 0, because Vite turns small assets into `data:` URLs, which the
CSP refuses for fonts; the smallest subset is 2 KB. Screenshots taken before and after
the move were pixel-identical.

## Setup

On first launch a setup wizard walks through this, and will not finish until it has seen
a test tone arrive on the cable. Settings → **Run setup again** reopens it.

1. Install [VB-CABLE](https://vb-audio.com/Cable/) and reboot.
2. In the app: Settings → output = `CABLE Input`, monitor = your headphones.
3. In Discord → Voice & Video: Microphone (older versions: Input Device) = `CABLE Output`.
4. In Discord: Input Profile = **Custom**, which is what reveals the switches. Then
   Noise Suppression = None, and Echo Cancellation and Automatic Gain Control **off** —
   the last one is under Advanced Voice Settings.
5. Optional but worth it: raise the voice channel's bitrate to 96–128 kbps.

### Bluetooth headsets

A Bluetooth headset can be in stereo mode (A2DP, **no mic**) or hands-free mode (HFP,
mic works, output drops to mono ~16 kHz). It cannot do both — that's the Bluetooth spec.
Opening the headset's mic forces HFP and degrades everything you hear.

Use a separate wired or USB mic and keep the Bluetooth headset for output only. The app
warns when you pick a hands-free endpoint, since Windows lists both and people choose
wrong constantly.

Bluetooth output also runs 150–250 ms behind. Your friends hear pads instantly — the
cable path never touches Bluetooth — but your own monitor lags. Monitor volume defaults
low for this reason, and individual pads can skip the monitor entirely.

## Storage

```
%APPDATA%/soundboard/
  config.json     banks · pads · hotkeys · devices
  sounds/         audio copied in, named by content hash
  peaks/          cached waveforms
```

Audio is copied in rather than referenced in place, so moving or deleting the original
never breaks a pad, and soundpack export always has the bytes.

## Commands

```bash
npm run dev        # dev with HMR
npm run typecheck  # tsc over main, preload, renderer and tests
npm test           # Vitest: the audio maths, accelerators, soundpacks, config migration, RNNoise
npm run build      # typecheck + bundle to out/
npm run dist       # NSIS installer + latest.yml into dist/
```

The RNNoise tests run the real worklet against the real wasm on a recorded voice
(`test-sounds/test-speech.wav`), so they measure noise reduction, voice level and
latency rather than trusting the code.

## Releases and updates

The app updates itself from GitHub releases with `electron-updater`. It downloads in the
background and then *asks* — a soundboard that restarted itself mid-game would be worse
than a stale one. The version shows in Settings, beside **Check for updates**.

```bash
# bump "version" in package.json, then
npm run dist
gh release create vX.Y.Z dist/Soundboard-setup.exe dist/Soundboard-setup.exe.blockmap dist/latest.yml \
  --title "Soundboard X.Y.Z" --notes-file RELEASE_NOTES.md
```

- **`latest.yml` must be attached to every release.** It is what the updater reads.
  The blockmap lets later updates download only what changed.
- **The installer name stays version-less.** GitHub's `/releases/latest/download/<name>`
  link resolves by exact filename; a version in the name breaks the permanent download
  link already handed out. The updater reads the version from `latest.yml`.
- **Nothing is signed, so `publisherName` stays unset.** With it, electron-updater
  would look for a signature that does not exist and refuse every update.
- Anyone on 0.1.x has no updater yet and installs 0.2.0 by hand, once.

### If `npm run dist` fails on a fresh machine

electron-builder downloads a code-signing toolkit whose archive contains macOS
symlinks, and Windows refuses to create symlinks without elevation:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
  ...winCodeSign\<n>\darwin\10.12\lib\libcrypto.dylib
```

We don't sign anything, and the macOS half of that archive is never used. Pre-populate
the cache without it, from the project root:

```bash
CACHE="$LOCALAPPDATA/electron-builder/Cache/winCodeSign"
./node_modules/7zip-bin/win/x64/7za.exe x "$CACHE"/*.7z -o"$CACHE/winCodeSign-2.6.0" '-x!darwin' -y
rm -rf "$CACHE"/[0-9]*
```

Then `npm run dist` again. Enabling Windows Developer Mode, or running the build
elevated, also works.
