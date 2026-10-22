import { describe, it, expect, vi } from 'vitest'

vi.mock('../config/env', () => ({
  config: { r2BucketName: 'maceut-captures' },
  isR2Configured: () => true,
  missingIntegrationKeys: () => ({ r2: [], here: [] }),
}))

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { MultipartUpload } from './r2-client'

/** A fake S3 client that records every command it is sent. */
function fakeClient() {
  const sent: unknown[] = []
  let etag = 0
  const send = vi.fn(async (cmd: unknown) => {
    sent.push(cmd)
    if (cmd instanceof CreateMultipartUploadCommand) return { UploadId: 'up-1' }
    if (cmd instanceof UploadPartCommand) return { ETag: `"e${++etag}"` }
    return {}
  })
  return { client: { send } as never, sent }
}

const parts = (sent: unknown[]) =>
  sent.filter((c): c is UploadPartCommand => c instanceof UploadPartCommand).map((c) => (c.input.Body as Buffer).toString())

describe('MultipartUpload', () => {
  it('cuts parts to exactly the part size, whatever sizes are written (R2 requires equal parts)', async () => {
    const { client, sent } = fakeClient()
    const up = await MultipartUpload.start('exports/u/e.zip', 'application/zip', { client, partSize: 4 })
    await up.write(Buffer.from('ab'))
    await up.write(Buffer.from('cdefghij'))
    await up.write(Buffer.from('k'))
    await up.complete()

    // Every part but the last is exactly 4 bytes; the last carries the remainder.
    expect(parts(sent)).toEqual(['abcd', 'efgh', 'ijk'])
    const done = sent.find((c) => c instanceof CompleteMultipartUploadCommand) as CompleteMultipartUploadCommand
    expect(done.input.MultipartUpload?.Parts).toEqual([
      { PartNumber: 1, ETag: '"e1"' },
      { PartNumber: 2, ETag: '"e2"' },
      { PartNumber: 3, ETag: '"e3"' },
    ])
    expect(up.bytes).toBe(11)
  })

  it('keeps no more than one part in memory', async () => {
    const { client, sent } = fakeClient()
    const up = await MultipartUpload.start('k', 'x', { client, partSize: 4 })
    await up.write(Buffer.from('abcdefghi'))
    // Two full parts are already uploaded before the write returns.
    expect(parts(sent)).toEqual(['abcd', 'efgh'])
  })

  it('uploads one part for a file smaller than a part', async () => {
    const { client, sent } = fakeClient()
    const up = await MultipartUpload.start('k', 'x', { client, partSize: 16 })
    await up.write(Buffer.from('tiny'))
    await up.complete()
    expect(parts(sent)).toEqual(['tiny'])
  })

  it('aborts without throwing, and refuses further writes', async () => {
    const { client, sent } = fakeClient()
    const up = await MultipartUpload.start('k', 'x', { client, partSize: 4 })
    await up.abort()
    expect(sent.some((c) => c instanceof AbortMultipartUploadCommand)).toBe(true)
    await expect(up.write(Buffer.from('x'))).rejects.toThrow('after complete/abort')
  })
})
