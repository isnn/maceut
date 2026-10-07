/**
 * One headless Chromium per worker process (EXP-A1, issue #67).
 *
 * The export consumer and the capture-image consumer each took one job at a time, but
 * they ran side by side, so a long export and a capture image could each hold a
 * Chromium at once. On this host (no swap, about 0.5–1 GB free) that is how renderers
 * got OOM-killed mid-export ("Target crashed").
 *
 * `withBrowserSlot` serialises every browser job in the process: whoever holds the slot
 * is the only Chromium running. Capture images simply wait while an export renders —
 * they take seconds and nothing is waiting on them.
 *
 * A consumer that keeps a browser alive between jobs (the capture-image one does, for
 * a minute) registers a closer, so the next slot holder doesn't start a second browser
 * beside an idle one.
 */

let tail: Promise<void> = Promise.resolve()
const idleClosers = new Set<() => Promise<void>>()

/** Registers a function that closes a browser kept idle between jobs. */
export function registerIdleBrowser(close: () => Promise<void>): () => void {
  idleClosers.add(close)
  return () => idleClosers.delete(close)
}

/**
 * Runs `fn` while holding the process's only browser slot. Jobs run strictly one after
 * another, in the order they asked. `closeIdle: true` first shuts any browser another
 * consumer kept warm — for jobs that launch their own.
 */
export async function withBrowserSlot<T>(fn: () => Promise<T>, opts: { closeIdle?: boolean } = {}): Promise<T> {
  const previous = tail
  let release!: () => void
  tail = new Promise<void>((resolve) => (release = resolve))
  await previous
  try {
    if (opts.closeIdle) {
      await Promise.allSettled([...idleClosers].map((close) => close()))
    }
    return await fn()
  } finally {
    release()
  }
}
