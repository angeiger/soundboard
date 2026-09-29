import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { readFileSync, writeFileSync, existsSync, rmSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { app } from 'electron'
import { writePack, readPack, isSafeEntryPath, PACK_FORMAT, PACK_VERSION } from './soundpack'
import { importSound } from './library'
import { ensureDirs, soundPath } from './paths'
import type { PackManifest } from '@shared/types'

// paths.ts resolves the library under app.getPath('userData') at import time.
// Point it at a throwaway directory so nothing touches a real install.
vi.mock('electron', async () => {
  const fs = await import('fs')
  const os = await import('os')
  const path = await import('path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soundboard-test-'))
  return { app: { getPath: () => dir } }
})

const CHIME = resolve('test-sounds/test-chime.wav')
const TRIM_ME = resolve('test-sounds/test-trim-me.wav')

function manifestFor(chime: { hash: string }, trimMe: { hash: string }): PackManifest {
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    name: 'Round trip',
    createdAt: '2026-09-29T12:00:00.000Z',
    pads: [
      {
        name: 'Chime',
        file: `sounds/${chime.hash}.wav`,
        duration: 0.87,
        trimStart: 0.12,
        trimEnd: 0.64,
        gain: 0.6471505599902726,
        playMode: 'overlap',
        color: 'magenta',
        glyph: '🔔',
        cooldown: 1.5,
        index: 0,
        hotkey: 'Control+Alt+num1'
      },
      {
        name: 'Trim me',
        file: `sounds/${trimMe.hash}.wav`,
        duration: 2.7,
        trimStart: 0,
        trimEnd: null,
        gain: 1.8,
        playMode: 'toggle',
        color: 'lime',
        glyph: '',
        cooldown: 0,
        index: 1,
        hotkey: 'Alt+Mouse4'
      }
    ]
  }
}

describe('soundpack round trip', () => {
  const work = mkdtempSync(join(tmpdir(), 'soundboard-pack-'))

  beforeAll(() => ensureDirs())
  afterAll(() => {
    rmSync(work, { recursive: true, force: true })
    rmSync(app.getPath('userData'), { recursive: true, force: true })
  })

  it('preserves every pad setting, including gain, trim and hotkey', async () => {
    const chime = await importSound(CHIME)
    const trimMe = await importSound(TRIM_ME)
    const manifest = manifestFor(chime, trimMe)
    const packPath = join(work, 'round-trip.soundpack')

    await writePack(packPath, manifest, [
      { hash: chime.hash, ext: chime.ext },
      { hash: trimMe.hash, ext: trimMe.ext }
    ])

    // Empty the library so the import has to restore the audio from the pack.
    rmSync(soundPath(chime.hash, chime.ext))
    rmSync(soundPath(trimMe.hash, trimMe.ext))

    const pack = await readPack(packPath)

    expect(pack.manifest).toEqual(manifest)
    for (const [source, sound] of [
      [CHIME, chime],
      [TRIM_ME, trimMe]
    ] as const) {
      const entry = pack.files[`sounds/${sound.hash}.wav`]
      expect(entry).toEqual({ hash: sound.hash, ext: '.wav' })
      expect(readFileSync(soundPath(entry.hash, entry.ext))).toEqual(readFileSync(source))
    }
  })

  it('writes each clip once even when several pads share it', async () => {
    const chime = await importSound(CHIME)
    const manifest = manifestFor(chime, chime)
    const packPath = join(work, 'shared.soundpack')

    await writePack(packPath, manifest, [
      { hash: chime.hash, ext: chime.ext },
      { hash: chime.hash, ext: chime.ext }
    ])
    const pack = await readPack(packPath)

    expect(Object.keys(pack.files)).toEqual([`sounds/${chime.hash}.wav`])
  })

  it('refuses a zip that is not a soundpack', async () => {
    const chime = await importSound(CHIME)
    const packPath = join(work, 'no-manifest.soundpack')
    await writePack(packPath, manifestFor(chime, chime), [])
    // Rewrite the manifest name so the archive no longer has one.
    const bytes = readFileSync(packPath)
    writeFileSync(packPath, Buffer.from(bytes.toString('latin1').replaceAll('manifest.json', 'manifest.jsox'), 'latin1'))

    await expect(readPack(packPath)).rejects.toThrow(/manifest\.json is missing/)
  })

  it('refuses a pack from a newer version rather than misreading it', async () => {
    const chime = await importSound(CHIME)
    const packPath = join(work, 'future.soundpack')
    await writePack(packPath, { ...manifestFor(chime, chime), version: PACK_VERSION + 1 }, [])

    await expect(readPack(packPath)).rejects.toThrow(/newer version/)
  })

  it('refuses an entry that climbs out of the library, and writes nothing', async () => {
    // Audio is written under its content hash, never its entry name, and yauzl
    // rejects traversal before isSafeEntryPath sees it -- so this proves the
    // layers together rather than the guard alone.
    const chime = await importSound(CHIME)
    const packPath = join(work, 'zip-slip.soundpack')
    // yazl will not create a traversal entry, so write a harmless name of the
    // same length and patch it in place: the name is not covered by any CRC.
    const safe = `sounds/${'x'.repeat(10)}.wav`
    const evil = `../../${'x'.repeat(11)}.wav`
    expect(evil).toHaveLength(safe.length)

    const zip = await import('yazl')
    const archive = new zip.default.ZipFile()
    archive.addBuffer(Buffer.from(JSON.stringify(manifestFor(chime, chime))), 'manifest.json')
    archive.addBuffer(readFileSync(CHIME), safe)
    const chunks: Buffer[] = []
    await new Promise<void>((done, fail) => {
      archive.outputStream.on('data', (c: Buffer) => chunks.push(c))
      archive.outputStream.on('end', done)
      archive.outputStream.on('error', fail)
      archive.end()
    })
    const patched = Buffer.from(Buffer.concat(chunks).toString('latin1').replaceAll(safe, evil), 'latin1')
    writeFileSync(packPath, patched)

    await expect(readPack(packPath)).rejects.toThrow()
    const escaped = resolve(app.getPath('userData'), 'sounds', evil)
    expect(existsSync(escaped)).toBe(false)
  })
})

describe('isSafeEntryPath', () => {
  it('accepts ordinary entries', () => {
    expect(isSafeEntryPath('manifest.json')).toBe(true)
    expect(isSafeEntryPath('sounds/ee3c564c4f9e48eb.wav')).toBe(true)
    expect(isSafeEntryPath('sounds/..hidden.wav')).toBe(true)
  })

  it('rejects anything that could land outside the extraction directory', () => {
    for (const name of [
      '../evil.wav',
      'sounds/../../evil.wav',
      'sounds\\..\\..\\evil.wav',
      '/etc/passwd',
      '\\Windows\\evil.dll',
      'C:\\Windows\\evil.dll',
      'c:/evil.wav',
      'sounds/evil\0.wav'
    ]) {
      expect(isSafeEntryPath(name), name).toBe(false)
    }
  })
})
