'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as authApi from '../api'
import type { User } from '../types'

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    authApi.getMe().then((u) => {
      if (!cancelled) {
        setUser(u)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { user, loading }
}

export function useLogout() {
  const router = useRouter()
  return useCallback(async () => {
    await authApi.logout()
    router.push('/login')
  }, [router])
}
