'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Polygon, Polyline, useMap } from 'react-leaflet'
import L, { type LatLngExpression } from 'leaflet'
import type { ZoneGeometry } from '../types'
import type { TrafficPreview } from '../api'

const OSM_TILE_URL = process.env.NEXT_PUBLIC_OSM_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = process.env.NEXT_PUBLIC_OSM_ATTRIBUTION ?? '© OpenStreetMap contributors'
const DEFAULT_CENTER: LatLngExpression = [-6.2, 106.816] // Jakarta

function toLatLngs(geometry: ZoneGeometry): LatLngExpression[] {
  return geometry.coordinates[0].map(([lng, lat]) => [lat, lng] as LatLngExpression)
}

/**
 * Frames the map on the boundary rather than dropping a fixed zoom on its first vertex.
 *
 * Centring on `coordinates[0]` put a CORNER of the zone in the middle of the map, so a
 * large zone ran off every edge and a small one sat lost in a city. Fitting the bounds
 * is what "show me this zone" actually means.
 *
 * Keyed on the coordinates rather than the array identity, so a re-render with the same
 * shape does not yank the view back while someone is panning.
 */
function FitToPolygon({ latLngs }: { latLngs: LatLngExpression[] | null }) {
  const map = useMap()
  const key = latLngs ? JSON.stringify(latLngs) : null

  useEffect(() => {
    if (!latLngs || latLngs.length < 3) return
    const bounds = L.latLngBounds(latLngs as L.LatLngTuple[])
    if (!bounds.isValid()) return
    // Padding so the boundary stroke is not flush against the frame, and a zoom ceiling
    // so a tiny zone does not slam into street level.
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 })
    // `key` is the real dependency; `latLngs` is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])

  return null
}

interface MapCanvasProps {
  polygon?: ZoneGeometry | LatLngExpression[]
  trafficGeoJSON?: TrafficPreview
  /**
   * Playback geometry: lines and colours only. Accepted alongside the full shape rather
   * than instead of it, because the zone page inspects one cycle closely while the
   * Studio player runs through dozens — one map draws both.
   */
  slimTraffic?: { features: { c: [number, number][]; k: string }[] } | null
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
  slimTraffic,
  interactive = false,
  scrollWheelZoom,
  center,
  zoom = 15,
  className,
  children,
}: MapCanvasProps) {
  const latLngs = polygon ? (Array.isArray(polygon) ? polygon : toLatLngs(polygon)) : null
  // Only a starting point now — FitToPolygon takes over as soon as there is a shape.
  const mapCenter = center ?? latLngs?.[0] ?? DEFAULT_CENTER

  return (
    /* `isolate` gives the map its own stacking context. Leaflet assigns its panes and
       controls z-indexes up to 1000, which otherwise float above dialogs, dropdowns and
       anything else later on the page — the map appearing to spill over its neighbours. */
    <div
      className={`maceut-map-dark bg-gray-950 rounded-lg overflow-hidden isolate relative ${className ?? 'h-80 w-full'}`}
    >
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
        <FitToPolygon latLngs={latLngs} />
        {latLngs && latLngs.length >= 3 && (
          <Polygon positions={latLngs} pathOptions={{ color: '#5A35F3', fillOpacity: 0.15, weight: 2 }} />
        )}
        {slimTraffic?.features.map((feature, idx) => (
          <Polyline
            key={`slim-${idx}`}
            positions={feature.c.map(([lng, lat]) => [lat, lng] as LatLngExpression)}
            pathOptions={{ color: feature.k, weight: 4 }}
          />
        ))}
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
