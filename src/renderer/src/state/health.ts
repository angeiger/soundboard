import type { AudioDevice, Config } from '@shared/types'
import type { LocalAudioStatus } from '@/audio/target'

/**
 * One definition of "is this part of the audio path working", so the title
 * bar, the bottom bar, Settings and the setup wizard never disagree.
 */
export type HealthState = 'ok' | 'unset' | 'missing' | 'failed' | 'off'

export interface Health {
  state: HealthState
  device: AudioDevice | null
  /** What is wrong, worded for whoever has to fix it; null when nothing is. */
  problem: string | null
}

export interface DeviceSnapshot {
  inputs: AudioDevice[]
  outputs: AudioDevice[]
  /** False until the first enumeration, so nothing reads as disconnected at startup. */
  loaded: boolean
}

function lookup(list: AudioDevice[], id: string | null): AudioDevice | null {
  return id ? (list.find((d) => d.deviceId === id) ?? null) : null
}

export function cableHealth(
  config: Config,
  devices: DeviceSnapshot,
  status: LocalAudioStatus | null
): Health {
  const id = config.output.cableDeviceId
  if (!id) {
    return { state: 'unset', device: null, problem: 'Choose the device Discord listens to.' }
  }
  const device = lookup(devices.outputs, id)
  if (!device && devices.loaded) {
    return {
      state: 'missing',
      device: null,
      problem: 'The chosen output is not connected. Nothing reaches Discord until it is back.'
    }
  }
  if (status?.cableError) return { state: 'failed', device, problem: status.cableError }
  return { state: 'ok', device, problem: null }
}

export function monitorHealth(
  config: Config,
  devices: DeviceSnapshot,
  status: LocalAudioStatus | null
): Health {
  if (!config.output.monitorEnabled) return { state: 'off', device: null, problem: null }
  // Unset means the Windows default output, which is always there.
  const id = config.output.monitorDeviceId ?? 'default'
  const device = lookup(devices.outputs, id)
  if (!device && devices.loaded) {
    return { state: 'missing', device: null, problem: 'Your headphones are not connected.' }
  }
  if (status?.monitorError) return { state: 'failed', device, problem: status.monitorError }
  return { state: 'ok', device, problem: null }
}

export function micHealth(
  config: Config,
  devices: DeviceSnapshot,
  status: LocalAudioStatus | null
): Health {
  if (!config.mic.enabled) return { state: 'off', device: null, problem: null }
  const id = config.mic.deviceId ?? 'default'
  const device = lookup(devices.inputs, id)
  if (status?.mic.state === 'failed') {
    return { state: 'failed', device, problem: status.mic.error }
  }
  if (!device && devices.loaded) {
    return { state: 'missing', device: null, problem: 'This microphone is not connected.' }
  }
  return { state: 'ok', device, problem: null }
}
