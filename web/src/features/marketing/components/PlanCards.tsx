'use client'

import { cn } from '@/lib/utils'
import { PLAN_HIGHLIGHTS, PLAN_LABEL, PLAN_ORDER, PLAN_PRICE } from '@/lib/constants'
import type { Plan } from '@/features/auth/types'

interface PlanCardsProps {
  /** Highlights the plan the user is on / has picked. */
  selected?: Plan
  onSelect?: (plan: Plan) => void
  /** Label template for the card action; omit to render read-only cards. */
  actionLabel?: (plan: Plan) => string
  pendingPlan?: Plan | null
  className?: string
}

export function PlanCards({ selected, onSelect, actionLabel, pendingPlan, className }: PlanCardsProps) {
  return (
    <div className={cn('grid grid-cols-1 tablet:grid-cols-3 gap-lg items-start', className)}>
      {PLAN_ORDER.map((plan) => {
        const isSelected = selected === plan
        const recommended = plan === 'standard'
        return (
          <div
            key={plan}
            className={cn(
              'relative bg-card border rounded-lg p-xl flex flex-col gap-lg h-full transition-colors',
              isSelected ? 'border-primary ring-2 ring-primary-soft' : 'border-border'
            )}
          >
            {recommended && (
              <span className="absolute -top-2.5 left-xl bg-primary text-on-primary text-micro font-semibold rounded-xs px-sm py-[3px] uppercase tracking-wide">
                Paling populer
              </span>
            )}
            <div>
              <p className="text-heading-sm text-text-primary">{PLAN_LABEL[plan]}</p>
              <p className="mt-sm flex items-baseline gap-xs">
                <span className="text-page-title font-bold text-text-primary">{PLAN_PRICE[plan].amount}</span>
                <span className="text-caption text-text-muted">{PLAN_PRICE[plan].period}</span>
              </p>
            </div>
            <ul className="space-y-sm flex-1">
              {PLAN_HIGHLIGHTS[plan].map((line) => (
                <li key={line} className="flex items-start gap-sm text-body text-text-secondary">
                  <span aria-hidden className="text-success-icon mt-[2px]">✓</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {actionLabel && onSelect && (
              <button
                type="button"
                onClick={() => onSelect(plan)}
                disabled={pendingPlan != null}
                className={cn(
                  'h-11 px-lg rounded-md text-body font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                  recommended || isSelected
                    ? 'bg-primary hover:bg-primary-hover text-on-primary'
                    : 'bg-canvas border border-border text-text-primary hover:bg-canvas-secondary'
                )}
              >
                {pendingPlan === plan ? 'Menyimpan...' : actionLabel(plan)}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
