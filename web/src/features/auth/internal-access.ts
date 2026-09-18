/**
 * Who gets the `internal` platform role, driven by configuration rather than by
 * whoever happened to register first.
 *
 * `NEXT_PUBLIC_INTERNAL_EMAILS` is a comma-separated allowlist. Being a
 * NEXT_PUBLIC_ variable it ships inside the browser bundle, so treat it as
 * configuration and never as a secret or a security control — anyone can read
 * it, and anyone can edit their own role in localStorage. Once api/ exists this
 * is replaced by a `users.role` column plus server-side middleware.
 */
const RAW = process.env.NEXT_PUBLIC_INTERNAL_EMAILS ?? ''

const ALLOWLIST: Set<string> = new Set(
  RAW.split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
)

/** True when the address is granted internal access by configuration. */
export function isInternalByConfig(email: string): boolean {
  return ALLOWLIST.has(email.trim().toLowerCase())
}

/** The configured addresses, for display on the internal screens. */
export function configuredInternalEmails(): string[] {
  return [...ALLOWLIST]
}
