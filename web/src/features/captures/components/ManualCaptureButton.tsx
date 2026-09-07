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

export function ManualCaptureButton({ zoneId, zoneName }: { zoneId: string; zoneName: string }) {
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
      setError(err instanceof ApiError ? err.message : 'Terjadi kesalahan, coba lagi.')
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
      <Button variant="primary" className="h-10 px-lg" onClick={openModal}>
        Capture Sekarang
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
                  <Button variant="secondary" className="h-10 px-lg" onClick={() => setOpen(false)}>
                    Batal
                  </Button>
                  <Button className="h-10 px-lg" onClick={handleConfirm} disabled={triggering}>
                    {triggering ? 'Memproses...' : 'Capture Sekarang'}
                  </Button>
                </div>
              </>
            )}

            {inProgress && (
              <div className="text-center py-xl space-y-md">
                <StatusBadge status={capture!.status} />
                <p className="text-body text-text-secondary">Sedang memproses capture...</p>
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
                    Unduh
                  </a>
                </div>
              </div>
            )}

            {finished && capture!.status !== 'done' && (
              <div className="space-y-md">
                <Alert variant="warning">
                  {capture!.status === 'skipped_limit'
                    ? 'Batas captures harian plan Anda tercapai.'
                    : capture!.errorMessage ?? 'Capture gagal diproses.'}
                </Alert>
                <div className="flex justify-end">
                  <Button variant="secondary" className="h-10 px-lg" onClick={retry}>
                    Coba Lagi
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
