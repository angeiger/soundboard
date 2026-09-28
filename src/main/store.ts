import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs'
import { configPath } from './paths'
import { defaultConfig, CONFIG_VERSION } from '@shared/defaults'
import type { Config } from '@shared/types'

let cached: Config | null = null

function migrate(raw: Config): Config {
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
      try {
        renameSync(configPath, `${configPath}.corrupt-${Date.now()}`)
      } catch {
        /* best effort */
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
