import { uIOhook, UiohookKey } from 'uiohook-napi'
import {
  KEY_TOKENS,
  MOUSE_TOKENS,
  buildAccelerator,
  validateAccelerator,
  bankAccelerator,
  type ModifierState,
  type MouseButton
} from '@shared/accelerator'
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
 * uiohook keycode -> physical key, named by KeyboardEvent.code so this and the
 * renderer share one vocabulary (src/shared/accelerator.ts).
 *
 * Numpad keys appear twice on purpose: Windows reports a different code
 * depending on NumLock, and a pad bound to Numpad 1 must fire either way.
 */
function buildKeyTable(): Map<number, string> {
  const K = UiohookKey
  const byName = K as Record<string, number>
  const table = new Map<number, string>()

  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (byName[letter] !== undefined) table.set(byName[letter], `Key${letter}`)
  }
  for (let d = 0; d <= 9; d++) {
    if (byName[String(d)] !== undefined) table.set(byName[String(d)], `Digit${d}`)
  }
  for (let f = 1; f <= 24; f++) {
    if (byName[`F${f}`] !== undefined) table.set(byName[`F${f}`], `F${f}`)
  }

  // NumLock on, then the NumLock-off equivalent for the same physical key.
  const numpad: [number, number | null, string][] = [
    [K.Numpad0, K.NumpadInsert, 'Numpad0'],
    [K.Numpad1, K.NumpadEnd, 'Numpad1'],
    [K.Numpad2, K.NumpadArrowDown, 'Numpad2'],
    [K.Numpad3, K.NumpadPageDown, 'Numpad3'],
    [K.Numpad4, K.NumpadArrowLeft, 'Numpad4'],
    [K.Numpad5, null, 'Numpad5'],
    [K.Numpad6, K.NumpadArrowRight, 'Numpad6'],
    [K.Numpad7, K.NumpadHome, 'Numpad7'],
    [K.Numpad8, K.NumpadArrowUp, 'Numpad8'],
    [K.Numpad9, K.NumpadPageUp, 'Numpad9'],
    [K.NumpadDecimal, K.NumpadDelete, 'NumpadDecimal']
  ]
  for (const [on, off, code] of numpad) {
    table.set(on, code)
    if (off !== null) table.set(off, code)
  }

  // Everything else has the same name in both vocabularies.
  const sameName = [
    'NumpadAdd',
    'NumpadSubtract',
    'NumpadMultiply',
    'NumpadDivide',
    'NumpadEnter',
    'Space',
    'Enter',
    'Backspace',
    'Tab',
    'Escape',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'Insert',
    'Delete',
    'Minus',
    'Equal',
    'BracketLeft',
    'BracketRight',
    'Backslash',
    'Semicolon',
    'Quote',
    'Comma',
    'Period',
    'Slash',
    'Backquote'
  ]
  for (const name of sameName) {
    if (byName[name] !== undefined) table.set(byName[name], name)
  }

  return table
}

/** uiohook keycode -> physical key (KeyboardEvent.code). Exported for tests. */
export const KEYCODE_TO_CODE: ReadonlyMap<number, string> = buildKeyTable()

/** uiohook numbers mouse buttons 1 left, 2 right, 3 middle, 4 back, 5 forward. */
export const UIOHOOK_MOUSE_BUTTONS: Readonly<Record<number, MouseButton>> = {
  3: 'middle',
  4: 'back',
  5: 'forward'
}

export function keyEventAccelerator(e: ModifierState & { keycode: number }): string | null {
  const code = KEYCODE_TO_CODE.get(e.keycode)
  const token = code ? KEY_TOKENS.get(code) : undefined
  return token ? buildAccelerator(e, token) : null
}

export function mouseEventAccelerator(e: ModifierState & { button: unknown }): string | null {
  const button = UIOHOOK_MOUSE_BUTTONS[e.button as number]
  return button ? buildAccelerator(e, MOUSE_TOKENS[button]) : null
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
      const accel = keyEventAccelerator(e)
      if (accel) dispatch(accel)
    })

    uIOhook.on('mousedown', (e) => {
      const accel = mouseEventAccelerator(e)
      if (accel) dispatch(accel)
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
    for (let i = 0; i < 9; i++) bankAccelerators.set(bankAccelerator(i), i)
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
