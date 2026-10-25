import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { crc32 } from './zip'
import { ffmpegArgs, startVideoEncoder } from './video-encoder'

/** A solid-colour RGB PNG, built by hand so the test needs no image library. */
function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3).map((_, i) => rgb[i % 3]!)])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function probe(file: string): { frames: number; seconds: number; codec: string; width: number; height: number } {
  const out = JSON.parse(
    execFileSync('ffprobe', [
      '-v', 'error', '-count_frames', '-select_streams', 'v:0',
      '-show_entries', 'stream=nb_read_frames,codec_name,width,height:format=duration',
      '-of', 'json', file,
    ]).toString(),
  )
  const s = out.streams[0]
  return { frames: Number(s.nb_read_frames), seconds: Number(out.format.duration), codec: s.codec_name, width: s.width, height: s.height }
}

describe('ffmpegArgs', () => {
  it('turns the hold time into the frame rate — no real-time waiting', () => {
    const args = ffmpegArgs('webm', 500, '/tmp/x.webm')
    expect(args[args.indexOf('-framerate') + 1]).toBe('1000/500')
    expect(args).toContain('libvpx-vp9')
    expect(args.at(-1)).toBe('/tmp/x.webm')
  })

  it('uses H.264 tuned for still images for MP4, with the index at the front', () => {
    const args = ffmpegArgs('mp4', 1000, '/tmp/x.mp4')
    expect(args).toEqual(expect.arrayContaining(['libx264', 'stillimage', '+faststart']))
  })

  it('pads odd sizes to even, which 4:2:0 video needs', () => {
    expect(ffmpegArgs('mp4', 1000, 'x')).toContain('pad=ceil(iw/2)*2:ceil(ih/2)*2')
  })
})

describe.runIf(hasFfmpeg())('startVideoEncoder (real ffmpeg)', () => {
  const frames = [png(65, 41, [20, 30, 200]), png(65, 41, [200, 40, 30]), png(65, 41, [30, 200, 60])]

  for (const format of ['webm', 'mp4'] as const) {
    it(`encodes still frames into ${format}, each held exactly its hold time`, async () => {
      const out = join(mkdtempSync(join(tmpdir(), 'enc-')), `out.${format}`)
      const encoder = startVideoEncoder(format, 500, out)
      for (const f of frames) await encoder.write(f)
      await encoder.finish()

      const info = probe(out)
      expect(info.codec).toBe(format === 'webm' ? 'vp9' : 'h264')
      expect(info.frames).toBe(3)
      // 3 frames × 0.5 s. Containers round timestamps slightly.
      expect(info.seconds).toBeGreaterThanOrEqual(1.4)
      expect(info.seconds).toBeLessThanOrEqual(1.6)
      // 65×41 padded up to even.
      expect([info.width, info.height]).toEqual([66, 42])
    }, 30_000)
  }

  it('reports ffmpeg failing instead of hanging', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'enc-')), 'out.webm')
    const encoder = startVideoEncoder('webm', 500, out)
    await encoder.write(Buffer.from('not a png at all')).catch(() => undefined)
    await expect(encoder.finish()).rejects.toThrow(/ffmpeg exited/)
  }, 30_000)
})
