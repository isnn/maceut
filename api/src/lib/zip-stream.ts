import { crc32 } from './zip'

/**
 * A ZIP written as it goes — STORE method, ZIP64 when it outgrows 4 GB.
 *
 * `buildZip` (zip.ts) needs every file in memory, then copies them all once more into
 * one Buffer: an export's memory grew with every frame and doubled at the end, which is
 * what crashed long exports on this host. This writes each file to `sink` the moment it
 * is added and keeps only the small central-directory records, so memory stays at
 * about one frame whatever the frame count (EXP-A1, issue #63).
 *
 * Each file arrives whole (a rendered PNG), so its CRC and size are known before its
 * header is written — no data descriptors needed.
 *
 * ZIP64 kicks in automatically past 0xFFFFFFFF bytes or 0xFFFF entries: the old writer
 * stored 32-bit offsets and threw a RangeError past 4 GB.
 */

const MAX_32 = 0xffffffff
const MAX_16 = 0xffff

interface CentralEntry {
  name: Buffer
  crc: number
  size: number
  offset: number
}

export interface ZipStreamLimits {
  /** Offsets/sizes at or above this use ZIP64 fields. Lowered only by tests. */
  offsetLimit?: number
  /** Entry counts at or above this use ZIP64 records. Lowered only by tests. */
  countLimit?: number
}

/** DOS date/time packing — the timestamp format ZIP actually stores. */
function dosDateTime(date: Date): { time: number; date: number } {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f)
  const year = Math.max(date.getFullYear() - 1980, 0) & 0x7f
  return { time, date: (year << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f) }
}

export class ZipStream {
  private written = 0
  private readonly entries: CentralEntry[] = []
  private readonly time: number
  private readonly date: number
  private readonly offsetLimit: number
  private readonly countLimit: number
  private finished = false

  constructor(
    private readonly sink: (chunk: Buffer) => Promise<void>,
    now: Date = new Date(),
    limits: ZipStreamLimits = {},
  ) {
    const dt = dosDateTime(now)
    this.time = dt.time
    this.date = dt.date
    this.offsetLimit = Math.min(limits.offsetLimit ?? MAX_32, MAX_32)
    this.countLimit = Math.min(limits.countLimit ?? MAX_16, MAX_16)
  }

  /** Bytes handed to the sink so far. */
  get bytesWritten(): number {
    return this.written
  }

  get fileCount(): number {
    return this.entries.length
  }

  /** Appends one file. Must not be called concurrently — await each call. */
  async add(name: string, data: Buffer): Promise<void> {
    if (this.finished) throw new Error('ZipStream: add() after finish()')
    // One frame is never near 4 GB; ZIP64 here is for the archive, not its members.
    if (data.length >= MAX_32) throw new Error(`ZipStream: "${name}" is too large for one entry`)

    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0) // local file header
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // flags: UTF-8 names
    local.writeUInt16LE(0, 8) // method: store
    local.writeUInt16LE(this.time, 10)
    local.writeUInt16LE(this.date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    nameBuf.copy(local, 30)

    this.entries.push({ name: nameBuf, crc, size: data.length, offset: this.written })
    await this.emit(local)
    await this.emit(data)
  }

  /** Writes the central directory (and ZIP64 records if needed). Returns the total size. */
  async finish(): Promise<number> {
    if (this.finished) throw new Error('ZipStream: finish() twice')
    this.finished = true

    const cdStart = this.written
    for (const e of this.entries) {
      const bigOffset = e.offset >= this.offsetLimit
      // ZIP64 extended information: only the fields whose header slot is 0xFFFFFFFF.
      const extra = bigOffset ? Buffer.alloc(12) : Buffer.alloc(0)
      if (bigOffset) {
        extra.writeUInt16LE(0x0001, 0)
        extra.writeUInt16LE(8, 2)
        extra.writeBigUInt64LE(BigInt(e.offset), 4)
      }
      const cd = Buffer.alloc(46 + e.name.length + extra.length)
      cd.writeUInt32LE(0x02014b50, 0) // central directory header
      cd.writeUInt16LE(bigOffset ? 45 : 20, 4) // version made by
      cd.writeUInt16LE(bigOffset ? 45 : 20, 6) // version needed
      cd.writeUInt16LE(0x0800, 8)
      cd.writeUInt16LE(0, 10)
      cd.writeUInt16LE(this.time, 12)
      cd.writeUInt16LE(this.date, 14)
      cd.writeUInt32LE(e.crc, 16)
      cd.writeUInt32LE(e.size, 20)
      cd.writeUInt32LE(e.size, 24)
      cd.writeUInt16LE(e.name.length, 28)
      cd.writeUInt16LE(extra.length, 30)
      // 32: comment length, 34: disk, 36: internal attrs, 38: external attrs — all zero
      cd.writeUInt32LE(bigOffset ? MAX_32 : e.offset, 42)
      e.name.copy(cd, 46)
      extra.copy(cd, 46 + e.name.length)
      await this.emit(cd)
    }
    const cdSize = this.written - cdStart
    const count = this.entries.length

    const needs64 = count >= this.countLimit || cdStart >= this.offsetLimit || cdSize >= this.offsetLimit
    if (needs64) {
      const zip64EocdOffset = this.written
      const rec = Buffer.alloc(56)
      rec.writeUInt32LE(0x06064b50, 0) // ZIP64 end of central directory record
      rec.writeBigUInt64LE(44n, 4) // size of the rest of this record
      rec.writeUInt16LE(45, 12) // version made by
      rec.writeUInt16LE(45, 14) // version needed
      rec.writeUInt32LE(0, 16) // this disk
      rec.writeUInt32LE(0, 20) // disk with the central directory
      rec.writeBigUInt64LE(BigInt(count), 24)
      rec.writeBigUInt64LE(BigInt(count), 32)
      rec.writeBigUInt64LE(BigInt(cdSize), 40)
      rec.writeBigUInt64LE(BigInt(cdStart), 48)
      await this.emit(rec)

      const locator = Buffer.alloc(20)
      locator.writeUInt32LE(0x07064b50, 0) // ZIP64 end of central directory locator
      locator.writeUInt32LE(0, 4)
      locator.writeBigUInt64LE(BigInt(zip64EocdOffset), 8)
      locator.writeUInt32LE(1, 16) // total disks
      await this.emit(locator)
    }

    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(needs64 ? MAX_16 : count, 8)
    eocd.writeUInt16LE(needs64 ? MAX_16 : count, 10)
    eocd.writeUInt32LE(needs64 ? MAX_32 : cdSize, 12)
    eocd.writeUInt32LE(needs64 ? MAX_32 : cdStart, 16)
    await this.emit(eocd)
    return this.written
  }

  private async emit(chunk: Buffer): Promise<void> {
    this.written += chunk.length
    await this.sink(chunk)
  }
}
