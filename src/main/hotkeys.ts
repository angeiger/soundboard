import { globalShortcut } from 'electron'
import type { Pad, HotkeyRegistrationResult } from '@shared/types'

/**
 * Global hotkeys go through Electron's globalShortcut, which on Windows is a
 * thin wrapper over the Win32 RegisterHotKey API.
 *
 * This is deliberate and load-bearing: RegisterHotKey asks the OS to deliver a
 * combo to our window. It installs no hook, injects no DLL and never touches
 * another process. Riot's Vanguard (League, Valorant) is hostile to
 * SetWindowsHookEx-style keyboard hooks, which is the usual way soundboards do
 * this -- so we never use one. Do not swap this module for uiohook-napi,
 * iohook, node-global-key-listener or anything else that hooks the input queue.
 *
 * The trade-offs that follow from RegisterHotKey:
 *   - keyboard only, so mouse4/mouse5 cannot be bound
 *   - a registered combo is consumed and never reaches the focused game
 *   - bare single keys are technically allowed but would be stolen from every
 *     other app, so the UI requires a modifier unless the key is F13-F24
 */

type TriggerHandler = (padId: string) => void

let onTrigger: TriggerHandler = () => {}
let onPanic: () => void = () => {}
let onBankSwitch: (index: number) => void = () => {}

/** accelerator -> padId, for everything we currently hold. */
const registered = new Map<string, string>()

export function setHandlers(handlers: {
  trigger: TriggerHandler
  panic: () => void
  bankSwitch: (index: number) => void
}): void {
  onTrigger = handlers.trigger
  onPanic = handlers.panic
  onBankSwitch = handlers.bankSwitch
}

/**
 * F13-F24 exist in the HID spec but on no normal keyboard, so binding them
 * without a modifier steals nothing from anyone.
 */
const MODIFIERLESS_SAFE = /^F(1[3-9]|2[0-4])$/i

export function validateAccelerator(accelerator: string): 'ok' | 'invalid' {
  if (!accelerator.trim()) return 'invalid'
  const parts = accelerator.split('+')
  const key = parts[parts.length - 1]
  const hasModifier = parts.length > 1
  if (!hasModifier && !MODIFIERLESS_SAFE.test(key)) return 'invalid'
  return 'ok'
}

function registerOne(accelerator: string, handler: () => void): boolean {
  try {
    // globalShortcut.register returns false when another process already owns
    // the combo. It can also throw on a malformed accelerator string.
    return globalShortcut.register(accelerator, handler)
  } catch {
    return false
  }
}

/**
 * Drops every binding and re-registers from scratch. Cheap enough at our scale
 * and avoids an entire class of stale-binding bugs.
 */
export function syncPadHotkeys(
  pads: Pad[],
  panicHotkey: string | null,
  bankHotkeysEnabled: boolean
): HotkeyRegistrationResult[] {
  globalShortcut.unregisterAll()
  registered.clear()

  const results: HotkeyRegistrationResult[] = []

  for (const pad of pads) {
    if (!pad.hotkey) continue

    if (validateAccelerator(pad.hotkey) === 'invalid') {
      results.push({ padId: pad.id, accelerator: pad.hotkey, ok: false, reason: 'invalid' })
      continue
    }

    const existing = registered.get(pad.hotkey)
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

    const padId = pad.id
    const ok = registerOne(pad.hotkey, () => onTrigger(padId))
    if (ok) registered.set(pad.hotkey, padId)
    results.push({
      padId,
      accelerator: pad.hotkey,
      ok,
      reason: ok ? undefined : 'taken'
    })
  }

  if (panicHotkey) registerOne(panicHotkey, () => onPanic())

  if (bankHotkeysEnabled) {
    // Control+Alt+digit, not Control+digit. A registered combo is consumed
    // system-wide, and Control+1..9 is Discord's own server switcher -- binding
    // it here silently breaks that everywhere. The top-row digits used here do
    // not collide with the numpad digits the pads default to.
    for (let i = 1; i <= 9; i++) {
      registerOne(`Control+Alt+${i}`, () => onBankSwitch(i - 1))
    }
  }

  return results
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll()
  registered.clear()
}
