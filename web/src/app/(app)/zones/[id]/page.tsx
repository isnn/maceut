'use client'

import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'

// Leaflet touches `window` on import, so the map-bearing view is client-only.
const ZoneDetail = dynamic(() => import('@/features/zones/components/ZoneDetail').then((m) => m.ZoneDetail), {
  ssr: false,
  loading: () => <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" />,
})

export default function ZoneDetailPage() {
  const params = useParams<{ id: string }>()
  const { user } = useCurrentUser()

  if (!user || !params?.id) return <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" />

  return <ZoneDetail zoneId={params.id} plan={user.plan} />
}
