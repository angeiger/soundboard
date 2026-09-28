/**
 * Translation between browser KeyboardEvents and Electron accelerator strings.
 *
 * Electron's globalShortcut maps onto Win32 RegisterHotKey, which is keyboard
 * only -- there is deliberately no path here for mouse buttons. See
 * src/main/hotkeys.ts for why we do not use a low-level hook.
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

/** F13-F24 are safe without a modifier: no normal keyboard can produce them. */
const MODIFIERLESS_SAFE = /^F(1[3-9]|2[0-4])$/

export function isModifierKey(code: string): boolean {
  return MODIFIER_CODES.has(code)
}

/** Maps a KeyboardEvent.code to the token Electron expects. */
function codeToAcceleratorKey(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`

  const table: Record<string, string> = {
    NumpadAdd: 'numadd',
    NumpadSubtract: 'numsub',
    NumpadMultiply: 'nummult',
    NumpadDivide: 'numdiv',
    NumpadDecimal: 'numdec',
    NumpadEnter: 'Enter',
    Space: 'Space',
    Enter: 'Return',
    Backspace: 'Backspace',
    Tab: 'Tab',
    Escape: 'Escape',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    Delete: 'Delete',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backquote: '`'
  }
  return table[code] ?? null
}

export interface CapturedHotkey {
  accelerator: string
  /** False when the combo would be stolen from every other app. */
  safe: boolean
}

export function captureHotkey(e: KeyboardEvent): CapturedHotkey | null {
  if (isModifierKey(e.code)) return null

  const key = codeToAcceleratorKey(e.code)
  if (!key) return null

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')
  parts.push(key)

  const hasModifier = parts.length > 1
  return {
    accelerator: parts.join('+'),
    safe: hasModifier || MODIFIERLESS_SAFE.test(key)
  }
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
