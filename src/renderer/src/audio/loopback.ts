import { measure } from './level'
import type { Level } from './target'

/**
 * Listens at the far end of the cable -- the recording device Discord reads.
 *
 * The in-app meter proves sound reached our own graph; this proves it left
 * Soundboard and came out of the cable, which is the part that fails for
 * reasons the graph cannot see: a device that refused audio, the wrong end of
 * the cable, a driver that never finished installing.
 *
 * It has its own AudioContext and is connected to nothing audible. It only
 * measures, and it is closed as soon as the wizard's test step is left.
 */
export interface LoopbackProbe {
  level(): Level
  close(): void
}

export async function openLoopbackProbe(deviceId: string): Promise<LoopbackProbe> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: deviceId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  })
  const ctx = new AudioContext({ sampleRate: 48000 })
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  source.connect(analyser)
  const buf = new Float32Array(analyser.fftSize)

  return {
    level: () => measure(analyser, buf),
    close: () => {
      source.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    }
  }
}
