import type { Plan } from './plan'
import type { MemberRole } from './workspace'

declare global {
  namespace Express {
    interface Request {
      /** Set by auth.middleware from the Better Auth session. */
      userId?: string
      /** The workspace this request acts in. Set by workspace.middleware. */
      workspaceId?: string
      workspaceName?: string
      /** The caller's role in that workspace — not their platform role. */
      memberRole?: MemberRole
      /** The workspace's plan, not the user's. Set by workspace.middleware. */
      plan?: Plan
    }
  }
}

export {}
