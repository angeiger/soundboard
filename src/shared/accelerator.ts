/**
 * The accelerator format, defined once.
 *
 * Two places turn a physical key combo into an accelerator string, each from
 * a different input source:
 *
 *   src/main/hotkeys.ts               uiohook keycodes, when a pad should fire
 *   src/renderer/src/state/hotkey.ts  KeyboardEvent.code, when one is recorded
 *
 * Nothing but string equality connects the two, so if they disagree by so
 * much as a modifier's position the pad records fine and then never fires.
 * Each side keeps its own keycode table -- the inputs genuinely differ -- and
 * maps it onto the physical key names below. Everything downstream of that,
 * tokens, modifier order and the modifierless rule, lives here.
 *
 * Physical keys are named by their W3C KeyboardEvent.code: a standard,
 * layout-independent naming the renderer already receives directly.
 */

function buildKeyTokens(): Map<string, string> {
  const tokens = new Map<string, string>()

  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') tokens.set(`Key${letter}`, letter)
  for (let d = 0; d <= 9; d++) tokens.set(`Digit${d}`, String(d))
  for (let f = 1; f <= 24; f++) tokens.set(`F${f}`, `F${f}`)
  for (let d = 0; d <= 9; d++) tokens.set(`Numpad${d}`, `num${d}`)

  const rest: [string, string][] = [
    ['NumpadAdd', 'numadd'],
    ['NumpadSubtract', 'numsub'],
    ['NumpadMultiply', 'nummult'],
    ['NumpadDivide', 'numdiv'],
    ['NumpadDecimal', 'numdec'],
    ['NumpadEnter', 'Enter'],
    ['Space', 'Space'],
    ['Enter', 'Return'],
    ['Backspace', 'Backspace'],
    ['Tab', 'Tab'],
    ['Escape', 'Escape'],
    ['ArrowUp', 'Up'],
    ['ArrowDown', 'Down'],
    ['ArrowLeft', 'Left'],
    ['ArrowRight', 'Right'],
    ['Home', 'Home'],
    ['End', 'End'],
    ['PageUp', 'PageUp'],
    ['PageDown', 'PageDown'],
    ['Insert', 'Insert'],
    ['Delete', 'Delete'],
    ['Minus', '-'],
    ['Equal', '='],
    ['BracketLeft', '['],
    ['BracketRight', ']'],
    ['Backslash', '\\'],
    ['Semicolon', ';'],
    ['Quote', "'"],
    ['Comma', ','],
    ['Period', '.'],
    ['Slash', '/'],
    ['Backquote', '`']
  ]
  for (const [code, token] of rest) tokens.set(code, token)

  return tokens
}

/** Physical key (KeyboardEvent.code) -> accelerator token. */
export const KEY_TOKENS: ReadonlyMap<string, string> = buildKeyTokens()

/**
 * Mouse buttons worth binding. Left and right are deliberately absent --
 * binding either would make the app unusable.
 */
export type MouseButton = 'middle' | 'back' | 'forward'

export const MOUSE_TOKENS: Readonly<Record<MouseButton, string>> = {
  middle: 'Mouse3',
  back: 'Mouse4',
  forward: 'Mouse5'
}

export interface ModifierState {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/**
 * Modifier order is part of the format: "Alt+Control+X" is a different string
 * from "Control+Alt+X", and would never match.
 */
export const MODIFIER_ORDER = ['Control', 'Alt', 'Shift', 'Super'] as const

export function buildAccelerator(mods: ModifierState, token: string): string {
  const held = [mods.ctrlKey, mods.altKey, mods.shiftKey, mods.metaKey]
  const parts: string[] = MODIFIER_ORDER.filter((_, i) => held[i])
  parts.push(token)
  return parts.join('+')
}

/**
 * F13-F24 and the extra mouse buttons are safe without a modifier: no normal
 * typing produces them, so they cannot fire a pad by accident. Anything else
 * needs one, because the hook does not consume keystrokes -- a bare key would
 * fire its pad every time it was typed in Discord.
 */
const MODIFIERLESS_SAFE = /^(F(1[3-9]|2[0-4])|Mouse[345])$/

export function isModifierlessSafe(token: string): boolean {
  return MODIFIERLESS_SAFE.test(token)
}

const KNOWN_TOKENS = new Set<string>([...KEY_TOKENS.values(), ...Object.values(MOUSE_TOKENS)])

/**
 * 'ok' only for a string buildAccelerator could have produced for a real key
 * and that is safe to bind. A malformed one would register without error and
 * then silently never fire, so it is rejected here instead.
 */
export function validateAccelerator(accelerator: string): 'ok' | 'invalid' {
  const parts = accelerator.split('+')
  // "Control++" is Control plus the "+" key, which is not a token we emit.
  if (parts.some((p) => p === '')) return 'invalid'

  const token = parts[parts.length - 1]
  const modifiers = parts.slice(0, -1)
  if (!KNOWN_TOKENS.has(token)) return 'invalid'

  let last = -1
  for (const m of modifiers) {
    const i = (MODIFIER_ORDER as readonly string[]).indexOf(m)
    if (i <= last) return 'invalid'
    last = i
  }

  if (modifiers.length === 0 && !isModifierlessSafe(token)) return 'invalid'
  return 'ok'
}

/** Ctrl+Alt+1..9 switches to bank 1..9 when bank hotkeys are enabled. */
export function bankAccelerator(bankIndex: number): string {
  return buildAccelerator(
    { ctrlKey: true, altKey: true, shiftKey: false, metaKey: false },
    String(bankIndex + 1)
  )
}
