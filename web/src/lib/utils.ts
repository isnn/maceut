export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

// crypto.randomUUID() only works in secure contexts (HTTPS or localhost) — this
// app is served over plain HTTP via a public IP during dev, so it's undefined
// there. crypto.getRandomValues() has no such restriction, so build a UUID v4
// from it instead (falls back to Math.random() if crypto is unavailable at all).
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()

  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function formatTimestampWIB(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const formatted = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(d)
  return `${formatted} WIB`
}

/** Short date for table rows, e.g. "22 Jul". */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }).format(d)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Numbers for display, in one convention across the whole app.
 *
 * The dashboard was showing `11652 roads` in one panel, `11.623 roads` in the next and
 * `501.69 km` beside them — so a dot meant "thousands" and "decimal point" on the same
 * screen, and `9.645 roads` read as nine-point-six. The interface is in English, and km
 * already uses a decimal point, so the thousands separator follows that: 9,645.
 *
 * One helper rather than a locale string at each call site, because four call sites is
 * four chances to pick a different one — which is how this happened.
 */
export function formatNumber(value: number, fractionDigits = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

/** Distances, always to two decimals so a column of them lines up. */
export function formatKm(value: number): string {
  return `${formatNumber(value, 2)} km`
}
