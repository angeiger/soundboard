import { createWriteStream, existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { extname } from 'path'
import { createHash } from 'crypto'
import yazl from 'yazl'
import yauzl from 'yauzl'
import { soundPath } from './paths'
import { SUPPORTED_EXTS } from './library'
import type { PackManifest } from '@shared/types'

export type { PackManifest, PackPad } from '@shared/types'

export const PACK_FORMAT = 'soundboard-pack'
export const PACK_VERSION = 1

/** Guards against a zip entry escaping the extraction directory. */
function isSafeEntryPath(name: string): boolean {
  if (name.includes('\0')) return false
  const normalised = name.replace(/\\/g, '/')
  if (normalised.startsWith('/') || /^[a-zA-Z]:/.test(normalised)) return false
  return !normalised.split('/').includes('..')
}

export async function writePack(
  destPath: string,
  manifest: PackManifest,
  sounds: { hash: string; ext: string }[]
): Promise<void> {
  const zip = new yazl.ZipFile()

  zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'), 'manifest.json')

  const seen = new Set<string>()
  for (const s of sounds) {
    const key = `${s.hash}${s.ext}`
    if (seen.has(key)) continue
    seen.add(key)
    const src = soundPath(s.hash, s.ext)
    if (existsSync(src)) zip.addFile(src, `sounds/${key}`)
  }

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(destPath)
    out.on('close', resolve)
    out.on('error', reject)
    zip.outputStream.on('error', reject)
    zip.outputStream.pipe(out)
    zip.end()
  })
}

export interface ReadPackResult {
  manifest: PackManifest
  /** Zip path -> { hash, ext } after being copied into the library. */
  files: Record<string, { hash: string; ext: string }>
}

/**
 * Unpacks into a temp directory, then copies each audio file into the library
 * under its own content hash. The hash is recomputed here rather than trusted
 * from the pack, so a tampered or simply stale manifest cannot make two
 * different clips collide on one library file.
 */
export async function readPack(srcPath: string): Promise<ReadPackResult> {
  const entries = await extractAll(srcPath)

  const manifestRaw = entries['manifest.json']
  if (!manifestRaw) throw new Error('Not a soundpack: manifest.json is missing')

  const manifest = JSON.parse(manifestRaw.toString('utf-8')) as PackManifest
  if (manifest.format !== PACK_FORMAT) throw new Error('Not a soundpack')
  if (manifest.version > PACK_VERSION) {
    throw new Error('This pack was made by a newer version of Soundboard')
  }

  const files: Record<string, { hash: string; ext: string }> = {}

  for (const [entryPath, buf] of Object.entries(entries)) {
    if (entryPath === 'manifest.json') continue
    const ext = extname(entryPath).toLowerCase()
    if (!SUPPORTED_EXTS.includes(ext)) continue

    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16)
    const dest = soundPath(hash, ext)
    if (!existsSync(dest)) await writeFile(dest, buf)
    files[entryPath] = { hash, ext }
  }

  return { manifest, files }
}

/** Reads every entry into memory. Packs are a handful of MB, so this is fine. */
function extractAll(srcPath: string): Promise<Record<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.open(srcPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error('Could not open pack'))

      const out: Record<string, Buffer> = {}
      let total = 0
      const LIMIT = 512 * 1024 * 1024

      zipfile.on('error', reject)
      zipfile.on('end', () => resolve(out))

      zipfile.readEntry()
      zipfile.on('entry', (entry) => {
        const name = entry.fileName as string

        if (name.endsWith('/') || !isSafeEntryPath(name)) {
          zipfile.readEntry()
          return
        }

        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return reject(streamErr ?? new Error('Bad entry'))
          const chunks: Buffer[] = []
          stream.on('data', (c: Buffer) => {
            total += c.length
            // A zip bomb would otherwise sit here filling memory.
            if (total > LIMIT) {
              stream.destroy()
              reject(new Error('Pack is unreasonably large'))
              return
            }
            chunks.push(c)
          })
          stream.on('error', reject)
          stream.on('end', () => {
            out[name] = Buffer.concat(chunks)
            zipfile.readEntry()
          })
        })
      })
    })
  })
}
