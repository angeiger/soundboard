import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { writeFileSync, readdirSync, rmSync, existsSync } from 'fs'
import { app } from 'electron'
import { defaultConfig, CONFIG_VERSION } from '@shared/defaults'
import type { Config } from '@shared/types'

vi.mock('electron', async () => {
  const fs = await import('fs')
  const os = await import('os')
  const path = await import('path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soundboard-test-'))
  return { app: { getPath: () => dir } }
})

/** A config as an older build would have written it: no version field at all. */
function v1Config(): Config {
  const c = defaultConfig() as Partial<Config> & Record<string, unknown>
  delete c.version
  c.bankHotkeysEnabled = true
  c.launchMinimised = false
  return c as Config
}

describe('migrate', () => {
  it('turns bank hotkeys off once for v1 configs', async () => {
    const { migrate } = await import('./store')
    const migrated = migrate(v1Config())
    expect(migrated.bankHotkeysEnabled).toBe(false)
    expect(migrated.version).toBe(CONFIG_VERSION)
  })

  it('leaves a v2 opt-in to bank hotkeys alone', async () => {
    const { migrate } = await import('./store')
    const raw = { ...defaultConfig(), version: 2, bankHotkeysEnabled: true }
    expect(migrate(raw).bankHotkeysEnabled).toBe(true)
  })

  it('skips the setup wizard for older configs that already chose a cable', async () => {
    const { migrate } = await import('./store')
    const configured = { ...defaultConfig(), version: 2 }
    configured.output.cableDeviceId = 'cable-id'
    expect(migrate(configured).setupCompleted).toBe(true)
  })

  it('still shows the wizard to older configs that never chose a cable', async () => {
    const { migrate } = await import('./store')
    expect(migrate({ ...defaultConfig(), version: 2 }).setupCompleted).toBe(false)
  })

  it('never reopens a finished setup, or finishes an open one, for current configs', async () => {
    const { migrate } = await import('./store')
    const fresh = defaultConfig()
    fresh.output.cableDeviceId = 'cable-id'
    expect(migrate(fresh).setupCompleted).toBe(false)
    expect(migrate({ ...defaultConfig(), setupCompleted: true }).setupCompleted).toBe(true)
  })

  it('drops launchMinimised, which nothing reads', async () => {
    const { migrate } = await import('./store')
    expect('launchMinimised' in migrate(v1Config())).toBe(false)
  })

  it('fills in settings added since the config was written', async () => {
    const { migrate } = await import('./store')
    const { duckEnabled: _added, ...olderMic } = defaultConfig().mic
    const raw = { ...defaultConfig(), mic: olderMic } as unknown as Config
    expect(migrate(raw).mic.duckEnabled).toBe(defaultConfig().mic.duckEnabled)
  })

  it('keeps what the user chose over the defaults', async () => {
    const { migrate } = await import('./store')
    const raw = defaultConfig()
    raw.master = 0.25
    raw.output.cableDeviceId = 'cable-id'
    raw.mic.gateThreshold = -60
    const migrated = migrate(raw)
    expect(migrated.master).toBe(0.25)
    expect(migrated.output.cableDeviceId).toBe('cable-id')
    expect(migrated.mic.gateThreshold).toBe(-60)
  })
})

describe('loadConfig', () => {
  const dir = (): string => app.getPath('userData')

  beforeEach(() => {
    // loadConfig caches, so each case needs a fresh module and a clean folder.
    vi.resetModules()
    for (const f of readdirSync(dir())) rmSync(`${dir()}/${f}`, { recursive: true })
  })
  afterAll(() => rmSync(dir(), { recursive: true, force: true }))

  it('starts from defaults when there is no config yet', async () => {
    const { loadConfig } = await import('./store')
    expect(loadConfig()).toEqual(defaultConfig())
  })

  it('sets a corrupt config aside instead of bricking the app', async () => {
    writeFileSync(`${dir()}/config.json`, '{ "banks": [ truncated')
    const { loadConfig } = await import('./store')

    expect(loadConfig().pads).toEqual([])
    expect(existsSync(`${dir()}/config.json`)).toBe(false)
    expect(readdirSync(dir()).some((f) => f.startsWith('config.json.corrupt-'))).toBe(true)
  })

  it('round-trips through saveConfig', async () => {
    const { loadConfig, saveConfig } = await import('./store')
    const config = { ...defaultConfig(), master: 0.4 }
    saveConfig(config)

    vi.resetModules()
    const fresh = await import('./store')
    expect(fresh.loadConfig().master).toBe(0.4)
    expect(loadConfig).not.toBe(fresh.loadConfig)
  })
})
