'use client'

import { useMapEvents, CircleMarker } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import { MapCanvas } from './MapCanvas'
import { Button } from '@/components/ui/Button'
import type { ZoneGeometry } from '../types'

function ClickCapture({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

interface ZoneMapEditorProps {
  points: LatLngExpression[]
  onAddPoint: (lat: number, lng: number) => void
  onUndo: () => void
  onReset: () => void
}

export function ZoneMapEditor({ points, onAddPoint, onUndo, onReset }: ZoneMapEditorProps) {
  return (
    <div className="space-y-sm">
      <MapCanvas polygon={points} interactive className="h-96 w-full">
        <ClickCapture onClick={onAddPoint} />
        {points.map((p, i) => (
          <CircleMarker key={i} center={p} radius={5} pathOptions={{ color: '#5A35F3', fillOpacity: 1 }} />
        ))}
      </MapCanvas>
      <div className="flex items-center justify-between">
        <p className="text-caption text-text-muted">
          Klik di peta untuk menambah titik polygon. {points.length} titik ditambahkan
          {points.length < 3 ? ' (minimal 3 titik).' : '.'}
        </p>
        <div className="flex gap-sm">
          <Button type="button" variant="secondary" className="h-9 px-md" onClick={onUndo} disabled={points.length === 0}>
            Undo
          </Button>
          <Button type="button" variant="secondary" className="h-9 px-md" onClick={onReset} disabled={points.length === 0}>
            Reset
          </Button>
        </div>
      </div>
    </div>
  )
}

export function pointsToGeometry(points: LatLngExpression[]): ZoneGeometry | null {
  if (points.length < 3) return null
  const coords = points.map((p) => {
    const [lat, lng] = p as [number, number]
    return [lng, lat]
  })
  coords.push(coords[0])
  return { type: 'Polygon', coordinates: [coords] }
}
