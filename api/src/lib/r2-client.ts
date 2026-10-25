import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config, isR2Configured, missingIntegrationKeys } from '../config/env'
import { UpstreamError } from '../errors'

/**
 * Cloudflare R2, over the S3-compatible API (ADR-008).
 *
 * Three settings are not optional against R2, and each fails in a way that does not
 * name itself:
 *
 * - `region: 'auto'` — R2 has no regions, but the SDK refuses to sign without one.
 * - `forcePathStyle: true` — the default virtual-host style would address
 *   `https://{bucket}.{account}.r2.cloudflarestorage.com`, which R2's S3 endpoint
 *   does not serve. The symptom is a DNS or 404 error that looks like a wrong bucket.
 * - `requestChecksumCalculation: 'WHEN_REQUIRED'` — recent AWS SDK versions add
 *   flexible checksum headers to every upload by default; R2 rejects requests
 *   carrying them. The symptom is a signature or "not implemented" error on PUT only.
 */

let client: S3Client | null = null

/** Throws a message naming exactly what is missing, rather than a generic SDK error. */
function requireConfigured(): void {
  if (isR2Configured()) return
  const missing = missingIntegrationKeys().r2
  throw new UpstreamError(
    'R2',
    `not configured — set ${missing.join(', ')} in api/.env, then restart. Run \`npm run env:check\` to verify.`,
  )
}

export function getClient(): S3Client {
  requireConfigured()
  if (client) return client

  client = new S3Client({
    region: 'auto',
    endpoint: config.r2Endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: config.r2AccessKeyId as string,
      secretAccessKey: config.r2AccessKeySecret as string,
    },
  })
  return client
}

/** Test seam — drops the memoised client so a later call rebuilds it from config. */
export function resetClient(): void {
  client = null
}

/**
 * Where a capture lives in the bucket (BR-011):
 * `captures/{user_id}/{YYYY}/{MM}/{capture_id}.png`
 *
 * Month is zero-padded and both parts come from UTC, so the same capture always
 * resolves to the same key regardless of the server's timezone. (Daily *limits* are
 * counted in WIB — that is a different question, answered in the capture repository.)
 */
export function capturePath(userId: string, captureId: string, at: Date = new Date(), ext = 'png'): string {
  const year = at.getUTCFullYear()
  const month = String(at.getUTCMonth() + 1).padStart(2, '0')
  return `captures/${userId}/${year}/${month}/${captureId}.${ext}`
}

/**
 * The small JPEG beside a capture image — `…/{id}.png` → `…/{id}.thumb.jpg`. Derived,
 * not stored: one image always has one thumbnail, so a column would only be a second
 * place for the same fact to drift.
 */
export function thumbnailPath(imagePath: string): string {
  return imagePath.replace(/\.png$/, '.thumb.jpg')
}

export async function upload(path: string, data: Buffer, contentType: string): Promise<void> {
  const s3 = getClient()
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: config.r2BucketName,
        Key: path,
        Body: data,
        ContentType: contentType,
      }),
    )
  } catch (err) {
    throw toUpstream('upload', path, err)
  }
}

/**
 * Part size for multipart uploads. R2 requires every part except the last to be the
 * SAME size (and at least 5 MiB), so parts are cut to exactly this many bytes rather
 * than flushed whenever a write happens to arrive.
 */
export const MULTIPART_PART_SIZE = 16 * 1024 * 1024

type Sender = Pick<S3Client, 'send'>

/**
 * An object uploaded in fixed-size parts as it is produced — a long export's ZIP is
 * streamed straight to R2 instead of being built in memory (EXP-A1). Memory stays at
 * one part plus whatever write is in flight.
 *
 * `write` must not be called concurrently: await each call (it waits while a full part
 * uploads, which is also what slows the producer down when R2 is slower than the
 * renderer). `complete()` sends the remainder; `abort()` discards everything uploaded.
 */
export class MultipartUpload {
  private pending: Buffer[] = []
  private pendingBytes = 0
  private readonly parts: { PartNumber: number; ETag: string }[] = []
  private totalBytes = 0
  private closed = false

  private constructor(
    private readonly s3: Sender,
    readonly path: string,
    readonly uploadId: string,
    private readonly partSize: number,
  ) {}

  static async start(
    path: string,
    contentType: string,
    opts: { client?: Sender; partSize?: number } = {},
  ): Promise<MultipartUpload> {
    const s3 = opts.client ?? getClient()
    try {
      const res = await s3.send(
        new CreateMultipartUploadCommand({ Bucket: config.r2BucketName, Key: path, ContentType: contentType }),
      )
      if (!res.UploadId) throw new Error('no UploadId returned')
      return new MultipartUpload(s3, path, res.UploadId, opts.partSize ?? MULTIPART_PART_SIZE)
    } catch (err) {
      throw toUpstream('start multipart upload', path, err)
    }
  }

  /** Re-attaches to an upload started earlier — used to abort one left behind. */
  static async abortById(path: string, uploadId: string, client?: Sender): Promise<void> {
    const s3 = client ?? getClient()
    await s3.send(new AbortMultipartUploadCommand({ Bucket: config.r2BucketName, Key: path, UploadId: uploadId }))
  }

  get bytes(): number {
    return this.totalBytes
  }

  get partCount(): number {
    return this.parts.length
  }

