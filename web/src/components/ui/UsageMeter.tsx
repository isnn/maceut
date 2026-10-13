import { ProgressBar } from './ProgressBar'

/**
 * A labelled quota meter — used on Profile & usage and in the internal drawer.
 *
 * `value` may be null for a quota that is not tracked yet. That renders as "— / max"
 * with an empty bar, which reads as "unknown". Passing 0 instead would draw a full,
 * confident "nothing used" — a claim we cannot make.
 */
export function UsageMeter({
  label,
  value,
  max,
  unit = '',
  note,
  sub,
}: {
  label: string
  value: number | null
  max: number
  unit?: string
  /** One line under the bar: what is left. */
  note?: string
  /** A second line: when it resets. */
  sub?: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-sm">
        <span className="text-label text-text-secondary">{label}</span>
        <span className="text-body font-semibold text-text-primary tabular-nums">
          {value === null ? '—' : `${value}${unit}`} / {max}
          {unit}
        </span>
      </div>
      <ProgressBar value={value ?? 0} max={max} className="mt-sm" />
      {note && <p className="mt-xs text-caption text-text-muted">{note}</p>}
      {sub && <p className="text-caption text-text-muted">{sub}</p>}
    </div>
  )
}

/** A label/value row inside a definition list. */
export function AttributeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-md py-md first:pt-0 last:pb-0">
      <dt className="text-body text-text-secondary">{label}</dt>
      <dd className="text-body font-semibold text-text-primary">{value}</dd>
    </div>
  )
}
