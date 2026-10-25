import { StatusPill } from '@/components/ui/Badge'

/** Verified = the sign-up code was entered; until then the account can't sign in with its password. */
export function VerifiedPill({ verified, className }: { verified: boolean; className?: string }) {
  return verified ? (
    <StatusPill tone="success" className={className}>
      Verified
    </StatusPill>
  ) : (
    <StatusPill tone="warning" className={className} title="Hasn't entered the sign-up code yet, so can't log in">
      Unverified
    </StatusPill>
  )
}
