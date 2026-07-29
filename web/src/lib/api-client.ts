import { ApiError, type ApiResponse } from '@/types/api'

// TODO: replace mock feature api.ts implementations with real calls through this
// client once api/ exists. Kept here now so the swap-in later is a small diff.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  const body = (await res.json()) as ApiResponse<T>
  if (!body.success) throw new ApiError(body.error)
  return body.data
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, payload?: unknown) =>
    request<T>(path, { method: 'POST', body: payload ? JSON.stringify(payload) : undefined }),
  patch: <T>(path: string, payload?: unknown) =>
    request<T>(path, { method: 'PATCH', body: payload ? JSON.stringify(payload) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
