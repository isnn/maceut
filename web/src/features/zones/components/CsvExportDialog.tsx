'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Dialog } from '@base-ui/react/dialog'
import { DialogCloseX } from '@/components/ui/DialogCloseX'
import { Button, linkClass } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { IconCrown, IconDownload } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { PLAN_LABEL, PLAN_LIMITS } from '@/lib/constants'
import { ApiError } from '@/types/api'
import type { Plan } from '@/features/auth/types'
import * as zonesApi from '../api'

/** The ranges offered; `null` days = all history. */
const RANGES: { id: zonesApi.CsvRange; label: string; days: number | null }[] = [
  { id: '1', label: 'Last 24 hours', days: 1 },
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All history', days: null },
]

/** The cheapest plan whose history reaches this far. */
function planReaching(days: number | null): Plan {
  return (['free', 'standard', 'premium'] as Plan[]).find((p) => {
    const h = PLAN_LIMITS[p].historyDays
    return h === null || (days !== null && days <= h)
  })!
}

/**
 * Export CSV → pick how far back (FE-32). Ranges past the plan carry a crown: picking
 * one says which plan reaches it, and Download waits for a range the plan covers — the
 * API refuses the rest too (BR-007).
 */
export function CsvExportDialog({ open, zoneId, plan, onClose }: { open: boolean; zoneId: string; plan: Plan; onClose: () => void }) {
  const [range, setRange] = useState<zonesApi.CsvRange>('7')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosen = RANGES.find((r) => r.id === range)!
  const needs = planReaching(chosen.days)
  const locked = needs !== plan && PLAN_LIMITS[plan].historyDays !== null && (chosen.days === null || chosen.days > PLAN_LIMITS[plan].historyDays!)

  async function download() {
    setWorking(true)
    setError(null)
    try {
      await zonesApi.downloadCapturesCsv(zoneId, range)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'NETWORK_ERROR' ? err.message : 'Couldn’t prepare the CSV. Please try again.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-[26rem] bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <DialogCloseX disabled={working} />
          <Dialog.Title className="pr-xl text-section-title text-text-primary mb-lg">Export CSV</Dialog.Title>

          {error && (
            <Alert variant="warning" className="mb-md">
              {error}
            </Alert>
          )}

          <div role="radiogroup" aria-label="Time range" className="space-y-xs">
            {RANGES.map((r) => {
              const rLocked = planReaching(r.days) !== plan && PLAN_LIMITS[plan].historyDays !== null && (r.days === null || r.days > PLAN_LIMITS[plan].historyDays!)
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={range === r.id}
                  onClick={() => setRange(r.id)}
                  className={cn(
                    'w-full h-11 px-md rounded-md border flex items-center justify-between gap-sm text-body transition-colors',
                    range === r.id
                      ? 'border-primary bg-primary-soft text-text-primary font-semibold'
                      : 'border-border bg-canvas text-text-secondary hover:bg-canvas-secondary',
                  )}
                >
                  {r.label}
                  {rLocked && <IconCrown size={14} className="text-primary" aria-label="Upgrade to unlock" />}
                </button>
              )
            })}
          </div>

          {locked && (
            <div className="mt-md rounded-md bg-primary-soft px-md py-sm flex flex-wrap items-center gap-x-sm gap-y-xs" role="status">
              <IconCrown size={14} className="text-primary shrink-0" />
              <p className="text-caption font-medium text-primary">
                {chosen.label} is on {PLAN_LABEL[needs]}.
              </p>
              <Link href="/profile" className={cn(linkClass('caption'), 'ml-auto')}>
                Upgrade
              </Link>
            </div>
          )}

          <div className="flex justify-end gap-sm mt-xl">
            <Button variant="secondary" onClick={onClose} disabled={working}>
              Cancel
            </Button>
            <Button onClick={() => void download()} disabled={working || locked}>
              <IconDownload size={16} />
              {working ? 'Preparing…' : 'Download'}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
