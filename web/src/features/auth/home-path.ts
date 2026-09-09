import type { User } from './types'

/**
 * Where a signed-in account belongs. Internal staff and customers have
 * disjoint apps, so this is the one place that decides — six call sites used
 * to hardcode '/dashboard' independently, which is how they drifted apart.
 */
export function homePathFor(user: User): string {
  if (user.role === 'internal') return '/internal'
  if (!user.onboardingDone) return '/onboarding'
  return '/dashboard'
}
