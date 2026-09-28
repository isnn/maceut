import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/notification.repository', () => ({
  insertOnce: vi.fn(async (row: unknown) => row),
  findDueEmails: vi.fn(),
  markEmailSent: vi.fn(),
  markEmailSkipped: vi.fn(),
  recordEmailAttemptFailed: vi.fn(),
  getPreferences: vi.fn(async () => ({ emailCaptureProblems: true })),
  countSent: vi.fn(async () => 0),
  claimEmail: vi.fn(async () => true),
  setEmailOutcome: vi.fn(),
}))
vi.mock('../repositories/capture.repository', () => ({ lastSettledScheduled: vi.fn() }))
vi.mock('../repositories/export.repository', () => ({ findById: vi.fn() }))
vi.mock('../repositories/zone.repository', () => ({ findById: vi.fn() }))
vi.mock('../repositories/user.repository', () => ({
  findById: vi.fn(async () => ({ id: 'u1', email: 'budi@example.com' })),
  listInternalIds: vi.fn(async () => ['staff1', 'staff2']),
}))
vi.mock('./email.service', () => ({
  sendLogged: vi.fn(async () => true),
  captureProblemsEmail: vi.fn((to: string, zones: unknown[]) => ({ to, zones, kind: 'capture-problems' })),
  planChangedEmail: vi.fn((to: string) => ({ to, kind: 'plan-changed' })),
  hereBudgetEmail: vi.fn((to: string) => ({ to, kind: 'here-budget' })),
}))
vi.mock('../lib/email', () => ({ getEmailProvider: () => ({ name: 'console' }) }))

import * as svc from './notification.service'
import * as notificationRepo from '../repositories/notification.repository'
import * as captureRepo from '../repositories/capture.repository'
import * as exportRepo from '../repositories/export.repository'
import * as email from './email.service'

const at = new Date('2026-09-28T00:00:00Z') // 07:00 WIB
const failedCapture = { id: 'c2', userId: 'u1', zoneId: 'z1', trigger: 'scheduled', capturedAt: at, error: 'HERE 503' }

function pendingFailing(over: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    userId: 'u1',
    type: 'capture_failing',
    title: 't',
    body: 'b',
    data: { zoneId: 'z1', zoneName: 'Sudirman' },
    readAt: null,
    createdAt: at,
    ...over,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(notificationRepo.insertOnce).mockImplementation(async (row) => row as never)
  vi.mocked(notificationRepo.getPreferences).mockResolvedValue({ emailCaptureProblems: true })
  vi.mocked(notificationRepo.countSent).mockResolvedValue(0)
  vi.mocked(email.sendLogged).mockResolvedValue(true)
})

describe('onCaptureFailed', () => {
  it('notifies when a failure starts a streak, with the email held for 2 hours', async () => {
    vi.mocked(captureRepo.lastSettledScheduled).mockResolvedValue({ id: 'c1', status: 'done', capturedAt: at })
    await svc.onCaptureFailed(failedCapture, 'Sudirman')

    const row = vi.mocked(notificationRepo.insertOnce).mock.calls[0]![0]
    expect(row).toMatchObject({
      userId: 'u1',
      type: 'capture_failing',
      title: 'Sudirman stopped collecting',
      actionHref: '/zones/z1',
      emailStatus: 'pending',
      dedupeKey: 'capture-failing:z1:c2',
    })
    expect((row.emailDueAt as Date).getTime() - at.getTime()).toBe(2 * 60 * 60 * 1000)
  })

  it('stays quiet while the zone is already failing — one notification per streak', async () => {
    vi.mocked(captureRepo.lastSettledScheduled).mockResolvedValue({ id: 'c1', status: 'failed', capturedAt: at })
    await svc.onCaptureFailed(failedCapture, 'Sudirman')
    expect(notificationRepo.insertOnce).not.toHaveBeenCalled()
  })

  it('ignores manual captures — the person who pressed the button is watching', async () => {
    await svc.onCaptureFailed({ ...failedCapture, trigger: 'manual' }, 'Sudirman')
    expect(captureRepo.lastSettledScheduled).not.toHaveBeenCalled()
    expect(notificationRepo.insertOnce).not.toHaveBeenCalled()
  })

  it('never throws — a notification must not fail the capture', async () => {
    vi.mocked(captureRepo.lastSettledScheduled).mockRejectedValue(new Error('db down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(svc.onCaptureFailed(failedCapture, 'Sudirman')).resolves.toBeUndefined()
    error.mockRestore()
  })
})

describe('onCaptureDone', () => {
  it('says the zone recovered after a failure, in-app only', async () => {
    vi.mocked(captureRepo.lastSettledScheduled).mockResolvedValue({ id: 'c1', status: 'failed', capturedAt: at })
    await svc.onCaptureDone({ ...failedCapture, id: 'c3' }, 'Sudirman')
    expect(notificationRepo.insertOnce).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'capture_recovered', dedupeKey: 'capture-recovered:z1:c3' }),
    )
    expect(vi.mocked(notificationRepo.insertOnce).mock.calls[0]![0].emailStatus).toBeUndefined()
  })

  it('says nothing after an ordinary success', async () => {
    vi.mocked(captureRepo.lastSettledScheduled).mockResolvedValue({ id: 'c1', status: 'done', capturedAt: at })
    await svc.onCaptureDone({ ...failedCapture, id: 'c3' }, 'Sudirman')
    expect(notificationRepo.insertOnce).not.toHaveBeenCalled()
  })
})

