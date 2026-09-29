import { uIOhook, UiohookKey } from 'uiohook-napi'
import type { Pad, HotkeyRegistrationResult } from '@shared/types'

/**
 * Global hotkeys via a low-level keyboard hook (WH_KEYBOARD_LL, through
 * libuiohook).
 *
 * This replaced Electron's globalShortcut, which wraps Win32 RegisterHotKey.
 * RegisterHotKey looked like the anti-cheat-safe choice, but it is exactly the
 * mechanism a game can switch off: registering raw input with RIDEV_NOHOTKEYS
 * suppresses every application hotkey in the system while that window holds
 * the foreground. League does this, which is why pads fired in the client, on
 * the desktop and while alt-tabbed, but never inside a match -- regardless of
 * display mode or elevation.
 *
 * A low-level hook sits below the raw-input layer and is unaffected. Vanguard
 * tolerates it: Discord's own push-to-talk uses the same mechanism and works
 * in-game, as do OBS and most streaming tools. Unlike a DLL injection, the
 * callback runs in our process and never touches the game's.
 *
 * Two behavioural differences from RegisterHotKey, both deliberate:
 *   - Keystrokes are NOT consumed. The focused app still receives them, so a
 *     bound combo is no longer stolen from every other program. This is why
 *     the UI still insists on a modifier: a bare key would fire a pad while
 *     you were typing in Discord.
 *   - There is no longer any such thing as a combo being "taken" by another
 *     application, so that failure mode disappears.
 */

type TriggerHandler = (padId: string) => void

let onTrigger: TriggerHandler = () => {}
let onPanic: () => void = () => {}
let onBankSwitch: (index: number) => void = () => {}

/** accelerator -> padId */
const bindings = new Map<string, string>()
let panicAccelerator: string | null = null
let bankAccelerators = new Map<string, number>()

let started = false
let suspended = false

/**
 * keycode -> accelerator token. Numpad keys appear twice on purpose: Windows
 * reports a different code depending on NumLock, and a pad bound to Numpad 1
 * must fire either way.
 */
const KEYCODE_TO_TOKEN = new Map<number, string>()

function buildKeyTable(): void {
  const K = UiohookKey

  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const code = (K as Record<string, number>)[letter]
    if (code !== undefined) KEYCODE_TO_TOKEN.set(code, letter)
  }
  for (let d = 0; d <= 9; d++) {
    const code = (K as Record<string, number>)[String(d)]
    if (code !== undefined) KEYCODE_TO_TOKEN.set(code, String(d))
  }
  for (let f = 1; f <= 24; f++) {
    const code = (K as Record<string, number>)[`F${f}`]
    if (code !== undefined) KEYCODE_TO_TOKEN.set(code, `F${f}`)
  }

  // NumLock on, then the NumLock-off equivalent for the same physical key.
  const numpad: [number, number | null, string][] = [
    [K.Numpad0, K.NumpadInsert, 'num0'],
    [K.Numpad1, K.NumpadEnd, 'num1'],
    [K.Numpad2, K.NumpadArrowDown, 'num2'],
    [K.Numpad3, K.NumpadPageDown, 'num3'],
    [K.Numpad4, K.NumpadArrowLeft, 'num4'],
    [K.Numpad5, null, 'num5'],
    [K.Numpad6, K.NumpadArrowRight, 'num6'],
    [K.Numpad7, K.NumpadHome, 'num7'],
    [K.Numpad8, K.NumpadArrowUp, 'num8'],
    [K.Numpad9, K.NumpadPageUp, 'num9'],
    [K.NumpadDecimal, K.NumpadDelete, 'numdec']
  ]
  for (const [on, off, token] of numpad) {
    KEYCODE_TO_TOKEN.set(on, token)
    if (off !== null) KEYCODE_TO_TOKEN.set(off, token)
  }

  const rest: [number, string][] = [
    [K.NumpadAdd, 'numadd'],
    [K.NumpadSubtract, 'numsub'],
    [K.NumpadMultiply, 'nummult'],
    [K.NumpadDivide, 'numdiv'],
    [K.NumpadEnter, 'Enter'],
    [K.Space, 'Space'],
    [K.Enter, 'Return'],
    [K.Backspace, 'Backspace'],
    [K.Tab, 'Tab'],
    [K.Escape, 'Escape'],
    [K.ArrowUp, 'Up'],
    [K.ArrowDown, 'Down'],
    [K.ArrowLeft, 'Left'],
    [K.ArrowRight, 'Right'],
    [K.Home, 'Home'],
    [K.End, 'End'],
    [K.PageUp, 'PageUp'],
    [K.PageDown, 'PageDown'],
    [K.Insert, 'Insert'],
    [K.Delete, 'Delete'],
    [K.Minus, '-'],
    [K.Equal, '='],
    [K.BracketLeft, '['],
    [K.BracketRight, ']'],
    [K.Backslash, '\\'],
    [K.Semicolon, ';'],
    [K.Quote, "'"],
    [K.Comma, ','],
    [K.Period, '.'],
    [K.Slash, '/'],
    [K.Backquote, '`']
  ]
  for (const [code, token] of rest) KEYCODE_TO_TOKEN.set(code, token)
}

