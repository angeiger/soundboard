import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs'
import { configPath } from './paths'
import { defaultConfig, CONFIG_VERSION } from '@shared/defaults'
import type { Config } from '@shared/types'

let cached: Config | null = null

/**
 * Where a corrupt config was set aside, until the renderer has shown it. A
 * reset to defaults empties the soundboard; without a word about why, and
 * where the old pads went, that looks like every pad was deleted.
 */
let recoveredFrom: string | null = null

export function takeRecoveryNotice(): string | null {
  const notice = recoveredFrom
  recoveredFrom = null
  return notice
}

/** Brings a stored config of any version up to CONFIG_VERSION. Exported for tests. */
export function migrate(raw: Config): Config {
  const base = defaultConfig()
  const merged: Config = {
    ...base,
    ...raw,
    version: CONFIG_VERSION,
    mic: { ...base.mic, ...raw.mic },
    output: { ...base.output, ...raw.output }
  }

  // v1 bound bank switching to Control+1..9 and defaulted it on. Those combos
  // are consumed system-wide and are Discord's own server switcher, so anyone
  // carrying a v1 config gets it turned off once; they can opt back in from
  // Settings, where it now uses Control+Alt+digit instead.
  if ((raw.version ?? 1) < 2) merged.bankHotkeysEnabled = false

  // setupCompleted existed before v3 but nothing ever set it, so every older
  // config says false. Someone who already picked a cable device has been
  // through setup by hand and should not be walked through it again on
  // update; anyone who has not gets the wizard. It stays re-openable from
  // Settings either way.
  if ((raw.version ?? 1) < 3 && raw.output?.cableDeviceId) merged.setupCompleted = true

  // Never read by anything, and removed from Config. The spread above would
  // otherwise carry it forward in every saved file indefinitely.
  Reflect.deleteProperty(merged, 'launchMinimised')

  return merged
}

export function loadConfig(): Config {
  if (cached) return cached
  if (!existsSync(configPath)) {
    cached = defaultConfig()
    return cached
  }
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as Config
    cached = migrate(raw)
  } catch {
    // A corrupt config should not brick the app. Keep the bad file around so
    // the pads can be recovered by hand if it matters.
    if (existsSync(configPath)) {
      const aside = `${configPath}.corrupt-${Date.now()}`
      try {
        renameSync(configPath, aside)
        recoveredFrom = aside
      } catch {
        // Could not even move it; the defaults still let the app start, and
        // the unreadable file stays in place until the next save.
        recoveredFrom = configPath
      }
    }
    cached = defaultConfig()
  }
  return cached
}

export function saveConfig(config: Config): void {
  cached = config
  // Write to a temp file then rename, so a crash mid-write cannot truncate the
  // real config.
  const tmp = `${configPath}.tmp`
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8')
  renameSync(tmp, configPath)
}
