'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import * as zonesApi from '@/features/zones/api'
import type { Zone } from '@/features/zones/types'

// Leaflet touches `window` on import, so the wizard can only render client-side.
const ZoneWizard = dynamic(() => import('@/features/zones/components/ZoneWizard').then((m) => m.ZoneWizard), {
  ssr: false,
  loading: () => <div className="h-[32rem] bg-canvas-secondary rounded-lg animate-pulse" />,
})

export default function NewZonePage() {
  const { user } = useCurrentUser()
  const [zones, setZones] = useState<Zone[] | null>(null)

  useEffect(() => {
    if (user) zonesApi.getZones().then(setZones)
  }, [user])

  if (!user || zones === null) return <div className="h-[32rem] bg-canvas-secondary rounded-lg animate-pulse" />

  return <ZoneWizard plan={user.plan} existingZones={zones} />
}
