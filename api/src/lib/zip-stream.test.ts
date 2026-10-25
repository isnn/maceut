import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ZipStream } from './zip-stream'
import { buildZip } from './zip'

const now = new Date('2026-10-05T10:20:30')

async function collect(build: (zip: ZipStream) => Promise<void>, limits?: ConstructorParameters<typeof ZipStream>[2]) {
  const chunks: Buffer[] = []
  const zip = new ZipStream(async (c) => void chunks.push(c), now, limits)
  await build(zip)
  const total = await zip.finish()
  const out = Buffer.concat(chunks)
  expect(out.length).toBe(total)
  return out
}

/** Reads the archive back with Python's zipfile — an independent reader, ZIP64-aware. */
function pythonRead(zip: Buffer): { name: string; data: string }[] | null {
  const dir = mkdtempSync(join(tmpdir(), 'zipstream-'))
  const file = join(dir, 'x.zip')
  writeFileSync(file, zip)
  try {
    const out = execFileSync('python3', [
      '-c',
      'import sys, zipfile, json\nz = zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(json.dumps([{"name": i.filename, "data": z.read(i).decode("latin1")} for i in z.infolist()]))',
      file,
    ]).toString()
    return JSON.parse(out)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null // no python3 here
    throw err
  }
}

describe('ZipStream', () => {
  it('writes exactly what buildZip writes, without holding the files', async () => {
    const a = Buffer.from('first frame')
    const b = Buffer.alloc(5000, 7)
    const streamed = await collect(async (zip) => {
      await zip.add('01-frame.png', a)
      await zip.add('02-frame.png', b)
    })
    expect(streamed.equals(buildZip([{ name: '01-frame.png', data: a }, { name: '02-frame.png', data: b }], now))).toBe(true)
  })

  it('hands each file to the sink as it is added', async () => {
    const seen: number[] = []
    const zip = new ZipStream(async (c) => void seen.push(c.length), now)
    await zip.add('a.png', Buffer.alloc(100))
    // Local header (30 + name) and the data — already out before the archive is finished.
    expect(seen).toEqual([35, 100])
    expect(zip.bytesWritten).toBe(135)
  })

  it('switches to ZIP64 past the offset limit, and a real reader still opens it', async () => {
    // The limit is lowered so the ZIP64 path runs without writing 4 GB.
    const files = Array.from({ length: 4 }, (_, i) => ({ name: `${i}.png`, data: Buffer.from(`frame ${i} `.repeat(20)) }))
    const zip = await collect(
      async (z) => {
        for (const f of files) await z.add(f.name, f.data)
      },
      { offsetLimit: 300 },
    )

    // ZIP64 end-of-central-directory record and locator precede the classic EOCD,
    // which is maxed out to point readers at them.
    const eocd = zip.length - 22
    expect(zip.readUInt32LE(eocd)).toBe(0x06054b50)
    expect(zip.readUInt32LE(eocd + 16)).toBe(0xffffffff)
    expect(zip.readUInt32LE(eocd - 20)).toBe(0x07064b50)
    expect(zip.readUInt32LE(eocd - 20 - 56)).toBe(0x06064b50)

    const read = pythonRead(zip)
    if (read) expect(read).toEqual(files.map((f) => ({ name: f.name, data: f.data.toString('latin1') })))
  })

  it('uses ZIP64 records past the entry-count limit', async () => {
    const zip = await collect(
      async (z) => {
        for (let i = 0; i < 5; i++) await z.add(`${i}.png`, Buffer.from(`f${i}`))
      },
      { countLimit: 3 },
    )
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(0xffff)
    const read = pythonRead(zip)
    if (read) expect(read.map((f) => f.name)).toEqual(['0.png', '1.png', '2.png', '3.png', '4.png'])
  })

  it('refuses to add after finishing', async () => {
    const zip = new ZipStream(async () => undefined, now)
    await zip.finish()
    await expect(zip.add('late.png', Buffer.from('x'))).rejects.toThrow('after finish')
  })
})
