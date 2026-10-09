import Link from 'next/link'
import { PublicHeader } from '@/components/shared/PublicHeader'
import { PlanCards } from '@/features/marketing/components/PlanCards'
import { BandMap, ExportPreview, ReplayPreview, SchedulePreview, ZonePreview } from '@/features/marketing/components/LandingPreviews'
import { HeroStack } from '@/features/marketing/components/HeroStack'
import { buttonClass, linkClass } from '@/components/ui/Button'
import { IconArrowRight, IconCalendar, IconFilm, IconGlobe, IconPencil } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { PlanQuestions } from '@/features/marketing/components/PlanQuestions'
import { PublicFooter } from '@/components/shared/PublicFooter'
import type { Metadata } from 'next'

/**
 * The public landing page (FE-36), laid out after the owner's concept: hero with real
 * captures, the four product areas, how it works, the problems it solves, plans, FAQ,
 * a closing band.
 *
 * Backgrounds alternate (FE-40) so each section reads as its own band: white, grey,
 * one purple band for How it works, then white and grey again, closing in pale purple.
 *
 * Content rule (antislop R-17/R-36/R-38): everything here describes what the product
 * does today. No customer logos, counts or testimonials: there are none to show yet,
 * and no links to pages that do not exist.
 */

export const metadata: Metadata = {
  title: { absolute: 'Maceut: scheduled traffic capture for road agencies' },
  description: `Draw a zone, set the hours, and Maceut collects traffic flow on schedule so you can replay or export it. Free for one zone.`,
}

const PRODUCT = [
  {
    title: 'Zone management',
    body: 'Draw corridors, junctions and districts on the map. Each zone keeps its own road classes and history.',
    preview: <ZonePreview />,
  },
  {
    title: 'Scheduled capture',
    body: 'Capture windows run on their own, on the days and hours you set, with the next collection always shown.',
    preview: <SchedulePreview />,
  },
  {
    title: 'Traffic replay',
    body: 'Play a morning back frame by frame and compare how the same roads looked at different times.',
    preview: <ReplayPreview />,
  },
  {
    title: 'Export data',
    body: 'Download captures as a spreadsheet, frames as a ZIP, or the whole window as an MP4 for a report.',
    preview: <ExportPreview />,
  },
]

/** A real sequence, so the numbers carry information (FE-40). */
const STEPS = [
  { icon: IconPencil, title: 'Draw your zone.', body: 'Outline the corridor or district on the map and pick the road classes to collect.' },
  { icon: IconCalendar, title: 'Set the hours.', body: 'Choose the days, the times and how often. Collection starts at the next time you set.' },
  { icon: IconFilm, title: 'Replay and export.', body: 'Play the window back in Studio, or download the CSV, the frames or an MP4.' },
]

/** Problem first, in the reader's words; then only what the product does today (FE-40). */
const USE_CASES = [
  {
    title: 'Daily monitoring',
    problem: 'Staff count traffic by hand at the same junctions every morning.',
    solution: 'A capture window collects those corridors at 07:00 every weekday, on its own.',
  },
  {
    title: 'Before and after a change',
    problem: 'Nobody can show what the road was like before the closure or the new signal.',
    solution: 'Compare the same 07:00 window from two weeks apart in Studio.',
  },
  {
    title: 'When it starts to jam',
    problem: '“It gets busy in the evening” is a guess, not a time.',
    solution: 'Replay the same hour across weeks and see when the red starts, and whether it comes earlier.',
  },
  {
    title: 'Data for a study',
    problem: 'Surveys are one-off and taken at different hours.',
    solution: 'Every capture is a timestamped CSV row, collected at the same times each day.',
  },
  {
    title: 'Reporting to decision-makers',
    problem: 'A table of numbers doesn’t convince the people who decide.',
    solution: 'Export the morning as an MP4 and play it in the meeting.',
  },
]

/** Section heading: the title, with an optional small label above it in the brand colour. */
function SectionHead({ label, title, children, className }: { label?: string; title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <p className="mb-sm text-label font-semibold text-primary">{label}</p>}
      <h2 className="text-[28px] leading-[1.2] font-bold tracking-tight text-text-primary text-balance">{title}</h2>
      {children && <p className="mt-md text-body text-text-secondary max-w-[52ch]">{children}</p>}
    </div>
  )
}

const WRAP = 'mx-auto max-w-[1600px] px-lg tablet:px-xl'

