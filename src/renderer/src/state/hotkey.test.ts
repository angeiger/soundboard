import { describe, it, expect } from 'vitest'
import { UiohookKey } from 'uiohook-napi'
import {
  captureHotkey,
  captureMouseButton,
  formatAccelerator,
  BROWSER_MOUSE_BUTTONS
} from './hotkey'
import {
  KEYCODE_TO_CODE,
  UIOHOOK_MOUSE_BUTTONS,
  keyEventAccelerator,
  mouseEventAccelerator
} from '../../../main/hotkeys'
import {
  KEY_TOKENS,
  MOUSE_TOKENS,
  validateAccelerator,
  bankAccelerator,
  type ModifierState,
  type MouseButton
} from '@shared/accelerator'
import { SUGGESTED_HOTKEYS, defaultConfig } from '@shared/defaults'

/** All sixteen combinations of the four modifiers. */
const MODIFIER_COMBOS: ModifierState[] = Array.from({ length: 16 }, (_, bits) => ({
  ctrlKey: Boolean(bits & 1),
  altKey: Boolean(bits & 2),
  shiftKey: Boolean(bits & 4),
  metaKey: Boolean(bits & 8)
}))

const NONE: ModifierState = MODIFIER_COMBOS[0]
const CTRL_ALT: ModifierState = { ctrlKey: true, altKey: true, shiftKey: false, metaKey: false }

const keyboardEvent = (code: string, mods: ModifierState): KeyboardEvent =>
  ({ code, key: '', ...mods }) as unknown as KeyboardEvent

const mouseEvent = (button: number, mods: ModifierState): MouseEvent =>
  ({ button, ...mods }) as unknown as MouseEvent

function numberFor(table: Readonly<Record<number, MouseButton>>, button: MouseButton): number {
  const entry = Object.entries(table).find(([, b]) => b === button)
  if (!entry) throw new Error(`no ${button} button in table`)
  return Number(entry[0])
}

describe('main and renderer agree on accelerators', () => {
  it('produce the identical string for every physical key and modifier combination', () => {
    let checked = 0
    for (const [keycode, code] of KEYCODE_TO_CODE) {
      for (const mods of MODIFIER_COMBOS) {
        const fired = keyEventAccelerator({ keycode, ...mods })
        const recorded = captureHotkey(keyboardEvent(code, mods))?.accelerator
        expect(fired, code).not.toBeNull()
        expect(recorded, code).toBe(fired)
        checked++
      }
    }
    // Every letter, digit, F-key, numpad and punctuation key, both numpad modes.
    expect(checked).toBe(KEYCODE_TO_CODE.size * 16)
    expect(KEYCODE_TO_CODE.size).toBeGreaterThanOrEqual(100)
  })

  it('can fire every key the recorder accepts', () => {
    // A key the renderer can record but main cannot see would bind without
    // error and then never fire.
    const reachable = new Set(KEYCODE_TO_CODE.values())
    for (const code of KEY_TOKENS.keys()) expect(reachable.has(code), code).toBe(true)
  })

  it('fire a numpad pad the same with NumLock on or off', () => {
    const on = keyEventAccelerator({ keycode: UiohookKey.Numpad1, ...CTRL_ALT })
    const off = keyEventAccelerator({ keycode: UiohookKey.NumpadEnd, ...CTRL_ALT })
    expect(on).toBe('Control+Alt+num1')
    expect(off).toBe(on)
  })

  it('agree on the three bindable mouse buttons', () => {
    for (const button of Object.keys(MOUSE_TOKENS) as MouseButton[]) {
      const uiohook = numberFor(UIOHOOK_MOUSE_BUTTONS, button)
      const browser = numberFor(BROWSER_MOUSE_BUTTONS, button)
      for (const mods of MODIFIER_COMBOS) {
        const fired = mouseEventAccelerator({ button: uiohook, ...mods })
        expect(fired, button).not.toBeNull()
        expect(captureMouseButton(mouseEvent(browser, mods))?.accelerator, button).toBe(fired)
      }
    }
  })

  it('both ignore left and right click', () => {
    expect(mouseEventAccelerator({ button: 1, ...NONE })).toBeNull()
    expect(mouseEventAccelerator({ button: 2, ...NONE })).toBeNull()
    expect(captureMouseButton(mouseEvent(0, NONE))).toBeNull()
    expect(captureMouseButton(mouseEvent(2, NONE))).toBeNull()
  })
})

describe('recording', () => {
  it('refuses a bare key but allows F13-F24 and mouse buttons', () => {
    expect(captureHotkey(keyboardEvent('KeyQ', NONE))?.safe).toBe(false)
    expect(captureHotkey(keyboardEvent('F12', NONE))?.safe).toBe(false)
    expect(captureHotkey(keyboardEvent('F13', NONE))?.safe).toBe(true)
    expect(captureHotkey(keyboardEvent('F24', NONE))?.safe).toBe(true)
    expect(captureMouseButton(mouseEvent(3, NONE))?.safe).toBe(true)
    expect(captureHotkey(keyboardEvent('KeyQ', CTRL_ALT))?.safe).toBe(true)
  })

  it('waits for a real key while only modifiers are held', () => {
    expect(captureHotkey(keyboardEvent('ControlLeft', CTRL_ALT))).toBeNull()
    expect(captureHotkey(keyboardEvent('AltRight', CTRL_ALT))).toBeNull()
  })

  it('ignores keys outside the vocabulary', () => {
    expect(captureHotkey(keyboardEvent('IntlBackslash', CTRL_ALT))).toBeNull()
    expect(captureHotkey(keyboardEvent('CapsLock', CTRL_ALT))).toBeNull()
  })

  it('writes modifiers in canonical order', () => {
    const all: ModifierState = { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true }
    expect(captureHotkey(keyboardEvent('KeyA', all))?.accelerator).toBe(
      'Control+Alt+Shift+Super+A'
    )
  })
})

describe('validateAccelerator', () => {
  it('accepts every combo the app ships by default', () => {
    const shipped = [
      ...SUGGESTED_HOTKEYS,
      defaultConfig().panicHotkey as string,
      ...Array.from({ length: 9 }, (_, i) => bankAccelerator(i))
    ]
    for (const accel of shipped) expect(validateAccelerator(accel), accel).toBe('ok')
  })

  it('rejects strings that would register and then never fire', () => {
    const bad = [
      '',
      'Control+',
      'Control++',
      'Alt+Control+A',
      'Control+Control+A',
      'Control+Foo',
      'Ctrl+A',
      'Control+a',
      'A',
      'num1',
      'f13'
    ]
    for (const accel of bad) expect(validateAccelerator(accel), accel).toBe('invalid')
  })

  it('numbers bank hotkeys from one', () => {
    expect(bankAccelerator(0)).toBe('Control+Alt+1')
    expect(bankAccelerator(8)).toBe('Control+Alt+9')
  })
})

describe('formatAccelerator', () => {
  it('reads naturally on a pad face', () => {
    expect(formatAccelerator('Control+Alt+num1')).toBe('Ctrl + Alt + Num1')
    expect(formatAccelerator('Control+Alt+numadd')).toBe('Ctrl + Alt + Num+')
    expect(formatAccelerator('Super+Mouse4')).toBe('Win + Mouse4')
    expect(formatAccelerator(null)).toBe('')
  })
})
