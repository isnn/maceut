import { cn } from '@/lib/utils'
import { TRAFFIC_COLORS } from '@/lib/constants'

interface TrafficSchematicProps {
  /** Draws the zone boundary rectangle with corner handles. */
  showBoundary?: boolean
  /** Hides the coloured traffic lines, leaving the grey base network. */
  baseMapOnly?: boolean
  className?: string
}

/**
 * Placeholder for the real Leaflet + OSM canvas — a schematic road network with
 * traffic-coloured corridors (BR-017). Used on the landing hero and wherever a
 * map preview is shown before the tile layer exists.
 */
export function TrafficSchematic({ showBoundary, baseMapOnly, className }: TrafficSchematicProps) {
  return (
    <svg viewBox="0 0 400 240" role="img" aria-label="Skema jaringan jalan dengan kondisi lalu lintas" className={cn('w-full h-full', className)}>
      <rect width="400" height="240" fill="#F3F4F8" />
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={`h${i}`} x1="0" y1={40 + i * 40} x2="400" y2={40 + i * 40} stroke="#E4E5EC" strokeWidth="1" />
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line key={`v${i}`} x1={50 + i * 60} y1="0" x2={50 + i * 60} y2="240" stroke="#E4E5EC" strokeWidth="1" />
      ))}

      {/* base road network */}
      <g stroke="#C9CBD6" strokeWidth="7" strokeLinecap="round" fill="none">
        <path d="M20 200 L150 150 L390 120" />
        <path d="M60 30 L110 130 L150 230" />
        <path d="M240 20 L250 240" />
        <path d="M150 150 L360 210" />
      </g>

      {!baseMapOnly && (
        <g strokeWidth="5" strokeLinecap="round" fill="none">
          <path d="M180 40 L196 96 L188 140 L205 190" stroke={TRAFFIC_COLORS.congested} />
          <path d="M150 150 L390 118" stroke={TRAFFIC_COLORS.normal} />
          <path d="M110 165 L330 178" stroke={TRAFFIC_COLORS.slow} />
          <path d="M64 44 L104 126" stroke={TRAFFIC_COLORS.heavy} />
        </g>
      )}

      {showBoundary && (
        <g>
          <rect x="150" y="36" width="130" height="170" fill="#5A35F3" fillOpacity="0.09" stroke="#5A35F3" strokeWidth="1.5" />
          {[
            [150, 36],
            [280, 36],
            [280, 206],
            [150, 206],
          ].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x - 4} y={y - 4} width="8" height="8" fill="#FFFFFF" stroke="#5A35F3" strokeWidth="1.5" />
          ))}
        </g>
      )}
    </svg>
  )
}

/** The green→red key that ships on every capture (BR-019). */
export function TrafficLegend({ className }: { className?: string }) {
  const levels: [string, string][] = [
    ['Lancar', TRAFFIC_COLORS.normal],
    ['Padat', TRAFFIC_COLORS.slow],
    ['Berat', TRAFFIC_COLORS.heavy],
    ['Macet', TRAFFIC_COLORS.congested],
  ]
  return (
    <div className={cn('flex items-center gap-md', className)}>
      {levels.map(([label, color]) => (
        <span key={label} className="flex items-center gap-xs text-micro text-text-secondary">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  )
}
