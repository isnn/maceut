import { spawn, type ChildProcess } from 'node:child_process'
import { config } from '../config/env'

/**
 * Encodes export videos from rendered frames with ffmpeg (EXP-B, ADR-030).
 *
 * The animation used to be recorded in real time by Chromium's MediaRecorder: draw a
 * frame, then WAIT its hold time while the recorder watched — 720 frames held 1 s each
 * was 12 minutes of waiting, with the browser (and the growing video) kept in memory
 * throughout. Here each frame is drawn once, exactly like a ZIP frame, and piped to
 * ffmpeg as a PNG; the hold time is just the frame rate written into the file
 * (`-framerate 1000/holdMs`). No waiting, exact timing, and the browser is free as
 * soon as the last frame is drawn.
 *
 * Output goes to a file on disk, not a pipe: both containers write their index
 * (WebM cues, MP4 `moov`) after the frames, which needs a seekable output. Videos of
 * still frames are small (≈20–100 KB a frame), so the file is modest.
 */

export type VideoFormat = 'webm' | 'mp4'

/** ffmpeg arguments for a format. Exported for tests. */
export function ffmpegArgs(format: VideoFormat, holdMs: number, outPath: string): string[] {
  const input = [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    // Still frames, one per hold: the frame rate IS the hold time.
    '-f', 'image2pipe',
    '-framerate', `1000/${holdMs}`,
    '-c:v', 'png',
    '-i', 'pipe:0',
    // 4:2:0 needs even dimensions; Studio allows any size, so pad by at most a pixel.
    '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
    '-pix_fmt', 'yuv420p',
    '-an',
  ]
  const codec =
    format === 'webm'
      ? // VP9, constant quality. CRF 32 is visually clean for flat map colours and lines.
        ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4']
      : // H.264 tuned for stills; faststart moves the index to the front so it streams.
        ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-crf', '20', '-movflags', '+faststart']
  return [...input, ...codec, outPath]
}

export interface VideoEncoder {
  /** Feeds one PNG frame. Resolves once ffmpeg has taken it (backpressure). */
  write(png: Buffer): Promise<void>
  /** No more frames: waits for ffmpeg to finish the file. */
  finish(): Promise<void>
  /** Stops ffmpeg now — on cancel or failure. */
  kill(): void
}

export function startVideoEncoder(
  format: VideoFormat,
  holdMs: number,
  outPath: string,
  spawnFn: typeof spawn = spawn,
): VideoEncoder {
  const proc: ChildProcess = spawnFn(config.ffmpegPath, ffmpegArgs(format, holdMs, outPath), { stdio: ['pipe', 'ignore', 'pipe'] })
  const stdin = proc.stdin!
  let stderr = ''
  proc.stderr?.on('data', (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-4000)
  })

  let exitError: Error | null = null
  const exited = new Promise<void>((resolve) => {
    proc.on('error', (err) => {
      exitError = new Error(`ffmpeg could not start: ${err.message}`)
      resolve()
    })
    proc.on('close', (code, signal) => {
      if (code !== 0 && !exitError) exitError = new Error(`ffmpeg exited with ${code ?? signal}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`)
      resolve()
    })
  })
  // A write to a dead ffmpeg raises EPIPE on stdin; the exit error explains why.
  stdin.on('error', () => undefined)

  return {
    async write(png) {
      if (exitError) throw exitError
      if (!stdin.write(png)) {
        await new Promise<void>((resolve) => {
          const done = () => {
            stdin.off('drain', done)
            proc.off('close', done)
            resolve()
          }
          stdin.once('drain', done)
          proc.once('close', done)
        })
      }
      if (exitError) throw exitError
    },
    async finish() {
      stdin.end()
      await exited
      if (exitError) throw exitError
    },
    kill() {
      if (proc.exitCode === null) proc.kill('SIGKILL')
    },
  }
}
