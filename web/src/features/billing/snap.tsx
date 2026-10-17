'use client'

import Script from 'next/script'

/**
 * Midtrans Snap JS (FE-56). Loaded once from the signed-in app layout — a stable
 * boundary, so the script isn't raced by a page that streams in later — and only when
 * a client key is configured. The client key is public by design; the server key never
 * reaches the browser.
 */
const CLIENT_KEY = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? ''
const PRODUCTION = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === 'true'
const SNAP_SRC = PRODUCTION ? 'https://app.midtrans.com/snap/snap.js' : 'https://app.sandbox.midtrans.com/snap/snap.js'

export function SnapScript() {
  if (!CLIENT_KEY) return null
  return <Script id="midtrans-snap" src={SNAP_SRC} data-client-key={CLIENT_KEY} strategy="afterInteractive" />
}

/** What Snap reports about a payment. UX hints only — the server decides what happened. */
export interface SnapResult {
  order_id?: string
  transaction_status?: string
  status_code?: string
}

interface SnapCallbacks {
  onSuccess: (r: SnapResult) => void
  onPending: (r: SnapResult) => void
  onError: (r: SnapResult) => void
  onClose: () => void
}

declare global {
  interface Window {
    snap?: { pay: (token: string, callbacks: Partial<SnapCallbacks>) => void }
  }
}

/**
 * Opens the Snap popup. If snap.js hasn't loaded (blocked, slow network, no client key),
 * falls back to Midtrans' hosted page — the same payment, and the finish redirect
 * brings the customer back to /profile?payment=…
 */
export function openSnap(token: string, redirectUrl: string, callbacks: SnapCallbacks): 'popup' | 'redirect' {
  if (typeof window !== 'undefined' && typeof window.snap?.pay === 'function') {
    window.snap.pay(token, callbacks)
    return 'popup'
  }
  window.location.assign(redirectUrl)
  return 'redirect'
}
