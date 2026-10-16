'use client'

import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'

// Leaflet touches `window` on import, so the map-bearing view is client-only.
const AccountZoneView = dynamic(
  () => import('@/features/internal/components/AccountZoneView').then((m) => m.AccountZoneView),
  { ssr: false, loading: () => <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" /> },
)

/** One customer zone, read-only, for staff (from the account page's Zones table). */
export default function InternalAccountZonePage() {
  const params = useParams<{ id: string; zoneId: string }>()
  if (!params?.id || !params.zoneId) return <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" />
  return <AccountZoneView userId={params.id} zoneId={params.zoneId} />
}
