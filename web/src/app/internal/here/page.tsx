'use client'

/**
 * HERE usage and budget cap (staff only).
 *
 * Every traffic request the platform sends to HERE — captures, map previews, road-class
 * counts, zone stats — counted per WIB day, against a daily and a monthly cap staff can
 * set here. Once a cap is reached, HERE calls are refused before they're sent (so not
 * billed); customers see only that traffic data is briefly unavailable, never why.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormLabel, Input } from '@/components/ui/Input'
import { CardTitle, SectionHeader } from '@/components/shared/SectionHeader'
import { cn, formatNumber } from '@/lib/utils'
import { ApiError } from '@/types/api'
import {
  SOURCE_LABEL,
  getHereUsage,
  setHereBudget,
  type HereBudget,
  type HereSource,
  type HereUsageSummary,
} from '@/features/internal/here-api'

const SOURCES: HereSource[] = ['capture', 'preview', 'road_counts', 'zone_stats']
const SOURCE_COLOR: Record<HereSource, string> = {
  capture: 'bg-primary',
  preview: 'bg-info',
  road_counts: 'bg-warning-icon',
  zone_stats: 'bg-success-icon',
}

function pct(share: number | null): string {
  return share === null ? '' : `${Math.round(share * 100)}%`
}

function shortDay(day: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
}

/** Form text ↔ a limit: empty means "no cap". */
function toField(n: number | null): string {
  return n === null ? '' : String(n)
}
function fromField(s: string): number | null {
  const t = s.trim()
  return t === '' ? null : Number(t)
}

