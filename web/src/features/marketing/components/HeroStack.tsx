'use client'

import { useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { ReplayVideo } from './ReplayVideo'

/**
 * Hero (FE-40): three real captures of Yogyakarta and the Studio replay, stacked like
 * prints on a desk. Hovering, focusing or tapping a card brings it to the top and
 * straightens it; it stays there until another card is picked. The video sits at the
 * bottom-right corner, overlapping the prints a little, and starts on top so it is
 * seen.
 *
 * Under reduced motion the cards still change order, only without the transition.
 */

type CardId = 'violet' | 'blush' | 'dark' | 'video'

interface Card {
  id: CardId
  label: string
  /** Position and resting tilt inside the stack. */
  place: string
  rest: string
}

const CARDS: Card[] = [
  {
    id: 'violet',
    label: 'Yogyakarta at 08:15 WIB, violet style: mostly free-flowing roads.',
    place: 'left-0 top-[6%] w-[50%]',
    rest: '-rotate-6',
  },
  {
    id: 'blush',
    label: 'Yogyakarta at 17:15 WIB, light style: congestion on the ring road.',
    place: 'right-[6%] top-[4%] w-[50%]',
    rest: 'rotate-6',
  },
  {
    id: 'dark',
    label: 'Yogyakarta at 17:15 WIB, dark style: red and orange on the main corridors.',
    place: 'left-[22%] top-0 w-[54%]',
    rest: '-rotate-1',
  },
  {
    id: 'video',
    label: 'Studio replay of Yogyakarta, traffic colours changing through the morning.',
    place: 'right-0 bottom-0 w-[50%]',
    rest: 'rotate-3',
  },
]

const SRC: Record<Exclude<CardId, 'video'>, string> = {
  violet: '/landing/capture-yogyakarta-0815-violet.webp',
  blush: '/landing/capture-yogyakarta-1715-blush.webp',
  dark: '/landing/capture-yogyakarta-1715-dark.webp',
}

export function HeroStack({ className }: { className?: string }) {
  // Order of the pile, bottom first. The picked card moves to the end (the top).
  const [order, setOrder] = useState<CardId[]>(['violet', 'blush', 'dark', 'video'])
  const front = order[order.length - 1]
  const bringToFront = (id: CardId) => setOrder((o) => (o[o.length - 1] === id ? o : [...o.filter((x) => x !== id), id]))

  return (
    <div className={cn('min-w-0', className)}>
      <div className="relative mx-auto aspect-[5/4] w-full max-w-[40rem]">
        {CARDS.map((card) => {
          const isFront = card.id === front
          const shared = cn(
            'absolute block p-0 rounded-md overflow-hidden border border-border bg-canvas text-left',
            'transition-[rotate,translate,box-shadow] duration-300 ease-out motion-reduce:transition-none',
            'focus:outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary',
            card.place,
            isFront ? 'rotate-0 -translate-y-2 shadow-elevation-3' : cn(card.rest, 'shadow-elevation-2'),
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
