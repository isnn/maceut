import { cn } from '@/lib/utils'
import { TRAFFIC_COLORS } from '@/lib/constants'
import { IconCalendar, IconCheck, IconDownload, IconLayers, IconMap, IconPlay } from '@/components/ui/icons'

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

const HERO_ZONE: [number, number][] = [
  [118, 46],
  [282, 56],
  [300, 196],
  [132, 206],
]

function Legend() {
  return (
    <div className="flex items-center gap-sm">
      <span className="text-micro text-text-muted">Free flow</span>
      <span
        aria-hidden
        className="h-1.5 flex-1 rounded-full"
        style={{
          background: `linear-gradient(90deg, ${TRAFFIC_COLORS.normal}, ${TRAFFIC_COLORS.slow}, ${TRAFFIC_COLORS.heavy}, ${TRAFFIC_COLORS.congested})`,
        }}
      />
      <span className="text-micro text-text-muted">Jammed</span>
    </div>
  )
}

/** Hero: the whole zone screen, with the sidebar, map with the zone, and its settings. */
export function HeroAppPreview({ className }: { className?: string }) {
  return (
    <figure className={cn('bg-card border border-border rounded-lg shadow-elevation-3 overflow-hidden', className)}>
      <figcaption className="sr-only">
        The Maceut zone screen: a zone drawn on a map with traffic colours on its roads, its road classes, a capture
        window, and its capturing status.
      </figcaption>
      <div aria-hidden className="grid grid-cols-1 tablet:grid-cols-[120px_1fr_168px] min-w-0">
        {/* Phones show the map alone: the sidebar and panel text would be too small to read. */}
        <div className="hidden tablet:block border-r border-divider p-sm space-y-xs">
          <p className="font-brand font-bold text-text-primary text-label px-xs pb-sm">maceut</p>
          {['Dashboard', 'Zones', 'Schedule', 'Studio'].map((item) => (
            <p
              key={item}
              className={cn(
                'text-micro rounded-xs px-xs py-[5px]',
                item === 'Zones' ? 'bg-primary-soft text-primary font-semibold' : 'text-text-muted',
              )}
            >
              {item}
            </p>
          ))}
        </div>
        <div className="p-sm min-w-0">
          <div className="rounded-md overflow-hidden border border-divider">
            <svg viewBox="0 0 400 240" className="block w-full h-auto">
              <MapBase />
              <ZonePolygon points={HERO_ZONE} />
            </svg>
          </div>
          <div className="mt-sm px-xs">
            <Legend />
          </div>
        </div>
        <div className="hidden tablet:block border-l border-divider p-sm space-y-md">
          <div>
            <p className="text-micro text-text-muted">Zone</p>
            <p className="text-label font-semibold text-text-primary">Example zone</p>
          </div>
          <div className="space-y-xs">
            <p className="text-micro text-text-muted">Road classes</p>
            {[
              ['Highways', true],
              ['Main roads', true],
              ['Local streets', false],
            ].map(([label, on]) => (
              <p key={label as string} className="flex items-center gap-xs text-micro text-text-secondary">
                <span
                  className={cn(
                    'w-3 h-3 rounded-[3px] border flex items-center justify-center',
                    on ? 'bg-primary border-primary text-on-primary' : 'border-border',
                  )}
                >
                  {on && <IconCheck size={9} />}
                </span>
                {label}
              </p>
            ))}
          </div>
          <div className="space-y-xs">
            <p className="text-micro text-text-muted">Capture window</p>
            <p className="text-micro text-text-primary border border-border rounded-xs px-xs py-[4px]">07:00 to 09:00 · hourly</p>
            <p className="text-micro text-text-primary border border-border rounded-xs px-xs py-[4px]">Mon to Fri</p>
          </div>
          <p className="flex items-center gap-xs text-micro font-semibold text-success-text">
            <span className="w-2 h-2 rounded-full bg-success-icon" />
            Capturing
          </p>
        </div>
      </div>
    </figure>
  )
}

/** A preview card's drawing area: same frame for all four, so the text below lines up. */
function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="rounded-md border border-divider bg-canvas overflow-hidden">
      <p className="sr-only">{label}</p>
      <div aria-hidden>{children}</div>
    </div>
  )
}

export function ZonePreview() {
  return (
    <Frame label="A list of zones next to a map with one zone drawn.">
      <div className="grid grid-cols-[110px_1fr]">
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
        <svg viewBox="0 0 400 240" className="block w-full h-auto">
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
      <div className="p-md space-y-sm">
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

export function ReplayPreview() {
  return (
    <Frame label="Studio replay: a map with traffic colours and a timeline to scrub through saved snapshots.">
      <svg viewBox="0 0 400 200" className="block w-full h-auto">
        <rect width="400" height="200" className="fill-canvas-secondary" />
        <g className="stroke-border" strokeWidth="10" strokeLinecap="round" fill="none">
          <path d="M0 40 L400 170" />
          <path d="M60 200 L340 0" />
          <path d="M0 120 L400 110" />
        </g>
        <g strokeWidth="5" strokeLinecap="round" fill="none">
          <path d="M0 40 L180 98" stroke={TRAFFIC_COLORS.congested} />
          <path d="M180 98 L400 170" stroke={TRAFFIC_COLORS.slow} />
          <path d="M60 200 L200 100" stroke={TRAFFIC_COLORS.heavy} />
          <path d="M200 100 L340 0" stroke={TRAFFIC_COLORS.normal} />
          <path d="M0 120 L400 110" stroke={TRAFFIC_COLORS.normal} />
        </g>
      </svg>
      <div className="flex items-center gap-sm px-sm py-sm border-t border-divider">
        <span className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center">
          <IconPlay size={11} />
        </span>
        <span className="text-micro tabular-nums text-text-primary">07:30</span>
        <span className="relative flex-1 h-1 rounded-full bg-page">
          <span className="absolute inset-y-0 left-0 w-[42%] rounded-full bg-primary" />
          <span className="absolute top-1/2 left-[42%] -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-canvas border-2 border-primary" />
        </span>
        <span className="text-micro tabular-nums text-text-muted">09:00</span>
      </div>
    </Frame>
  )
}

export function ExportPreview() {
  return (
    <Frame label="Export options: a CSV of captures, a ZIP of frames, or an MP4 animation.">
      <div className="p-md space-y-sm">
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
        <p className="text-[10px] font-mono text-text-muted leading-relaxed">
          captured_at_wib,status,roads,avg_jam_factor
          <br />
          2026-10-07 07:00,done,…,…
        </p>
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
