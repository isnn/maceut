import type { Metadata } from 'next'
import { PublicHeader } from '@/components/shared/PublicHeader'
import { PublicFooter } from '@/components/shared/PublicFooter'
import { Alert } from '@/components/ui/Alert'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms for using Maceut, including where its traffic and map data come from.',
}

/**
 * Terms of Service (FE-37). A plain-language DRAFT written to name the data sources the
 * landing page deliberately does not (HERE traffic data, OpenStreetMap map data). It is
 * marked as a draft on the page and must be reviewed by a lawyer before launch.
 * [CONTACT EMAIL] is an honest placeholder until the owner supplies an address.
 */
const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: '1. The service',
    body: 'Maceut lets you draw zones on a map, schedule when traffic in those zones is collected, keep each collection as a snapshot, and replay or export it.',
  },
  {
    title: '2. Your account',
    body: 'You need a verified email address to use Maceut. Keep your password to yourself; you are responsible for what happens under your account. Staff accounts are managed by Maceut.',
  },
  {
    title: '3. Plans and payment',
    body: 'Every account starts on the Free plan. Paid plans (Standard and Premium) are priced per month in Indonesian rupiah, as shown on the Pricing page. Online payment is not open yet; until it is, accounts stay on Free. If you move to a smaller plan, zones and capture windows beyond its limits are paused, not deleted.',
  },
  {
    title: '4. Where the traffic data comes from',
    body: 'Traffic flow data is provided by HERE Technologies under licence. Maceut collects it at the times you schedule and shows it as it was received. Traffic data can be delayed, incomplete or inaccurate, and Maceut does not guarantee it. Do not rely on it alone for decisions where safety is at stake.',
  },
  {
    title: '5. Map data',
    body: 'Base maps use data from © OpenStreetMap contributors, available under the Open Database License.',
  },
  {
    title: '6. Your data and exports',
    body: 'The zones, schedules and captures you create are yours. You can export them as CSV, image frames or video at any time while your account is active. Exports are kept for a limited time and then removed; download what you need.',
  },
  {
    title: '7. Acceptable use',
    body: 'Do not use Maceut to break the law, to resell the underlying traffic data as your own data product, to overload the service, or to access another account.',
  },
  {
    title: '8. Changes and contact',
    body: 'We may update these terms; we will show the date of the latest version on this page. Questions: [CONTACT EMAIL].',
  },
]

export default function TermsPage() {
  return (
    <>
      <PublicHeader />
      <main className="flex-1">
        <article className="mx-auto max-w-[46rem] px-lg tablet:px-xl py-section">
          <h1 className="text-[36px] leading-[1.1] font-extrabold tracking-tight text-text-primary">Terms of Service</h1>
          <Alert variant="warning" className="mt-lg">
            Draft for review. These terms have not been checked by a lawyer yet and are not final.
          </Alert>
          <div className="mt-xl space-y-xl">
            {SECTIONS.map((s) => (
              <section key={s.title}>
                <h2 className="text-section-title text-text-primary">{s.title}</h2>
                <p className="mt-sm text-body text-text-secondary leading-relaxed">{s.body}</p>
              </section>
            ))}
          </div>
        </article>
      </main>
      <PublicFooter />
    </>
  )
}