buildKeyTable()

/** Mouse buttons worth binding. Left and right are deliberately absent. */
const MOUSE_TOKENS: Record<number, string> = {
  3: 'Mouse3',
  4: 'Mouse4',
  5: 'Mouse5'
}

interface ModifierState {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/** Must match captureHotkey() in the renderer exactly, order included. */
function accelerator(mods: ModifierState, token: string): string {
  const parts: string[] = []
  if (mods.ctrlKey) parts.push('Control')
  if (mods.altKey) parts.push('Alt')
  if (mods.shiftKey) parts.push('Shift')
  if (mods.metaKey) parts.push('Super')
  parts.push(token)
  return parts.join('+')
}

function dispatch(accel: string): void {
  if (suspended) return

  const padId = bindings.get(accel)
  if (padId) {
    onTrigger(padId)
    return
  }
  if (panicAccelerator && accel === panicAccelerator) {
    onPanic()
    return
  }
  const bank = bankAccelerators.get(accel)
  if (bank !== undefined) onBankSwitch(bank)
}

export function setHandlers(handlers: {
  trigger: TriggerHandler
  panic: () => void
  bankSwitch: (index: number) => void
}): void {
  onTrigger = handlers.trigger
  onPanic = handlers.panic
  onBankSwitch = handlers.bankSwitch
}

/** Starts the hook. Safe to call more than once. */
export function startHook(): { ok: boolean; error?: string } {
  if (started) return { ok: true }

  try {
    uIOhook.on('keydown', (e) => {
      const token = KEYCODE_TO_TOKEN.get(e.keycode)
      if (!token) return
      dispatch(accelerator(e, token))
    })

    uIOhook.on('mousedown', (e) => {
      const token = MOUSE_TOKENS[e.button as number]
      if (!token) return
      dispatch(accelerator(e, token))
    })

    uIOhook.start()
    started = true
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export function stopHook(): void {
  if (!started) return
  try {
    uIOhook.stop()
  } catch {
    /* shutting down anyway */
  }
  started = false
}

/**
 * F13-F24 and the extra mouse buttons are safe without a modifier: no normal
 * keyboard or typing produces them, so they cannot fire a pad by accident.
 */
const MODIFIERLESS_SAFE = /^(F(1[3-9]|2[0-4])|Mouse[345])$/i

export function validateAccelerator(accel: string): 'ok' | 'invalid' {
  if (!accel.trim()) return 'invalid'
  const parts = accel.split('+')
  const key = parts[parts.length - 1]
  if (parts.length === 1 && !MODIFIERLESS_SAFE.test(key)) return 'invalid'
  return 'ok'
}

/**
 * Rebuilds the binding table. Unlike the old RegisterHotKey implementation
 * nothing is claimed from the OS, so this cannot fail for external reasons --
 * only two pads wanting the same combo is still an error worth surfacing.
 */
export function syncPadHotkeys(
  pads: Pad[],
  panicHotkey: string | null,
  bankHotkeysEnabled: boolean
): HotkeyRegistrationResult[] {
  bindings.clear()
  bankAccelerators = new Map()
  panicAccelerator = panicHotkey

  const results: HotkeyRegistrationResult[] = []

  for (const pad of pads) {
    if (!pad.hotkey) continue

    if (validateAccelerator(pad.hotkey) === 'invalid') {
      results.push({ padId: pad.id, accelerator: pad.hotkey, ok: false, reason: 'invalid' })
      continue
    }

    const existing = bindings.get(pad.hotkey)
    if (existing) {
      results.push({
        padId: pad.id,
        accelerator: pad.hotkey,
        ok: false,
        reason: 'conflict',
        conflictsWith: existing
      })
      continue
    }

    bindings.set(pad.hotkey, pad.id)
    results.push({ padId: pad.id, accelerator: pad.hotkey, ok: true })
  }

  if (bankHotkeysEnabled) {
    for (let i = 1; i <= 9; i++) bankAccelerators.set(`Control+Alt+${i}`, i - 1)
  }

  return results
}

/**
 * Stops pads firing while the UI is recording a new hotkey. The hook does not
 * consume keystrokes, so the renderer receives the keypress either way -- this
 * only prevents the combo also triggering whatever it is currently bound to.
 */
export function suspend(): void {
  suspended = true
}

export function resume(): void {
  suspended = false
}

/** Kept for the shutdown path; the hook itself is torn down by stopHook. */
export function unregisterAll(): void {
  bindings.clear()
  bankAccelerators = new Map()
  panicAccelerator = null
}
