import { create } from 'zustand'
import { engine } from '@/audio/engine'
import { computePeaks } from '@/audio/peaks'
import { analyzeLoudness, suggestGain } from '@/audio/loudness'
import {
  defaultConfig,
  NEON_COLORS,
  PLAY_MODES,
  SUGGESTED_HOTKEYS,
  DEFAULT_BANK_ID
} from '@shared/defaults'
import type {
  Config,
  Pad,
  Bank,
  MicSettings,
  OutputSettings,
  AudioDevice,
  HotkeyRegistrationResult
} from '@shared/types'

let saveTimer: ReturnType<typeof setTimeout> | null = null
let hotkeyTimer: ReturnType<typeof setTimeout> | null = null

interface State {
  config: Config
  loaded: boolean
  activeBankId: string
  /** Pads currently producing sound, for the glow state. */
  playing: Set<string>
  /** hash -> cached waveform peaks. */
  peaks: Record<string, number[]>
  devices: { inputs: AudioDevice[]; outputs: AudioDevice[] }
  hotkeyIssues: HotkeyRegistrationResult[]
  /** Pad whose settings drawer is open, or null. */
  editingPadId: string | null
  /** Pad currently listening for a new hotkey, or null. */
  capturingPadId: string | null
  settingsOpen: boolean
  searchQuery: string

  load: () => Promise<void>
  setActiveBank: (bankId: string) => void
  setActiveBankByIndex: (index: number) => void

  addPads: (files: string[]) => Promise<void>
  updatePad: (padId: string, patch: Partial<Pad>) => void
  deletePad: (padId: string) => void
  triggerPad: (padId: string) => Promise<void>
  stopPad: (padId: string) => void
  panic: () => void

  addBank: (name: string) => void
  renameBank: (bankId: string, name: string) => void
  deleteBank: (bankId: string) => void

  setMic: (patch: Partial<MicSettings>) => void
  setOutput: (patch: Partial<OutputSettings>) => void
  setMaster: (value: number) => void
  setDevices: (devices: { inputs: AudioDevice[]; outputs: AudioDevice[] }) => void

  setEditingPad: (padId: string | null) => void
  setCapturingPad: (padId: string | null) => void
  setSettingsOpen: (open: boolean) => void
  setSearchQuery: (query: string) => void
  setBankHotkeys: (enabled: boolean) => void
  resyncHotkeys: () => void
  normalizePad: (padId: string) => Promise<void>
  exportBank: (bankId: string) => Promise<string | null>
  importPack: () => Promise<{ ok: boolean; message: string }>
}

function persist(config: Config): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void window.api.config.save(config), 250)
}

/**
 * Re-registering on every keystroke of a rename would be wasteful and would
 * briefly drop bindings, so this coalesces.
 */
function syncHotkeys(config: Config, onResult: (r: HotkeyRegistrationResult[]) => void): void {
  if (hotkeyTimer) clearTimeout(hotkeyTimer)
  hotkeyTimer = setTimeout(async () => {
    const results = await window.api.hotkeys.sync(
      config.pads,
      config.panicHotkey,
      config.bankHotkeysEnabled
    )
    onResult(results.filter((r) => !r.ok))
  }, 200)
}

