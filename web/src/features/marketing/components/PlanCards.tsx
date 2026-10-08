'use client'

import { cn } from '@/lib/utils'
import { IconCheck } from '@/components/ui/icons'
import Link from 'next/link'
import { publicPlanLink } from '../plan-links'
import { Button, buttonClass } from '@/components/ui/Button'
import { PLAN_HIGHLIGHTS, PLAN_LABEL, PLAN_ORDER, PLAN_PRICE } from '@/lib/constants'
import type { Plan } from '@/features/auth/types'

interface PlanCardsProps {
  /** Highlights the plan the user is on / has picked. */
  selected?: Plan
  onSelect?: (plan: Plan) => void
  /** Label template for the card action; omit to render read-only cards. */
  actionLabel?: (plan: Plan) => string
  pendingPlan?: Plan | null
  /**
   * Plans this viewer cannot move to themselves — upgrades, while billing does not
   * exist. The card still renders in full: hiding a plan would remove the very thing
   * someone is deciding whether to ask for.
   */
  disabledPlan?: (plan: Plan) => boolean
  /**
   * Public pages (FE-37): each card links to sign-up (paid plans carry `?plan=`). A flag,
   * not a function, so server pages can pass it to this client component.
   */
  publicLinks?: boolean
  className?: string
}

export function PlanCards({ selected, onSelect, actionLabel, pendingPlan, disabledPlan, publicLinks, className }: PlanCardsProps) {
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
              isSelected ? 'border-primary bg-primary-soft/25' : 'border-border'
            )}
          >
            {recommended && (
              // A reason, not a popularity claim (FE-36): nothing measures popularity, but
              // Standard's 5 zones and main roads are sized for one city.
              <span className="absolute -top-2.5 left-xl bg-primary text-on-primary text-micro font-semibold rounded-xs px-sm py-[3px]">
                Best for one city
              </span>
            )}
            <div>
              <p className="text-heading-sm text-text-primary">{PLAN_LABEL[plan]}</p>
              <p className="mt-sm flex items-baseline gap-xs">
                <span className="text-page-title font-bold text-text-primary">{PLAN_PRICE[plan].amount}</span>
                <span className="text-caption text-text-secondary">{PLAN_PRICE[plan].period}</span>
              </p>
            </div>
            <ul className="space-y-sm flex-1">
              {PLAN_HIGHLIGHTS[plan].map((line) => (
                <li key={line} className="flex items-start gap-sm text-body text-text-secondary">
                  <IconCheck className="text-success-icon mt-[3px]" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {publicLinks && (
              <Link href={publicPlanLink(plan).href} className={buttonClass(recommended ? 'primary' : 'secondary')}>
                {publicPlanLink(plan).label}
              </Link>
            )}
            {actionLabel && onSelect && (
              <Button
                variant={recommended || isSelected ? 'primary' : 'secondary'}
                onClick={() => onSelect(plan)}
                disabled={pendingPlan != null || isSelected || disabledPlan?.(plan) === true}
              >
                {pendingPlan === plan ? 'Saving…' : actionLabel(plan)}
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
