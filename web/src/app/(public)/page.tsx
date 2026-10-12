import Link from 'next/link'
import { PublicHeader } from '@/components/shared/PublicHeader'
import { PlanCards } from '@/features/marketing/components/PlanCards'
import { BandMap, ExportPreview, ReplayPreview, SchedulePreview, ZonePreview } from '@/features/marketing/components/LandingPreviews'
import { HeroStack } from '@/features/marketing/components/HeroStack'
import { UseCaseTabs, type UseCase } from '@/features/marketing/components/UseCaseTabs'
import { CaseCapture, DayCurve } from '@/features/marketing/components/CasePreviews'
import { buttonClass, linkClass } from '@/components/ui/Button'
import { IconArrowRight, IconCalendar, IconCamera, IconClock, IconFilm, IconGlobe, IconPencil } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { PlanQuestions } from '@/features/marketing/components/PlanQuestions'
import { PublicFooter } from '@/components/shared/PublicFooter'
import type { Metadata } from 'next'

/**
 * The public landing page (FE-36), laid out after the owner's concept: hero with real
 * captures, the four product areas, how it works, the problems it solves (tabs), plans, FAQ,
 * a closing band.
 *
 * One continuous ground (FE-44): each section's background fades from the colour the
 * previous one ended on, so the page reads as one surface instead of stacked bands.
 * How it works is a rounded purple panel sitting in that flow, not a full-width band.
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
    title: 'Pick your roads',
    body: 'Draw around the streets you care about. That area is your zone, and it keeps its own history.',
    preview: <ZonePreview />,
  },
  {
    title: 'Set it once',
    body: 'Choose the days and hours. Maceut checks the traffic for you, every time, with no reminders.',
    preview: <SchedulePreview />,
  },
  {
    title: 'Watch it back',
    body: 'Play any morning like a video and see the moment the jam began.',
    preview: <ReplayPreview />,
  },
  {
    title: 'Share the proof',
    body: 'Download a video, images or a spreadsheet, ready to drop into your report.',
    preview: <ExportPreview />,
  },
]

/** A real sequence, so the numbers carry information (FE-40). */
const STEPS = [
  { icon: IconPencil, title: 'Draw your zone.', body: 'Outline the corridor or district on the map and pick the road classes to collect.' },
  { icon: IconCalendar, title: 'Set the hours.', body: 'Choose the days, the times and how often. Collection starts at the next time you set.' },
  { icon: IconFilm, title: 'Replay and export.', body: 'Play the window back in Studio, or download the CSV, the frames or an MP4.' },
]

/**
 * The three problems it solves most directly (FE-42), told as one real case (FE-43):
 * our own run on Yogyakarta, every road, 23 September to 11 October 2026. Every figure
 * comes from those captures (query in SPRINT.md, FE-43); the source line says it was
 * our run, not a customer's.
 */
const CASE_SOURCE = 'Maceut team, monitoring Yogyakarta ourselves · 23 Sep to 11 Oct 2026, every road'
const USE_CASES: UseCase[] = [
  {
    tab: 'No more counting by hand',
    icon: <IconCamera size={18} />,
    story: 'No one had to stand at a junction. We drew one zone over Yogyakarta, and it captured the traffic on its own, up to every 15 minutes.',
    stats: [
      { value: '1,236', label: 'captures, nobody at a junction' },
      { value: '17 days', label: 'of traffic on record' },
    ],
    preview: <CaseCapture />,
  },
  {
    tab: 'Know when it jams',
    icon: <IconClock size={18} />,
    story: 'We expected one rush hour. Yogyakarta has a long one: on an average day, it stays heavy from 14:00 until 21:00.',
    stats: [
      { value: '7 hours', label: 'of heavy traffic on an average day' },
      { value: '16:00', label: 'the busiest hour on average' },
    ],
    preview: <DayCurve />,
  },
  {
    tab: 'Reports that convince',
    icon: <IconFilm size={18} />,
    story:
      'Some days the jams began at 09:00, others at 14:30. A table hides that. A short replay shows it.',
    stats: [
      { value: '09:00 to 14:30', label: 'when the jams began' },
      { value: '36 s', label: 'to replay a whole morning' },
    ],
    preview: <ReplayPreview />,
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
              keeps each snapshot, and lets you replay or export it.
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
          {/* A soft lilac glow behind the stack: it anchors the focal point without a frame. */}
          <div className="relative min-w-0">
            <div aria-hidden className="absolute inset-[8%] rounded-full bg-primary-soft blur-3xl" />
            <HeroStack className="relative" />
          </div>
          </div>
        </section>

        {/* Product */}
        <section id="product" className="scroll-mt-16 bg-linear-to-b from-canvas to-page">
          <div className={cn(WRAP, 'py-section grid grid-cols-1 laptop:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] gap-xxl')}>
            <div>
              <SectionHead title="See how your roads really move.">
                Pick the roads, set the hours, and Maceut does the watching. Look back any time, and share what you find.
              </SectionHead>
            </div>
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
              {PRODUCT.map((item) => (
                <article key={item.title} className="h-full flex flex-col bg-canvas rounded-xl ring-1 ring-border/70 shadow-elevation-2 p-md">
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

        {/* How it works: the one bold panel, inside the flow. */}
        <section id="how-it-works" className="scroll-mt-16 bg-page">
          <div className={cn(WRAP, 'pb-section')}>
          <div className="rounded-xl bg-primary text-on-primary px-lg py-xxl tablet:px-xxl">
            <h2 className="text-[28px] leading-[1.2] font-bold tracking-tight text-balance">
              Three steps, then it runs on its own.
            </h2>
            <ol className="mt-xl grid grid-cols-1 laptop:grid-cols-3 gap-xl">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-md">
                  <span className="w-11 h-11 shrink-0 rounded-full bg-on-primary/15 ring-1 ring-on-primary/40 flex items-center justify-center" aria-hidden>
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
          </div>
        </section>

        {/* What it solves */}
        <section className="bg-linear-to-b from-page to-canvas">
          <div className={cn(WRAP, 'py-section')}>
            <SectionHead title="Stop guessing what your roads are doing." />
            <UseCaseTabs cases={USE_CASES} source={CASE_SOURCE} className="mt-lg" />
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-16 bg-linear-to-b from-canvas to-page">
          <div className={cn(WRAP, 'py-section')}>
            <div className="flex flex-wrap items-end justify-between gap-lg">
              <SectionHead title="Plans priced for public budgets." />
              <Link href="/pricing" className={linkClass()}>
                Compare plans in detail
              </Link>
            </div>
            <PlanCards className="mt-xl" publicLinks />
          </div>
        </section>

        <section className="bg-linear-to-b from-page to-canvas">
          <div className={cn(WRAP, 'py-section')}>
            <PlanQuestions id="questions" />
          </div>
        </section>

        {/* Closing band */}
        <section className="bg-canvas">
          <div className={cn(WRAP, 'pb-section')}>
            <div className="relative overflow-hidden rounded-xl bg-linear-to-br from-primary-soft to-canvas ring-1 ring-primary-soft px-xl py-xxl">
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
