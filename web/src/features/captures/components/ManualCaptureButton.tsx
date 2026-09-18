'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Button } from '@/components/ui/Button'
import { StyleSelector } from '@/components/ui/StyleSelector'
import { StatusBadge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import { ApiError } from '@/types/api'
import { CAPTURE_POLL_INTERVAL_MS } from '@/lib/constants'
import * as capturesApi from '../api'
import type { Capture } from '../types'
import { DEFAULT_STYLE, type CaptureStyleInput } from '@/features/zones/types'

interface ManualCaptureButtonProps {
  zoneId: string
  zoneName: string
  /** The trigger's appearance — secondary where it sits beside a stronger action. */
  variant?: 'primary' | 'secondary'
  className?: string
}

export function ManualCaptureButton({ zoneId, zoneName, variant = 'primary', className }: ManualCaptureButtonProps) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CaptureStyleInput>({ ...DEFAULT_STYLE, title: zoneName })
  const [capture, setCapture] = useState<Capture | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  function openModal() {
    setStyle({ ...DEFAULT_STYLE, title: zoneName })
    setCapture(null)
    setError(null)
    setOpen(true)
  }

  function startPolling(id: string) {
    pollRef.current = setInterval(async () => {
      const updated = await capturesApi.getCapture(id)
      setCapture(updated)
      if (updated.status === 'done' || updated.status === 'failed' || updated.status === 'skipped_limit') {
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }, CAPTURE_POLL_INTERVAL_MS)
  }

  async function handleConfirm() {
    setTriggering(true)
    setError(null)
    try {
      const created = await capturesApi.triggerManual(zoneId, style)
      setCapture(created)
      startPolling(created.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setTriggering(false)
    }
  }

  function retry() {
    if (pollRef.current) clearInterval(pollRef.current)
    setCapture(null)
    setError(null)
    setStyle({ ...DEFAULT_STYLE, title: zoneName })
  }

  const inProgress = capture && (capture.status === 'pending' || capture.status === 'processing')
  const finished = capture && ['done', 'failed', 'skipped_limit'].includes(capture.status)

  return (
    <>
      <Button variant={variant} className={className} onClick={openModal}>
        Capture now
      </Button>

      <Dialog.Root open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
          <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[28rem] bg-card border border-border rounded-lg p-xl shadow-elevation-3">
            <Dialog.Title className="text-section-title text-text-primary mb-lg">
              Capture — {zoneName}
            </Dialog.Title>

            {error && <Alert variant="warning" className="mb-lg">{error}</Alert>}

            {!capture && (
              <>
                <StyleSelector value={style} onChange={setStyle} />
                <div className="flex justify-end gap-sm mt-xl">
                  <Button variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleConfirm} disabled={triggering}>
                    {triggering ? 'Working…' : 'Capture now'}
                  </Button>
                </div>
              </>
            )}

            {inProgress && (
              <div className="text-center py-xl space-y-md">
                <StatusBadge status={capture!.status} />
                <p className="text-body text-text-secondary">Processing capture…</p>
              </div>
            )}

            {finished && capture!.status === 'done' && (
              <div className="space-y-md">
                <img src={capture!.filePath!} alt={zoneName} className="rounded-md border border-border w-full" />
                <div className="flex justify-between items-center">
                  <StatusBadge status={capture!.status} />
                  <a
                    href={capture!.filePath!}
                    download={`${zoneName}.png`}
                    className="text-info no-underline hover:underline text-label"
                  >
                    Download
                  </a>
                </div>
              </div>
            )}

            {finished && capture!.status !== 'done' && (
              <div className="space-y-md">
                <Alert variant="warning">
                  {capture!.status === 'skipped_limit'
                    ? "You have reached your plan's daily capture limit."
                    : capture!.errorMessage ?? 'Capture failed to process.'}
                </Alert>
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={retry}>
                    Try again
                  </Button>
                </div>
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
