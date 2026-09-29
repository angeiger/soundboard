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

/**
 * Chromium lists the Windows default and communications devices a second time
 * under these ids, with the real label behind a prefix.
 */
const ALIAS_IDS = new Set(['default', 'communications'])
const ALIAS_PREFIX = /^(default|communications)\s+-\s+/i

export function classify(d: Pick<MediaDeviceInfo, 'deviceId' | 'kind' | 'label'>): AudioDevice {
  return {
    deviceId: d.deviceId,
    label: d.label || 'Unknown device',
    kind: d.kind as 'audioinput' | 'audiooutput',
    isHandsFree: HANDS_FREE.test(d.label),
    isVirtualCable: VIRTUAL_CABLE.test(d.label)
  }
}

/**
 * Chromium hides device labels from a page without microphone permission.
 * Electron grants that by default, so labels normally arrive regardless and
 * this is only called when they do not: it opens the default mic for an
 * instant, which Windows shows as microphone use.
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

export interface DeviceList {
  inputs: AudioDevice[]
  outputs: AudioDevice[]
  /**
   * False when Windows or Chromium is withholding device names. Every label
   * then reads "Unknown device" and no cable can be recognised, which must
   * not be mistaken for the cable being absent.
   */
  labelsAvailable: boolean
}

export async function listDevices(): Promise<DeviceList> {
  const all = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) => d.kind === 'audioinput' || d.kind === 'audiooutput'
  )
  const mapped = all.map(classify)
  return {
    inputs: mapped.filter((d) => d.kind === 'audioinput'),
    outputs: mapped.filter((d) => d.kind === 'audiooutput'),
    labelsAvailable: all.length === 0 || all.some((d) => d.label !== '')
  }
}

export function isAlias(device: AudioDevice): boolean {
  return ALIAS_IDS.has(device.deviceId)
}

/** "Default - CABLE Output (VB-Audio Virtual Cable)" -> "CABLE Output (VB-Audio Virtual Cable)". */
export function baseLabel(device: AudioDevice): string {
  return device.label.replace(ALIAS_PREFIX, '')
}

/**
 * Best guess at the virtual cable, for the first-run wizard. VB-CABLE also
 * installs "CABLE In 16ch", which feeds the same cable and often sorts first,
 * but every guide -- and the Discord side -- talks about "CABLE Input".
 */
export function guessCableDevice(outputs: AudioDevice[]): AudioDevice | null {
  const cables = outputs.filter((d) => d.isVirtualCable && !isAlias(d))
  return cables.find((d) => /^CABLE Input\b/i.test(d.label)) ?? cables[0] ?? null
}

/**
 * The recording end of the cable Soundboard plays into -- the device Discord
 * should listen to. VB-CABLE names the ends "CABLE Input" / "CABLE In 16ch"
 * and "CABLE Output", the A+B editions prefix "CABLE-A", and VoiceMeeter
 * uses "VoiceMeeter Input" / "VoiceMeeter Output", each with the same driver
 * name in brackets. Chromium's groupId cannot be used instead: on Windows it
 * groups CABLE Output with the laptop's own microphone.
 */
export function recordingEndOf(cable: AudioDevice, inputs: AudioDevice[]): AudioDevice | null {
  const parse = (label: string): { name: string; driver: string } => {
    const m = /^(.*?)\s*(\([^)]*\))?\s*$/.exec(label)
    return { name: (m?.[1] ?? label).trim(), driver: (m?.[2] ?? '').toLowerCase() }
  }

  const playback = parse(baseLabel(cable))
  const stem = /^(.*?)\s*In(?:put)?\b/i.exec(playback.name)?.[1]
  if (!stem) return null
  const wanted = `${stem} Output`.toLowerCase()

  return (
    inputs.find((d) => {
      if (isAlias(d)) return false
      const recording = parse(d.label)
      return recording.name.toLowerCase() === wanted && recording.driver === playback.driver
    }) ?? null
  )
}

export function onDeviceChange(cb: () => void): () => void {
  navigator.mediaDevices.addEventListener('devicechange', cb)
  return () => navigator.mediaDevices.removeEventListener('devicechange', cb)
}
