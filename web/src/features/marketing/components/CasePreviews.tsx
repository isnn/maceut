import Image from 'next/image'

/**
 * Visuals for the Yogyakarta case (FE-43). The numbers are averages over the zone's
 * captures from 23 September to 11 October 2026 (every road, every 15 minutes); see the
 * FE-43 entry in SPRINT.md for the query. Change them only together with the story.
 */

/** One of the real captures from the run. */
export function CaseCapture() {
  return (
    <Image
      src="/landing/capture-yogyakarta-1715-dark.webp"
      alt="Capture of Yogyakarta at 17:15 WIB: red and orange on the main corridors."
      width={1080}
      height={1080}
      sizes="(min-width: 1024px) 36rem, 100vw"
      className="block w-full max-w-[22rem] h-auto ml-auto rounded-xl ring-1 ring-border/70 shadow-elevation-2"
    />
  )
}

/** Average jam level per hour of the day (WIB), 00:00 to 23:00, over the whole run. */
const HOURS = [
  0.71, 0.64, 0.6, 0.55, 0.56, 0.62, 0.9, 1.34, 1.72, 1.66, 1.9, 1.83, 1.97, 1.94, 2.2, 2.27, 2.56, 2.44, 2.45, 2.3, 2.09,
  1.73, 1.35, 0.91,
]
/** Bars run to 3, just above the highest hour; 2 and over counts as heavy. */
const SCALE = 3
const HEAVY = 2

/** The average day in Yogyakarta, hour by hour: heavy from 14:00 until 21:00. */
export function DayCurve() {
  return (
    <div className="rounded-xl ring-1 ring-border/70 bg-canvas p-lg shadow-elevation-2">
      <p className="text-label font-semibold text-text-primary">Average jam level by hour, Yogyakarta</p>
      <p className="mt-xs text-caption text-text-secondary">0 is free-flowing, 10 is standstill. Heavy (2 and over) in purple.</p>
      <div className="mt-md relative h-32" role="img" aria-label="Jam level is lowest around 03:00, rises from 07:00, stays at 2 or above from 14:00 to 20:00, and peaks at 16:00.">
        <div className="absolute inset-0 flex items-end gap-[3px]" aria-hidden>
          {HOURS.map((v, h) => (
            <span
              key={h}
              className={v >= HEAVY ? 'flex-1 rounded-t-xs bg-primary' : 'flex-1 rounded-t-xs bg-primary/30'}
              style={{ height: `${(v / SCALE) * 100}%` }}
            />
          ))}
        </div>
        <span
          className="absolute inset-x-0 border-t border-dashed border-text-muted"
          style={{ bottom: `${(HEAVY / SCALE) * 100}%` }}
          aria-hidden
        />
      </div>
      {/* Each label sits under the middle of its own hour's bar. */}
      <div className="mt-xs relative h-4 text-micro text-text-secondary tabular-nums" aria-hidden>
        {[0, 6, 12, 18, 23].map((h) => (
          <span key={h} className="absolute -translate-x-1/2" style={{ left: `${((h + 0.5) / HOURS.length) * 100}%` }}>
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>
    </div>
  )
}
