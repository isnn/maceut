import { cn } from '@/lib/utils'
import { ReplayVideo } from './ReplayVideo'
import { TRAFFIC_COLORS } from '@/lib/constants'
import { IconCalendar, IconDownload, IconLayers, IconMap } from '@/components/ui/icons'

/**
 * Static miniatures of the real app screens for the landing page (FE-36). They are
 * illustrations, not screenshots: built from the app's own tokens so they stay sharp at
 * any size, and labelled with neutral example names rather than invented customers or
 * figures. Each carries a text summary for screen readers; the drawing is aria-hidden.
 *
 * The purple zone polygon with corner handles is the page's repeated motif: it is the
 * one gesture every Maceut workflow starts with.
 */

const ROADS = [
  'M0 150 L120 118 L300 96 L400 80',
  'M70 0 L110 120 L140 240',
  'M250 0 L262 240',
  'M120 118 L330 200 L400 214',
  'M0 60 L400 40',
]

/** The base map: soft blocks and grey roads, the way the app's light basemap reads. */
function MapBase({ traffic = true }: { traffic?: boolean }) {
  return (
    <>
      <rect width="400" height="240" className="fill-canvas-secondary" />
      <g className="fill-page">
        <rect x="14" y="74" width="80" height="54" rx="4" />
        <rect x="150" y="128" width="88" height="60" rx="4" />
        <rect x="280" y="120" width="70" height="66" rx="4" />
        <rect x="160" y="14" width="74" height="54" rx="4" />
      </g>
      <g className="stroke-border" strokeWidth="9" strokeLinecap="round" fill="none">
        {ROADS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {traffic && (
        <g strokeWidth="4.5" strokeLinecap="round" fill="none">
          <path d="M120 118 L300 96" stroke={TRAFFIC_COLORS.normal} />
          <path d="M110 120 L140 240" stroke={TRAFFIC_COLORS.congested} />
          <path d="M250 30 L262 200" stroke={TRAFFIC_COLORS.slow} />
          <path d="M120 118 L330 200" stroke={TRAFFIC_COLORS.heavy} />
        </g>
      )}
    </>
  )
}

/** The zone a user draws: purple fill, solid edge, a handle on every corner. */
function ZonePolygon({ points }: { points: [number, number][] }) {
  return (
    <g>
      <polygon points={points.map((p) => p.join(',')).join(' ')} className="fill-primary/15 stroke-primary" strokeWidth="2.5" />
      {points.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="5" className="fill-canvas stroke-primary" strokeWidth="2.5" />
      ))}
    </g>
  )
}

/**
 * A preview card's picture box. One ratio for all four (16:10, the replay video's), so
 * the cards and the text under them line up whatever each preview draws (FE-40).
 */
const FRAME = 'aspect-[16/10] rounded-md border border-divider overflow-hidden'

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className={cn(FRAME, 'bg-canvas')}>
      <p className="sr-only">{label}</p>
      <div aria-hidden className="h-full">
        {children}
      </div>
    </div>
  )
}

export function ZonePreview() {
  return (
    <Frame label="A list of zones next to a map with one zone drawn.">
      <div className="grid h-full grid-cols-[110px_1fr]">
        <div className="p-sm space-y-xs border-r border-divider">
          <p className="flex items-center gap-xs text-micro font-semibold text-text-primary">
            <IconMap size={12} /> Zones
          </p>
          {['City centre', 'Ring road', 'Port access'].map((z, i) => (
            <p
              key={z}
              className={cn('text-micro rounded-xs px-xs py-[4px]', i === 0 ? 'bg-primary-soft text-primary' : 'text-text-muted')}
            >
              {z}
            </p>
          ))}
        </div>
        <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="block w-full h-full">
          <MapBase traffic={false} />
          <ZonePolygon points={[[150, 40], [300, 70], [282, 200], [128, 178]]} />
        </svg>
      </div>
    </Frame>
  )
}

export function SchedulePreview() {
  return (
    <Frame label="A capture window form: zone, time, days, and how often to collect.">
      <div className="h-full p-md flex flex-col justify-center gap-sm">
        <p className="flex items-center gap-xs text-label font-semibold text-text-primary">
          <IconCalendar size={14} /> New capture window
        </p>
        {[
          ['Zone', 'City centre'],
          ['Time', '07:00 to 09:00'],
        ].map(([k, v]) => (
          <div key={k} className="grid grid-cols-[64px_1fr] items-center gap-sm">
            <span className="text-micro text-text-muted">{k}</span>
            <span className="text-micro text-text-primary border border-border rounded-xs px-sm py-[5px]">{v}</span>
          </div>
        ))}
        <div className="grid grid-cols-[64px_1fr] items-center gap-sm">
          <span className="text-micro text-text-muted">Days</span>
          <span className="flex gap-[3px]">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <span
                key={i}
                className={cn(
                  'w-5 h-5 rounded-[4px] text-[9px] font-semibold flex items-center justify-center',
                  i < 5 ? 'bg-primary text-on-primary' : 'bg-canvas-secondary text-text-muted',
                )}
              >
                {d}
              </span>
            ))}
          </span>
        </div>
        <div className="grid grid-cols-[64px_1fr] items-center gap-sm">
          <span className="text-micro text-text-muted">Every</span>
          <span className="flex bg-canvas-secondary rounded-xs p-[2px] text-[10px]">
            {['15 min', 'Hourly', 'Daily'].map((o) => (
              <span
                key={o}
                className={cn('flex-1 text-center rounded-[3px] py-[3px]', o === 'Hourly' ? 'bg-canvas text-text-primary font-semibold' : 'text-text-muted')}
              >
                {o}
              </span>
            ))}
          </span>
        </div>
      </div>
    </Frame>
  )
}

/**
 * A real Studio replay (FE-38): Yogyakarta, 25 September 2026, exported by the app as
 * video. Muted, looping and inline because it is a picture of the product, not a
 * soundtrack; visitors who ask for reduced motion get the still poster with controls.
 */
export function ReplayPreview() {
  return (
    <div className={cn(FRAME, 'bg-text-primary')}>
      <ReplayVideo />
    </div>
  )
}

export function ExportPreview() {
  return (
    <Frame label="Export options: a CSV of captures, a ZIP of frames, or an MP4 animation.">
      <div className="h-full p-md flex flex-col justify-center gap-sm">
        <p className="flex items-center gap-xs text-label font-semibold text-text-primary">
          <IconDownload size={14} /> Export
        </p>
        {[
          ['Captures', 'CSV'],
          ['Frames', 'ZIP'],
          ['Animation', 'MP4'],
        ].map(([what, fmt]) => (
          <div key={fmt} className="flex items-center gap-sm border border-border rounded-xs px-sm py-[6px]">
            <IconLayers size={12} className="text-text-muted" />
            <span className="text-micro text-text-primary flex-1">{what}</span>
            <span className="text-micro font-semibold text-primary">{fmt}</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

/** The closing band's backdrop: the zone motif, faint, on a bare road network. */
export function BandMap() {
  return (
    <svg aria-hidden viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full opacity-40">
      <g className="stroke-border" strokeWidth="6" strokeLinecap="round" fill="none">
        {ROADS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <polygon points="230,30 360,48 350,170 220,150" className="fill-primary/10 stroke-primary/40" strokeWidth="2" />
    </svg>
  )
}