describe('onCaptureQueued (near the daily limit)', () => {
  // Standard allows 50 captures a day; 80% is 40.
  it('notes it once usage reaches 80%', async () => {
    await svc.onCaptureQueued('u1', 'standard', 40, at)
    expect(notificationRepo.insertOnce).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'capture_limit_near', dedupeKey: 'limit-near:2026-09-28' }),
    )
  })

  it('stays quiet below 80%', async () => {
    await svc.onCaptureQueued('u1', 'standard', 39, at)
    expect(notificationRepo.insertOnce).not.toHaveBeenCalled()
  })
})

describe('onExportFinished', () => {
  it('announces a finished export in-app, never by email', async () => {
    vi.mocked(exportRepo.findById).mockResolvedValue({
      id: 'e1',
      userId: 'u1',
      zoneId: 'z1',
      status: 'done',
      format: 'webm',
      spec: { zoneName: 'Sudirman' },
    } as never)
    await svc.onExportFinished('e1')
    const row = vi.mocked(notificationRepo.insertOnce).mock.calls[0]![0]
    expect(row).toMatchObject({ type: 'export_ready', title: 'Animation ready — Sudirman', dedupeKey: 'export-done:e1' })
    expect(row.emailStatus).toBeUndefined()
  })
})

describe('onPlanChanged', () => {
  it('emails only when staff made the change', async () => {
    await svc.onPlanChanged('u1', { from: 'premium', to: 'free', paused: ['Sudirman'], byStaff: true }, at)
    expect(vi.mocked(notificationRepo.insertOnce).mock.calls[0]![0]).toMatchObject({
      type: 'plan_changed',
      emailStatus: 'pending',
      emailDueAt: at,
    })
    expect(vi.mocked(notificationRepo.insertOnce).mock.calls[0]![0].body).toContain('Paused to fit the new limits: Sudirman')

    vi.mocked(notificationRepo.insertOnce).mockClear()
    await svc.onPlanChanged('u1', { from: 'standard', to: 'free', paused: [], byStaff: false }, at)
    expect(vi.mocked(notificationRepo.insertOnce).mock.calls[0]![0]).toMatchObject({ emailStatus: 'none' })
  })
})

