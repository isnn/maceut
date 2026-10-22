import type { PillTone } from '@/components/ui/Badge'
import type { Capture, CaptureStatus } from './api'

/** One wording for a capture's status, on the customer's zone page and the staff one. */
export const CAPTURE_STATUS_LABEL: Record<CaptureStatus, string> = {
  pending: 'Queued',
  processing: 'Collecting…',
  done: 'Collected',
  failed: 'Failed',
  skipped_limit: 'Skipped: monthly limit',
  missed: 'Missed',
}

export const CAPTURE_STATUS_TONE: Record<CaptureStatus, PillTone> = {
  pending: 'neutral',
  processing: 'brand',
  done: 'success',
  failed: 'danger',
  skipped_limit: 'warning',
  missed: 'warning',
}

/** One word for the trigger, everywhere. */
export const CAPTURE_TRIGGER_LABEL: Record<Capture['trigger'], string> = { scheduled: 'Scheduled', manual: 'Manual' }
