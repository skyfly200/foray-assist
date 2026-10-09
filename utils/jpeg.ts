// Lossless removal of JPEG metadata segments before a photo leaves the device.
// Photos picked from the gallery (and many camera captures) carry GPS in EXIF, which would
// defeat a find's location setting once the photo is shared with foray members. The local
// copy keeps its EXIF (Review Mode reads it); only the uploaded copy is stripped.
// Pure module: erasable TypeScript, unit-tested under plain Node.

// APP1 = EXIF/XMP, APP13 = IPTC/Photoshop, COM = comments. APP0 (JFIF) and APP2 (ICC colour
// profile) are kept so the image looks the same.
const DROP = new Set([0xe1, 0xed, 0xfe])

/** Returns a copy without metadata segments, or the input unchanged if it isn't a JPEG. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes
  const out: Uint8Array[] = [bytes.subarray(0, 2)]
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return bytes // malformed: leave it alone rather than corrupt it
    const marker = bytes[i + 1]!
    if (marker === 0xff) { i++; continue } // fill byte
    // Start of scan: the rest is image data up to the end.
    if (marker === 0xda) { out.push(bytes.subarray(i)); break }
    // Markers without a length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { out.push(bytes.subarray(i, i + 2)); i += 2; continue }
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!
    if (len < 2 || i + 2 + len > bytes.length) return bytes
    if (!DROP.has(marker)) out.push(bytes.subarray(i, i + 2 + len))
    i += 2 + len
  }
  const total = out.reduce((n, a) => n + a.length, 0)
  const res = new Uint8Array(total)
  let o = 0
  for (const a of out) { res.set(a, o); o += a.length }
  return res
}

/** Blob wrapper used by sync; non-JPEGs pass through untouched. */
export async function stripPhotoBlob(blob: Blob): Promise<Blob> {
  if (!/jpe?g/i.test(blob.type)) return blob
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const out = stripJpegMetadata(bytes)
  return out === bytes ? blob : new Blob([out as BlobPart], { type: blob.type })
}
