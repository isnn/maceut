'use client'

import { MapContainer, TileLayer, Polygon, Polyline } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import type { ZoneGeometry } from '../types'
import type { TrafficPreview } from '../api'

const OSM_TILE_URL = process.env.NEXT_PUBLIC_OSM_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = process.env.NEXT_PUBLIC_OSM_ATTRIBUTION ?? '© OpenStreetMap contributors'
const DEFAULT_CENTER: LatLngExpression = [-6.2, 106.816] // Jakarta

function toLatLngs(geometry: ZoneGeometry): LatLngExpression[] {
  return geometry.coordinates[0].map(([lng, lat]) => [lat, lng] as LatLngExpression)
}

interface MapCanvasProps {
  polygon?: ZoneGeometry | LatLngExpression[]
  trafficGeoJSON?: TrafficPreview
  /** Enables the drawing surface; zoom and pan are always on. */
  interactive?: boolean
  /**
   * Wheel zoom is off by default on read-only maps so scrolling the page past
   * one doesn't hijack the scroll.
   */
  scrollWheelZoom?: boolean
  center?: LatLngExpression
  zoom?: number
  className?: string
  children?: React.ReactNode
}

export function MapCanvas({
  polygon,
  trafficGeoJSON,
  interactive = false,
  scrollWheelZoom,
  center,
  zoom = 15,
  className,
  children,
}: MapCanvasProps) {
  const latLngs = polygon ? (Array.isArray(polygon) ? polygon : toLatLngs(polygon)) : null
  const mapCenter = center ?? latLngs?.[0] ?? DEFAULT_CENTER

  return (
    <div className={`maceut-map-dark bg-gray-950 rounded-lg overflow-hidden ${className ?? 'h-80 w-full'}`}>
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        // Zoom and pan are available on every map, including read-only previews:
        // a boundary you can't zoom into tells you very little about the roads
        // it covers. `interactive` still gates click-to-draw, via ZoneMapEditor.
        scrollWheelZoom={scrollWheelZoom ?? interactive}
        dragging
        doubleClickZoom
        zoomControl
        style={{ height: '100%', width: '100%', background: '#0a0a0a' }}
      >
        <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
        {latLngs && latLngs.length >= 3 && (
          <Polygon positions={latLngs} pathOptions={{ color: '#5A35F3', fillOpacity: 0.15, weight: 2 }} />
        )}
        {trafficGeoJSON?.features.map((feature, i) => (
          <Polyline
            key={i}
            positions={feature.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLngExpression)}
            pathOptions={{ color: feature.properties.color, weight: 4 }}
          />
        ))}
        {children}
      </MapContainer>
    </div>
  )
}
