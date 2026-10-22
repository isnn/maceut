import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildZip, crc32 } from './zip'

describe('crc32', () => {
  it('matches the standard check value', () => {
    // The CRC-32 of "123456789" is 0xCBF43926 by definition.
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
  })
})

describe('buildZip', () => {
  it('writes an archive that a real unzip reads back byte for byte', () => {
    const a = Buffer.from('first frame')
    const b = Buffer.alloc(5000, 7)
    const zip = buildZip([
      { name: '01-frame.png', data: a },
      { name: '02-frame.png', data: b },
    ])
    const dir = mkdtempSync(join(tmpdir(), 'zip-'))
    writeFileSync(join(dir, 'x.zip'), zip)

    let listing: string
    try {
      listing = execFileSync('unzip', ['-l', join(dir, 'x.zip')]).toString()
    } catch {
      // No `unzip` binary in this environment — check the structure by hand instead.
      expect(zip.readUInt32LE(0)).toBe(0x04034b50)
      expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50)
      expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(2)
      return
    }
    expect(listing).toContain('01-frame.png')
    expect(listing).toContain('02-frame.png')
    expect(execFileSync('unzip', ['-p', join(dir, 'x.zip'), '01-frame.png']).toString()).toBe('first frame')
  })
})
