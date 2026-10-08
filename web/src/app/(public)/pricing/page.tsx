import type { Metadata } from 'next'
import Link from 'next/link'
import { PublicHeader } from '@/components/shared/PublicHeader'
import { PublicFooter } from '@/components/shared/PublicFooter'
import { PlanCards } from '@/features/marketing/components/PlanCards'
import { PlanComparison } from '@/features/marketing/components/PlanComparison'
import { PlanQuestions } from '@/features/marketing/components/PlanQuestions'
import { buttonClass } from '@/components/ui/Button'
import { PLAN_PRICE } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Pricing',
  description: `Free for one zone. Standard from ${PLAN_PRICE.standard.amount} a month, Premium from ${PLAN_PRICE.premium.amount} a month. Compare zones, captures, road classes and history.`,
}

/** What the words in the table mean, in plain English (FE-37). */
const TERMS = [
  ['Capture', 'One fetch of your zone’s live traffic at a scheduled time, kept as a frame you can replay or export.'],
  ['Captures a day', 'How many captures your windows can run per day across all zones. Anything past it is skipped, not charged.'],
  ['Capture window', 'The days and hours a zone is collected, and how often within them.'],
  ['Fastest interval', 'How close together captures can be inside a window.'],
  ['Road classes', 'Which roads count: highways, highways plus main roads, or every road down to local streets.'],
  ['History in CSV', 'How far back the spreadsheet export of your captures reaches.'],
  ['Frames per export', 'The most frames one ZIP or video export may contain.'],
] as const

const WRAP = 'mx-auto max-w-[1600px] px-lg tablet:px-xl'

export default function PricingPage() {
  return (
    <>
      <PublicHeader />
      <main className="flex-1">
        <section className={`${WRAP} pt-section pb-xxl`}>
          <h1 className="text-[36px] tablet:text-[44px] leading-[1.08] font-extrabold tracking-tight text-text-primary text-balance max-w-[20ch]">
            Pay for the roads and hours you need.
          </h1>
          <p className="mt-lg text-[16px] leading-relaxed text-text-secondary max-w-[56ch]">
            Start free with one zone. Move up when you need more zones, more captures, or a finer interval. Prices are
            per month, in rupiah.
          </p>
          <PlanCards className="mt-xxl" publicLinks />
          <p className="mt-lg text-caption text-text-secondary">
            Paid plans: you sign up on Free, and your plan is ready to switch on as soon as payment opens.
          </p>
        </section>

        <section className={`${WRAP} pb-section`} aria-labelledby="compare-title">
          <h2 id="compare-title" className="text-[28px] leading-[1.2] font-bold tracking-tight text-text-primary">
            Compare plans
          </h2>
          <div className="mt-xl">
            <PlanComparison />
          </div>
          <h3 className="mt-xxl text-heading-sm text-text-primary">What these mean</h3>
          <dl className="mt-md grid grid-cols-1 tablet:grid-cols-2 gap-x-xxl gap-y-md">
            {TERMS.map(([term, meaning]) => (
              <div key={term}>
                <dt className="text-label font-semibold text-text-primary">{term}</dt>
                <dd className="mt-xs text-body text-text-secondary">{meaning}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className={`${WRAP} pb-section`}>
          <PlanQuestions id="questions" />
        </div>

        <section className={`${WRAP} pb-section`}>
          <div className="rounded-lg border border-border bg-primary-soft px-xl py-xxl flex flex-wrap items-center justify-between gap-xl">
            <div>
              <h2 className="text-[28px] leading-[1.2] font-bold tracking-tight text-text-primary">One zone free, to start.</h2>
              <p className="mt-sm text-body text-text-secondary">
                Paid plans from {PLAN_PRICE.standard.amount} a month. No card needed for Free.
              </p>
            </div>
            <Link href="/register" className={buttonClass()}>
              Draw your first zone, free
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  )
}
