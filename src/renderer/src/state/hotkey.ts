import {
  KEY_TOKENS,
  MOUSE_TOKENS,
  buildAccelerator,
  validateAccelerator,
  type MouseButton
} from '@shared/accelerator'

/**
 * Turns a key or mouse press in the hotkey recorder into an accelerator.
 *
 * The main process builds the same strings from uiohook keycodes when a pad
 * fires, and the two must agree exactly -- see src/shared/accelerator.ts,
 * which owns the format. This file only knows how the browser names things.
 */

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight'
])

export function isModifierKey(code: string): boolean {
  return MODIFIER_CODES.has(code)
}

export interface CapturedHotkey {
  accelerator: string
  /** False when a bare key would fire the pad every time it was typed elsewhere. */
  safe: boolean
}

/**
 * The browser numbers mouse buttons 0 left, 1 middle, 2 right, 3 back and
 * 4 forward. Left and right are excluded -- binding those would make the app
 * unusable.
 */
export const BROWSER_MOUSE_BUTTONS: Readonly<Record<number, MouseButton>> = {
  1: 'middle',
  3: 'back',
  4: 'forward'
}

export function captureMouseButton(e: MouseEvent): CapturedHotkey | null {
  const button = BROWSER_MOUSE_BUTTONS[e.button]
  if (!button) return null
  const accelerator = buildAccelerator(e, MOUSE_TOKENS[button])
  return { accelerator, safe: validateAccelerator(accelerator) === 'ok' }
}

export function captureHotkey(e: KeyboardEvent): CapturedHotkey | null {
  if (isModifierKey(e.code)) return null

  // KeyboardEvent.code already is the shared physical-key name.
  const token = KEY_TOKENS.get(e.code)
  if (!token) return null

  const accelerator = buildAccelerator(e, token)
  return { accelerator, safe: validateAccelerator(accelerator) === 'ok' }
}

/** Turns an accelerator into something readable on a pad face. */
export function formatAccelerator(accelerator: string | null): string {
  if (!accelerator) return ''
  return accelerator
    .split('+')
    .map((part) => {
      if (part === 'Control') return 'Ctrl'
      if (part === 'Super') return 'Win'
      if (part.startsWith('num')) {
        const rest = part.slice(3)
        if (/^[0-9]$/.test(rest)) return `Num${rest}`
        return { add: 'Num+', sub: 'Num-', mult: 'Num*', div: 'Num/', dec: 'Num.' }[rest] ?? part
      }
      return part
    })
    .join(' + ')
}
