import type { ErrorCode } from '../errors'

/** Every successful response body. tech.md: `{ success, data }`. */
export interface SuccessResponse<T> {
  success: true
  data: T
}

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  total_pages: number
}

export interface PaginatedResponse<T> extends SuccessResponse<T[]> {
  meta: PaginationMeta
}

/** Every failed response body. tech.md: `{ success, error: { code, message } }`. */
export interface ErrorResponse {
  success: false
  error: {
    code: ErrorCode
    message: string
    details?: Record<string, unknown>
  }
}

export function ok<T>(data: T): SuccessResponse<T> {
  return { success: true, data }
}

export function paginated<T>(data: T[], meta: PaginationMeta): PaginatedResponse<T> {
  return { success: true, data, meta }
}
