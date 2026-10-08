import Link from 'next/link'
import { linkClass } from '@/components/ui/Button'

/**
 * Real questions with real answers (FE-37, antislop R-28): what a visitor needs before
 * signing up, answered from how the product actually behaves. The data source is named
 * on the Terms page, not here, by the owner's choice.
 */
const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What is a capture?',
    a: 'One fetch of your zone’s live traffic at a scheduled time. Each capture is kept as a frame you can replay in Studio or export.',
  },
  {
    q: 'Which roads can I collect?',
    a: 'Highways on Free, highways and main roads on Standard, and every road down to local streets on Premium. You choose per zone.',
  },
  {
    q: 'Can I take my data out?',
    a: 'Yes, on every plan: captures as a CSV spreadsheet, frames as a ZIP of images, or a whole window as an MP4 or WebM video.',
  },
  {
    q: 'What happens if I go over my plan?',
    a: 'Captures beyond the daily limit are skipped, not charged. If you move to a smaller plan, the zones and windows that no longer fit are paused and nothing is deleted.',
  },
  {
    q: 'Do I need a card to start?',
    a: 'No. The Free plan needs only an email address.',
  },
  {
    q: 'Which time zone are captures in?',
    a: 'Capture windows and timestamps use Western Indonesia Time (WIB).',
  },
  {
    q: 'Where does the traffic data come from?',
    a: (
      <>
        From a licensed commercial traffic data provider. The details are in our{' '}
        <Link href="/terms" className={linkClass()}>
          Terms of Service
        </Link>
        .
      </>
    ),
  },
]

export function PlanQuestions({ id }: { id?: string }) {
  return (
    <section id={id} aria-labelledby="questions-title" className="scroll-mt-16">
      <p className="text-label font-semibold text-primary">Questions</p>
      <h2 id="questions-title" className="mt-sm text-[28px] leading-[1.2] font-bold tracking-tight text-text-primary">
        Before you sign up
      </h2>
      <dl className="mt-xl grid grid-cols-1 laptop:grid-cols-2 gap-x-xxl border-t border-border">
        {QUESTIONS.map(({ q, a }) => (
          <div key={q} className="py-lg border-b border-border">
            <dt className="text-heading-sm text-text-primary">{q}</dt>
            <dd className="mt-xs text-body text-text-secondary">{a}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
