'use client'

import { MapCanvas } from '../MapCanvas'
import { RoadClassBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import type { RoadClass, ZoneGeometry } from '../../types'

interface StepReviewProps {
  name: string
  geometry: ZoneGeometry
  roadClass: RoadClass
  submitting: boolean
  errorCode: string | null
  onSubmit: () => void
  onBackToStep1: () => void
  onBackToStep2: () => void
}

export function StepReview({ name, geometry, roadClass, submitting, errorCode, onSubmit, onBackToStep1, onBackToStep2 }: StepReviewProps) {
  return (
    <div className="space-y-lg">
      <div className="space-y-sm">
        <p className="text-label text-text-secondary">Nama Zona</p>
        <p className="text-heading-sm text-text-primary">{name}</p>
      </div>

      <MapCanvas polygon={geometry} className="h-56 w-full" />

      <div className="space-y-sm">
        <p className="text-label text-text-secondary">Road Class</p>
        <RoadClassBadge roadClass={roadClass} />
      </div>

      {errorCode === 'ZONE_NAME_TAKEN' && (
        <Alert variant="warning">
          Nama zona sudah digunakan.{' '}
          <button className="underline font-semibold" onClick={onBackToStep1}>
            Kembali ke Step 1
          </button>
        </Alert>
      )}
      {errorCode === 'ROAD_CLASS_NOT_ALLOWED' && (
        <Alert variant="warning">
          Road class ini memerlukan upgrade plan.{' '}
          <button className="underline font-semibold" onClick={onBackToStep2}>
            Kembali ke Step 2
          </button>
        </Alert>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="secondary" onClick={onBackToStep2} disabled={submitting}>
          Kembali
        </Button>
        <Button type="button" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Membuat...' : 'Buat Zona'}
        </Button>
      </div>
    </div>
  )
}
