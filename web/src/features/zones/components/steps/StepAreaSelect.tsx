'use client'

import type { LatLngExpression } from 'leaflet'
import { FormLabel, Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ZoneMapEditor } from '../ZoneMapEditor'

interface StepAreaSelectProps {
  name: string
  onNameChange: (name: string) => void
  points: LatLngExpression[]
  onAddPoint: (lat: number, lng: number) => void
  onUndo: () => void
  onReset: () => void
  existingNames: string[]
  onNext: () => void
}

export function StepAreaSelect({
  name,
  onNameChange,
  points,
  onAddPoint,
  onUndo,
  onReset,
  existingNames,
  onNext,
}: StepAreaSelectProps) {
  const nameTaken = name.trim().length > 0 && existingNames.some((n) => n.toLowerCase() === name.trim().toLowerCase())
  const nameValid = name.trim().length > 0 && !nameTaken
  const polygonValid = points.length >= 3
  const canProceed = nameValid && polygonValid

  return (
    <div className="space-y-lg">
      <div className="space-y-xs">
        <FormLabel htmlFor="zone-name">Nama Zona</FormLabel>
        <Input id="zone-name" value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Zona Malioboro" />
        {nameTaken && <p className="text-caption text-red-600">Nama zona sudah digunakan.</p>}
      </div>

      <ZoneMapEditor points={points} onAddPoint={onAddPoint} onUndo={onUndo} onReset={onReset} />

      <div className="flex justify-end">
        <Button type="button" onClick={onNext} disabled={!canProceed}>
          Lanjut
        </Button>
      </div>
    </div>
  )
}
