'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { ReplayVideo } from './ReplayVideo'

/**
 * Hero (FE-40, FE-41): three real captures of Yogyakarta and the Studio replay, stacked
 * like prints on a desk. The dark capture starts on top; the video starts at the bottom,
 * its corner showing at the bottom-right.
 *
 * Hovering, focusing or tapping a card restacks it the way a print is pulled from a pile:
 * it first slides out from under the others (still at its old height in the pile), then
 * goes on top and settles back, straightened. It stays there until another card is picked.
 *
 * Under reduced motion the order changes at once, with no slide.
 */

type CardId = 'violet' | 'blush' | 'dark' | 'video'

interface Card {
  id: CardId
  label: string
  /** Position and resting tilt inside the stack. */
  place: string
  rest: string
  /** Where it slides to when pulled out: away from the pile, on its own side. */
  out: string
}

const CARDS: Card[] = [
  {
    id: 'violet',
    label: 'Yogyakarta at 08:15 WIB, violet style: mostly free-flowing roads.',
    place: 'left-0 top-[6%] w-[50%]',
    rest: '-rotate-6',
    out: '-translate-x-[45%] -rotate-12',
  },
  {
    id: 'blush',
    label: 'Yogyakarta at 17:15 WIB, light style: congestion on the ring road.',
    place: 'right-[6%] top-[4%] w-[50%]',
    rest: 'rotate-6',
    out: 'translate-x-[45%] rotate-12',
  },
  {
    id: 'dark',
    label: 'Yogyakarta at 17:15 WIB, dark style: red and orange on the main corridors.',
    place: 'left-[22%] top-0 w-[54%]',
    rest: '-rotate-1',
    out: '-translate-y-[45%] -rotate-3',
  },
  {
    id: 'video',
    label: 'Studio replay of Yogyakarta, traffic colours changing through the morning.',
    place: 'right-0 bottom-0 w-[50%]',
    rest: 'rotate-3',
    out: 'translate-x-[30%] translate-y-[30%] rotate-6',
  },
]

/** How long a card spends sliding out before it goes on top. */
const PULL_MS = 220

const SRC: Record<Exclude<CardId, 'video'>, string> = {
  violet: '/landing/capture-yogyakarta-0815-violet.webp',
  blush: '/landing/capture-yogyakarta-1715-blush.webp',
  dark: '/landing/capture-yogyakarta-1715-dark.webp',
}

export function HeroStack({ className }: { className?: string }) {
  // Order of the pile, bottom first. The picked card moves to the end (the top).
  const [order, setOrder] = useState<CardId[]>(['video', 'violet', 'blush', 'dark'])
  // The card being pulled out, while the restack runs. Other hovers wait until it ends,
  // so the pile does not flicker as the cursor crosses cards.
  const [pulling, setPulling] = useState<CardId | null>(null)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const front = order[order.length - 1]
  const toTop = (id: CardId) => setOrder((o) => [...o.filter((x) => x !== id), id])

  const bringToFront = (id: CardId) => {
    if (pulling || id === front) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return toTop(id)
    setPulling(id)
    timers.current.push(
      window.setTimeout(() => {
        toTop(id)
        setPulling(null)
      }, PULL_MS),
    )
  }

  return (
    <div className={cn('min-w-0', className)}>
      <div className="relative mx-auto aspect-[5/4] w-full max-w-[40rem]">
        {CARDS.map((card) => {
          const isFront = card.id === front
          const shared = cn(
            'absolute block p-0 rounded-md overflow-hidden border border-border bg-canvas text-left',
            'transition-[rotate,translate,box-shadow] duration-[250ms] ease-out motion-reduce:transition-none',
            'focus:outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary',
            card.place,
            card.id === pulling
              ? cn(card.out, 'shadow-elevation-3')
              : isFront
                ? 'rotate-0 -translate-y-2 shadow-elevation-3'
                : cn(card.rest, 'shadow-elevation-2'),
          )
          const events = {
            onMouseEnter: () => bringToFront(card.id),
            onFocus: () => bringToFront(card.id),
            onClick: () => bringToFront(card.id),
            style: { zIndex: order.indexOf(card.id) + 1 },
          }

          if (card.id === 'video') {
            // A div, not a button: with reduced motion the video shows its own controls,
            // which must not sit inside another button.
            return (
              <div key={card.id} tabIndex={0} aria-label={card.label} className={cn(shared, 'bg-text-primary')} {...events}>
                <ReplayVideo />
              </div>
            )
          }
          return (
            <button key={card.id} type="button" aria-label={`Show ${card.label}`} aria-pressed={isFront} className={shared} {...events}>
              <Image
                src={SRC[card.id]}
                alt={card.label}
                width={1080}
                height={1080}
                priority={card.id === 'dark'}
                sizes="(min-width: 1024px) 30vw, 60vw"
                className="block w-full h-auto"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
