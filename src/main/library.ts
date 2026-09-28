import { createHash } from 'crypto'
import { readFile, writeFile, copyFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { extname, basename } from 'path'
import { soundPath, peaksPath } from './paths'

export const SUPPORTED_EXTS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.webm']

export interface ImportedSound {
  hash: string
  ext: string
  name: string
}

export function isSupported(filePath: string): boolean {
  return SUPPORTED_EXTS.includes(extname(filePath).toLowerCase())
}

/**
 * Copies an audio file into the library under its content hash. Two pads
 * pointing at identical audio share one file on disk, and re-importing the
 * same clip is a no-op rather than a duplicate.
 */
export async function importSound(filePath: string): Promise<ImportedSound> {
  const buf = await readFile(filePath)
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16)
  const ext = extname(filePath).toLowerCase()
  const dest = soundPath(hash, ext)

  if (!existsSync(dest)) await copyFile(filePath, dest)

  return { hash, ext, name: basename(filePath, extname(filePath)) }
}

export async function readSound(hash: string, ext: string): Promise<Buffer> {
  return readFile(soundPath(hash, ext))
}

export async function readPeaks(hash: string): Promise<number[] | null> {
  const p = peaksPath(hash)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(await readFile(p, 'utf-8')) as number[]
  } catch {
    return null
  }
}

/**
 * Peaks are decoded once at import and cached, so reopening a bank does not
 * re-decode every mp3 in it.
 */
export async function writePeaks(hash: string, peaks: number[]): Promise<void> {
  await writeFile(peaksPath(hash), JSON.stringify(peaks), 'utf-8')
}

/** Removes library files for a hash no pad references any more. */
export async function pruneSound(hash: string, ext: string): Promise<void> {
  for (const p of [soundPath(hash, ext), peaksPath(hash)]) {
    try {
      if (existsSync(p)) await unlink(p)
    } catch {
      /* best effort */
    }
  }
}
