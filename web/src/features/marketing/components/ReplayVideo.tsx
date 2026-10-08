'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/**
 * The Yogyakarta replay as a looping video. It autoplays only when the visitor has not
 * asked for reduced motion; otherwise the poster shows with controls so they choose to
 * play it. The server render assumes reduced motion, so nothing moves before hydration.
 */
export function ReplayVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  const reduced = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  )

  useEffect(() => {
    if (reduced) ref.current?.pause()
    else void ref.current?.play().catch(() => undefined)
  }, [reduced])

  return (
    <video
      ref={ref}
      className="block w-full h-auto aspect-[16/10]"
      poster="/landing/replay-yogyakarta-poster.webp"
      muted
      loop
      playsInline
      preload="metadata"
      controls={reduced}
      aria-label="Studio replay of Yogyakarta's roads on 25 September 2026, traffic colours changing through the morning"
    >
      <source src="/landing/replay-yogyakarta.webm" type="video/webm" />
      <source src="/landing/replay-yogyakarta.mp4" type="video/mp4" />
    </video>
  )
}
