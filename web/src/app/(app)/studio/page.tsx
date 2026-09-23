'use client'

/**
 * Studio — plays a zone's day back on the map (3m, F-07).
 *
 * Every frame is a real capture. The previous version generated its own traffic curve
 * (a Gaussian morning peak, a softer evening one, a flat overnight base) and scrubbed
 * through numbers that had never touched a road. It looked convincing, which is what
 * made it worse than an empty screen.
 *
 * Geometry is fetched one frame at a time as playback reaches it, with the next frame
 * prefetched and everything played kept in a cache. A capture is ~2 MB full and ~575 KB
 * slimmed, so loading a whole day up front would be tens of megabytes for an animation
 * nobody inspects road-by-road.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Button, buttonClass } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/shared/EmptyState'
import { IconArrowLeft, IconArrowRight, IconPlay, IconPause } from '@/components/ui/icons'
import { cn, formatNumber } from '@/lib/utils'
import { TRAFFIC_COLORS } from '@/lib/constants'
import { MapCanvas } from '@/features/zones/components/MapCanvas'
import * as zonesApi from '@/features/zones/api'
import * as studioApi from '@/features/studio/api'
import type { Frame, SlimTraffic } from '@/features/studio/api'
import type { Zone } from '@/features/zones/types'

/** Playback speeds, as milliseconds between frames. */
const SPEEDS = [
  { label: '0.5×', ms: 2000 },
  { label: '1×', ms: 1000 },
  { label: '2×', ms: 500 },
  { label: '4×', ms: 250 },
]

/**
 * BR-017's bands, over the mean jam factor of a frame.
 *
 * The same four states the map itself uses, so the bar under the player and the colours
 * on it cannot tell different stories.
 */
function bandFor(jam: number): { label: string; color: string } {
  if (jam >= 8) return { label: 'Congested', color: TRAFFIC_COLORS.congested! }
  if (jam >= 6) return { label: 'Heavy', color: TRAFFIC_COLORS.heavy! }
  if (jam >= 4) return { label: 'Slow', color: TRAFFIC_COLORS.slow! }
  return { label: 'Normal', color: TRAFFIC_COLORS.normal! }
}

function formatDay(day: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(`${day}T00:00:00+07:00`))
}