  async write(chunk: Buffer): Promise<void> {
    if (this.closed) throw new Error('MultipartUpload: write after complete/abort')
    if (chunk.length === 0) return
    this.pending.push(chunk)
    this.pendingBytes += chunk.length
    this.totalBytes += chunk.length
    while (this.pendingBytes >= this.partSize) {
      const all = Buffer.concat(this.pending, this.pendingBytes)
      await this.uploadPart(all.subarray(0, this.partSize))
      const rest = all.subarray(this.partSize)
      // Copy the remainder so the large concatenated buffer can be freed.
      this.pending = rest.length ? [Buffer.from(rest)] : []
      this.pendingBytes = rest.length
    }
  }

  async complete(): Promise<void> {
    if (this.closed) throw new Error('MultipartUpload: complete twice')
    if (this.pendingBytes > 0 || this.parts.length === 0) {
      await this.uploadPart(Buffer.concat(this.pending, this.pendingBytes))
      this.pending = []
      this.pendingBytes = 0
    }
    this.closed = true
    try {
      await this.s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: config.r2BucketName,
          Key: this.path,
          UploadId: this.uploadId,
          MultipartUpload: { Parts: this.parts },
        }),
      )
    } catch (err) {
      throw toUpstream('complete multipart upload', this.path, err)
    }
  }

  /** Discards the upload. Never throws — it runs on failure paths. */
  async abort(): Promise<void> {
    this.closed = true
    this.pending = []
    await MultipartUpload.abortById(this.path, this.uploadId, this.s3).catch((err) =>
      console.error(`[r2] abort of ${this.path} failed:`, describe(err)),
    )
  }

  private async uploadPart(body: Buffer): Promise<void> {
    const PartNumber = this.parts.length + 1
    try {
      const res = await this.s3.send(
        new UploadPartCommand({ Bucket: config.r2BucketName, Key: this.path, UploadId: this.uploadId, PartNumber, Body: body }),
      )
      if (!res.ETag) throw new Error('no ETag returned')
      this.parts.push({ PartNumber, ETag: res.ETag })
    } catch (err) {
      throw toUpstream(`upload part ${PartNumber}`, this.path, err)
    }
  }
}

export async function download(path: string): Promise<Buffer> {
  const s3 = getClient()
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: config.r2BucketName, Key: path }))
    if (!res.Body) throw new Error('empty body')
    return Buffer.from(await res.Body.transformToByteArray())
  } catch (err) {
    throw toUpstream('download', path, err)
  }
}

export async function remove(path: string): Promise<void> {
  const s3 = getClient()
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: config.r2BucketName, Key: path }))
  } catch (err) {
    throw toUpstream('delete', path, err)
  }
}

export async function exists(path: string): Promise<boolean> {
  const s3 = getClient()
  try {
    await s3.send(new HeadObjectCommand({ Bucket: config.r2BucketName, Key: path }))
    return true
  } catch {
    return false
  }
}

/**
 * A time-limited URL for a private object.
 *
 * ADR-008 notes R2's presigning is more limited than S3's; in particular the URL is
 * signed against the S3 endpoint, not R2_PUBLIC_URL, so it works whether or not the
 * bucket has public access configured.
 */
export async function getPresignedUrl(path: string, expiresInSeconds = 3600, downloadName?: string): Promise<string> {
  const s3 = getClient()
  try {
    return await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: config.r2BucketName,
        Key: path,
        // With a name, the browser saves the file as that rather than as the object's
        // uuid key — the difference between "Sudirman-2026-09-27.webm" and "3f2a….webm".
        ...(downloadName
          ? { ResponseContentDisposition: `attachment; filename="${downloadName.replace(/["\\\r\n]/g, '')}"` }
          : {}),
      }),
      { expiresIn: expiresInSeconds },
    )
  } catch (err) {
    throw toUpstream('presign', path, err)
  }
}

/**
 * The public URL for an object, when the bucket is served publicly.
 *
 * Returns undefined if R2_PUBLIC_URL is unset — callers must then fall back to
 * `getPresignedUrl`. Guessing a public URL that 403s would be worse than saying so.
 */
export function publicUrlFor(path: string): string | undefined {
  if (!config.r2PublicUrl) return undefined
  return `${config.r2PublicUrl.replace(/\/+$/, '')}/${path}`
}

export interface BucketHealth {
  ok: boolean
  bucket?: string
  error?: string
}

export async function headBucket(): Promise<BucketHealth> {
  try {
    const s3 = getClient()
    await s3.send(new HeadBucketCommand({ Bucket: config.r2BucketName }))
    return { ok: true, bucket: config.r2BucketName }
  } catch (err) {
    return { ok: false, bucket: config.r2BucketName, error: describe(err) }
  }
}

/**
 * Maps the SDK's errors onto what an operator should actually change. `AccessDenied`
 * on a PUT almost always means the API token is Object Read *only*, which is
 * invisible from a bucket listing.
 */
function describe(err: unknown): string {
  const name = (err as { name?: string })?.name ?? ''
  const message = err instanceof Error ? err.message : String(err)

  if (name === 'NoSuchBucket') return `bucket "${config.r2BucketName}" does not exist in this account`
  if (name === 'AccessDenied' || name === 'Forbidden')
    return 'access denied — the API token likely lacks Object Read & Write on this bucket'
  if (name === 'InvalidAccessKeyId') return 'R2_ACCESS_KEY_ID is not recognised by this account'
  if (name === 'SignatureDoesNotMatch') return 'R2_ACCESS_KEY_SECRET does not match the access key id'
  if (name === 'NotFound') return `bucket "${config.r2BucketName}" not found (check R2_BUCKET_NAME and R2_ACCOUNT_ID)`
  return message
}

function toUpstream(op: string, path: string, err: unknown): UpstreamError {
  return new UpstreamError('R2', `${op} failed for "${path}": ${describe(err)}`)
}
