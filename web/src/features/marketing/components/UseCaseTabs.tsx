'use client'

import { Tabs } from '@base-ui/react/tabs'
import { cn } from '@/lib/utils'

export interface UseCase {
  /** The outcome, used as the tab label: what is solved, not the feature. */
  tab: string
  problem: string
  solution: string
  preview: React.ReactNode
}

/**
 * The problems Maceut solves (FE-42), one at a time: tabs named by the outcome, each
 * panel the problem, what changes, and the part of the product that does it. Base UI
 * handles arrow keys and ARIA; the previews come from the server page as props.
 */
export function UseCaseTabs({ cases, className }: { cases: UseCase[]; className?: string }) {
  return (
    <Tabs.Root defaultValue={cases[0]!.tab} className={className}>
      <Tabs.List className="grid grid-cols-3 gap-md tablet:flex tablet:gap-xl border-b border-border">
        {cases.map((c) => (
          <Tabs.Tab
            key={c.tab}
            value={c.tab}
            className={cn(
              '-mb-px pb-md pt-xs border-b-2 border-transparent text-left text-label tablet:text-heading-sm cursor-pointer',
              'text-text-secondary hover:text-text-primary transition-colors',
              'data-[active]:border-primary data-[active]:text-text-primary',
              'focus:outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded-xs',
            )}
          >
            {c.tab}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {cases.map((c) => (
        <Tabs.Panel
          key={c.tab}
          value={c.tab}
          className="mt-xl grid grid-cols-1 laptop:grid-cols-2 gap-xl laptop:gap-xxl items-center focus:outline-none"
        >
          <div>
            <p className="text-label font-semibold text-text-muted">Before</p>
            <p className="mt-xs text-body text-text-secondary max-w-[44ch]">{c.problem}</p>
            <p className="mt-xl text-label font-semibold text-primary">With Maceut</p>
            <p className="mt-xs text-[22px] leading-[1.3] font-bold tracking-tight text-text-primary text-balance max-w-[30ch]">
              {c.solution}
            </p>
          </div>
          <div className="w-full max-w-[36rem] laptop:justify-self-end">{c.preview}</div>
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  )
}
