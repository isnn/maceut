'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useMap, useMapEvents, CircleMarker } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import { MapCanvas } from './MapCanvas'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { IconMapPin } from '@/components/ui/icons'
import { ApiError } from '@/types/api'
import { searchPlaces, type PlaceResult } from '../api'
import type { ZoneGeometry } from '../types'

/** Moves the map to a picked place: the whole place when it has a box, else a street-level zoom. */
function FocusPlace({ place }: { place: PlaceResult | null }) {
  const map = useMap()
  useEffect(() => {
    if (!place) return
    if (place.bbox) {
      const [w, s, e, n] = place.bbox
      map.fitBounds([[s, w], [n, e]], { maxZoom: 16 })
    } else {
      map.setView([place.lat, place.lng], 16)
    }
  }, [map, place])
  return null
}

/**
 * Search runs on Enter or the button, not while typing: each search is a HERE call (4,000
 * a month) or, past that, an OpenStreetMap one, whose policy forbids type-ahead.
 */
function PlaceSearch({ onPick }: { onPick: (place: PlaceResult) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PlaceResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(e: FormEvent) {
    e.preventDefault()
    if (q.trim().length < 2) return
    setLoading(true)
    setError(null)
    try {
      setResults((await searchPlaces(q.trim())).results)
    } catch (err) {
      setResults(null)
      setError(err instanceof ApiError ? err.message : 'Search is unavailable. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <form onSubmit={search} className="flex gap-sm" role="search">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a place, e.g. Malioboro Yogyakarta"
          aria-label="Search a place"
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={loading || q.trim().length < 2}>
          {loading ? 'Searching…' : 'Search'}
        </Button>
      </form>
      {error && <p className="text-caption text-danger-text mt-xs">{error}</p>}
      {results && (
        <ul className="absolute z-30 left-0 right-0 mt-xs bg-card border border-border rounded-md shadow-elevation-3 py-xs max-h-72 overflow-y-auto">
          {results.length === 0 ? (
            <li className="px-md py-sm text-caption text-text-muted">No places found.</li>
          ) : (
            results.map((r) => (
              <li key={`${r.lat},${r.lng},${r.label}`}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(r)
                    setResults(null)
                  }}
                  className="flex w-full items-start gap-sm px-md py-sm text-left text-body text-text-primary hover:bg-canvas-secondary"
                >
                  <IconMapPin size={16} className="mt-[3px] shrink-0 text-text-muted" />
                  <span className="min-w-0">{r.label}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

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
  const [place, setPlace] = useState<PlaceResult | null>(null)
  return (
    <div className="space-y-sm">
      <PlaceSearch onPick={setPlace} />
      <MapCanvas polygon={points} interactive fitToShape={false} className="h-[480px] laptop:h-[640px] w-full">
        <FocusPlace place={place} />
        <ClickCapture onClick={onAddPoint} />
        {points.map((p, i) => (
          <CircleMarker key={i} center={p} radius={5} pathOptions={{ color: '#5A35F3', fillOpacity: 1 }} />
        ))}
      </MapCanvas>
      <div className="flex items-center justify-between">
        <p className="text-caption text-text-muted">
          Click the map to add polygon points. {points.length} placed
          {points.length < 3 ? ' (3 minimum).' : '.'}
        </p>
        <div className="flex gap-sm">
          <Button type="button" variant="secondary" size="sm" onClick={onUndo} disabled={points.length === 0}>
            Undo
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onReset} disabled={points.length === 0}>
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
