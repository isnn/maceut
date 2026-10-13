/**
 * How many zones and capture windows a plan change paused on an account (ADR-020), as one
 * number in its own column (FE-34). The breakdown is in the tooltip.
 */
export function PausedCell({ zones, windows }: { zones: number; windows: number }) {
  const total = zones + windows
  if (total === 0) return <span className="text-text-muted">&mdash;</span>
  return (
    <span
      className="tabular-nums font-semibold text-warning-text"
      title="Paused by plan"
    >
      {total}
    </span>
  )
}
