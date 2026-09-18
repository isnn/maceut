import { cn } from '@/lib/utils'
import { IconCheck } from '@/components/ui/icons'

const STEPS = ['Your details', 'Choose your plan']

/**
 * The two-step create-account indicator, shared by /register (step 1) and
 * /onboarding (step 2) so the pair reads as one flow.
 */
export function SignupSteps({ current }: { current: 0 | 1 }) {
  return (
    <ol className="flex flex-wrap items-center gap-md">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className="flex items-center gap-sm">
            <span
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-label font-semibold',
                done && 'bg-success-bg text-success-text',
                active && 'bg-primary text-on-primary',
                !done && !active && 'bg-canvas-secondary text-text-muted'
              )}
            >
              {done ? <IconCheck /> : i + 1}
            </span>
            <span className={cn('text-body', active ? 'text-text-primary font-semibold' : 'text-text-secondary')}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span aria-hidden className="w-10 h-px bg-border ml-sm" />}
          </li>
        )
      })}
    </ol>
  )
}
