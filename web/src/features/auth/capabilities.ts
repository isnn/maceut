import type { MemberRole } from './types'

/**
 * What a workspace role may do, mirroring `ROLE_CAPABILITIES` in
 * `api/src/types/workspace.ts`. The server enforces these; this copy only decides
 * what to render, so a Viewer is not shown buttons that would 403.
 *
 * Hiding is not security — the API is. This exists so the UI does not promise
 * something it cannot deliver.
 */
export const CAN = {
  read: { viewer: true, editor: true, owner: true },
  render: { viewer: false, editor: true, owner: true },
  write: { viewer: false, editor: true, owner: true },
  manage: { viewer: false, editor: false, owner: true },
} as const

export type Capability = keyof typeof CAN

export function can(role: MemberRole | undefined, capability: Capability): boolean {
  // Absent role means we have not loaded /me yet. Deny until we know — showing a
  // button that then disappears is worse than showing it a moment late.
  if (!role) return false
  return CAN[capability][role]
}