export default function StudioPage() {
  const [zones, setZones] = useState<Zone[] | null>(null)
  const [zoneId, setZoneId] = useState<string>('')
  // Keyed by the zone it belongs to, so switching zones needs no reset: a result whose
  // key no longer matches is simply not this zone's, and the page falls back to loading.
  const [loadedFrames, setLoadedFrames] = useState<{ zoneId: string; frames: Frame[] } | null>(null)
  const [day, setDay] = useState<string>('')

  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  /**
   * Geometry already fetched. Playback revisits the same frames constantly and a day is
   * a few dozen at most, so holding them is far cheaper than re-fetching each loop.
   *
   * State rather than a ref because the render reads it — a ref read during render is
   * not guaranteed to be the value React painted with.
   */
  const [traffics, setTraffics] = useState<Record<string, SlimTraffic | null>>({})
  /** In-flight ids, so a prefetch and a play tick cannot both fetch the same frame. */
  const inFlight = useRef(new Set<string>())

  useEffect(() => {
    zonesApi.getZones().then((next) => {
      setZones(next)
      if (next.length > 0) setZoneId((z) => z || next[0]!.id)
    })
  }, [])

  useEffect(() => {
    if (!zoneId) return
    let cancelled = false
    studioApi.getFrames(zoneId).then((frames) => {
      if (cancelled) return
      setTraffics({})
      inFlight.current.clear()
      setLoadedFrames({ zoneId, frames })
      setDay(studioApi.daysWithFrames(frames)[0] ?? '')
      setCurrent(0)
      setPlaying(false)
    })
    return () => {
      cancelled = true
    }
  }, [zoneId])

  const allFrames = loadedFrames?.zoneId === zoneId ? loadedFrames.frames : null

  const days = useMemo(() => (allFrames ? studioApi.daysWithFrames(allFrames) : []), [allFrames])
  const frames = useMemo(
    () => (allFrames ?? []).filter((f) => studioApi.wibDate(f.capturedAt) === day),
    [allFrames, day],
  )

  const frame = frames[current] ?? null

  /** Loads a frame's geometry into the cache, once. */
  const ensureLoaded = useCallback(async (id: string) => {
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)
    const traffic = await studioApi.getFrameTraffic(id).catch(() => null)
    setTraffics((prev) => (id in prev ? prev : { ...prev, [id]: traffic }))
  }, [])

  // The current frame, and the next one so playback does not stall at each step.
  useEffect(() => {
    if (!frame) return
    if (!(frame.id in traffics)) void ensureLoaded(frame.id)
    const next = frames[current + 1]
    if (next && !(next.id in traffics)) void ensureLoaded(next.id)
  }, [frame, frames, current, traffics, ensureLoaded])

  useEffect(() => {
    if (!playing || frames.length === 0) return
    const timer = setTimeout(() => {
      setCurrent((i) => (i + 1 >= frames.length ? 0 : i + 1))
    }, SPEEDS[speed]!.ms)
    return () => clearTimeout(timer)
  }, [playing, current, frames.length, speed])

  const zone = zones?.find((z) => z.id === zoneId) ?? null
  const traffic = frame ? (traffics[frame.id] ?? null) : null
  const loadingFrame = frame ? !(frame.id in traffics) : false

  if (zones === null) {
    return <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" />
  }

  if (zones.length === 0) {
    return (
      <EmptyState
        title="No zones yet"
        description="Studio replays what a zone has collected. Create one and give it a capture window first."
        action={
          <Link href="/zones/new" className={buttonClass()}>
            Create a zone
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-xl">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-page-title font-bold text-text-primary">Studio</h1>
          <p className="text-body text-text-secondary mt-xs">
            Play a zone&rsquo;s day back, frame by frame, from what it actually collected.
          </p>
        </div>
        <div className="flex flex-wrap gap-md">
          <Select
            value={zoneId}
            onValueChange={setZoneId}
            options={zones.map((z) => ({ value: z.id, label: z.name }))}
            className="w-56"
            aria-label="Zone"
          />
          {days.length > 0 && (
            <Select
              value={day}
              onValueChange={(next) => {
                setDay(next)
                setCurrent(0)
                setPlaying(false)
              }}
              options={days.map((d) => ({ value: d, label: formatDay(d) }))}
              className="w-44"
              aria-label="Day"
            />
          )}
        </div>
      </div>

      {allFrames === null ? (
        <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" />
      ) : frames.length === 0 ? (
        <EmptyState
          title="Nothing collected yet"
          description={
            zone
              ? `${zone.name} has no completed captures to play. Set a capture window, or run one from the zone page.`
              : 'No completed captures to play.'
          }
          action={
            zone ? (
              <Link href={`/zones/${zone.id}`} className={buttonClass('secondary')}>
                Open zone
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 laptop:grid-cols-[minmax(0,1fr)_320px] gap-xl items-start">
          <div className="space-y-lg min-w-0">
            <Card className="p-lg space-y-lg">
              <div className="relative">
                <MapCanvas
                  polygon={zone?.geometry}
                  slimTraffic={traffic}
                  className="h-[28rem] rounded-md overflow-hidden"
                />
                {loadingFrame && (
                  <span className="absolute top-md right-md z-[500] text-micro font-semibold bg-canvas text-text-secondary border border-border rounded-xs px-sm py-xs">
                    Loading frame…
                  </span>
                )}
              </div>

              {/* Transport */}
              <div className="flex flex-wrap items-center gap-md">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPlaying(false)
                    setCurrent((i) => Math.max(i - 1, 0))
                  }}
                  disabled={current === 0}
                  aria-label="Previous frame"
                >
                  <IconArrowLeft size={16} />
                </Button>
                <Button onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
                  {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
                  <span className="ml-sm">{playing ? 'Pause' : 'Play'}</span>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPlaying(false)
                    setCurrent((i) => Math.min(i + 1, frames.length - 1))
                  }}
                  disabled={current >= frames.length - 1}
                  aria-label="Next frame"
                >
                  <IconArrowRight size={16} />
                </Button>

                <div className="flex gap-xs ml-auto">
                  {SPEEDS.map((s, i) => (
                    <button
                      key={s.label}
                      onClick={() => setSpeed(i)}
                      className={cn(
                        'text-micro font-semibold rounded-xs px-sm py-xs transition-colors',
                        speed === i
                          ? 'bg-primary text-on-primary'
                          : 'bg-canvas-secondary text-text-muted hover:text-text-primary',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <input
                  type="range"
                  min={0}
                  max={frames.length - 1}
                  value={current}
                  onChange={(e) => {
                    setPlaying(false)
                    setCurrent(Number(e.target.value))
                  }}
                  aria-label="Frame position"
                  className="w-full accent-primary"
                />
                <p className="text-caption text-text-muted mt-xs tabular-nums">
                  Frame {current + 1} of {frames.length}
                  {frame && (
                    <>
                      <span aria-hidden> · </span>
                      {frame.time} WIB
                      {frame.jamFactorAvg !== null && (
                        <>
                          <span aria-hidden> · </span>
                          jam {frame.jamFactorAvg.toFixed(2)}
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>
            </Card>

            {/* The day at a glance: every frame's congestion, and where you are in it. */}
            <Card className="p-lg">
              <p className="text-label text-text-secondary mb-md">Congestion through the day</p>
              <div className="flex items-end gap-[2px] h-24">
                {frames.map((f, i) => {
                  const jam = f.jamFactorAvg ?? 0
                  const band = bandFor(jam)
                  return (
                    <button
                      key={f.id}
                      onClick={() => {
                        setPlaying(false)
                        setCurrent(i)
                      }}
                      title={`${f.time} · jam ${jam.toFixed(2)}`}
                      aria-label={`Jump to ${f.time}`}
                      className={cn(
                        'flex-1 min-w-[3px] rounded-t-xs transition-opacity',
                        i === current ? 'opacity-100' : 'opacity-45 hover:opacity-80',
                      )}
                      style={{
                        // 10 is HERE's ceiling, so the bar is a share of "road closed"
                        // rather than of whatever the busiest frame happened to be.
                        height: `${Math.max((jam / 10) * 100, 4)}%`,
                        background: band.color,
                      }}
                    />
                  )
                })}
              </div>
              <div className="flex justify-between text-micro text-text-muted mt-sm tabular-nums">
                <span>{frames[0]?.time}</span>
                <span>{frames[frames.length - 1]?.time}</span>
              </div>
            </Card>
          </div>

          <div className="space-y-lg">
            <Card className="p-lg space-y-md">
              <p className="text-label text-text-secondary">This frame</p>
              {frame ? (
                <dl className="space-y-md">
                  <Row label="Time" value={`${frame.time} WIB`} />
                  <Row
                    label="Avg jam factor"
                    value={frame.jamFactorAvg === null ? '—' : frame.jamFactorAvg.toFixed(2)}
                    hint={frame.jamFactorAvg === null ? undefined : bandFor(frame.jamFactorAvg).label}
                  />
                  <Row
                    label="Roads"
                    value={frame.roadsCount === null ? '—' : formatNumber(frame.roadsCount)}
                  />
                </dl>
              ) : (
                <p className="text-body text-text-secondary">No frame selected.</p>
              )}
            </Card>

            <Card className="p-lg">
              <p className="text-label text-text-secondary mb-sm">Day summary</p>
              <dl className="space-y-md">
                <Row label="Frames" value={String(frames.length)} />
                <Row label="Busiest" value={busiest(frames)} />
                <Row label="Quietest" value={quietest(frames)} />
              </dl>
            </Card>

            {/*
              Export is not built. Turning frames into a file needs the render pipeline —
              a headless browser drawing each frame and an encoder stitching them — and
              none of that exists yet (CAP-02, CAP-03). The old version showed a "Render
              animation" button that wrote a fake job to local storage and reported
              success, which is the kind of thing that gets believed.
            */}
            <Card className="p-lg">
              <p className="text-label text-text-secondary mb-sm">Export</p>
              <Alert variant="warning">
                Exporting to GIF or MP4 isn&rsquo;t built yet — it needs the render pipeline that also produces
                branded capture images. Playback here is live from stored traffic data.
              </Alert>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function busiest(frames: Frame[]): string {
  const scored = frames.filter((f) => f.jamFactorAvg !== null)
  if (scored.length === 0) return '—'
  const top = scored.reduce((a, b) => (a.jamFactorAvg! >= b.jamFactorAvg! ? a : b))
  return `${top.time} · ${top.jamFactorAvg!.toFixed(2)}`
}

function quietest(frames: Frame[]): string {
  const scored = frames.filter((f) => f.jamFactorAvg !== null)
  if (scored.length === 0) return '—'
  const low = scored.reduce((a, b) => (a.jamFactorAvg! <= b.jamFactorAvg! ? a : b))
  return `${low.time} · ${low.jamFactorAvg!.toFixed(2)}`
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-md">
      <dt className="text-body text-text-secondary">{label}</dt>
      <dd className="text-right">
        <span className="text-body font-semibold text-text-primary tabular-nums">{value}</span>
        {hint && <span className="block text-micro text-text-muted">{hint}</span>}
      </dd>
    </div>
  )
}
