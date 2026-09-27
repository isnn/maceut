import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
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

/** Where a branding logo lives. */
export function logoPath(userId: string, ext = 'png'): string {
  return `branding/${userId}/logo.${ext}`
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
export async function getPresignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const s3 = getClient()
  try {
    return await getSignedUrl(s3, new GetObjectCommand({ Bucket: config.r2BucketName, Key: path }), {
      expiresIn: expiresInSeconds,
    })
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
