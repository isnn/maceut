import Link from 'next/link'
import { PublicHeader } from '@/components/shared/PublicHeader'
import { PlanCards } from '@/features/marketing/components/PlanCards'
import {
  BandMap,
  ExportPreview,
  HeroAppPreview,
  ReplayPreview,
  SchedulePreview,
  ZonePreview,
} from '@/features/marketing/components/LandingPreviews'
import { Logo } from '@/components/ui/Logo'
import { buttonClass } from '@/components/ui/Button'
import {
  IconArrowRight,
  IconCalendar,
  IconClipboardList,
  IconClock,
  IconDownload,
  IconGauge,
  IconGlobe,
  IconMap,
  IconRoute,
} from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { PLAN_LIMITS } from '@/lib/constants'

/**
 * The public landing page (FE-36), laid out after the owner's concept: hero with the
 * app, how it works, the four product areas, use cases, plans, a closing band.
 *
 * Content rule (antislop R-17/R-36/R-38): everything here describes what the product
 * does today. No customer logos, counts or testimonials: there are none to show yet,
 * and no links to pages that do not exist.
 */

const FREE = PLAN_LIMITS.free

const STEPS = [
  {
    icon: IconMap,
    title: 'Draw a zone',
    body: 'Outline the area on the map and choose which roads count: highways, main roads, or every street.',
  },
  {
    icon: IconCalendar,
    title: 'Set capture windows',
    body: 'Pick the days and hours that matter to you, then how often to collect: every 15 minutes, hourly, or daily.',
  },
  {
    icon: IconDownload,
    title: 'Replay and export',
    body: 'Scrub through every snapshot in Studio, then take the data with you as CSV, image frames, or video.',
  },
]

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

const USE_CASES = [
  {
    icon: IconGauge,
    title: 'Traffic monitoring',
    body: 'Watch the corridors you manage at the hours they matter, without staff counting cars.',
  },
  {
    icon: IconRoute,
    title: 'Planning and operations',
    body: 'Check how a road behaves before and after a closure, a new signal, or a diversion.',
  },
  {
    icon: IconClock,
    title: 'Historical analysis',
    body: 'Line up the same window across weeks to see which hours are getting worse.',
  },
  {
    icon: IconClipboardList,
    title: 'Research and engineering',
    body: 'Export consistent, timestamped samples for studies and models.',
  },
  {
    icon: IconDownload,
    title: 'Reporting',
    body: 'Put a replay or a chart from real captures in front of the people who decide.',
  },
]

/** Section heading: a small sentence-case label in the brand colour, then the title. */
function SectionHead({ label, title, children, className }: { label: string; title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-label font-semibold text-primary">{label}</p>
      <h2 className="mt-sm text-[28px] leading-[1.2] font-bold tracking-tight text-text-primary text-balance">{title}</h2>
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
        {/* Hero: the one focal point is the app itself. */}
        <section className={cn(WRAP, 'py-section grid grid-cols-1 laptop:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-xxl items-center')}>
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
                Create free account
                <IconArrowRight size={16} />
              </Link>
              <a href="#how-it-works" className={buttonClass('secondary')}>
                See how it works
              </a>
            </div>
            <p className="mt-lg text-caption text-text-secondary">
              Free plan: {FREE.zonesLimit} zone, {FREE.capturesLimit} captures a day. No card needed.
            </p>
          </div>
          <HeroAppPreview className="min-w-0" />
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-16 border-t border-border bg-canvas-secondary">
          <div className={cn(WRAP, 'py-section grid grid-cols-1 laptop:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] gap-xxl')}>
            <SectionHead label="How it works" title="From a shape on a map to data you can use.">
              Three steps, done once. After that the capture windows run on their own.
            </SectionHead>
            <ol className="grid grid-cols-1 tablet:grid-cols-3 gap-xl">
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <div className="flex items-center gap-md">
                    <span className="w-10 h-10 rounded-md bg-primary-soft text-primary flex items-center justify-center">
                      <step.icon size={20} />
                    </span>
                    <span className="text-label font-semibold text-text-secondary tabular-nums">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-md text-heading-sm text-text-primary">{step.title}</h3>
                  <p className="mt-xs text-body text-text-secondary">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Product */}
        <section id="product" className="scroll-mt-16 border-t border-border">
          <div className={cn(WRAP, 'py-section grid grid-cols-1 laptop:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] gap-xxl')}>
            <div>
              <SectionHead label="Product" title="Everything between drawing a zone and handing over the data.">
                One workspace for the whole job: define the area, collect on a schedule, look back, and export.
              </SectionHead>
              <Link href="/register" className={cn(buttonClass(), 'mt-xl')}>
                Create free account
              </Link>
            </div>
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
              {PRODUCT.map((item) => (
                <article key={item.title} className="bg-card border border-border rounded-lg p-md">
                  {item.preview}
                  <h3 className="mt-md px-xs text-heading-sm text-text-primary">{item.title}</h3>
                  <p className="mt-xs px-xs pb-xs text-body text-text-secondary">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="border-t border-border bg-canvas-secondary">
          <div className={cn(WRAP, 'py-section')}>
            <SectionHead label="Use cases" title="Built for how road agencies work.">
              The same zones and windows serve the control room, the planning desk, and the people writing the report.
            </SectionHead>
            <div className="mt-xl grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-5 gap-lg">
              {USE_CASES.map((u) => (
                <article key={u.title} className="bg-card border border-border rounded-lg p-lg">
                  <span className="w-9 h-9 rounded-md bg-primary-soft text-primary flex items-center justify-center">
                    <u.icon size={18} />
                  </span>
                  <h3 className="mt-md text-heading-sm text-text-primary">{u.title}</h3>
                  <p className="mt-xs text-body text-text-secondary">{u.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-16 border-t border-border">
          <div className={cn(WRAP, 'py-section')}>
            <SectionHead label="Pricing" title="Plans priced for public budgets.">
              Start free with one zone. Move up when you need more zones, more captures, or a finer interval. Every plan
              exports CSV, image frames and video.
            </SectionHead>
            <PlanCards className="mt-xl" />
          </div>
        </section>

        {/* Closing band */}
        <section className={cn(WRAP, 'pb-section')}>
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
                  Works anywhere HERE has live traffic data. Times are shown in Western Indonesia Time (WIB).
                </p>
              </div>
              <div className="flex flex-col items-start laptop:items-end gap-xs">
                <Link href="/register" className={buttonClass()}>
                  Create free account
                </Link>
                <span className="text-caption text-text-secondary">Free plan, no card needed.</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className={cn(WRAP, 'py-xl flex flex-wrap items-center justify-between gap-lg')}>
          <Logo />
          <nav aria-label="Footer" className="flex items-center gap-xl">
            <a href="#product" className="text-body text-text-secondary no-underline hover:text-text-primary transition-colors">
              Product
            </a>
            <a href="#pricing" className="text-body text-text-secondary no-underline hover:text-text-primary transition-colors">
              Pricing
            </a>
          </nav>
          <p className="w-full text-caption text-text-secondary">© 2026 Maceut</p>
        </div>
      </footer>
    </>
  )
}
