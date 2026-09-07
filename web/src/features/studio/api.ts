// TODO: replace with real fetch through @/lib/api-client once api/ + worker exist
// (GET /captures?zoneId=&date=, POST /renders, GET /renders).

export type RenderFormat = 'gif' | 'mp4' | 'webm'
export type RenderStatus = 'ready' | 'rendering' | 'failed'

/** One captured frame in the Studio strip (3m). */
export interface Frame {
  id: string
  zoneId: string
  /** "HH:mm" in Asia/Jakarta. */
  time: string
  /** Congestion index 0-100 shown under the player. */
  index: number
  capturedAt: string
}

export interface RenderJob {
  id: string
  zoneId: string
  title: string
  frames: number
  format: RenderFormat
  status: RenderStatus
  /** 0-100 while status is "rendering". */
  progress: number
  createdAt: string
}

const MOCK_LATENCY_MS = 300
const RENDERS_KEY = 'maceut_mock_renders'

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS))
}

/**
 * Deterministic index curve for a day: quiet overnight, a hard morning peak
 * around 07:00-08:00 and a softer evening one, so the scrubber reads like real
 * traffic rather than noise.
 */
function indexForHour(hour: number): number {
  const morning = 78 * Math.exp(-((hour - 7.6) ** 2) / 2.2)
  const evening = 61 * Math.exp(-((hour - 17.8) ** 2) / 3.4)
  const base = 18
  return Math.min(99, Math.round(base + morning + evening))
}

export async function getFrames(zoneId: string, fromHour = 6, toHour = 20): Promise<Frame[]> {
  const frames: Frame[] = []
  for (let hour = fromHour; hour <= toHour; hour++) {
    frames.push({
      id: `${zoneId}-${hour}`,
      zoneId,
      time: `${String(hour).padStart(2, '0')}:00`,
      index: indexForHour(hour),
      capturedAt: new Date().toISOString(),
    })
  }
  return delay(frames)
}

function readRenders(): RenderJob[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(RENDERS_KEY)
  return raw ? (JSON.parse(raw) as RenderJob[]) : []
}

function writeRenders(renders: RenderJob[]) {
  window.localStorage.setItem(RENDERS_KEY, JSON.stringify(renders))
}

export async function getRenders(zoneNames: Record<string, string> = {}): Promise<RenderJob[]> {
  const stored = readRenders()
  if (stored.length > 0) return delay(stored)

  const [firstZoneId, secondZoneId] = Object.keys(zoneNames)
  if (!firstZoneId) return delay([])
  const seeded: RenderJob[] = [
    {
      id: 'seed-1',
      zoneId: firstZoneId,
      title: `${zoneNames[firstZoneId]} · 5 Sep`,
      frames: 14,
      format: 'mp4',
      status: 'ready',
      progress: 100,
      createdAt: '2026-09-05T09:10:00.000Z',
    },
    {
      id: 'seed-2',
      zoneId: secondZoneId ?? firstZoneId,
      title: `${zoneNames[secondZoneId ?? firstZoneId]} · minggu 36`,
      frames: 98,
      format: 'gif',
      status: 'ready',
      progress: 100,
      createdAt: '2026-09-04T11:00:00.000Z',
    },
    {
      id: 'seed-3',
      zoneId: firstZoneId,
      title: `${zoneNames[firstZoneId]} · minggu 36`,
      frames: 62,
      format: 'mp4',
      status: 'rendering',
      progress: 62,
      createdAt: '2026-09-05T09:40:00.000Z',
    },
  ]
  writeRenders(seeded)
  return delay(seeded)
}

export async function createRender(input: {
  zoneId: string
  title: string
  frames: number
  format: RenderFormat
}): Promise<RenderJob> {
  const job: RenderJob = {
    id: `${Date.now()}`,
    zoneId: input.zoneId,
    title: input.title,
    frames: input.frames,
    format: input.format,
    status: 'rendering',
    progress: 5,
    createdAt: new Date().toISOString(),
  }
  writeRenders([job, ...readRenders()])
  // Stand in for the worker finishing the encode.
  setTimeout(() => {
    writeRenders(readRenders().map((r) => (r.id === job.id ? { ...r, status: 'ready', progress: 100 } : r)))
  }, 4000)
  return delay(job)
}
