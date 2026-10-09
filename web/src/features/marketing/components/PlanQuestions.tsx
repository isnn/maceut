'use client'

import Link from 'next/link'
import { Accordion } from '@base-ui/react/accordion'
import { IconChevronDown } from '@/components/ui/icons'
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

/**
 * The FAQ as an accordion (FE-38): one question per row, answers on demand, so seven
 * answers take the space of seven lines. Base UI handles keyboard and ARIA; the first
 * question starts open so the pattern is obvious.
 */
export function PlanQuestions({ id }: { id?: string }) {
  return (
    <section id={id} aria-labelledby="faq-title" className="scroll-mt-16 grid grid-cols-1 laptop:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] gap-xxl">
      <div>
        <h2 id="faq-title" className="text-[28px] leading-[1.2] font-bold tracking-tight text-text-primary text-balance">
          Common questions
        </h2>
      </div>
      <Accordion.Root defaultValue={[QUESTIONS[0]!.q]} className="border-t border-border">
        {QUESTIONS.map(({ q, a }) => (
          <Accordion.Item key={q} value={q} className="border-b border-border">
            <Accordion.Header>
              <Accordion.Trigger className="group w-full min-h-[56px] py-md flex items-center justify-between gap-lg text-left text-heading-sm text-text-primary cursor-pointer hover:text-primary transition-colors focus:outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded-xs">
                {q}
                <IconChevronDown
                  size={18}
                  className="shrink-0 text-text-secondary transition-transform group-data-[panel-open]:rotate-180 motion-reduce:transition-none"
                />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel className="pb-lg pr-xxl text-body text-text-secondary">{a}</Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </section>
  )
}
