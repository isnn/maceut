import Link from 'next/link'
import { PublicHeader } from '@/components/shared/PublicHeader'
import { TrafficSchematic } from '@/components/shared/TrafficSchematic'
import { PlanCards } from '@/features/marketing/components/PlanCards'
import { buttonClass } from '@/components/ui/Button'

const SERVICES = [
  {
    title: 'Zone collection',
    body: 'Draw a boundary on the map, then pick the road classes you want collected.',
  },
  {
    title: 'Capture windows',
    body: 'Recurring schedules per zone — peak hours, weekdays, or one-offs.',
  },
  {
    title: 'Studio replay',
    body: 'Animate saved frames and compare any two moments side by side.',
  },
  {
    title: 'Export & API',
    body: 'CSV per window, or pull frames straight into your own systems.',
  },
]

export default function LandingPage() {
  return (
    <>
      <PublicHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-[1180px] px-xl py-section grid grid-cols-1 laptop:grid-cols-2 gap-xxl items-center">
          <div>
            <span className="inline-block bg-primary-soft text-[#5A35F3] text-micro font-semibold uppercase tracking-wide rounded-xs px-sm py-xs">
              For Indonesian road agencies
            </span>
            <h1 className="mt-lg text-[40px] leading-[1.1] font-extrabold tracking-tight text-text-primary text-balance">
              Turn any road network into traffic data you can schedule.
            </h1>
            <p className="mt-lg text-body text-text-secondary max-w-[46ch]">
              Draw a zone, pick the road classes you care about, and set the windows you want captured. Maceut
              collects, stores and replays every frame.
            </p>
            <div className="mt-xl flex flex-wrap gap-md">
              <Link
                href="/register"
                className={buttonClass()}
              >
                Create a free account
              </Link>
              <a
                href="#support"
                className={buttonClass('secondary')}
              >
                Book a walkthrough
              </a>
            </div>
            <p className="mt-lg flex flex-wrap gap-lg text-caption text-text-muted">
              <span>Free tier — 1 zone, 10 captures / day</span>
              <span>No card required</span>
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-lg shadow-elevation-2">
            <div className="flex items-center gap-sm mb-md">
              <span className="bg-primary-soft text-[#5A35F3] text-micro font-semibold rounded-xs px-sm py-xs">PLACEHOLDER</span>
              <span className="text-caption text-text-secondary">Product screenshot goes here in build</span>
            </div>
            <div className="rounded-md overflow-hidden border border-divider">
              <TrafficSchematic showBoundary />
            </div>
            <div className="mt-md flex items-end justify-between">
              <div>
                <p className="text-label text-text-secondary">Sudirman corridor</p>
                <p className="text-page-title font-bold text-text-primary">18.4 km/h</p>
              </div>
              <span className="bg-danger-bg text-danger-text text-micro font-semibold rounded-xs px-sm py-xs">
                Congested · 07:30 window
              </span>
            </div>
          </div>
        </section>

        {/* Services */}
        <section id="product" className="border-t border-border bg-canvas-secondary">
          <div className="mx-auto max-w-[1180px] px-xl py-section">
            <p className="text-label text-text-secondary">What Maceut does</p>
            <h2 className="mt-xs text-page-title font-bold text-text-primary">Four services, one workspace.</h2>
            <div className="mt-xl grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-lg">
              {SERVICES.map((service, i) => (
                <div key={service.title} className="bg-card border border-border rounded-lg p-xl">
                  <span className="text-micro font-semibold text-text-muted tabular-nums">0{i + 1}</span>
                  <h3 className="mt-sm text-heading-sm text-text-primary">{service.title}</h3>
                  <p className="mt-sm text-body text-text-secondary">{service.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Plans */}
        <section id="pricing" className="border-t border-border">
          <div className="mx-auto max-w-[1180px] px-xl py-section">
            <div className="flex flex-wrap items-end justify-between gap-md mb-xl">
              <div>
                <p className="text-label text-text-secondary">Plans</p>
                <h2 className="mt-xs text-page-title font-bold text-text-primary">
                  Upgrade any time — zones and windows scale with the tier.
                </h2>
              </div>
              <Link href="/register" className="text-info text-body no-underline hover:underline">
                Compare all features
              </Link>
            </div>
            <PlanCards />
          </div>
        </section>

        {/* Closing */}
        <section id="support" className="border-t border-border bg-primary">
          <div className="mx-auto max-w-[1180px] px-xl py-section flex flex-wrap items-center justify-between gap-xl">
            <div>
              <h2 className="text-page-title font-bold text-on-primary">Start with one zone today.</h2>
              <p className="mt-sm text-body text-on-primary/80">
                The Free plan needs no card. Upgrade when you need more zones or more captures.
              </p>
            </div>
            <Link
              href="/register"
              className={buttonClass('secondary')}
            >
              Create a free account
            </Link>
          </div>
        </section>
      </main>

      <footer id="docs" className="border-t border-border">
        <div className="mx-auto max-w-[1180px] px-xl py-xl flex flex-wrap items-center justify-between gap-md">
          <p className="text-caption text-text-muted">© 2026 Maceut — map-based congestion monitoring.</p>
          <p className="text-caption text-text-muted">Used by provincial and city road agencies across Java and Sumatra.</p>
        </div>
      </footer>
    </>
  )
}
