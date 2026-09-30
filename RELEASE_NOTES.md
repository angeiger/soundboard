## What's new in 0.2.0

**This is the last version you install by hand.** From now on Soundboard checks
for a new version when it starts and downloads it in the background. It never
restarts by itself — a banner asks first, and if you say Later, the update goes
in the next time you close the app. Settings → About shows which version you're on.

**A setup wizard.** It opens on first launch and walks through VB-CABLE, output,
headphones and mic. Then it plays a test tone and won't let you finish until the
tone has actually arrived on the cable, so you know it works before you open
Discord. It ends with the Discord checklist, in English and German. If you set
Soundboard up in 0.1.x already, it stays out of your way — Settings → **Run setup
again** opens it whenever you want.

**Noise removal for your mic.** Takes out steady background noise — a fan, hum,
a noisy room — even while you talk. It's on by default. To switch it off, go to
Settings → Microphone → Noise removal. Your sounds never go through it. It adds
about 30 ms to your voice.

**The noise gate actually works now.** In 0.1.x it never loaded, and nothing said
so — your mic went to Discord ungated.

**No more mic dropouts while you change settings.** Every change, down to each
step of dragging a slider, used to reopen your microphone.

**Problems are shown instead of silence.** Maybe Soundboard can't reach the
cable, your mic won't open or gets unplugged mid-game, a sound file is missing,
or a file you dropped in can't be used. Soundboard now tells you, in the title
bar, on the pad or in Settings, instead of just going quiet.

**Banks can be renamed and deleted.** Right-click a bank, or double-click its
name to rename it.

**Stop one sound without stopping all of them.** Right-click a pad while it plays.

Also fixed: a fresh install played your own mic through your speakers until you
picked the cable. And Soundboard no longer opens your microphone at startup just
to read device names, which Windows showed as the app using your mic.

The fonts are built in now. Soundboard used to download them from Google every
time it started, and fell back to plain Windows fonts when it couldn't. It now
looks the same online or offline.

---

A soundboard that plays into Discord voice chat, with global hotkeys that work
while a game has focus.

## Setup — in this order

**1. Install VB-CABLE first, and reboot.**
Download it from [vb-audio.com/Cable](https://vb-audio.com/Cable/), extract the zip,
then right-click `VBCABLE_Setup_x64.exe` → **Run as administrator** → Install Driver.

The reboot is not optional. Discord can only transmit what arrives on a microphone
input, and VB-CABLE is what lets the soundboard pose as one.

**2. Install Soundboard.**
Download `Soundboard-setup.exe` below and run it. Already on 0.1.x? Install right
over it — your pads, hotkeys and settings stay.

Windows will say **"Windows protected your PC"** — the app isn't code-signed. Click
**More info** → **Run anyway**.

**3. Follow the setup wizard.**
It covers everything. In short, in case you ever need it without the wizard:

In Soundboard → Settings: output `CABLE Input`, monitor your headphones, mic your
actual microphone.

In Discord → Voice & Video (German: *Sprache & Video*): input device
**`CABLE Output`** (not Input) — *Eingabegerät* — and turn **off** Noise Suppression
(*Rauschunterdrückung*), Echo Cancellation (*Echounterdrückung*) and Automatic Gain
Control (*Automatische Verstärkungsregelung*). Discord's processing cannot tell a
voice from a sound effect and will eat your clips — Soundboard cleans up your
microphone itself instead.

That's it — no administrator rights needed, and nothing to configure per game.

## Using it

Drag audio onto the grid to make a pad. Right-click a pad to set its hotkey, trim
the clip, change volume, colour or playback mode. Pads default to
`Ctrl+Alt+Numpad 1-9`, which nothing else uses.

You can bind a mouse thumb button instead — click the hotkey field, then press the
button. Far easier to reach mid-fight than a numpad combo.

Hotkeys work inside games, including League. They are not swallowed by the game, so
whatever you bind still reaches it as well — worth remembering if you rebind to
something League uses.

**Panic** stops every playing sound at once. You will need it.

Clips are measured on import and levelled to sit near speaking volume, so you don't
have to balance each one by hand.

Export a bank as a `.soundpack` and send it to someone — they import it and get the
same sounds, trims and hotkeys you have.

## Notes

- Windows only.
- On a German keyboard, don't bind Ctrl+Alt plus a letter or digit. Windows treats
  Ctrl+Alt as AltGr, so Ctrl+Alt+Q is how you type `@` and Ctrl+Alt+7 to 0 type
  `{ [ ] }`. Every `@` you type in chat would fire that pad. The numpad defaults and
  mouse buttons are safe.
- Bluetooth headsets: a headset can do stereo *or* microphone, never both. If you use
  the headset's mic, everything you hear drops to telephone quality. Use a separate
  wired or USB mic and keep the headset for output.
- Raise your voice channel's bitrate to 96 kbps or higher; the 64 kbps default makes
  music-heavy clips sound rough.
