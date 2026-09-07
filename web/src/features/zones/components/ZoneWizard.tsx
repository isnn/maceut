'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LatLngExpression } from 'leaflet'
import { Button } from '@/components/ui/Button'
import { FormLabel, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { RoadClassBadge } from '@/components/ui/Badge'
import { UpgradeModal } from '@/components/ui/UpgradeModal'
import { cn } from '@/lib/utils'
import { PLAN_LIMITS, ROAD_CLASS_LABEL } from '@/lib/constants'
import { ApiError } from '@/types/api'
import { MapCanvas } from './MapCanvas'
import { ZoneMapEditor, pointsToGeometry } from './ZoneMapEditor'
import * as zonesApi from '../api'
import type { MatchedRoad, RoadClass, Zone } from '../types'
import type { Plan } from '@/features/auth/types'

const STEPS = ['Batas area', 'Kelas jalan', 'Review']
const ROAD_CLASS_ORDER: RoadClass[] = ['nasional', 'nasional_provinsi', 'semua']

const ROAD_CLASS_DESCRIPTION: Record<RoadClass, string> = {
  nasional: 'Jalan besar antar kota dan tol',
  nasional_provinsi: 'Tambah arteri provinsi',
  semua: 'Tambah jalan kota dan lokal',
}

const REQUIRED_PLAN_LABEL: Record<RoadClass, string> = {
  nasional: 'Free',
  nasional_provinsi: 'Standard',
  semua: 'Premium',
}

export function ZoneWizard({ plan, existingZones }: { plan: Plan; existingZones: Zone[] }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [points, setPoints] = useState<LatLngExpression[]>([])
  const [roadClass, setRoadClass] = useState<RoadClass | null>(null)
  const [mode, setMode] = useState<'draw' | 'import'>('draw')
  const [withTraffic, setWithTraffic] = useState(true)
  const [traffic, setTraffic] = useState<zonesApi.TrafficPreview | null>(null)
  const [upgradeFor, setUpgradeFor] = useState<RoadClass | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const geometry = pointsToGeometry(points)
  const maxRoadClass = PLAN_LIMITS[plan].maxRoadClass
  const nameTaken = name.trim() !== '' && existingZones.some((z) => z.name.toLowerCase() === name.trim().toLowerCase())
  const area = geometry ? zonesApi.areaKm2(geometry) : 0

  const matched: MatchedRoad[] = useMemo(
    () => (geometry && roadClass ? zonesApi.matchRoads(geometry, roadClass) : []),
    [geometry, roadClass]
  )
  const matchedLength = Number(matched.reduce((sum, r) => sum + r.lengthKm, 0).toFixed(1))

  // Road counts per class, used for the per-option readouts in step 2.
  const perClass = useMemo(() => {
    if (!geometry) return { nasional: [], provinsi: [], kota: [] } as Record<string, MatchedRoad[]>
    const all = zonesApi.matchRoads(geometry, 'semua')
    return {
      nasional: all.filter((r) => r.roadClass === 'nasional'),
      provinsi: all.filter((r) => r.roadClass === 'provinsi'),
      kota: all.filter((r) => r.roadClass === 'kota'),
    }
  }, [geometry])

  useEffect(() => {
    if (step !== 1 || !geometry || !withTraffic) return
    const ring = geometry.coordinates[0]
    const lngs = ring.map(([lng]) => lng)
    const lats = ring.map(([, lat]) => lat)
    zonesApi
      .getTrafficPreview([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)])
      .then(setTraffic)
      .catch(() => setTraffic(null))
  }, [step, geometry, withTraffic])

  function pickRoadClass(next: RoadClass) {
    if (ROAD_CLASS_ORDER.indexOf(next) > ROAD_CLASS_ORDER.indexOf(maxRoadClass)) {
      setUpgradeFor(next)
      return
    }
    setRoadClass(next)
  }

  async function submit() {
    if (!geometry || !roadClass) return
    setSubmitting(true)
    setError(null)
    try {
      await zonesApi.createZone({ name: name.trim(), geometry, roadClass }, plan)
      router.push('/schedule')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Terjadi kesalahan, coba lagi.')
      setSubmitting(false)
    }
  }

  const canLeaveStep1 = name.trim() !== '' && !nameTaken && points.length >= 3
  const canLeaveStep2 = roadClass !== null

  return (
    <div className="space-y-lg">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-page-title font-bold text-text-primary">
            {step === 0 && 'Gambar area yang ingin dikumpulkan'}
            {step === 1 && 'Pilih kedalaman data jalan'}
            {step === 2 && `Review “${name.trim() || 'zona baru'}”`}
          </h1>
          <p className="text-body text-text-secondary mt-xs">
            {step === 2
              ? 'Pengumpulan dimulai pada jendela terjadwal berikutnya setelah Anda membuatnya.'
              : 'Zona menentukan area dan kelas jalan yang di-capture setiap jendela.'}
          </p>
        </div>
        <Button variant="secondary" className="h-10 px-lg" onClick={() => router.push('/zones')}>
          Batal
        </Button>
      </div>

      {/* Step indicator */}
      <ol className="flex items-center gap-md">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-sm">
            <span
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-label font-semibold',
                i < step && 'bg-success-bg text-success-text',
                i === step && 'bg-primary text-on-primary',
                i > step && 'bg-canvas-secondary text-text-muted'
              )}
            >
              {i < step ? '✓' : i + 1}
            </span>
            <span className={cn('text-body', i === step ? 'text-text-primary font-semibold' : 'text-text-secondary')}>{label}</span>
            {i < STEPS.length - 1 && <span aria-hidden className="w-10 h-px bg-border ml-sm" />}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 laptop:grid-cols-[1fr_340px] gap-xl items-start">
        {/* Map panel */}
        <div className="bg-card border border-border rounded-lg p-lg space-y-md">
          {step === 0 && (
            <>
              <div className="flex bg-canvas-secondary border border-border rounded-md p-[3px] w-fit">
                {(['draw', 'import'] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => setMode(option)}
                    className={cn(
                      'px-md h-9 rounded-sm text-label transition-colors',
                      mode === option ? 'bg-canvas text-text-primary font-semibold shadow-elevation-2' : 'text-text-secondary'
                    )}
                  >
                    {option === 'draw' ? 'Gambar' : 'Impor'}
                  </button>
                ))}
              </div>

              {mode === 'draw' ? (
                <>
                  <ZoneMapEditor
                    points={points}
                    onAddPoint={(lat, lng) => setPoints((p) => [...p, [lat, lng]])}
                    onUndo={() => setPoints((p) => p.slice(0, -1))}
                    onReset={() => setPoints([])}
                  />
                  <p className="text-caption text-text-secondary">
                    {points.length === 0 && 'Klik di peta untuk mulai. Tambahkan minimal 3 titik untuk menutup bentuk.'}
                    {points.length > 0 && points.length < 3 && `${points.length} titik ditempatkan · butuh minimal 3 titik.`}
                    {points.length >= 3 && `${points.length} titik · bentuk tertutup · ${area} km²`}
                  </p>
                </>
              ) : (
                <div className="border border-dashed border-border rounded-md p-section text-center space-y-sm">
                  <p className="text-body text-text-primary font-medium">Impor batas dari berkas</p>
                  <p className="text-caption text-text-secondary">
                    GeoJSON dan SHP ada di mockup, tapi impor batas belum masuk lingkup MVP — gambar batasnya di peta
                    untuk sekarang.
                  </p>
                  <div className="flex justify-center gap-sm pt-sm">
                    <span className="text-micro text-text-muted border border-border rounded-xs px-sm py-xs">GeoJSON</span>
                    <span className="text-micro text-text-muted border border-border rounded-xs px-sm py-xs">SHP</span>
                  </div>
                </div>
              )}
            </>
          )}

          {step > 0 && geometry && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-md">
                <p className="text-label text-text-secondary">Pratinjau</p>
                {step === 1 && (
                  <div className="flex bg-canvas-secondary border border-border rounded-md p-[3px]">
                    {[
                      { id: true, label: 'Dengan traffic' },
                      { id: false, label: 'Peta dasar' },
                    ].map((option) => (
                      <button
                        key={String(option.id)}
                        onClick={() => setWithTraffic(option.id)}
                        className={cn(
                          'px-md h-8 rounded-sm text-label transition-colors',
                          withTraffic === option.id ? 'bg-canvas text-text-primary font-semibold shadow-elevation-2' : 'text-text-secondary'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <MapCanvas
                polygon={geometry}
                trafficGeoJSON={step === 1 && withTraffic && traffic ? traffic : undefined}
                className="h-96 w-full"
              />

              {step === 1 && (
                <div className="space-y-sm">
                  <p className="text-micro font-semibold uppercase tracking-wide text-text-muted">Yang di-render</p>
                  <ul className="space-y-xs">
                    {[
                      { label: 'Nasional', collected: true },
                      { label: 'Provinsi', collected: roadClass !== 'nasional' },
                      { label: 'Kota / Lokal', collected: roadClass === 'semua' },
                    ].map((row) => (
                      <li key={row.label} className="flex items-center gap-sm text-caption">
                        <span className={cn('w-2.5 h-2.5 rounded-full', row.collected ? 'bg-success-icon' : 'bg-border')} />
                        <span className={row.collected ? 'text-text-primary' : 'text-text-muted'}>
                          {row.label} · {row.collected ? 'dengan traffic' : 'tidak dikumpulkan'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Details rail */}
        <div className="bg-card border border-border rounded-lg p-lg space-y-lg">
          <div className="flex items-center justify-between">
            <p className="text-heading-sm text-text-primary">Detail zona</p>
            <span className="text-micro text-text-muted">langkah {step + 1}</span>
          </div>

          <div className="space-y-xs">
            <FormLabel htmlFor="zone-name">Nama zona</FormLabel>
            <Input
              id="zone-name"
              value={name}
              disabled={step > 0}
              placeholder="mis. Koridor Sudirman"
              onChange={(e) => setName(e.target.value)}
            />
            {nameTaken && <p className="text-caption text-danger-text">Nama zona sudah digunakan.</p>}
          </div>

          <dl className="space-y-md border-t border-divider pt-lg">
            <RailRow label="Area tergambar" value={points.length >= 3 ? `${area} km² · ${points.length} titik` : '—'} />
            <RailRow
              label="Ruas di dalam"
              value={roadClass ? `${matched.length} · ${matchedLength} km` : `${perClass.nasional.length + perClass.provinsi.length} terdeteksi`}
            />
            {roadClass && <RailRow label="Kelas jalan" value={ROAD_CLASS_LABEL[roadClass]} />}
            {step === 2 && <RailRow label="Slot zona" value={`${existingZones.length + 1} dari ${PLAN_LIMITS[plan].zonesLimit}`} />}
          </dl>

          {step === 0 && (
            <p className="text-caption text-text-secondary border-t border-divider pt-lg">
              <span className="font-semibold text-text-primary">Tips</span> — gambar sedikit lebih lebar dari jalan yang
              Anda pedulikan. Kelas jalan dipilih di langkah berikutnya.
            </p>
          )}

          {step === 1 && (
            <div className="space-y-sm border-t border-divider pt-lg">
              <p className="text-label text-text-secondary">
                Kelas jalan · {ROAD_CLASS_ORDER.indexOf(maxRoadClass) + 1} dari 3 di paket Anda
              </p>
              {ROAD_CLASS_ORDER.map((option) => {
                const locked = ROAD_CLASS_ORDER.indexOf(option) > ROAD_CLASS_ORDER.indexOf(maxRoadClass)
                const roads =
                  option === 'nasional'
                    ? perClass.nasional
                    : option === 'nasional_provinsi'
                      ? [...perClass.nasional, ...perClass.provinsi]
                      : [...perClass.nasional, ...perClass.provinsi, ...perClass.kota]
                const km = Number(roads.reduce((sum, r) => sum + r.lengthKm, 0).toFixed(1))
                return (
                  <button
                    key={option}
                    onClick={() => pickRoadClass(option)}
                    className={cn(
                      'w-full text-left border rounded-md p-md transition-colors',
                      roadClass === option ? 'border-primary bg-primary-soft/40 ring-2 ring-primary-soft' : 'border-border hover:bg-canvas-secondary',
                      locked && 'opacity-70'
                    )}
                  >
                    <span className="flex items-center justify-between gap-sm">
                      <span className="text-label font-semibold text-text-primary">{ROAD_CLASS_LABEL[option]}</span>
                      {locked && (
                        <span className="text-micro font-semibold bg-warning-bg text-warning-text rounded-xs px-sm py-xs">
                          {REQUIRED_PLAN_LABEL[option]}
                        </span>
                      )}
                    </span>
                    <span className="block text-micro text-text-muted mt-xs">{ROAD_CLASS_DESCRIPTION[option]}</span>
                    <span className="block text-micro text-text-secondary mt-xs tabular-nums">
                      {roads.length} ruas · {km} km
                    </span>
                  </button>
                )
              })}
              <p className="text-caption text-text-secondary pt-sm">
                Waktu capture diatur terpisah di halaman <span className="font-medium text-text-primary">Jadwal</span>.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="border-t border-divider pt-lg space-y-md">
              <div className="flex items-center gap-sm">
                <span className="text-label text-text-secondary">Kelas jalan</span>
                {roadClass && <RoadClassBadge roadClass={roadClass} />}
              </div>
              <p className="text-caption text-text-secondary">
                Belum ada waktu capture. Setelah dibuat, atur jendela di halaman Jadwal — sampai itu zona ini diam.
              </p>
              {error && <Alert variant="warning">{error}</Alert>}
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex flex-wrap items-center justify-between gap-md border-t border-border pt-lg">
        <span className="text-caption text-text-muted">
          Langkah {step + 1} dari 3 · {STEPS[step]}
        </span>
        <div className="flex gap-sm">
          {step > 0 && (
            <Button variant="secondary" className="h-11 px-lg" onClick={() => setStep(step - 1)}>
              Kembali
            </Button>
          )}
          {step < 2 && (
            <Button
              className="h-11 px-lg"
              disabled={step === 0 ? !canLeaveStep1 : !canLeaveStep2}
              onClick={() => setStep(step + 1)}
            >
              {step === 0 ? 'Lanjut: kelas jalan' : 'Lanjut: review'}
            </Button>
          )}
          {step === 2 && (
            <Button className="h-11 px-lg" disabled={submitting} onClick={submit}>
              {submitting ? 'Menyimpan...' : 'Buat zona & atur jadwal'}
            </Button>
          )}
        </div>
      </div>

      <UpgradeModal
        open={upgradeFor !== null}
        onClose={() => setUpgradeFor(null)}
        requiredPlan={upgradeFor ? REQUIRED_PLAN_LABEL[upgradeFor] : ''}
      />
    </div>
  )
}

function RailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-md">
      <dt className="text-body text-text-secondary">{label}</dt>
      <dd className="text-body font-semibold text-text-primary tabular-nums">{value}</dd>
    </div>
  )
}
