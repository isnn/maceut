/**
 * What a plan change paused on an account (ADR-020), in its own column (FE-34) — it used
 * to be squeezed into the Zones cell as "2 1 paused", which read as one number.
 */
export function PausedCell({ zones, windows }: { zones: number; windows: number }) {
  if (zones === 0 && windows === 0) return <span className="text-text-muted">&mdash;</span>
  const parts = [
    zones > 0 && `${zones} zone${zones === 1 ? '' : 's'}`,
    windows > 0 && `${windows} window${windows === 1 ? '' : 's'}`,
  ].filter(Boolean)
  return <span className="text-caption font-semibold text-warning-text whitespace-nowrap">{parts.join(' · ')}</span>
}
