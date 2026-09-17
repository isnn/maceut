'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, FormLabel } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { IconPause, IconPlay, IconRotate } from '@/components/ui/icons'
import { EmptyState } from '@/components/shared/EmptyState'
import { buttonClass } from '@/components/ui/Button'
import { TrafficSchematic, TrafficLegend } from '@/components/shared/TrafficSchematic'
import { ManualCaptureButton } from '@/features/captures/components/ManualCaptureButton'
import { cn } from '@/lib/utils'
import { PLAN_LIMITS } from '@/lib/constants'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import * as zonesApi from '@/features/zones/api'
import * as studioApi from '@/features/studio/api'
import type { Frame, RenderFormat } from '@/features/studio/api'
import type { Zone } from '@/features/zones/types'

type View = 'grid' | 'player'
type Overlay = 'full' | 'timestamp' | 'clean'

const SPEEDS = [2, 6, 12]
const PLAYBACK_RATE = [1, 4, 12]
const OVERLAY_LABEL: Record<Overlay, string> = {
  full: 'Timestamp + index',
  timestamp: 'Timestamp only',
  clean: 'Clean',
}
const POSITIONS = ['Top left', 'Top right', 'Bottom left', 'Bottom right']

export default function StudioPage() {
  const { user } = useCurrentUser()
  const [zones, setZones] = useState<Zone[]>([])
  const [zoneId, setZoneId] = useState('')
  const [frames, setFrames] = useState<Frame[]>([])
  const [view, setView] = useState<View>('player')
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(4)
  const [fps, setFps] = useState(6)
  const [overlay, setOverlay] = useState<Overlay>('full')
  const [title, setTitle] = useState('')
  const [position, setPosition] = useState(POSITIONS[0])
  const [format, setFormat] = useState<RenderFormat>('mp4')
  const [rendering, setRendering] = useState(false)
  const [rendered, setRendered] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const plan = user?.plan ?? 'free'
  const zone = zones.find((z) => z.id === zoneId)

  useEffect(() => {
    if (!user) return
    zonesApi.getZones(user.plan).then((next) => {
      setZones(next)
      if (next[0]) {
        setZoneId(next[0].id)
        setTitle(`${next[0].name} · morning peak`)
      }
    })
  }, [user])

  useEffect(() => {
    if (!zoneId) return
    studioApi.getFrames(zoneId).then((next) => {
      setFrames(next)
      setCurrent(0)
    })
  }, [zoneId])

  // Frame advance while playing; rate multiplies the 1 s base tick.
  useEffect(() => {
    if (!playing || frames.length === 0) return
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % frames.length)
    }, 1000 / rate)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [playing, rate, frames.length])

  const render = useCallback(async () => {
    if (!zone) return
    setRendering(true)
    setRendered(false)
    await studioApi.createRender({ zoneId: zone.id, title, frames: frames.length, format })
    setRendering(false)
    setRendered(true)
  }, [zone, title, frames.length, format])

  if (!user) return <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" />

  if (zones.length === 0) {
    return (
      <EmptyState
        title="No frames to play yet"
        description="Studio replays frames that have already been captured. Create a zone and its collection windows first."
        action={
          <Link
            href="/zones/new"
            className={buttonClass()}
          >
            Create zone
          </Link>
        }
      />
    )
  }

  const frame = frames[current]
  const durationSec = frames.length > 0 ? Number((frames.length / fps).toFixed(1)) : 0
  const estimatedMb = Number((frames.length * 0.13).toFixed(1))

  return (
    <div className="space-y-lg">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <h1 className="text-page-title font-bold text-text-primary">Studio</h1>
        <div className="flex flex-wrap items-center gap-sm">
          <Select
            aria-label="Zone"
            value={zoneId}
            onValueChange={setZoneId}
            options={zones.map((z) => ({ value: z.id, label: z.name }))}
            className="w-56"
          />
          {zone && <ManualCaptureButton zoneId={zone.id} zoneName={zone.name} />}
        </div>
      </div>

      <div className="grid grid-cols-1 laptop:grid-cols-[1fr_320px] gap-xl items-start">
        <div className="bg-card border border-border rounded-lg p-lg space-y-md">
          <div className="flex flex-wrap items-center justify-between gap-md">
            <div className="flex bg-canvas-secondary border border-border rounded-md p-[3px]">
              {(['grid', 'player'] as View[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setView(option)}
                  className={cn(
                    'px-md h-9 rounded-sm text-label transition-colors',
                    view === option ? 'bg-canvas text-text-primary font-semibold shadow-elevation-2' : 'text-text-secondary'
                  )}
                >
                  {option === 'grid' ? 'Grid' : 'Player'}
                </button>
              ))}
            </div>
            <button className="text-label text-info hover:underline">Share link</button>
          </div>

          {view === 'player' && frame ? (
            <>
              <div className="relative rounded-md overflow-hidden border border-divider bg-canvas-secondary">
                <TrafficSchematic showBoundary />
                {overlay !== 'clean' && (
                  <div className="absolute left-lg bottom-lg bg-black/70 text-white rounded-md px-md py-sm">
                    <p className="text-label font-semibold">{title || zone?.name}</p>
                    <p className="text-micro tabular-nums opacity-80">
                      {frame.time} · 5 Sep 2026{overlay === 'full' && ` · index ${frame.index}`}
                    </p>
                  </div>
                )}
                <TrafficLegend className="absolute right-lg bottom-lg bg-black/70 rounded-md px-md py-sm [&_span]:text-white" />
              </div>

              <div className="flex flex-wrap items-center gap-md">
                <Button variant="secondary" onClick={() => setPlaying((p) => !p)}>
                  {playing ? <IconPause /> : <IconPlay />}
                  {playing ? 'Pause' : 'Play'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPlaying(false)
                    setCurrent(0)
                  }}
                >
                  <IconRotate />
                  Restart
                </Button>
                <div className="flex bg-canvas-secondary border border-border rounded-md p-[3px]">
                  {PLAYBACK_RATE.map((option) => (
                    <button
                      key={option}
                      onClick={() => setRate(option)}
                      className={cn(
                        'px-md h-8 rounded-sm text-label tabular-nums transition-colors',
                        rate === option ? 'bg-canvas text-text-primary font-semibold shadow-elevation-2' : 'text-text-secondary'
                      )}
                    >
                      {option}×
                    </button>
                  ))}
                </div>
                <span className="text-caption text-text-secondary tabular-nums ml-auto">
                  Frame {current + 1} / {frames.length} · {frame.time} · index {frame.index}
                </span>
              </div>

              {/* Scrubber */}
              <div>
                <input
                  type="range"
                  min={0}
                  max={frames.length - 1}
                  value={current}
                  aria-label="Frame position"
                  onChange={(e) => {
                    setPlaying(false)
                    setCurrent(Number(e.target.value))
                  }}
                  className="w-full accent-[#5A35F3]"
                />
                <div className="flex mt-xs">
                  {frames.map((f, i) => (
                    <button
                      key={f.id}
                      onClick={() => setCurrent(i)}
                      title={`${f.time} · index ${f.index}`}
                      className="flex-1 group"
                    >
                      <span
                        className={cn('block rounded-sm transition-colors', i === current ? 'bg-primary' : 'bg-border group-hover:bg-text-muted')}
                        style={{ height: `${6 + (f.index / 100) * 26}px` }}
                      />
                      <span className="block text-micro text-text-muted tabular-nums mt-xs">
                        {i % 2 === 0 ? f.time.slice(0, 2) : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 tablet:grid-cols-4 gap-md">
              {frames.map((f, i) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setCurrent(i)
                    setView('player')
                  }}
                  className={cn(
                    'text-left rounded-md border overflow-hidden transition-colors',
                    i === current ? 'border-primary bg-primary-soft/30' : 'border-border hover:border-text-muted'
                  )}
                >
                  <TrafficSchematic className="h-24 w-full" />
                  <span className="flex items-center justify-between px-sm py-xs bg-canvas">
                    <span className="text-caption text-text-primary tabular-nums">{f.time}</span>
                    <span className="text-micro text-text-muted tabular-nums">{f.index}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Animation panel */}
        <Card className="p-lg space-y-lg">
          <h2 className="text-heading-sm text-text-primary">Animation</h2>

          <div className="space-y-xs">
            <FormLabel>Speed</FormLabel>
            <div className="flex bg-canvas-secondary border border-border rounded-md p-[3px]">
              {SPEEDS.map((option) => (
                <button
                  key={option}
                  onClick={() => setFps(option)}
                  className={cn(
                    'flex-1 h-9 rounded-sm text-label tabular-nums transition-colors',
                    fps === option ? 'bg-canvas text-text-primary font-semibold shadow-elevation-2' : 'text-text-secondary'
                  )}
                >
                  {option} fps
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-xs">
            <FormLabel htmlFor="overlay">Overlay</FormLabel>
            <Select
              id="overlay"
              value={overlay}
              onValueChange={(v) => setOverlay(v as Overlay)}
              options={(Object.keys(OVERLAY_LABEL) as Overlay[]).map((option) => ({
                value: option,
                label: OVERLAY_LABEL[option],
              }))}
            />
          </div>

          <div className="space-y-xs">
            <FormLabel htmlFor="anim-title">Title</FormLabel>
            <Input id="anim-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-xs">
            <FormLabel htmlFor="position">Position</FormLabel>
            <Select
              id="position"
              value={position}
              onValueChange={setPosition}
              options={POSITIONS.map((option) => ({ value: option, label: option }))}
            />
          </div>

          <div className="space-y-xs">
            <FormLabel>Format</FormLabel>
            <div className="flex bg-canvas-secondary border border-border rounded-md p-[3px]">
              {(['gif', 'mp4', 'webm'] as RenderFormat[]).map((option) => {
                const locked = option === 'webm' && plan !== 'premium'
                return (
                  <button
                    key={option}
                    onClick={() => !locked && setFormat(option)}
                    className={cn(
                      'flex-1 h-9 rounded-sm text-label uppercase transition-colors',
                      format === option ? 'bg-canvas text-text-primary font-semibold shadow-elevation-2' : 'text-text-secondary',
                      locked && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
            {plan !== 'premium' && <p className="text-micro text-text-muted">WebM is available on the Premium plan.</p>}
          </div>

          <div className="border-t border-divider pt-lg">
            <p className="text-caption text-text-secondary">
              <span className="font-semibold text-text-primary tabular-nums">{frames.length} frames</span> ready ·{' '}
              <span className="tabular-nums">{durationSec}s</span> at {fps} fps · est.{' '}
              <span className="tabular-nums">{estimatedMb} MB</span>
            </p>
            <p className="text-micro text-text-muted mt-xs">
              Frame retention on your plan: {PLAN_LIMITS[plan].historyLabel}
            </p>
            <Button className="w-full mt-md" onClick={render} disabled={rendering || frames.length === 0}>
              {rendering ? 'Submitting…' : 'Render animation'}
            </Button>
            {rendered && (
              <p className="text-caption text-success-text mt-sm">
                Render started — it will appear under “Recent renders” on the Dashboard.
              </p>
            )}
            <button className="w-full text-label text-text-secondary hover:text-text-primary mt-md transition-colors">
              Save as preset
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}
