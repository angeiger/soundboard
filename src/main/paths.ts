import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

/**
 * Everything lives under %APPDATA%/Soundboard. Audio files are copied in
 * rather than referenced in place, so moving or deleting the original never
 * breaks a pad and soundpack export always has the bytes it needs.
 */
export const userDataDir = app.getPath('userData')
export const soundsDir = join(userDataDir, 'sounds')
export const peaksDir = join(userDataDir, 'peaks')
export const configPath = join(userDataDir, 'config.json')

export function ensureDirs(): void {
  mkdirSync(soundsDir, { recursive: true })
  mkdirSync(peaksDir, { recursive: true })
}

export function soundPath(hash: string, ext: string): string {
  return join(soundsDir, `${hash}${ext}`)
}

export function peaksPath(hash: string): string {
  return join(peaksDir, `${hash}.json`)
}
