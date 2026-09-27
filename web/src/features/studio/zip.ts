/**
 * A minimal ZIP writer — STORE method (no compression), no external dependency.
 *
 * Built for one job: bundling several rendered PNGs into a single download instead of
 * triggering one browser download per frame, which popup blockers treat as spam and a
 * person then has to approve one at a time. Compression isn't worth the code here —
 * PNGs are already compressed, and re-compressing compressed bytes buys nothing.
 */

export interface ZipEntry {
  name: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** DOS date/time packing — the timestamp format ZIP actually stores. */
function dosDateTime(date: Date): { time: number; date: number } {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f)
  const dosYear = Math.max(date.getFullYear() - 1980, 0) & 0x7f
  const dateNum = (dosYear << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f)
  return { time, date: dateNum }
}

/** Builds a ZIP file's bytes from a set of already-encoded entries. */
export function buildZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder()
  // Typed loosely on purpose — see the note at the Blob() call below.
  const parts: unknown[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const { time, date } = dosDateTime(new Date())

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)

    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // local file header signature
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0, true) // flags
    lv.setUint16(8, 0, true) // method = store
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, entry.data.length, true) // compressed size
    lv.setUint32(22, entry.data.length, true) // uncompressed size
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true) // extra length
    local.set(nameBytes, 30)

    parts.push(local, entry.data)

    const centralEntry = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(centralEntry.buffer)
    cv.setUint32(0, 0x02014b50, true) // central directory signature
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0, true) // flags
    cv.setUint16(10, 0, true) // method
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, entry.data.length, true)
    cv.setUint32(24, entry.data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true) // extra length
    cv.setUint16(32, 0, true) // comment length
    cv.setUint16(34, 0, true) // disk number start
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, offset, true) // local header offset
    centralEntry.set(nameBytes, 46)
    central.push(centralEntry)

    offset += local.length + entry.data.length
  }

  const centralStart = offset
  const centralSize = central.reduce((sum, c) => sum + c.length, 0)

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true) // end of central directory signature
  ev.setUint16(4, 0, true) // disk number
  ev.setUint16(6, 0, true) // disk with central dir
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, centralStart, true)
  ev.setUint16(20, 0, true) // comment length

  // TS's DOM lib types Blob's constructor against `ArrayBufferView<ArrayBuffer>`, and
  // `Uint8Array`'s own generic tracks `ArrayBufferLike` (which also covers
  // SharedArrayBuffer). Every buffer built above is a plain, freshly allocated
  // ArrayBuffer, so this is a real value satisfying a stricter type than TS can prove
  // — not an actual type hole.
  return new Blob([...parts, ...central, eocd] as BlobPart[], { type: 'application/zip' })
}
