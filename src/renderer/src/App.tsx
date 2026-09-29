import { useEffect, useState } from 'react'
import { useStore } from '@/state/store'
import { listDevices, primeDevicePermissions, onDeviceChange } from '@/audio/devices'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { PadGrid } from './components/PadGrid'
import { BottomBar } from './components/BottomBar'
import { PadEditor } from './components/PadEditor'
import { SettingsPanel } from './components/SettingsPanel'
import { ElevationBanner } from './components/ElevationBanner'

export default function App(): React.JSX.Element {
  const load = useStore((s) => s.load)
  const loaded = useStore((s) => s.loaded)
  const triggerPad = useStore((s) => s.triggerPad)
  const panic = useStore((s) => s.panic)
  const setActiveBankByIndex = useStore((s) => s.setActiveBankByIndex)
  const setDevices = useStore((s) => s.setDevices)
  const editingPadId = useStore((s) => s.editingPadId)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const hotkeyIssues = useStore((s) => s.hotkeyIssues)
  const [hookError, setHookError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  // Without the hook there are no global hotkeys at all, so a failure has to
  // be visible rather than leaving someone to discover it in a match.
  useEffect(() => {
    void window.api.hotkeys.hookError().then(setHookError)
  }, [])

  // Device labels stay blank until mic permission has been granted once, so
  // prime it before the first enumeration.
  useEffect(() => {
    const refresh = async (): Promise<void> => setDevices(await listDevices())
    void (async () => {
      await primeDevicePermissions()
      await refresh()
    })()
    return onDeviceChange(() => void refresh())
  }, [setDevices])

  useEffect(() => {
    const offPad = window.api.on.padTrigger((padId) => void triggerPad(padId))
    const offPanic = window.api.on.panic(() => panic())
    const offBank = window.api.on.bankSwitch((index) => setActiveBankByIndex(index))
    return () => {
      offPad()
      offPanic()
      offBank()
    }
  }, [triggerPad, panic, setActiveBankByIndex])

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <span className="font-mono text-[11px] tracking-widest text-txt-faint">LOADING…</span>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <TitleBar />

      <ElevationBanner />

      {hookError && (
        <div className="border-b border-[rgba(255,59,59,.3)] bg-[rgba(255,59,59,.07)] px-4 py-2.5">
          <p className="text-[12px] text-[#FF6B6B]">
            Keyboard hook failed to start — no global hotkeys are active.
          </p>
          <p className="mt-0.5 text-[11px] text-txt-dim">
            Pads still work by clicking them. {hookError}
          </p>
        </div>
      )}

      {hotkeyIssues.length > 0 && (
        <div className="border-b border-[rgba(255,176,32,.25)] bg-[rgba(255,176,32,.06)] px-4 py-2 text-[11.5px] text-[var(--neon-amber)]">
          {hotkeyIssues.length} hotkey{hotkeyIssues.length > 1 ? 's' : ''} could not be
          registered — another app is holding the combo, or two pads share one.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col p-4">
          <PadGrid />
          <BottomBar />
        </main>
      </div>

      {editingPadId && <PadEditor padId={editingPadId} />}
      {settingsOpen && <SettingsPanel />}
    </div>
  )
}
