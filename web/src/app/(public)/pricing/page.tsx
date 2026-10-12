import type { Metadata } from 'next'
import Link from 'next/link'
import { PublicHeader } from '@/components/shared/PublicHeader'
import { PublicFooter } from '@/components/shared/PublicFooter'
import { PlanCards } from '@/features/marketing/components/PlanCards'
import { PlanComparison } from '@/features/marketing/components/PlanComparison'
import { PlanQuestions } from '@/features/marketing/components/PlanQuestions'
import { buttonClass } from '@/components/ui/Button'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Free for one zone. Compare zones, captures, road classes and history across Free, Standard and Premium.',
}

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
          <PlanCards className="mt-xxl" publicLinks />
        </section>

        <section className={`${WRAP} pb-section`} aria-labelledby="compare-title">
          <h2 id="compare-title" className="text-[28px] leading-[1.2] font-bold tracking-tight text-text-primary">
            Compare plans
          </h2>
          <div className="mt-xl">
            <PlanComparison />
          </div>
        </section>

        <div className={`${WRAP} pb-section`}>
          <PlanQuestions id="questions" />
        </div>

        <section className={`${WRAP} pb-section`}>
          <div className="rounded-lg border border-border bg-primary-soft px-xl py-xxl flex flex-wrap items-center justify-between gap-xl">
            <div>
              <h2 className="text-[28px] leading-[1.2] font-bold tracking-tight text-text-primary">One zone free, to start.</h2>
              <p className="mt-sm text-body text-text-secondary">No card needed.</p>
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
