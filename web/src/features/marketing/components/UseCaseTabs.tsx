'use client'

import { Tabs } from '@base-ui/react/tabs'
import { cn } from '@/lib/utils'

export interface UseCase {
  /** The outcome, used as the tab label: what is solved, not the feature. */
  tab: string
  /** An element, not a component: it crosses from the server page. */
  icon: React.ReactNode
  /** The story in one voice: what it was like, then what changed. */
  story: string
  stats: { value: string; label: string }[]
  preview: React.ReactNode
}

/**
 * The problems Maceut solves (FE-43), told as one real case: our own run on Yogyakarta.
 * Every number in `cases` comes from those captures; the attribution says whose run it
 * was, so nothing reads as a customer quote we do not have (antislop C-5).
 *
 * Pill tabs, as wide as their labels; the picked one fills in ink. Every panel stays mounted in one grid cell
 * and only the picked one is visible, so the section keeps the height of the tallest
 * case and the page does not jump when the tab changes. Base UI handles arrow keys and
 * ARIA. Its `hidden` attribute is swapped for `inert` plus `invisible`: Tailwind's base
 * rule for `[hidden]` is an !important display: none that a utility cannot override,
 * and the closed panels must keep their space.
 */
export function UseCaseTabs({ cases, source, className }: { cases: UseCase[]; source: string; className?: string }) {
  return (
    <Tabs.Root defaultValue={cases[0]!.tab} className={className}>
      <Tabs.List className="flex flex-wrap gap-sm">
        {cases.map((c) => (
          <Tabs.Tab
            key={c.tab}
            value={c.tab}
            className={cn(
              'group inline-flex items-center gap-sm h-10 px-lg rounded-full border border-border bg-canvas cursor-pointer',
              'text-label font-semibold text-text-secondary hover:border-text-muted hover:text-text-primary transition-colors',
              'data-[active]:bg-text-primary data-[active]:border-text-primary data-[active]:text-on-primary',
              'focus:outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            )}
          >
            <span className="shrink-0 flex text-text-muted group-data-[active]:text-on-primary transition-colors">{c.icon}</span>
            {c.tab}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <div className="mt-lg grid">
        {cases.map((c) => (
          <Tabs.Panel
            key={c.tab}
            value={c.tab}
            keepMounted
            render={({ hidden, ...props }) => <div {...props} inert={hidden} aria-hidden={hidden || undefined} />}
            className="col-start-1 row-start-1 grid grid-cols-1 laptop:grid-cols-2 gap-lg laptop:gap-xl items-center focus:outline-none [&[inert]]:invisible"
          >
            <figure>
              <blockquote className="text-[18px] tablet:text-[20px] leading-[1.4] font-semibold tracking-tight text-text-primary text-pretty max-w-[40ch]">
                &ldquo;{c.story}&rdquo;
              </blockquote>
              <figcaption className="mt-md text-caption text-text-secondary">{source}</figcaption>
              <dl className="mt-lg grid grid-cols-2 gap-md max-w-[28rem] border-t border-border pt-md">
                {c.stats.map((s) => (
                  <div key={s.label}>
                    <dt className="sr-only">{s.label}</dt>
                    <dd className="text-[24px] leading-none font-bold tracking-tight text-primary tabular-nums">{s.value}</dd>
                    <dd className="mt-xs text-caption text-text-secondary">{s.label}</dd>
                  </div>
                ))}
              </dl>
            </figure>
            <div className="w-full max-w-[30rem] laptop:justify-self-end">{c.preview}</div>
          </Tabs.Panel>
        ))}
      </div>
    </Tabs.Root>
  )
}
