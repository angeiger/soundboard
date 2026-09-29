import { app } from 'electron'
import { execFile, spawn } from 'child_process'
import { join } from 'path'

/**
 * Whether we are running with an elevated token, and how to restart if not.
 *
 * This exists because of Windows UIPI: the OS will not deliver a RegisterHotKey
 * hotkey to a normal-privilege process while an *elevated* window holds the
 * foreground. League of Legends runs its game process elevated, so pads fire
 * everywhere except inside the match -- the one place they are wanted.
 *
 * Nothing here elevates silently. The renderer shows a banner and the user
 * chooses to restart, which produces an ordinary UAC prompt.
 */

/** High Mandatory Level. Present in `whoami /groups` only when elevated. */
const HIGH_INTEGRITY_SID = 'S-1-16-12288'

let cached: boolean | null = null

export function isElevated(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(true)
  if (cached !== null) return Promise.resolve(cached)

  // Absolute path, not bare "whoami": Git Bash, MSYS and Cygwin all ship a
  // whoami that takes no /groups flag, and any of them earlier on PATH would
  // make this check fail.
  const whoami = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe')

  return new Promise((resolve) => {
    execFile(whoami, ['/groups'], { windowsHide: true }, (err, stdout) => {
      // If the check itself fails, claim elevated: a spurious "you need admin"
      // banner is worse than silently not showing one.
      cached = err ? true : stdout.includes(HIGH_INTEGRITY_SID)
      resolve(cached)
    })
  })
}

/**
 * Relaunches the app elevated and quits this instance.
 *
 * The delay is load-bearing. requestSingleInstanceLock means an elevated
 * instance starting while this one still holds the lock would simply focus us
 * and exit, so the new process has to wait for this one to release it.
 */
export function relaunchElevated(): void {
  if (process.platform !== 'win32') return

  const target = process.execPath.replace(/'/g, "''")

  // The catch matters: declining the UAC prompt throws, and without a fallback
  // the user is left with no app at all, having just asked it to restart.
  const command =
    `Start-Sleep -Milliseconds 900; ` +
    `try { Start-Process -FilePath '${target}' -Verb RunAs } ` +
    `catch { Start-Process -FilePath '${target}' }`

  spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', command], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref()

  app.quit()
}
