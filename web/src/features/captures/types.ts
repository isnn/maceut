import type { CaptureStyleInput } from '@/features/zones/types'

export type CaptureStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped_limit'

export interface Capture {
  id: string
  zoneId: string
  status: CaptureStatus
  filePath: string | null
  fileSize: number | null
  errorMessage: string | null
  styleUsed: CaptureStyleInput
  createdAt: string
  completedAt: string | null
}
