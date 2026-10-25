'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as authApi from '../api'
import type { User } from '../types'
import { ApiError } from '@/types/api'

/** Fired after something changed the account (a payment, a plan change): every useCurrentUser re-reads /me. */
const ACCOUNT_CHANGED = 'maceut:account-changed'

export function refreshCurrentUser() {
  window.dispatchEvent(new Event(ACCOUNT_CHANGED))
}

/** Waits between tries when /me can't be reached: a blip shouldn't leave the page blank. */
const RETRY_MS = [1000, 3000]

/**
 * The signed-in user. `user` stays null while signed out; `error` is set only when /me
 * couldn't be read after a couple of tries (network, server down), so callers can show
 * that instead of mistaking it for "signed out" or waiting forever.
 *
 * It used to have no error path at all: one failed /me (common right after a full
 * reload over a slow connection) left `loading` true for good, and the app layout,
 * which renders nothing while loading, stayed a blank white page.
 */
export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const load = (tryNo: number) => {
      authApi.getMe().then(
        (u) => {
          if (cancelled) return
          setUser(u)
          setError(null)
          setLoading(false)
        },
        (err) => {
          if (cancelled) return
          if (tryNo < RETRY_MS.length) {
            timer = setTimeout(() => load(tryNo + 1), RETRY_MS[tryNo])
            return
          }
          setError(err instanceof ApiError ? err.message : 'Could not load your account.')
          setLoading(false)
        },
      )
    }
    load(0)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [attempt])

  useEffect(() => {
    const again = () => setAttempt((n) => n + 1)
    window.addEventListener(ACCOUNT_CHANGED, again)
    return () => window.removeEventListener(ACCOUNT_CHANGED, again)
  }, [])

  const retry = useCallback(() => {
    setError(null)
    setLoading(true)
    setAttempt((n) => n + 1)
  }, [])

  return { user, loading, error, retry }
}

export function useLogout() {
  const router = useRouter()
  return useCallback(async () => {
    await authApi.logout()
    router.push('/login')
  }, [router])
}
