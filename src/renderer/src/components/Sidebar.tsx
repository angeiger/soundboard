import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/state/store'
import type { Bank } from '@shared/types'

/** Inline name editor shared by "New bank" and "Rename". */
function BankNameInput({
  initial,
  onCommit,
  onCancel
}: {
  initial: string
  onCommit: (name: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(initial)
  const done = useRef(false)
  const finish = (commit: boolean): void => {
    if (done.current) return
    done.current = true
    const name = draft.trim()
    if (commit && name) onCommit(name)
    else onCancel()
  }
  return (
    <input
      autoFocus
      className="field py-1.5 text-[12px]"
      placeholder="Bank name"
      aria-label="Bank name"
      value={draft}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
    />
  )
}

/**
 * Rename and delete for one bank. Deleting takes the bank's pads with it, so
 * it asks first and says how many; the last bank cannot go at all.
 */
function BankMenu({
  bank,
  padCount,
  isLast,
  onRename,
  onClose
}: {
  bank: Bank
  padCount: number
  isLast: boolean
  onRename: () => void
  onClose: () => void
}): React.JSX.Element {
  const deleteBank = useStore((s) => s.deleteBank)
  const [confirming, setConfirming] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`${bank.name} options`}
      className="absolute left-2 right-2 top-full z-10 mt-1 flex flex-col gap-0.5 rounded-lg border border-line-hi bg-surface-2 p-1 shadow-[0_8px_24px_rgba(0,0,0,.5)]"
    >
      {confirming ? (
        <div className="flex flex-col gap-2 p-2">
          <p className="text-[11.5px] leading-snug text-txt">
            Delete “{bank.name}”
            {padCount > 0 ? ` and its ${padCount} pad${padCount === 1 ? '' : 's'}` : ''}? This cannot
            be undone.
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              autoFocus
              className="flex-1 rounded-md border border-[rgba(255,59,59,.4)] bg-[rgba(255,59,59,.1)] px-2 py-1 text-[11.5px] font-medium text-[#FF6B6B] hover:bg-[rgba(255,59,59,.18)]"
              onClick={() => {
                deleteBank(bank.id)
                onClose()
              }}
            >
              Delete
            </button>
            <button type="button" className="btn-outline flex-1" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            autoFocus
            className="rounded-md px-2.5 py-1.5 text-left text-[12px] text-txt-dim hover:bg-[rgba(0,240,255,.07)] hover:text-[var(--neon-cyan)]"
            onClick={() => {
              onRename()
              onClose()
            }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={isLast}
            title={isLast ? 'You need at least one bank' : undefined}
            className="rounded-md px-2.5 py-1.5 text-left text-[12px] text-[#FF6B6B] hover:bg-[rgba(255,59,59,.08)] disabled:cursor-not-allowed disabled:text-txt-faint disabled:hover:bg-transparent"
            onClick={() => setConfirming(true)}
          >
            Delete…
          </button>
        </>
      )}
    </div>
  )
}

export function Sidebar(): React.JSX.Element {
  const banks = useStore((s) => s.config.banks)
  const pads = useStore((s) => s.config.pads)
  const activeBankId = useStore((s) => s.activeBankId)
  const setActiveBank = useStore((s) => s.setActiveBank)
  const addBank = useStore((s) => s.addBank)
  const renameBank = useStore((s) => s.renameBank)
  const search = useStore((s) => s.searchQuery)
  const setSearch = useStore((s) => s.setSearchQuery)

  const bankHotkeys = useStore((s) => s.config.bankHotkeysEnabled)
  const exportBank = useStore((s) => s.exportBank)
  const importPack = useStore((s) => s.importPack)

  const [adding, setAdding] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [packMessage, setPackMessage] = useState('')

  const padsInBank = pads.filter((p) => p.bankId === activeBankId).length

  return (
    <aside className="flex w-[180px] flex-col gap-1.5 border-r border-line bg-surface p-3">
      <div className="label mb-2 px-2">Banks</div>

      {banks.map((bank, i) => {
        const active = bank.id === activeBankId
        const count = pads.filter((p) => p.bankId === bank.id).length

        if (renamingId === bank.id) {
          return (
            <BankNameInput
              key={bank.id}
              initial={bank.name}
              onCommit={(name) => {
                renameBank(bank.id, name)
                setRenamingId(null)
              }}
              onCancel={() => setRenamingId(null)}
            />
          )
        }

        return (
          <div key={bank.id} className="group relative">
            <button
              type="button"
              onClick={() => setActiveBank(bank.id)}
              onDoubleClick={() => setRenamingId(bank.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenuId(bank.id)
              }}
              title="Double-click to rename · right-click for options"
              className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-[13px] transition-colors ${
                active
                  ? 'border-[rgba(0,240,255,.3)] bg-[rgba(0,240,255,.07)] text-[var(--neon-cyan)]'
                  : 'border-transparent text-txt-dim hover:bg-surface-2 hover:text-[var(--neon-cyan)]'
              }`}
            >
              <span className="truncate">{bank.name}</span>
              <span
                className={`ml-auto font-mono text-[10px] group-focus-within:invisible group-hover:invisible ${
                  active ? 'text-[rgba(0,240,255,.55)]' : 'text-txt-faint'
                }`}
              >
                {bankHotkeys && i < 9 ? `⌃⌥${i + 1}` : count}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Options for ${bank.name}`}
              aria-haspopup="menu"
              aria-expanded={menuId === bank.id}
              onClick={() => setMenuId(menuId === bank.id ? null : bank.id)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[13px] leading-none text-txt-faint opacity-0 transition-opacity hover:text-[var(--neon-cyan)] focus:opacity-100 group-hover:opacity-100"
            >
              ⋯
            </button>
            {menuId === bank.id && (
              <BankMenu
                bank={bank}
                padCount={count}
                isLast={banks.length <= 1}
                onRename={() => setRenamingId(bank.id)}
                onClose={() => setMenuId(null)}
              />
            )}
          </div>
        )
      })}

      {adding ? (
        <BankNameInput
          initial=""
          onCommit={(name) => {
            addBank(name)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="btn-outline mt-1 border-dashed text-center"
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
            className="btn-outline flex-1"
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
            className="btn-outline flex-1"
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
