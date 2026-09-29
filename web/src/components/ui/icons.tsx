import { cn } from '@/lib/utils'

/**
 * One icon family for the whole app: 24×24 grid, stroked in `currentColor` at
 * 1.75px, round caps and joins. Sized 16px by default so icons sit on the
 * 14px body baseline; pass `size` for the few larger cases.
 *
 * Icons marked "Lucide" use path data from Lucide (https://lucide.dev), ISC licence,
 * © Lucide contributors — the same 24×24 stroked grid, so they sit with the rest.
 */
interface IconProps {
  size?: number
  className?: string
}

function Svg({ size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      {children}
    </svg>
  )
}

export function IconBell(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </Svg>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  )
}

export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </Svg>
  )
}

export function IconInfo(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </Svg>
  )
}

export function IconPlay(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 4.5 20 12 6 19.5z" />
    </Svg>
  )
}

export function IconPause(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4v16" />
      <path d="M14 4v16" />
    </Svg>
  )
}

// Text alignment — horizontal: which edge the lines share.
export function IconAlignLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
    </Svg>
  )
}

export function IconAlignCenter(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />
    </Svg>
  )
}

export function IconAlignRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />
    </Svg>
  )
}

// Text alignment — vertical: where the block sits in its frame.
export function IconAlignTop(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4h16" />
      <path d="M8 8h8M9 12h6" />
    </Svg>
  )
}

export function IconAlignMiddle(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 10h8M9 14h6" />
    </Svg>
  )
}

export function IconAlignBottom(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 12h8M9 16h6" />
      <path d="M4 20h16" />
    </Svg>
  )
}

export function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v11M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </Svg>
  )
}

export function IconMove(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2v20M2 12h20" />
      <path d="m9 5 3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3" />
    </Svg>
  )
}

export function IconRotate(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Svg>
  )
}

export function IconArrowLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </Svg>
  )
}

export function IconArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Svg>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  )
}

export function IconMinus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
    </Svg>
  )
}

export function IconMapPin(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </Svg>
  )
}

export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Svg>
  )
}

export function IconUsers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </Svg>
  )
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
    </Svg>
  )
}

export function IconUpload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </Svg>
  )
}

export function IconPencil(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </Svg>
  )
}

export function IconEye(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}

export function IconEyeOff(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-2.6 3.3" />
      <path d="M6.6 6.7A17 17 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4.4-1" />
      <path d="M10 10a3 3 0 0 0 4 4" />
      <path d="m3 3 18 18" />
    </Svg>
  )
}

export function IconMail(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="m2.5 6.5 9.5 6.5 9.5-6.5" />
    </Svg>
  )
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Svg>
  )
}

export function IconChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  )
}

export function IconDotsVertical(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </Svg>
  )
}

export function IconArrowUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </Svg>
  )
}

export function IconArrowDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </Svg>
  )
}

export function IconX(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  )
}

export function IconCamera(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </Svg>
  )
}

export function IconFilm(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4M3 12h18" />
    </Svg>
  )
}

export function IconRuler(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21.3 15.3 8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z" />
      <path d="m7.5 10.5 2-2M10.5 13.5l2-2M13.5 16.5l2-2" />
    </Svg>
  )
}

export function IconRoad(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 21 8 3M20 21 16 3M12 5v2M12 11v2M12 17v2" />
    </Svg>
  )
}

export function IconCalendar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </Svg>
  )
}

export function IconGauge(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 14 16 10" />
      <path d="M3.3 17a10 10 0 1 1 17.4 0" />
    </Svg>
  )
}

export function IconLayers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 2 10 5-10 5L2 7z" />
      <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
    </Svg>
  )
}

/** Lucide "map" — a zone's boundary on the map. */
export function IconMap(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
      <path d="M15 5.764v15" />
      <path d="M9 3.236v15" />
    </Svg>
  )
}

/** Lucide "clipboard-list" — a zone's details. */
export function IconClipboardList(props: IconProps) {
  return (
    <Svg {...props}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </Svg>
  )
}

/** Lucide "route" — which roads a zone collects. */
export function IconRoute(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </Svg>
  )
}

/** Lucide "car-front" — congestion (the jam factor). */
export function IconCarFront(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8" />
      <path d="M7 14h.01" />
      <path d="M17 14h.01" />
      <rect width="18" height="8" x="3" y="10" rx="2" />
      <path d="M5 18v2" />
      <path d="M19 18v2" />
    </Svg>
  )
}

/** Lucide "zap" — what triggered a capture. */
export function IconZap(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </Svg>
  )
}
