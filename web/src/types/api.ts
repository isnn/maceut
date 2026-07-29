export interface ApiErrorBody {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface SuccessResponse<T> {
  success: true
  data: T
  meta?: {
    total: number
    page: number
    limit: number
    total_pages: number
  }
}

export interface ErrorResponse {
  success: false
  error: ApiErrorBody
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse

export class ApiError extends Error {
  code: string
  details?: Record<string, unknown>

  constructor(body: ApiErrorBody) {
    super(body.message)
    this.code = body.code
    this.details = body.details
  }
}
