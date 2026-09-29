/**
 * What a user reads when a capture or an export didn't work.
 *
 * The raw error stays in the database for whoever is debugging — "page.evaluate: Target
 * crashed", an HTTP status from HERE, an internal Indonesian note. None of those tell a
 * customer what happened or what to do, so the API sends this instead: what happened,
 * in their terms, and whether they need to act.
 */

export function exportErrorForUser(raw: string | null): string | null {
  if (!raw) return null
  if (/target crashed|crash|out of memory|oom/i.test(raw)) {
    return 'The render ran out of memory partway through. Try again — a smaller size or fewer frames makes it lighter.'
  }
  if (/timeout|timed out/i.test(raw)) return 'Rendering took too long and was stopped. Please try again.'
  if (/berhenti di tengah|stopped unexpectedly/i.test(raw)) return 'Rendering stopped unexpectedly. Please try again.'
  if (/antrian|queue/i.test(raw)) return 'The export queue was busy. Please try again in a moment.'
  if (/dibatalkan|cancel/i.test(raw)) return 'Cancelled.'
  if (/tanpa menghasilkan|no file/i.test(raw)) return 'The render finished without a file. Please try again.'
  if (/zona sudah dihapus/i.test(raw)) return 'The zone was deleted.'
  return 'Something went wrong while rendering. Please try again.'
}

export function captureErrorForUser(status: string, raw: string | null): string | null {
  if (!raw) return null
  if (status === 'skipped_limit') {
    const limit = /(\d+)/.exec(raw)?.[1]
    return limit ? `Skipped — the daily limit of ${limit} captures was reached.` : 'Skipped — the daily capture limit was reached.'
  }
  if (status === 'missed') {
    // Recorded as "N jadwal terlewat — sistem tidak aktif selama X menit." (or without N).
    const firings = /^(\d+) jadwal/i.exec(raw)?.[1]
    const minutes = /selama (\d+) menit/i.exec(raw)?.[1]
    const outage = minutes ? ` for ${minutes} min` : ''
    return firings
      ? `${firings} scheduled captures were missed while Maceut was unavailable${outage}.`
      : `This scheduled capture was missed while Maceut was unavailable${outage}.`
  }
  if (/lalu lintas|traffic|here|503|502|504|429/i.test(raw)) {
    return 'Traffic data wasn’t available at this moment. The next scheduled time tries again.'
  }
  if (/zona sudah dihapus/i.test(raw)) return 'The zone was deleted before this capture ran.'
  if (/antre|queue/i.test(raw)) return 'The capture couldn’t be queued. The next scheduled time tries again.'
  return 'This capture couldn’t be collected. The next scheduled time tries again.'
}
