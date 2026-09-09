import { ProgressBar } from './ProgressBar'

/** A labelled quota meter — used on Profile & usage and in the internal drawer. */
export function UsageMeter({ label, value, max, unit = '' }: { label: string; value: number; max: number; unit?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-sm">
        <span className="text-label text-text-secondary">{label}</span>
        <span className="text-body font-semibold text-text-primary tabular-nums">
          {value}
          {unit} / {max}
          {unit}
        </span>
      </div>
      <ProgressBar value={value} max={max} className="mt-sm" />
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
