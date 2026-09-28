# Soundboard

A neon-dark soundboard for Discord voice chat. Windows only.

## Why it's built this way

**Global hotkeys use `RegisterHotKey`, never a low-level keyboard hook.** Electron's
`globalShortcut` wraps the Win32 `RegisterHotKey` API, which asks the OS to deliver a
combo to our window — it installs no hook, injects no DLL and never touches another
process. Riot's Vanguard (League of Legends, Valorant) is hostile to
`SetWindowsHookEx`-style keyboard hooks, which is how most soundboards do this.

Do not replace `src/main/hotkeys.ts` with `uiohook-napi`, `iohook`, or
`node-global-key-listener`. The trade-offs we accept in exchange:

- keyboard only — mouse4/mouse5 cannot be bound
- combos need a modifier (F13–F24 are exempt; no real keyboard produces them)
- a bound combo is consumed and never reaches the focused game

**Mic cleanup happens here, not in Discord.** Discord applies noise suppression, echo
cancellation and auto gain to whatever arrives on the input device, and cannot tell your
voice from a sound effect — Krisp is trained to delete exactly the kind of audio a
soundboard plays, and AEC cancels the clips because it sees them in both the mic and the
speaker path. So Discord's processing must be off, and we run a noise gate and
compressor on the mic branch *before* mixing instead. Sound effects pass through
untouched.

**Playback goes through a swappable target.** `PlaybackTarget` (`src/renderer/src/audio/
target.ts`) is the seam between "a pad was triggered" and "sound came out". v1 ships
`LocalTarget`; a future `BotTarget` sends the same calls to a Discord bot sitting in the
voice channel. Nothing above that interface knows which is active.

## Audio graph

```
  mic -> gate -> compressor -> micGain --+
                                         +--> cableBus -> cable sink   (Discord)
  pads -----------------------------------+
  pads --------------------------------------> monitorBus -> monitor sink (you)
```

The mic reaches the cable but never the monitor — hearing your own voice 20 ms late is
unbearable. Both sinks are `MediaStreamAudioDestinationNode`s feeding hidden `<audio>`
elements, because `setSinkId` lives on `HTMLMediaElement` and is the only way to aim Web
Audio at a specific Windows output device.

## Setup

1. Install [VB-CABLE](https://vb-audio.com/Cable/) and reboot.
2. In the app: Settings → output = `CABLE Input`, monitor = your headphones.
3. In Discord: Input Device = `CABLE Output`.
4. In Discord: turn **off** Noise Suppression, Echo Cancellation and Automatic Gain
   Control.
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
npm run typecheck  # tsc over main, preload and renderer
npm run build      # typecheck + bundle to out/
npm run dist       # NSIS installer into dist/
```

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
