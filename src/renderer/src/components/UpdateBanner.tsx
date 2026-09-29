import { useStore } from '@/state/store'

/**
 * Offers the restart for a downloaded update, and says so when updating
 * fails. Never restarts by itself -- a soundboard that restarts mid-game is
 * worse than a stale one -- and either banner can be dismissed.
 */
export function UpdateBanner(): React.JSX.Element | null {
  const update = useStore((s) => s.update)
  const dismissed = useStore((s) => s.updateDismissed)
  const installUpdate = useStore((s) => s.installUpdate)
  const checkForUpdates = useStore((s) => s.checkForUpdates)
  const dismissUpdate = useStore((s) => s.dismissUpdate)

  if (update.state === 'downloaded' && dismissed !== update.version) {
    return (
      <div
        role="status"
        className="flex items-center gap-3 border-b border-[rgba(182,255,0,.25)] bg-[rgba(182,255,0,.06)] px-4 py-2"
      >
        <p className="text-[12px] text-txt">
          <b className="font-medium text-[var(--neon-lime)]">Soundboard {update.version}</b> is
          ready. Restart to update — it takes a few seconds and opens again by itself.
          <span className="text-txt-dim"> Otherwise it installs next time you close Soundboard.</span>
        </p>
        <button
          type="button"
          className="ml-auto shrink-0 rounded-lg border border-[rgba(182,255,0,.4)] bg-[rgba(182,255,0,.08)] px-3 py-1 text-[12px] font-medium text-[var(--neon-lime)] transition-colors hover:bg-[rgba(182,255,0,.15)]"
          onClick={() => void installUpdate()}
        >
          Restart now
        </button>
        <button type="button" className="btn-ghost shrink-0" onClick={dismissUpdate}>
          Later
        </button>
      </div>
    )
  }

  if (update.state === 'error' && dismissed !== update.detail) {
    return (
      <div
        role="alert"
        className="flex items-center gap-3 border-b border-[rgba(255,176,32,.25)] bg-[rgba(255,176,32,.06)] px-4 py-2"
      >
        <p className="min-w-0 text-[12px] text-[var(--neon-amber)]">
          {update.message}
          <span className="ml-2 font-mono text-[10.5px] text-txt-faint">{update.detail}</span>
        </p>
        <button
          type="button"
          className="btn-outline ml-auto shrink-0 px-3"
          onClick={() => void checkForUpdates()}
        >
          Try again
        </button>
        <button
          type="button"
          className="btn-ghost shrink-0"
          aria-label="Dismiss"
          onClick={dismissUpdate}
        >
          ✕
        </button>
      </div>
    )
  }

  return null
}