export const useStore = create<State>((set, get) => ({
  config: defaultConfig(),
  loaded: false,
  activeBankId: DEFAULT_BANK_ID,
  playing: new Set(),
  peaks: {},
  devices: { inputs: [], outputs: [] },
  hotkeyIssues: [],
  editingPadId: null,
  capturingPadId: null,
  settingsOpen: false,
  searchQuery: '',

  load: async () => {
    const config = await window.api.config.get()
    set({
      config,
      loaded: true,
      activeBankId: config.banks[0]?.id ?? DEFAULT_BANK_ID
    })

    await engine.init()
    await engine.setOutput(config.output)
    await engine.setMic(config.mic)
    await engine.setMaster(config.master)

    syncHotkeys(config, (issues) => set({ hotkeyIssues: issues }))

    // Warm the waveform cache for the pads that are on screen.
    for (const pad of config.pads) {
      const cached = await window.api.library.readPeaks(pad.hash)
      if (cached) set((s) => ({ peaks: { ...s.peaks, [pad.hash]: cached } }))
    }
  },

  setActiveBank: (bankId) => set({ activeBankId: bankId }),

  setActiveBankByIndex: (index) => {
    const bank = get().config.banks[index]
    if (bank) set({ activeBankId: bank.id })
  },

  addPads: async (files) => {
    const imported = await window.api.library.import(files)
    if (imported.length === 0) return

    const { config, activeBankId } = get()
    const inBank = config.pads.filter((p) => p.bankId === activeBankId)
    let nextIndex = inBank.length

    // Tracked across the whole loop, not recomputed per file: dropping three
    // clips at once must hand out three different hotkeys.
    const used = new Set(
      config.pads.map((p) => p.hotkey).filter((h): h is string => Boolean(h))
    )

    const newPads: Pad[] = []

    for (const sound of imported) {
      const buffer = await engine.loadBuffer(sound.hash, sound.ext)
      if (!buffer) continue

      // Peaks are computed once here, then cached to disk forever.
      if (!get().peaks[sound.hash]) {
        const cached = await window.api.library.readPeaks(sound.hash)
        const peaks = cached ?? computePeaks(buffer)
        if (!cached) void window.api.library.writePeaks(sound.hash, peaks)
        set((s) => ({ peaks: { ...s.peaks, [sound.hash]: peaks } }))
      }

      const freeHotkey = SUGGESTED_HOTKEYS.find((h) => !used.has(h)) ?? null
      if (freeHotkey) used.add(freeHotkey)

      newPads.push({
        id: crypto.randomUUID(),
        bankId: activeBankId,
        name: sound.name,
        hash: sound.hash,
        ext: sound.ext,
        duration: buffer.duration,
        trimStart: 0,
        trimEnd: null,
        // Measured, not assumed: a mastered clip at unity gain lands about
        // twice as loud as a voice, so every pad would need hand-balancing.
        gain: suggestGain(analyzeLoudness(buffer)),
        playMode: 'restart',
        color: NEON_COLORS[nextIndex % NEON_COLORS.length],
        glyph: '',
        hotkey: freeHotkey,
        noMonitor: false,
        cooldown: 0,
        index: nextIndex++
      })
    }

    const next = { ...get().config, pads: [...get().config.pads, ...newPads] }
    set({ config: next })
    persist(next)
    syncHotkeys(next, (issues) => set({ hotkeyIssues: issues }))
  },

  updatePad: (padId, patch) => {
    const next = {
      ...get().config,
      pads: get().config.pads.map((p) => (p.id === padId ? { ...p, ...patch } : p))
    }
    set({ config: next })
    persist(next)
    if ('hotkey' in patch) syncHotkeys(next, (issues) => set({ hotkeyIssues: issues }))
  },

  deletePad: (padId) => {
    const { config } = get()
    const pad = config.pads.find((p) => p.id === padId)
    if (!pad) return

    engine.stop(padId)
    const pads = config.pads.filter((p) => p.id !== padId)

    // Only prune the audio file once nothing else references the same clip.
    if (!pads.some((p) => p.hash === pad.hash)) {
      void window.api.library.prune(pad.hash, pad.ext)
      engine.evict(pad.hash)
    }

    const next = { ...config, pads }
    set({ config: next, editingPadId: null })
    persist(next)
    syncHotkeys(next, (issues) => set({ hotkeyIssues: issues }))
  },

  triggerPad: async (padId) => {
    const pad = get().config.pads.find((p) => p.id === padId)
    if (!pad) return

    const started = await engine.trigger(pad)
    if (!started) {
      set((s) => {
        const playing = new Set(s.playing)
        if (!engine.isPlaying(padId)) playing.delete(padId)
        return { playing }
      })
      return
    }

    set((s) => ({ playing: new Set(s.playing).add(padId) }))

    // Poll rather than relying on onended, so overlapping voices and trim
    // points both resolve to a single truthful "is this pad lit" answer.
    const tick = (): void => {
      if (engine.isPlaying(padId)) {
        setTimeout(tick, 100)
        return
      }
      set((s) => {
        const playing = new Set(s.playing)
        playing.delete(padId)
        return { playing }
      })
    }
    setTimeout(tick, 100)
  },

  stopPad: (padId) => {
    engine.stop(padId)
    set((s) => {
      const playing = new Set(s.playing)
      playing.delete(padId)
      return { playing }
    })
  },

  panic: () => {
    engine.panic()
    set({ playing: new Set() })
  },

  addBank: (name) => {
    const { config } = get()
    const bank: Bank = { id: crypto.randomUUID(), name, index: config.banks.length }
    const next = { ...config, banks: [...config.banks, bank] }
    set({ config: next, activeBankId: bank.id })
    persist(next)
  },

  renameBank: (bankId, name) => {
    const next = {
      ...get().config,
      banks: get().config.banks.map((b) => (b.id === bankId ? { ...b, name } : b))
    }
    set({ config: next })
    persist(next)
  },

  deleteBank: (bankId) => {
    const { config } = get()
    if (config.banks.length <= 1) return

    const orphaned = config.pads.filter((p) => p.bankId === bankId)
    for (const pad of orphaned) engine.stop(pad.id)

    const banks = config.banks.filter((b) => b.id !== bankId)
    const pads = config.pads.filter((p) => p.bankId !== bankId)

    for (const pad of orphaned) {
      if (!pads.some((p) => p.hash === pad.hash)) {
        void window.api.library.prune(pad.hash, pad.ext)
        engine.evict(pad.hash)
      }
    }

    const next = { ...config, banks, pads }
    set({ config: next, activeBankId: banks[0].id })
    persist(next)
    syncHotkeys(next, (issues) => set({ hotkeyIssues: issues }))
  },

  setMic: (patch) => {
    const next = { ...get().config, mic: { ...get().config.mic, ...patch } }
    set({ config: next })
    persist(next)
    void engine.setMic(next.mic)
  },

  setOutput: (patch) => {
    const next = { ...get().config, output: { ...get().config.output, ...patch } }
    set({ config: next })
    persist(next)
    void engine.setOutput(next.output)
  },

  setMaster: (value) => {
    const next = { ...get().config, master: value }
    set({ config: next })
    persist(next)
    void engine.setMaster(value)
  },

  setDevices: (devices) => set({ devices }),
  setEditingPad: (padId) => set({ editingPadId: padId }),
  setCapturingPad: (padId) => set({ capturingPadId: padId }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  /**
   * Re-registers everything from the current config. Needed after the hotkey
   * capture UI suspends global bindings and the user then cancels -- without
   * this, cancelling would silently leave every pad unbound.
   */
  setBankHotkeys: (enabled) => {
    const next = { ...get().config, bankHotkeysEnabled: enabled }
    set({ config: next })
    persist(next)
    syncHotkeys(next, (issues) => set({ hotkeyIssues: issues }))
  },

  resyncHotkeys: () => {
    syncHotkeys(get().config, (issues) => set({ hotkeyIssues: issues }))
  },

  /** Re-measures a clip and resets its gain to the matched level. */
  normalizePad: async (padId) => {
    const pad = get().config.pads.find((p) => p.id === padId)
    if (!pad) return
    const buffer = await engine.loadBuffer(pad.hash, pad.ext)
    if (!buffer) return
    get().updatePad(padId, { gain: suggestGain(analyzeLoudness(buffer)) })
  },

  exportBank: async (bankId) => {
    const { config } = get()
    const bank = config.banks.find((b) => b.id === bankId)
    if (!bank) return null

    const pads = config.pads
      .filter((p) => p.bankId === bankId)
      .sort((a, b) => a.index - b.index)
    if (pads.length === 0) return null

    const manifest = {
      format: 'soundboard-pack',
      version: 1,
      name: bank.name,
      createdAt: new Date().toISOString(),
      pads: pads.map((p) => ({
        name: p.name,
        file: `sounds/${p.hash}${p.ext}`,
        duration: p.duration,
        trimStart: p.trimStart,
        trimEnd: p.trimEnd,
        gain: p.gain,
        playMode: p.playMode,
        color: p.color,
        glyph: p.glyph,
        cooldown: p.cooldown,
        index: p.index,
        hotkey: p.hotkey
      }))
    }

    const sounds = pads.map((p) => ({ hash: p.hash, ext: p.ext }))
    const safeName = bank.name.replace(/[^\w\- ]+/g, '').trim() || 'soundpack'
    const result = await window.api.pack.export(manifest, sounds, safeName)
    return result.ok ? (result.path ?? null) : null
  },

  importPack: async () => {
    const result = await window.api.pack.import()
    if (!result.ok) {
      return {
        ok: false,
        message: result.reason === 'cancelled' ? '' : result.reason
      }
    }

    const { config } = get()
    const bank: Bank = {
      id: crypto.randomUUID(),
      name: result.manifest.name || 'Imported',
      index: config.banks.length
    }

    // Hotkeys travel with a pack so everyone shares the same muscle memory, but
    // they only apply where the combo is actually free on this machine.
    const taken = new Set(
      config.pads.map((p) => p.hotkey).filter((h): h is string => Boolean(h))
    )

    const pads: Pad[] = []
    for (const packPad of result.manifest.pads) {
      const file = result.files[packPad.file]
      if (!file) continue

      const hotkey = packPad.hotkey && !taken.has(packPad.hotkey) ? packPad.hotkey : null
      if (hotkey) taken.add(hotkey)

      pads.push({
        id: crypto.randomUUID(),
        bankId: bank.id,
        name: packPad.name,
        hash: file.hash,
        ext: file.ext,
        duration: packPad.duration,
        trimStart: packPad.trimStart,
        trimEnd: packPad.trimEnd,
        gain: packPad.gain,
        playMode: (PLAY_MODES as string[]).includes(packPad.playMode)
          ? (packPad.playMode as Pad['playMode'])
          : 'restart',
        color: (NEON_COLORS as string[]).includes(packPad.color)
          ? (packPad.color as Pad['color'])
          : 'cyan',
        glyph: packPad.glyph ?? '',
        hotkey,
        noMonitor: false,
        cooldown: packPad.cooldown ?? 0,
        index: packPad.index
      })
    }

    if (pads.length === 0) {
      return { ok: false, message: 'That pack contained no usable sounds' }
    }

    const next = {
      ...config,
      banks: [...config.banks, bank],
      pads: [...config.pads, ...pads]
    }
    set({ config: next, activeBankId: bank.id })
    persist(next)
    syncHotkeys(next, (issues) => set({ hotkeyIssues: issues }))

    // Warm the waveform cache for what just arrived.
    for (const pad of pads) {
      if (get().peaks[pad.hash]) continue
      const cached = await window.api.library.readPeaks(pad.hash)
      if (cached) {
        set((s) => ({ peaks: { ...s.peaks, [pad.hash]: cached } }))
        continue
      }
      const buffer = await engine.loadBuffer(pad.hash, pad.ext)
      if (!buffer) continue
      const computed = computePeaks(buffer)
      void window.api.library.writePeaks(pad.hash, computed)
      set((s) => ({ peaks: { ...s.peaks, [pad.hash]: computed } }))
    }

    const dropped = result.manifest.pads.length - pads.length
    return {
      ok: true,
      message:
        dropped > 0
          ? `Imported ${pads.length} sounds into “${bank.name}” (${dropped} skipped)`
          : `Imported ${pads.length} sounds into “${bank.name}”`
    }
  }
}))
