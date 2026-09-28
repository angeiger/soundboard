import type { AudioDevice } from '@shared/types'

/**
 * A Bluetooth headset appears in Windows as two separate endpoints -- the A2DP
 * stereo one and the HFP hands-free one. Picking hands-free for output silently
 * drops you to mono ~16 kHz telephone audio, and people choose it by accident
 * constantly, so we detect and warn.
 */
const HANDS_FREE = /hands[- ]?free|headset\s*\(|\bhfp\b|\bhsp\b/i

/** VB-CABLE, VoiceMeeter and the handful of other virtual drivers people use. */
const VIRTUAL_CABLE = /cable|voicemeeter|vb-audio|virtual audio|vac\b/i

function classify(d: MediaDeviceInfo): AudioDevice {
  return {
    deviceId: d.deviceId,
    label: d.label || 'Unknown device',
    kind: d.kind as 'audioinput' | 'audiooutput',
    isHandsFree: HANDS_FREE.test(d.label),
    isVirtualCable: VIRTUAL_CABLE.test(d.label)
  }
}

/**
 * Device labels are blank until microphone permission has been granted at least
 * once, so we ask for a throwaway stream first and immediately release it.
 */
export async function primeDevicePermissions(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    return true
  } catch {
    return false
  }
}

export async function listDevices(): Promise<{
  inputs: AudioDevice[]
  outputs: AudioDevice[]
}> {
  const all = await navigator.mediaDevices.enumerateDevices()
  const mapped = all
    .filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput')
    .map(classify)
  return {
    inputs: mapped.filter((d) => d.kind === 'audioinput'),
    outputs: mapped.filter((d) => d.kind === 'audiooutput')
  }
}

/** Best guess at the virtual cable, for the first-run wizard. */
export function guessCableDevice(outputs: AudioDevice[]): AudioDevice | null {
  return outputs.find((d) => d.isVirtualCable) ?? null
}

export function onDeviceChange(cb: () => void): () => void {
  navigator.mediaDevices.addEventListener('devicechange', cb)
  return () => navigator.mediaDevices.removeEventListener('devicechange', cb)
}
