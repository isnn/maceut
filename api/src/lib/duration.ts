/** "7d" / "12h" / "30m" / "3600" -> seconds. Falls back to 7 days on anything unparseable. */
export function expiryToSeconds(expiry: string): number {
  const match = /^(\d+)([smhd])?$/.exec(expiry.trim())
  if (!match) return 7 * 24 * 60 * 60

  const value = Number(match[1])
  const unit = match[2] ?? 's'
  const multiplier = { s: 1, m: 60, h: 3_600, d: 86_400 }[unit] ?? 1
  return value * multiplier
}