describe('runEmailSweep', () => {
  it('sends ONE email listing every still-failing zone of a user', async () => {
    vi.mocked(notificationRepo.findDueEmails).mockResolvedValue([
      pendingFailing(),
      pendingFailing({ id: 'n2', data: { zoneId: 'z2', zoneName: 'Malioboro', failedAt: '2026-09-27T23:00:00.000Z' } }),
    ])
    vi.mocked(captureRepo.lastSettledScheduled).mockResolvedValue({ id: 'x', status: 'failed', capturedAt: at })

    const r = await svc.runEmailSweep(at)

    expect(r).toEqual({ sent: 1, skipped: 0, failed: 0 })
    expect(email.sendLogged).toHaveBeenCalledTimes(1)
    const zones = vi.mocked(email.captureProblemsEmail).mock.calls[0]![1]
    expect(zones.map((z) => z.zoneName)).toEqual(['Sudirman', 'Malioboro'])
    expect(zones[0]!.since).toEqual(at) // no failedAt recorded → falls back to the row's time
    expect(zones[1]!.since).toEqual(new Date('2026-09-27T23:00:00.000Z')) // the capture's own time
    expect(notificationRepo.markEmailSent).toHaveBeenCalledWith(['n1', 'n2'], at)
  })

  it('skips what was already seen in the app', async () => {
    vi.mocked(notificationRepo.findDueEmails).mockResolvedValue([pendingFailing({ readAt: at })])
    await svc.runEmailSweep(at)
    expect(notificationRepo.markEmailSkipped).toHaveBeenCalledWith(['n1'], 'read_in_app')
    expect(email.sendLogged).not.toHaveBeenCalled()
  })

  it('skips a zone that has recovered in the meantime', async () => {
    vi.mocked(notificationRepo.findDueEmails).mockResolvedValue([pendingFailing()])
    vi.mocked(captureRepo.lastSettledScheduled).mockResolvedValue({ id: 'x', status: 'done', capturedAt: at })
    await svc.runEmailSweep(at)
    expect(notificationRepo.markEmailSkipped).toHaveBeenCalledWith(['n1'], 'resolved')
    expect(email.sendLogged).not.toHaveBeenCalled()
  })

  it('respects the switch in Profile', async () => {
    vi.mocked(notificationRepo.findDueEmails).mockResolvedValue([pendingFailing()])
    vi.mocked(captureRepo.lastSettledScheduled).mockResolvedValue({ id: 'x', status: 'failed', capturedAt: at })
    vi.mocked(notificationRepo.getPreferences).mockResolvedValue({ emailCaptureProblems: false })
    await svc.runEmailSweep(at)
    expect(notificationRepo.markEmailSkipped).toHaveBeenCalledWith(['n1'], 'switched_off')
  })

  it('sends at most one capture-problems email per user per WIB day', async () => {
    vi.mocked(notificationRepo.findDueEmails).mockResolvedValue([pendingFailing()])
    vi.mocked(captureRepo.lastSettledScheduled).mockResolvedValue({ id: 'x', status: 'failed', capturedAt: at })
    vi.mocked(notificationRepo.countSent).mockResolvedValue(1)
    await svc.runEmailSweep(at)
    expect(notificationRepo.markEmailSkipped).toHaveBeenCalledWith(['n1'], 'daily_cap')
    // Counted from 00:00 WIB (17:00 UTC the day before), not from UTC midnight.
    expect(vi.mocked(notificationRepo.countSent).mock.calls[0]![2]).toEqual(new Date('2026-09-27T17:00:00Z'))
  })

  it('keeps the rows pending when the provider fails, to retry next pass', async () => {
    vi.mocked(notificationRepo.findDueEmails).mockResolvedValue([pendingFailing()])
    vi.mocked(captureRepo.lastSettledScheduled).mockResolvedValue({ id: 'x', status: 'failed', capturedAt: at })
    vi.mocked(email.sendLogged).mockResolvedValue(false)
    const r = await svc.runEmailSweep(at)
    expect(r.failed).toBe(1)
    expect(notificationRepo.recordEmailAttemptFailed).toHaveBeenCalledWith(['n1'], svc.MAX_EMAIL_ATTEMPTS)
  })

  it('sends a staff-made plan change regardless of the switch', async () => {
    vi.mocked(notificationRepo.findDueEmails).mockResolvedValue([pendingFailing({ id: 'p1', type: 'plan_changed' })])
    vi.mocked(notificationRepo.getPreferences).mockResolvedValue({ emailCaptureProblems: false })
    const r = await svc.runEmailSweep(at)
    expect(r.sent).toBe(1)
    expect(email.planChangedEmail).toHaveBeenCalledWith('budi@example.com', { title: 't', body: 'b' })
  })
})

describe('onHereBudget', () => {
  const alert = {
    level: 'warning' as const,
    period: 'monthly' as const,
    used: 8000,
    limit: 10000,
    periodKey: '2026-09-01',
    alertEmail: 'ops@maceut.id',
  }

  it("puts it in every staff member's bell and emails the one alert address", async () => {
    await svc.onHereBudget(alert)
    expect(notificationRepo.insertOnce).toHaveBeenCalledTimes(2)
    expect(notificationRepo.insertOnce).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'staff1', type: 'here_budget_warning', title: 'HERE usage at 80% of the monthly cap' }),
    )
    expect(notificationRepo.claimEmail).toHaveBeenCalledWith('here-budget:warning:monthly:2026-09-01', 'ops@maceut.id', 'here-budget', 'console')
    expect(email.hereBudgetEmail).toHaveBeenCalledWith('ops@maceut.id', expect.anything())
    // The claim row records the outcome — one log row per email.
    expect(email.sendLogged).toHaveBeenCalledWith(expect.anything(), 'here-budget', 'here-budget:warning:monthly:2026-09-01')
  })

  it('does nothing the second time in the same process — it runs on every metered call', async () => {
    await svc.onHereBudget({ ...alert, periodKey: '2026-10-01' })
    await svc.onHereBudget({ ...alert, periodKey: '2026-10-01' })
    expect(notificationRepo.insertOnce).toHaveBeenCalledTimes(2) // two staff, once
  })

  it('does not email when another process already claimed the alert', async () => {
    vi.mocked(notificationRepo.claimEmail).mockResolvedValue(false)
    await svc.onHereBudget({ ...alert, periodKey: '2026-11-01' })
    expect(email.sendLogged).not.toHaveBeenCalled()
  })
})
