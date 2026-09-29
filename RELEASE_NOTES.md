A soundboard that plays into Discord voice chat, with global hotkeys that work
while a game has focus.

## Setup — in this order

**1. Install VB-CABLE first, and reboot.**
Download it from [vb-audio.com/Cable](https://vb-audio.com/Cable/), extract the zip,
then right-click `VBCABLE_Setup_x64.exe` → **Run as administrator** → Install Driver.

The reboot is not optional. Discord can only transmit what arrives on a microphone
input, and VB-CABLE is what lets the soundboard pose as one.

**2. Install Soundboard.**
Download `Soundboard-0.1.0-setup.exe` below.

Windows will say **"Windows protected your PC"** — the app isn't code-signed. Click
**More info** → **Run anyway**.

**3. Point everything at the cable.**
In Soundboard → Settings: output `CABLE Input`, monitor your headphones, mic your
actual microphone.

In Discord → Voice & Video: input device **`CABLE Output`** (not Input), and turn
**off** Noise Suppression, Echo Cancellation and Automatic Gain Control. Discord's
processing cannot tell a voice from a sound effect and will eat your clips —
Soundboard cleans up your microphone itself instead.

**4. If you play League**, right-click the shortcut → Properties → Compatibility →
**Run this program as an administrator**. League runs elevated, and Windows won't
deliver hotkeys from a normal-privilege app to an elevated window.

## Using it

Drag audio onto the grid to make a pad. Right-click a pad to set its hotkey, trim
the clip, change volume, colour or playback mode. Pads default to
`Ctrl+Alt+Numpad 1-9`, which nothing else uses.

**Panic** stops every playing sound at once. You will need it.

Clips are measured on import and levelled to sit near speaking volume, so you don't
have to balance each one by hand.

Export a bank as a `.soundpack` and send it to someone — they import it and get the
same sounds, trims and hotkeys you have.

## Notes

- Windows only.
- Bluetooth headsets: a headset can do stereo *or* microphone, never both. If you use
  the headset's mic, everything you hear drops to telephone quality. Use a separate
  wired or USB mic and keep the headset for output.
- Raise your voice channel's bitrate to 96 kbps or higher; the 64 kbps default makes
  music-heavy clips sound rough.