export default function LandingPage() {
  return (
    <>
      <PublicHeader />

      <main className="flex-1">
        {/* Hero: the one focal point is the app itself. Clipped sideways so a card pulled
            out of the stack never makes the page scroll. */}
        <section className="bg-canvas overflow-x-clip">
          <div className={cn(WRAP, 'py-section grid grid-cols-1 laptop:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-xxl items-center')}>
          <div>
            <h1 className="text-[36px] tablet:text-[44px] leading-[1.08] font-extrabold tracking-tight text-text-primary text-balance">
              Traffic data for the roads you choose, collected on your schedule.
            </h1>
            <p className="mt-lg text-[16px] leading-relaxed text-text-secondary max-w-[46ch]">
              Draw a zone on the map, pick the road classes, set the hours. Maceut captures traffic flow at those times,
              keeps every snapshot, and lets you replay or export it.
            </p>
            <div className="mt-xl flex flex-wrap gap-md">
              <Link href="/register" className={buttonClass()}>
                Draw your first zone, free
                <IconArrowRight size={16} />
              </Link>
              <Link href="/pricing" className={buttonClass('secondary')}>
                See pricing
              </Link>
            </div>
            <p className="mt-lg text-caption text-text-secondary">No card needed to start.</p>
          </div>
          <HeroStack />
          </div>
        </section>

        {/* Product */}
        <section id="product" className="scroll-mt-16 bg-page">
          <div className={cn(WRAP, 'py-section grid grid-cols-1 laptop:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] gap-xxl')}>
            <div>
              <SectionHead title="From a zone on the map to data in your report.">
                One workspace for the whole job: define the area, collect on a schedule, look back, and export.
              </SectionHead>
              <Link href="/register" className={cn(buttonClass(), 'mt-xl')}>
                Create free account
              </Link>
            </div>
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
              {PRODUCT.map((item) => (
                <article key={item.title} className="h-full flex flex-col bg-card border border-border rounded-lg p-md">
                  {item.preview}
                  <h3 className="mt-md px-xs text-heading-sm text-text-primary truncate">{item.title}</h3>
                  {/* Same height on every card: three lines, reserved even when the text is shorter. */}
                  <p className="mt-xs px-xs pb-xs text-body text-text-secondary line-clamp-3 min-h-[calc(3*1.5em)] leading-[1.5]">
                    {item.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works: the one bold band. */}
        <section id="how-it-works" className="scroll-mt-16 bg-primary text-on-primary">
          <div className={cn(WRAP, 'py-section')}>
            <h2 className="text-[28px] leading-[1.2] font-bold tracking-tight text-balance">
              Three steps, then it runs on its own.
            </h2>
            <ol className="mt-xl grid grid-cols-1 laptop:grid-cols-3 gap-xl">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-md">
                  <span className="w-11 h-11 shrink-0 rounded-full border-2 border-on-primary flex items-center justify-center" aria-hidden>
                    <step.icon size={20} />
                  </span>
                  <div>
                    <p className="text-caption font-semibold text-on-primary/80 tabular-nums">Step {i + 1}</p>
                    <h3 className="mt-xs text-heading-sm">{step.title}</h3>
                    <p className="mt-xs text-body text-on-primary/90 max-w-[40ch]">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Problems it solves */}
        <section className="bg-canvas">
          <div className={cn(WRAP, 'py-section')}>
            <SectionHead label="Use cases" title="Problems it solves.">
              What road agencies do today, and what changes once the capture runs on a schedule.
            </SectionHead>
            <div className="mt-xl grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-5 gap-lg">
              {USE_CASES.map((u) => (
                <article key={u.title} className="flex flex-col bg-canvas-secondary border border-border rounded-lg p-lg">
                  <h3 className="text-heading-sm text-text-primary">{u.title}</h3>
                  <p className="mt-md text-micro font-semibold uppercase tracking-wider text-text-muted">The problem</p>
                  <p className="mt-xs text-body text-text-secondary">{u.problem}</p>
                  <p className="mt-md pt-md border-t border-divider text-micro font-semibold uppercase tracking-wider text-primary">
                    With Maceut
                  </p>
                  <p className="mt-xs text-body text-text-primary">{u.solution}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-16 bg-page">
          <div className={cn(WRAP, 'py-section')}>
            <div className="flex flex-wrap items-end justify-between gap-lg">
              <SectionHead title="Plans priced for public budgets.">
                Start free with one zone. Move up when you need more zones, more captures, or a finer interval. Every
                plan exports CSV, image frames and video.
              </SectionHead>
              <Link href="/pricing" className={linkClass()}>
                Compare plans in detail
              </Link>
            </div>
            <PlanCards className="mt-xl" publicLinks />
            <p className="mt-lg text-caption text-text-secondary">
              A capture is one fetch of your zone&rsquo;s traffic, kept as a frame you can replay or export.
            </p>
          </div>
        </section>

        <section className="bg-canvas">
          <div className={cn(WRAP, 'py-section')}>
            <PlanQuestions id="questions" />
          </div>
        </section>

        {/* Closing band */}
        <section className="bg-canvas">
          <div className={cn(WRAP, 'pb-section')}>
            <div className="relative overflow-hidden rounded-lg border border-border bg-primary-soft px-xl py-xxl">
              <BandMap />
              <div className="relative grid grid-cols-1 laptop:grid-cols-[minmax(0,6fr)_minmax(0,4fr)_auto] gap-xl items-center">
                <div>
                  <h2 className="text-[28px] leading-[1.2] font-bold tracking-tight text-text-primary text-balance">
                    Start with one zone today.
                  </h2>
                  <p className="mt-sm text-body text-text-secondary max-w-[48ch]">
                    Draw it, set a window, and the first capture runs at the time you chose.
                  </p>
                </div>
                <div className="flex items-start gap-md">
                  <IconGlobe size={28} className="text-primary shrink-0" />
                  <p className="text-body text-text-secondary">
                    One zone free, for as long as you like.
                  </p>
                </div>
                <div className="flex flex-col items-start laptop:items-end gap-xs">
                  <Link href="/register" className={buttonClass()}>
                    Draw your first zone, free
                  </Link>
                  <span className="text-caption text-text-secondary">No card needed.</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </>
  )
}
