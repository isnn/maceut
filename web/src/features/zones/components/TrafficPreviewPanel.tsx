'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { MapCanvas } from './MapCanvas'
import { StyleSelector } from '@/components/ui/StyleSelector'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import * as zonesApi from '../api'
import type { TrafficPreview } from '../api'
import type { CaptureStyleInput, RoadClass, ZoneGeometry } from '../types'
import { DEFAULT_STYLE } from '../types'
import { ROAD_CLASS_LABEL } from '@/lib/constants'

function bboxFromGeometry(geometry: ZoneGeometry): [number, number, number, number] {
  const coords = geometry.coordinates[0]
  const lngs = coords.map((c) => c[0])
  const lats = coords.map((c) => c[1])
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]
}

interface TrafficPreviewPanelProps {
  open: boolean
  onClose: () => void
  geometry: ZoneGeometry
  roadClass: RoadClass
  defaultTitle: string
}

export function TrafficPreviewPanel({ open, onClose, geometry, roadClass, defaultTitle }: TrafficPreviewPanelProps) {
  const [traffic, setTraffic] = useState<TrafficPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [style, setStyle] = useState<CaptureStyleInput>({ ...DEFAULT_STYLE, title: defaultTitle })

  useEffect(() => {
    if (!open) return
    setStyle({ ...DEFAULT_STYLE, title: defaultTitle })
    setError(null)
    setTraffic(null)
    zonesApi
      .getTrafficPreview(bboxFromGeometry(geometry))
      .then(setTraffic)
      .catch(() => setError('Gagal memuat preview traffic. Coba lagi nanti.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <Dialog.Title className="text-section-title text-text-primary mb-lg">
            Preview Traffic — {ROAD_CLASS_LABEL[roadClass]}
          </Dialog.Title>

          {error ? (
            <Alert variant="warning" className="mb-lg">
              {error}
            </Alert>
          ) : (
            <MapCanvas polygon={geometry} trafficGeoJSON={traffic ?? undefined} className="h-64 w-full mb-lg" />
          )}

          <StyleSelector value={style} onChange={setStyle} />

          <div className="flex justify-end mt-xl">
            <Button variant="secondary" className="h-10 px-lg" onClick={onClose}>
              Tutup
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