export default function HereUsagePage() {
  const [data, setData] = useState<HereUsageSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<{ daily: string; monthly: string; cost: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const apply = useCallback((next: HereUsageSummary) => {
    setData(next)
    setForm({
      daily: toField(next.budget.dailyLimit),
      monthly: toField(next.budget.monthlyLimit),
      cost: toField(next.budget.costPer1000),
    })
  }, [])

  useEffect(() => {
    getHereUsage()
      .then(apply)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load HERE usage.'))
  }, [apply])

  async function save() {
    if (!form) return
    const budget: HereBudget = {
      dailyLimit: fromField(form.daily),
      monthlyLimit: fromField(form.monthly),
      costPer1000: fromField(form.cost),
    }
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      apply(await setHereBudget(budget))
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the budget.')
    } finally {
      setSaving(false)
    }
  }

  if (!data || !form) {
    return (
      <div className="space-y-lg">
        {error ? <Alert variant="warning">{error}</Alert> : <div className="h-8 w-64 bg-canvas-secondary rounded-md animate-pulse" />}
        <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-lg">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-canvas-secondary rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const { budget } = data
  const peak = Math.max(...data.days.map((d) => d.total), budget.dailyLimit ?? 0, 1)
  const sourceTotals = Object.fromEntries(SOURCES.map((s) => [s, data.days.reduce((sum, d) => sum + d.bySource[s], 0)])) as Record<
    HereSource,
    number
  >
  const invalid =
    [form.daily, form.monthly].some((v) => v.trim() !== '' && (!Number.isInteger(Number(v)) || Number(v) < 1)) ||
    (form.cost.trim() !== '' && (Number.isNaN(Number(form.cost)) || Number(form.cost) < 0))

  return (
    <div className="space-y-xl">
      <div>
        <p className="text-label text-text-secondary">Platform</p>
        <h1 className="text-page-title font-bold text-text-primary mt-xs">HERE usage</h1>
        <p className="text-body text-text-secondary mt-xs">
          Traffic requests the platform sends to HERE, and the cap that keeps the bill in budget. Customers never see
          this page.
        </p>
      </div>

      {data.status === 'blocked' && (
        <Alert variant="warning">
          A cap is reached — HERE calls are being refused, so captures and map previews are failing with &ldquo;traffic
          data unavailable&rdquo;. Raise or clear the cap below to resume.
        </Alert>
      )}
      {data.status === 'warning' && (
        <Alert variant="warning">Over 80% of a cap is used. Captures will stop when it is reached.</Alert>
      )}
      {error && <Alert variant="warning">{error}</Alert>}

      <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-lg">
        <UsageTile
          label="Today"
          value={formatNumber(data.today.requests)}
          limit={budget.dailyLimit}
          share={data.dailyUsed}
          note={budget.dailyLimit === null ? 'No daily cap' : `of ${formatNumber(budget.dailyLimit)} per day`}
        />
        <UsageTile
          label="This month"
          value={formatNumber(data.month.requests)}
          limit={budget.monthlyLimit}
          share={data.monthlyUsed}
          note={budget.monthlyLimit === null ? 'No monthly cap' : `of ${formatNumber(budget.monthlyLimit)} per month`}
        />
        <UsageTile
          label="Estimated spend this month"
          value={data.estimatedMonthCost === null ? '—' : `$${formatNumber(data.estimatedMonthCost, 2)}`}
          note={budget.costPer1000 === null ? 'Set a price per 1,000 requests below' : `at $${budget.costPer1000} per 1,000`}
        />
        <UsageTile
          label="Refused this month"
          value={formatNumber(data.month.refused)}
          note={`Calls the cap stopped · ${formatNumber(data.month.failed)} failed at HERE`}
        />
      </div>

      <section className="space-y-md">
        <SectionHeader title="Last 30 days" description="Requests per WIB day, by what asked for them." />
        <Card className="p-lg space-y-md">
          <div className="relative h-48 flex items-end gap-[3px]">
            {budget.dailyLimit !== null && (
              <div
                className="absolute inset-x-0 border-t border-dashed border-danger-icon"
                style={{ bottom: `${(budget.dailyLimit / peak) * 100}%` }}
                title={`Daily cap: ${formatNumber(budget.dailyLimit)}`}
              >
                <span className="absolute right-0 -top-5 text-micro text-danger-text bg-card px-xs">
                  daily cap {formatNumber(budget.dailyLimit)}
                </span>
              </div>
            )}
            {data.days.map((d) => (
              <div
                key={d.day}
                className="flex-1 min-w-[4px] h-full flex flex-col justify-end"
                title={`${shortDay(d.day)} · ${formatNumber(d.total)} requests${d.refused ? ` · ${d.refused} refused` : ''}`}
              >
                {SOURCES.map((s) =>
                  d.bySource[s] > 0 ? (
                    <div
                      key={s}
                      className={cn(SOURCE_COLOR[s], 'first:rounded-t-xs')}
                      style={{ height: `${(d.bySource[s] / peak) * 100}%` }}
                    />
                  ) : null,
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-micro text-text-muted tabular-nums">
            <span>{shortDay(data.days[0]!.day)}</span>
            <span>{shortDay(data.days[data.days.length - 1]!.day)}</span>
          </div>
          <dl className="grid grid-cols-2 laptop:grid-cols-4 gap-md border-t border-divider pt-md">
            {SOURCES.map((s) => (
              <div key={s} className="flex items-center gap-sm">
                <span className={cn('w-3 h-3 rounded-xs shrink-0', SOURCE_COLOR[s])} />
                <dt className="text-caption text-text-secondary">{SOURCE_LABEL[s]}</dt>
                <dd className="ml-auto text-caption font-semibold text-text-primary tabular-nums">{formatNumber(sourceTotals[s])}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>

      <section className="space-y-md">
        <SectionHeader
          title="Budget cap"
          description="When a cap is reached, HERE calls are refused before they're sent — they aren't billed, but captures and previews fail until the next day or month. Leave a field empty for no cap."
        />
        <Card className="p-lg space-y-lg">
          <CardTitle>Limits</CardTitle>
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-lg">
            <div className="space-y-xs">
              <FormLabel htmlFor="here-daily">Requests per day</FormLabel>
              <Input
                id="here-daily"
                type="number"
                min={1}
                placeholder="No cap"
                value={form.daily}
                onChange={(e) => setForm({ ...form, daily: e.target.value })}
              />
            </div>
            <div className="space-y-xs">
              <FormLabel htmlFor="here-monthly">Requests per month</FormLabel>
              <Input
                id="here-monthly"
                type="number"
                min={1}
                placeholder="No cap"
                value={form.monthly}
                onChange={(e) => setForm({ ...form, monthly: e.target.value })}
              />
            </div>
            <div className="space-y-xs">
              <FormLabel htmlFor="here-cost">Price per 1,000 requests (USD)</FormLabel>
              <Input
                id="here-cost"
                type="number"
                min={0}
                step="0.01"
                placeholder="For the spend estimate"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-md border-t border-divider pt-lg">
            <p className="text-caption text-text-muted">
              {data.budgetUpdatedAt
                ? `Last changed ${new Date(data.budgetUpdatedAt).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' })} WIB. Applies at once; the capture worker picks it up within 15 seconds.`
                : 'No cap set yet.'}
              {saved && <span className="text-success-text font-semibold"> Saved.</span>}
            </p>
            <Button onClick={save} disabled={saving || invalid}>
              {saving ? 'Saving…' : 'Save budget'}
            </Button>
          </div>
          {invalid && <p className="text-caption text-danger-text">Limits must be whole numbers of 1 or more; the price can&rsquo;t be negative.</p>}
        </Card>
      </section>
    </div>
  )
}

function UsageTile({
  label,
  value,
  note,
  limit,
  share,
}: {
  label: string
  value: string
  note: string
  limit?: number | null
  share?: number | null
}) {
  const level = share === null || share === undefined ? null : share >= 1 ? 'blocked' : share >= 0.8 ? 'warning' : 'ok'
  return (
    <Card className="p-lg">
      <p className="text-label text-text-secondary">{label}</p>
      <p className="text-display text-text-primary mt-xs tabular-nums">{value}</p>
      {limit !== undefined && limit !== null && share !== null && share !== undefined && (
        <div className="mt-sm space-y-xs">
          <div className="h-1.5 rounded-full bg-canvas-secondary overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full',
                level === 'blocked' ? 'bg-danger-icon' : level === 'warning' ? 'bg-warning-icon' : 'bg-primary',
              )}
              style={{ width: `${Math.min(share * 100, 100)}%` }}
            />
          </div>
          <p className={cn('text-micro font-semibold tabular-nums', level === 'blocked' ? 'text-danger-text' : level === 'warning' ? 'text-warning-text' : 'text-text-muted')}>
            {pct(share)} used
          </p>
        </div>
      )}
      <p className="text-caption text-text-muted mt-sm">{note}</p>
    </Card>
  )
}
