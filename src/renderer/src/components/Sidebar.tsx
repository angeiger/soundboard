import { useState } from 'react'
import { useStore } from '@/state/store'

export function Sidebar(): React.JSX.Element {
  const banks = useStore((s) => s.config.banks)
  const pads = useStore((s) => s.config.pads)
  const activeBankId = useStore((s) => s.activeBankId)
  const setActiveBank = useStore((s) => s.setActiveBank)
  const addBank = useStore((s) => s.addBank)
  const search = useStore((s) => s.searchQuery)
  const setSearch = useStore((s) => s.setSearchQuery)

  const bankHotkeys = useStore((s) => s.config.bankHotkeysEnabled)
  const exportBank = useStore((s) => s.exportBank)
  const importPack = useStore((s) => s.importPack)

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [packMessage, setPackMessage] = useState('')

  const padsInBank = pads.filter((p) => p.bankId === activeBankId).length

  const commit = (): void => {
    const name = draft.trim()
    if (name) addBank(name)
    setDraft('')
    setAdding(false)
  }

  return (
    <aside className="flex w-[180px] flex-col gap-1.5 border-r border-line bg-surface p-3">
      <div className="label mb-2 px-2">Banks</div>

      {banks.map((bank, i) => {
        const active = bank.id === activeBankId
        const count = pads.filter((p) => p.bankId === bank.id).length
        return (
          <button
            key={bank.id}
            type="button"
            onClick={() => setActiveBank(bank.id)}
            className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-[13px] transition-colors ${
              active
                ? 'border-[rgba(0,240,255,.3)] bg-[rgba(0,240,255,.07)] text-[var(--neon-cyan)]'
                : 'border-transparent text-txt-dim hover:bg-surface-2 hover:text-txt'
            }`}
          >
            <span className="truncate">{bank.name}</span>
            <span
              className={`ml-auto font-mono text-[10px] ${
                active ? 'text-[rgba(0,240,255,.55)]' : 'text-txt-faint'
              }`}
            >
              {bankHotkeys && i < 9 ? `⌃⌥${i + 1}` : count}
            </span>
          </button>
        )
      })}

      {adding ? (
        <input
          autoFocus
          className="field mt-1 py-1.5 text-[12px]"
          placeholder="Bank name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft('')
              setAdding(false)
            }
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1 rounded-lg border border-dashed border-line px-2.5 py-2 text-center text-[12px] text-txt-faint transition-colors hover:border-line-hi hover:text-txt-dim"
        >
          + New bank
        </button>
      )}

      <div className="mt-auto flex flex-col gap-1.5">
        {packMessage && (
          <p className="px-1 text-[11px] leading-snug text-[var(--neon-lime)]">{packMessage}</p>
        )}

        <div className="flex gap-1.5">
          <button
            type="button"
            className="flex-1 rounded-lg border border-line px-2 py-1.5 text-[11px] text-txt-dim transition-colors hover:border-line-hi hover:text-txt disabled:opacity-40"
            disabled={busy || padsInBank === 0}
            onClick={async () => {
              setBusy(true)
              const path = await exportBank(activeBankId)
              setPackMessage(path ? 'Exported' : '')
              setBusy(false)
            }}
            title={
              padsInBank === 0
                ? 'This bank is empty'
                : 'Save this bank as a .soundpack your friends can import'
            }
          >
            Export
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg border border-line px-2 py-1.5 text-[11px] text-txt-dim transition-colors hover:border-line-hi hover:text-txt disabled:opacity-40"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const result = await importPack()
              setPackMessage(result.message)
              setBusy(false)
            }}
            title="Load a .soundpack into a new bank"
          >
            Import
          </button>
        </div>

        <input
          className="field py-2 text-[12px]"
          placeholder="Search sounds…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
    </aside>
  )
}
