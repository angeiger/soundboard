import { useEffect, useState } from 'react'

const DISMISS_KEY = 'soundboard.elevation.dismissed'

/**
 * Warns when we are not elevated, because Windows will not deliver hotkeys to a
 * normal-privilege process while an elevated game holds the foreground. The
 * failure is silent and looks exactly like a broken app, so it is worth saying
 * out loud rather than leaving people to discover it mid-match.
 */
export function ElevationBanner(): React.JSX.Element | null {
  const [elevated, setElevated] = useState<boolean | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    void window.api.app.isElevated().then(setElevated)
  }, [])

  if (elevated !== false || dismissed) return null

  return (
    <div className="flex items-center gap-3 border-b border-[rgba(255,176,32,.25)] bg-[rgba(255,176,32,.06)] px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-[var(--neon-amber)]">
          Not running as administrator — hotkeys will not work inside League of Legends.
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-txt-dim">
          Windows blocks hotkeys from reaching a normal program while an elevated game is
          in focus. Pads will still work everywhere else, which is why this looks fine
          until you are actually in a match.
        </p>
      </div>

      <button
        type="button"
        className="shrink-0 rounded-lg border border-[rgba(255,176,32,.4)] bg-[rgba(255,176,32,.08)] px-3 py-1.5 text-[11.5px] text-[var(--neon-amber)] transition-colors hover:bg-[rgba(255,176,32,.16)]"
        onClick={() => void window.api.app.relaunchElevated()}
      >
        Restart as administrator
      </button>

      <button
        type="button"
        className="shrink-0 px-2 text-txt-faint transition-colors hover:text-txt-dim"
        aria-label="Dismiss"
        title="Don't show this again"
        onClick={() => {
          setDismissed(true)
          try {
            localStorage.setItem(DISMISS_KEY, '1')
          } catch {
            /* private window or blocked storage; dismissing for this run is fine */
          }
        }}
      >
        ✕
      </button>
    </div>
  )
}
