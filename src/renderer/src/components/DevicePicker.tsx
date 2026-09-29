import type { AudioDevice } from '@shared/types'

const HANDS_FREE_OUTPUT =
  'This is the Bluetooth hands-free endpoint — output drops to mono telephone quality. Pick the stereo entry instead.'

const HANDS_FREE_INPUT =
  'Using a Bluetooth headset mic forces the headset into hands-free mode, which drops everything you hear to mono telephone quality. A separate wired or USB mic keeps the headset in stereo.'

export function DevicePicker({
  devices,
  value,
  onChange,
  placeholder,
  problem,
  label
}: {
  devices: AudioDevice[]
  value: string | null
  onChange: (deviceId: string) => void
  placeholder: string
  /** Why this choice is not working, shown under the picker. */
  problem?: string | null
  /** Accessible name when there is no visible <label>. */
  label?: string
}): React.JSX.Element {
  const selected = devices.find((d) => d.deviceId === value)
  // A device that was chosen and has since been unplugged must not quietly
  // display as the first option in the list.
  const missing = Boolean(value) && devices.length > 0 && !selected

  return (
    <div className="flex flex-col gap-1.5">
      <select
        className="field cursor-pointer"
        aria-label={label}
        value={missing ? '' : (value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          {missing ? 'Not connected — choose again…' : placeholder}
        </option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
      </select>

      {selected?.isHandsFree && (
        <p className="text-[11px] leading-relaxed text-[var(--neon-amber)]">
          {selected.kind === 'audioinput' ? HANDS_FREE_INPUT : HANDS_FREE_OUTPUT}
        </p>
      )}

      {problem && <p className="text-[11px] leading-relaxed text-[#FF6B6B]">{problem}</p>}
    </div>
  )
}
