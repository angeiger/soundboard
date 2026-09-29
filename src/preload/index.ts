import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Config,
  Pad,
  HotkeyRegistrationResult,
  PackManifest,
  UpdateStatus
} from '@shared/types'

export interface ImportedSound {
  hash: string
  ext: string
  name: string
}

const api = {
  config: {
    get: (): Promise<Config> => ipcRenderer.invoke('config:get'),
    save: (config: Config): Promise<void> => ipcRenderer.invoke('config:save', config),
    /** Where a corrupt config was set aside at startup, once; null normally. */
    recoveryNotice: (): Promise<string | null> => ipcRenderer.invoke('config:recoveryNotice')
  },
  library: {
    pickFiles: (): Promise<string[]> => ipcRenderer.invoke('library:pickFiles'),
    import: (
      filePaths: string[]
    ): Promise<{ imported: ImportedSound[]; skipped: { name: string; reason: string }[] }> =>
      ipcRenderer.invoke('library:import', filePaths),
    read: (hash: string, ext: string): Promise<ArrayBuffer> =>
      ipcRenderer.invoke('library:read', hash, ext),
    readPeaks: (hash: string): Promise<number[] | null> =>
      ipcRenderer.invoke('library:readPeaks', hash),
    writePeaks: (hash: string, peaks: number[]): Promise<void> =>
      ipcRenderer.invoke('library:writePeaks', hash, peaks),
    prune: (hash: string, ext: string): Promise<void> =>
      ipcRenderer.invoke('library:prune', hash, ext)
  },
  hotkeys: {
    sync: (
      pads: Pad[],
      panicHotkey: string | null,
      bankHotkeysEnabled: boolean
    ): Promise<HotkeyRegistrationResult[]> =>
      ipcRenderer.invoke('hotkeys:sync', pads, panicHotkey, bankHotkeysEnabled),
    suspend: (): Promise<void> => ipcRenderer.invoke('hotkeys:suspend'),
    resume: (): Promise<void> => ipcRenderer.invoke('hotkeys:resume'),
    hookError: (): Promise<string | null> => ipcRenderer.invoke('hotkeys:hookError')
  },
  pack: {
    export: (
      manifest: PackManifest,
      sounds: { hash: string; ext: string }[],
      suggestedName: string
    ): Promise<{ ok: boolean; path?: string; reason?: string }> =>
      ipcRenderer.invoke('pack:export', manifest, sounds, suggestedName),
    import: (): Promise<
      | { ok: true; manifest: PackManifest; files: Record<string, { hash: string; ext: string }> }
      | { ok: false; reason: string }
    > => ipcRenderer.invoke('pack:import')
  },
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<void> => ipcRenderer.invoke('window:toggleMaximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close')
  },
  /**
   * Electron 32 removed File.path, so the real filesystem path for a
   * drag-and-dropped file has to come from webUtils in the preload.
   */
  pathForFile: (file: File): string | null => {
    try {
      return webUtils.getPathForFile(file) || null
    } catch {
      // Not a file on disk -- dragged text or a link -- so there is nothing to
      // import, and the drop simply ignores it.
      return null
    }
  },
  shell: {
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke('shell:openExternal', url)
  },
  app: {
    version: (): Promise<string> => ipcRenderer.invoke('app:version')
  },
  updater: {
    status: (): Promise<UpdateStatus> => ipcRenderer.invoke('updater:status'),
    check: (): Promise<UpdateStatus> => ipcRenderer.invoke('updater:check'),
    install: (): Promise<void> => ipcRenderer.invoke('updater:install')
  },
  on: {
    updateStatus: (cb: (status: UpdateStatus) => void): (() => void) => {
      const h = (_e: unknown, status: UpdateStatus): void => cb(status)
      ipcRenderer.on('updater:status', h)
      return () => ipcRenderer.off('updater:status', h)
    },
    padTrigger: (cb: (padId: string) => void): (() => void) => {
      const h = (_e: unknown, padId: string): void => cb(padId)
      ipcRenderer.on('trigger:pad', h)
      return () => ipcRenderer.off('trigger:pad', h)
    },
    panic: (cb: () => void): (() => void) => {
      const h = (): void => cb()
      ipcRenderer.on('trigger:panic', h)
      return () => ipcRenderer.off('trigger:panic', h)
    },
    bankSwitch: (cb: (index: number) => void): (() => void) => {
      const h = (_e: unknown, index: number): void => cb(index)
      ipcRenderer.on('trigger:bank', h)
      return () => ipcRenderer.off('trigger:bank', h)
    }
  }
}

export type SoundboardApi = typeof api

contextBridge.exposeInMainWorld('api', api)
