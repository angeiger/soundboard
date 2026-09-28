import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { loadConfig, saveConfig } from './store'
import * as library from './library'
import { syncPadHotkeys, unregisterAll, validateAccelerator } from './hotkeys'
import { writePack, readPack } from './soundpack'
import type { Config, Pad, PackManifest } from '@shared/types'

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('config:get', () => loadConfig())

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
    const out: library.ImportedSound[] = []
    for (const p of filePaths) {
      if (!library.isSupported(p)) continue
      try {
        out.push(await library.importSound(p))
      } catch {
        // A single unreadable file should not abort the whole drop.
      }
    }
    return out
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

  ipcMain.handle('hotkeys:validate', (_e, accelerator: string) =>
    validateAccelerator(accelerator)
  )

  /**
   * While the UI is listening for a new hotkey we must release everything we
   * hold: a combo owned by RegisterHotKey never reaches the renderer's keydown
   * handler, so without this you could never rebind an existing pad.
   */
  ipcMain.handle('hotkeys:suspend', () => {
    unregisterAll()
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
}
