'use client'

import { useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import type { LatLngExpression } from 'leaflet'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { ApiError } from '@/types/api'
import { StepAreaSelect } from './steps/StepAreaSelect'
import { StepRoadClass } from './steps/StepRoadClass'
import { StepReview } from './steps/StepReview'
import { pointsToGeometry } from './ZoneMapEditor'
import * as zonesApi from '../api'
import type { RoadClass, Zone } from '../types'
import type { Plan } from '@/features/auth/types'

const STEPS = ['Pilih Area', 'Road Class', 'Review']

interface ZoneCreateStepperProps {
  open: boolean
  onClose: () => void
  onCreated: (zone: Zone) => void
  existingZoneNames: string[]
  plan: Plan
}

export function ZoneCreateStepper({ open, onClose, onCreated, existingZoneNames, plan }: ZoneCreateStepperProps) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [points, setPoints] = useState<LatLngExpression[]>([])
  const [roadClass, setRoadClass] = useState<RoadClass | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)

  const hasProgress = name.trim().length > 0 || points.length > 0

  function reset() {
    setStep(0)
    setName('')
    setPoints([])
    setRoadClass(null)
    setErrorCode(null)
    setSubmitting(false)
  }

  function requestClose() {
    if (hasProgress && step < 2) {
      setConfirmExit(true)
      return
    }
    reset()
    onClose()
  }

  const geometry = pointsToGeometry(points)

  async function handleSubmit() {
    if (!geometry || !roadClass) return
    setSubmitting(true)
    setErrorCode(null)
    try {
      const zone = await zonesApi.createZone({ name: name.trim(), geometry, roadClass }, plan)
      onCreated(zone)
      reset()
      onClose()
    } catch (err) {
      setErrorCode(err instanceof ApiError ? err.code : 'UNKNOWN')
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && requestClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <Dialog.Title className="text-section-title text-text-primary mb-lg">Buat Zona Baru</Dialog.Title>

          <div className="flex items-center gap-sm mb-xl">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-sm flex-1">
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-micro font-semibold shrink-0',
                    i < step ? 'bg-primary text-on-primary' : i === step ? 'bg-primary-soft text-[#5A35F3] ring-2 ring-primary' : 'bg-canvas-secondary text-text-muted'
                  )}
                >
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={cn('text-caption', i === step ? 'text-text-primary font-semibold' : 'text-text-muted')}>
                  {label}
                </span>
                {i < STEPS.length - 1 && <div className="flex-1 h-px bg-divider" />}
              </div>
            ))}
          </div>

          {step === 0 && (
            <StepAreaSelect
              name={name}
              onNameChange={setName}
              points={points}
              onAddPoint={(lat, lng) => setPoints((p) => [...p, [lat, lng]])}
              onUndo={() => setPoints((p) => p.slice(0, -1))}
              onReset={() => setPoints([])}
              existingNames={existingZoneNames}
              onNext={() => setStep(1)}
            />
          )}

          {step === 1 && geometry && (
            <StepRoadClass
              roadClass={roadClass}
              onRoadClassChange={setRoadClass}
              plan={plan}
              geometry={geometry}
              zoneName={name}
              onNext={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          )}

          {step === 2 && geometry && roadClass && (
            <StepReview
              name={name}
              geometry={geometry}
              roadClass={roadClass}
              submitting={submitting}
              errorCode={errorCode}
              onSubmit={handleSubmit}
              onBackToStep1={() => setStep(0)}
              onBackToStep2={() => setStep(1)}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>

      {confirmExit && (
        <Dialog.Root open onOpenChange={(next) => !next && setConfirmExit(false)}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
            <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[24rem] bg-card border border-border rounded-lg p-xl shadow-elevation-3">
              <Dialog.Title className="text-section-title text-text-primary mb-sm">Yakin keluar?</Dialog.Title>
              <Dialog.Description className="text-body text-text-secondary mb-lg">
                Progress akan hilang jika Anda keluar sekarang.
              </Dialog.Description>
              <div className="flex justify-end gap-sm">
                <Button variant="secondary" className="h-10 px-lg" onClick={() => setConfirmExit(false)}>
                  Batal
                </Button>
                <Button
                  variant="destructive"
                  className="h-10 px-lg"
                  onClick={() => {
                    setConfirmExit(false)
                    reset()
                    onClose()
                  }}
                >
                  Keluar
                </Button>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </Dialog.Root>
  )
}
