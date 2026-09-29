import { app, ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { basename } from 'path'
import { loadConfig, saveConfig, takeRecoveryNotice } from './store'
import * as library from './library'
import { syncPadHotkeys, suspend, resume } from './hotkeys'
import { writePack, readPack } from './soundpack'
import { checkForUpdates, currentStatus, installUpdate } from './updater'
import type { Config, Pad, PackManifest } from '@shared/types'

export function registerIpc(
  getWindow: () => BrowserWindow | null,
  getHookError: () => string | null
): void {
  ipcMain.handle('hotkeys:hookError', () => getHookError())

  ipcMain.handle('config:get', () => loadConfig())
  ipcMain.handle('config:recoveryNotice', () => takeRecoveryNotice())

  ipcMain.handle('config:save', (_e, config: Config) => {
    saveConfig(config)
  })

  ipcMain.handle('library:pickFiles', async () => {
    const win = getWindow()
    if (!win) return []
    const result = await dialog.showOpenDialog(win, {
      title: 'Add sounds',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Audio', extensions: library.SUPPORTED_EXTS.map((e) => e.slice(1)) },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('library:import', async (_e, filePaths: string[]) => {
    const imported: library.ImportedSound[] = []
    const skipped: { name: string; reason: string }[] = []
    for (const p of filePaths) {
      const name = basename(p)
      if (!library.isSupported(p)) {
        skipped.push({ name, reason: 'not an audio format Soundboard plays' })
        continue
      }
      try {
        imported.push(await library.importSound(p))
      } catch (err) {
        // One unreadable file must not abort the whole drop -- but it must
        // not vanish without a word either.
        skipped.push({ name, reason: (err as Error).message || 'could not be read' })
      }
    }
    return { imported, skipped }
  })

  ipcMain.handle('library:read', async (_e, hash: string, ext: string) => {
    const buf = await library.readSound(hash, ext)
    // Copy into a plain ArrayBuffer so it survives structured clone intact.
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })

  ipcMain.handle('library:readPeaks', (_e, hash: string) => library.readPeaks(hash))

  ipcMain.handle('library:writePeaks', (_e, hash: string, peaks: number[]) =>
    library.writePeaks(hash, peaks)
  )

  ipcMain.handle('library:prune', (_e, hash: string, ext: string) =>
    library.pruneSound(hash, ext)
  )

  ipcMain.handle(
    'hotkeys:sync',
    (_e, pads: Pad[], panicHotkey: string | null, bankHotkeysEnabled: boolean) =>
      syncPadHotkeys(pads, panicHotkey, bankHotkeysEnabled)
  )

  /**
   * Pauses triggering while the UI records a new hotkey, so the combo being
   * pressed does not also fire whatever it is currently bound to.
   */
  ipcMain.handle('hotkeys:suspend', () => {
    suspend()
  })

  ipcMain.handle('hotkeys:resume', () => {
    resume()
  })

  ipcMain.handle(
    'pack:export',
    async (
      _e,
      manifest: PackManifest,
      sounds: { hash: string; ext: string }[],
      suggestedName: string
    ) => {
      const win = getWindow()
      if (!win) return { ok: false as const, reason: 'no window' }

      const result = await dialog.showSaveDialog(win, {
        title: 'Export soundpack',
        defaultPath: `${suggestedName}.soundpack`,
        filters: [{ name: 'Soundpack', extensions: ['soundpack'] }]
      })
      if (result.canceled || !result.filePath) return { ok: false as const, reason: 'cancelled' }

      try {
        await writePack(result.filePath, manifest, sounds)
        return { ok: true as const, path: result.filePath }
      } catch (err) {
        return { ok: false as const, reason: (err as Error).message }
      }
    }
  )

  ipcMain.handle('pack:import', async () => {
    const win = getWindow()
    if (!win) return { ok: false as const, reason: 'no window' }

    const result = await dialog.showOpenDialog(win, {
      title: 'Import soundpack',
      properties: ['openFile'],
      filters: [
        { name: 'Soundpack', extensions: ['soundpack', 'zip'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, reason: 'cancelled' }
    }

    try {
      const pack = await readPack(result.filePaths[0])
      return { ok: true as const, ...pack }
    } catch (err) {
      return { ok: false as const, reason: (err as Error).message }
    }
  })

  ipcMain.handle('window:minimize', () => getWindow()?.minimize())
  ipcMain.handle('window:toggleMaximize', () => {
    const win = getWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('window:close', () => getWindow()?.close())

  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('updater:status', () => currentStatus())
  ipcMain.handle('updater:check', () => checkForUpdates())
  ipcMain.handle('updater:install', () => installUpdate())
}
