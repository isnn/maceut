/**
 * The monthly capture pool's calendar (delivery doc F5, BR-006).
 *
 * The month is Jakarta's: it starts on the 1st at 00:00 WIB. WIB is UTC+7 all year (no
 * daylight saving), so the bounds are plain instants and the count can be a range scan
 * on `captures (user_id, captured_at)` rather than a per-row time-zone conversion.
 */

function wibYearMonth(at: Date): { year: number; month: number } {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit' })
    .format(at)
    .split('-')
    .map(Number)
  return { year: year!, month: month! }
}

function wibMonthStartInstant(year: number, month: number): Date {
  // Month 13 rolls over to January of the next year.
  const y = year + Math.floor((month - 1) / 12)
  const m = ((month - 1) % 12) + 1
  return new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00+07:00`)
}

export interface WibMonth {
  /** "YYYY-MM", for dedupe keys. */
  key: string
  /** 00:00 WIB on the 1st, inclusive. */
  start: Date
  /** 00:00 WIB on the 1st of the next month, exclusive. Also the pool's reset time. */
  end: Date
}

export function wibMonth(at: Date): WibMonth {
  const { year, month } = wibYearMonth(at)
  return {
    key: `${year}-${String(month).padStart(2, '0')}`,
    start: wibMonthStartInstant(year, month),
    end: wibMonthStartInstant(year, month + 1),
  }
}
