import { app, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '@shared/types'

// electron-updater is CommonJS; its named exports are not visible to an ES
// module import, so take the namespace and destructure.
const { autoUpdater } = electronUpdater

/**
 * Auto-update from GitHub releases (the publish block in electron-builder.yml).
 *
 * Four people on hand-copied installers drift apart in version with no way to
 * tell who runs what, so updates download by themselves. They never install
 * by themselves mid-session: a soundboard that restarts itself in the middle
 * of a game is worse than a stale one. The renderer offers a restart; declined,
 * the update installs silently the next time the app is closed.
 *
 * The app is unsigned, so publisherName must stay unset in the builder config.
 * With it set, electron-updater would verify a signature that does not exist
 * and refuse every update.
 */

let status: UpdateStatus = app.isPackaged ? { state: 'idle' } : { state: 'unsupported' }
let getWindow: () => BrowserWindow | null = () => null
let pendingVersion = ''

function publish(next: UpdateStatus): void {
  status = next
  getWindow()?.webContents.send('updater:status', status)
}

/** First line of an error, which is all anyone can act on. */
function firstLine(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.split('\n')[0].slice(0, 300)
}

/**
 * An update failure must be visible: a silent catch leaves someone stranded
 * on an old build with no signal at all. This turns the common causes into
 * something that says what to do.
 */
export function describeUpdateError(detail: string, during: 'check' | 'download' | 'install'): string {
  const offline =
    /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_NETWORK|ERR_TIMED_OUT|net::/i
  if (offline.test(detail)) return 'Could not reach the update server. Check your internet connection.'
  if (/sha512|checksum/i.test(detail)) return 'The downloaded update was damaged. It will be downloaded again.'
  if (/\b404\b|Cannot find latest|No published versions/i.test(detail)) {
    return 'The update server has no release for Soundboard yet.'
  }
  if (during === 'install') return 'The update could not be installed.'
  return during === 'download' ? 'The update could not be downloaded.' : 'Could not check for updates.'
}

function fail(err: unknown, during: 'check' | 'download' | 'install'): void {
  const detail = firstLine(err)
  publish({ state: 'error', message: describeUpdateError(detail, during), detail, during })
}

export function initUpdater(win: () => BrowserWindow | null): void {
  getWindow = win
  // electron-updater throws confusingly when unpackaged; there is nothing to
  // update in dev anyway.
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    pendingVersion = info.version
    publish({ state: 'downloading', version: info.version, percent: 0, bytesPerSecond: 0 })
  })
  autoUpdater.on('update-not-available', () => publish({ state: 'up-to-date', checkedAt: Date.now() }))
  autoUpdater.on('download-progress', (p) =>
    publish({
      state: 'downloading',
      version: pendingVersion,
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond
    })
  )
  autoUpdater.on('update-downloaded', (info) => publish({ state: 'downloaded', version: info.version }))
  autoUpdater.on('error', (err) => fail(err, status.state === 'downloading' ? 'download' : 'check'))

  // One check shortly after launch, when people are still in the menus. No
  // periodic re-check: a 90 MB download starting mid-match costs ping.
  setTimeout(() => void checkForUpdates(), 5000)
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return status
  // Already on it, or already done: a second check would restart the download.
  if (status.state === 'checking' || status.state === 'downloading' || status.state === 'downloaded') {
    return status
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    // Download failures arrive through the 'error' event; this promise would
    // otherwise reject a second time, unhandled.
    result?.downloadPromise?.catch(() => undefined)
  } catch (err) {
    fail(err, 'check')
  }
  return status
}

export function currentStatus(): UpdateStatus {
  return status
}

/**
 * Silent, so the assisted installer does not put its wizard up mid-update, and
 * forced to run afterwards, so the app comes back rather than just vanishing.
 * The installer is spawned detached before the app quits, so it outlives us,
 * and the single-instance lock is free again by the time it relaunches.
 */
export function installUpdate(): void {
  if (status.state !== 'downloaded') return
  try {
    autoUpdater.quitAndInstall(true, true)
  } catch (err) {
    fail(err, 'install')
  }
}
