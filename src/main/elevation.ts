import { app } from 'electron'
import { execFile, spawn } from 'child_process'
import { join } from 'path'
import { tmpdir } from 'os'
import { writeFileSync } from 'fs'

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

/** Where the relaunch helper records what it did, for when it does not work. */
export const relaunchLogPath = join(tmpdir(), 'soundboard-relaunch.log')

/**
 * Relaunches the app elevated and quits this instance.
 *
 * Three things here are load-bearing, each having broken this in testing:
 *
 * 1. The helper is written to a file rather than passed as -Command. Quoting a
 *    command containing spaces, semicolons, quotes and braces through Node's
 *    Windows argument escaping and then PowerShell's parser is a coin flip.
 * 2. It is launched through `cmd /c start`, which orphans it properly. A plain
 *    detached spawn still died with its parent, so the helper never survived
 *    long enough to relaunch anything.
 * 3. It waits for *this* process to actually exit rather than sleeping a fixed
 *    interval. requestSingleInstanceLock means an elevated instance starting
 *    while we still hold the lock would simply focus us and exit.
 */
export function relaunchElevated(): void {
  if (process.platform !== 'win32') return

  const target = process.execPath
  const scriptPath = join(tmpdir(), 'soundboard-relaunch.ps1')

  const script = [
    `$log = ${psQuote(relaunchLogPath)}`,
    `$exe = ${psQuote(target)}`,
    `"[$(Get-Date -Format o)] waiting for PID ${process.pid}" | Set-Content -Path $log`,
    `try { Wait-Process -Id ${process.pid} -Timeout 20 -ErrorAction Stop } catch { "wait ended: $_" | Add-Content $log }`,
    `Start-Sleep -Milliseconds 400`,
    `try {`,
    `  Start-Process -FilePath $exe -Verb RunAs`,
    `  "relaunched elevated" | Add-Content $log`,
    `} catch {`,
    // Declining UAC throws. Without this the user is left with no app at all,
    // having just asked it to restart.
    `  "RunAs failed: $_" | Add-Content $log`,
    `  try { Start-Process -FilePath $exe; "relaunched normally" | Add-Content $log }`,
    `  catch { "normal launch failed too: $_" | Add-Content $log }`,
    `}`
  ].join('\n')

  try {
    writeFileSync(scriptPath, script, 'utf-8')
  } catch {
    // If we cannot even stage the helper, staying open beats quitting into
    // nothing.
    return
  }

  spawn(
    'cmd.exe',
    [
      '/c',
      'start',
      '',
      '/min',
      'powershell.exe',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      scriptPath
    ],
    { detached: true, stdio: 'ignore', windowsHide: true }
  ).unref()

  app.quit()
}

/** Single-quoted PowerShell literal, with embedded quotes doubled. */
function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}
