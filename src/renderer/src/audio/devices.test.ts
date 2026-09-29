import { describe, it, expect } from 'vitest'
import { classify, guessCableDevice, recordingEndOf, baseLabel } from './devices'
import type { AudioDevice } from '@shared/types'

/** Exactly what Chromium lists on a Windows 11 laptop with VB-CABLE installed. */
const outputs: AudioDevice[] = [
  ['default', 'Default - Headphones (Realtek(R) Audio)'],
  ['communications', 'Communications - Headphones (Realtek(R) Audio)'],
  ['4f0e6e5681', '2 - PHL 271E1 (AMD High Definition Audio Device)'],
  ['e6065261cd', 'CABLE In 16ch (VB-Audio Virtual Cable)'],
  ['f46f042201', 'Headphones (Realtek(R) Audio)'],
  ['dac150157d', 'CABLE Input (VB-Audio Virtual Cable)'],
  ['07226770e8', 'Speakers (Realtek(R) Audio)']
].map(([deviceId, label]) => classify({ deviceId, label, kind: 'audiooutput' }))

const inputs: AudioDevice[] = [
  ['default', 'Default - Microphone Array (Realtek(R) Audio)'],
  ['communications', 'Communications - Microphone Array (Realtek(R) Audio)'],
  ['4ec2c47dc5', 'CABLE Output (VB-Audio Virtual Cable)'],
  ['b794bcd42a', 'Microphone Array (Realtek(R) Audio)']
].map(([deviceId, label]) => classify({ deviceId, label, kind: 'audioinput' }))

const byLabel = (list: AudioDevice[], label: string): AudioDevice => {
  const d = list.find((x) => x.label === label)
  if (!d) throw new Error(`no ${label}`)
  return d
}

describe('guessCableDevice', () => {
  it('prefers CABLE Input over the 16-channel endpoint listed before it', () => {
    expect(guessCableDevice(outputs)?.label).toBe('CABLE Input (VB-Audio Virtual Cable)')
  })

  it('falls back to any virtual cable, and to nothing without one', () => {
    const voicemeeter = classify({
      deviceId: 'vm',
      label: 'VoiceMeeter Input (VB-Audio VoiceMeeter VAIO)',
      kind: 'audiooutput'
    })
    expect(guessCableDevice([voicemeeter])?.deviceId).toBe('vm')
    expect(guessCableDevice(outputs.filter((d) => !d.isVirtualCable))).toBeNull()
  })

  it('never picks the Windows default alias, even when the cable is the default', () => {
    const cableAsDefault = classify({
      deviceId: 'default',
      label: 'Default - CABLE Input (VB-Audio Virtual Cable)',
      kind: 'audiooutput'
    })
    const guess = guessCableDevice([cableAsDefault, ...outputs])
    expect(guess?.deviceId).toBe('dac150157d')
  })
})

describe('recordingEndOf', () => {
  it('finds CABLE Output from either playback end', () => {
    for (const label of [
      'CABLE Input (VB-Audio Virtual Cable)',
      'CABLE In 16ch (VB-Audio Virtual Cable)'
    ]) {
      expect(recordingEndOf(byLabel(outputs, label), inputs)?.deviceId, label).toBe('4ec2c47dc5')
    }
  })

  it('matches the A and B cables of the A+B edition to their own ends', () => {
    const labels = ['CABLE-A Output (VB-Audio Cable A)', 'CABLE-B Output (VB-Audio Cable B)']
    const abInputs = labels.map((label, i) =>
      classify({ deviceId: `ab${i}`, label, kind: 'audioinput' })
    )
    const cableB = classify({
      deviceId: 'b',
      label: 'CABLE-B Input (VB-Audio Cable B)',
      kind: 'audiooutput'
    })
    expect(recordingEndOf(cableB, abInputs)?.deviceId).toBe('ab1')
  })

  it('returns nothing for a device that is not a cable', () => {
    expect(recordingEndOf(byLabel(outputs, 'Speakers (Realtek(R) Audio)'), inputs)).toBeNull()
  })

  it('reads through the Default alias prefix', () => {
    const alias = classify({
      deviceId: 'default',
      label: 'Default - CABLE Input (VB-Audio Virtual Cable)',
      kind: 'audiooutput'
    })
    expect(baseLabel(alias)).toBe('CABLE Input (VB-Audio Virtual Cable)')
    expect(recordingEndOf(alias, inputs)?.deviceId).toBe('4ec2c47dc5')
  })
})

describe('classify', () => {
  it('flags Bluetooth hands-free endpoints', () => {
    for (const label of [
      'Headset (WH-1000XM4 Hands-Free AG Audio)',
      'Headset (Galaxy Buds2 Pro)',
      'Headphones (Jabra Evolve HFP)'
    ]) {
      expect(classify({ deviceId: 'x', label, kind: 'audiooutput' }).isHandsFree, label).toBe(true)
    }
    expect(byLabel(outputs, 'Headphones (Realtek(R) Audio)').isHandsFree).toBe(false)
  })

  it('does not mistake a USB gaming headset for hands-free', () => {
    const corsair = classify({
      deviceId: 'x',
      label: 'Headset Earphone (CORSAIR HS80 RGB Wireless Gaming Receiver)',
      kind: 'audiooutput'
    })
    expect(corsair.isHandsFree).toBe(false)
  })
})
