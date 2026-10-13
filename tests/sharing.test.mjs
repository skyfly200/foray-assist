import test from 'node:test'
import assert from 'node:assert/strict'
import { feedRowToPeerFind, formatJoinCode, joinUrl, mergeFeed, normalizeJoinCode, parseJoinInput, summarizeSuggestions } from '../utils/sharing.ts'
import { stripJpegMetadata } from '../utils/jpeg.ts'

test('join codes: normalise, format, links', () => {
  assert.equal(normalizeJoinCode(' ab3d-ef9h '), 'AB3DEF9H')
  assert.equal(normalizeJoinCode('AB3DEF9'), null)
  assert.equal(normalizeJoinCode('AB3DEF91'), null, '1 is not in the alphabet')
  assert.equal(normalizeJoinCode('AB3DEFOH'), null, 'O is not in the alphabet')
  assert.equal(formatJoinCode('ab3def9h'), 'AB3D-EF9H')
  assert.equal(joinUrl('https://forray-assist.vercel.app/', 'AB3DEF9H'), 'https://forray-assist.vercel.app/join/AB3DEF9H')
  assert.equal(parseJoinInput('https://forray-assist.vercel.app/join/AB3DEF9H'), 'AB3DEF9H')
  assert.equal(parseJoinInput('https://x.app/join/ab3d-ef9h/?utm=1'), 'AB3DEF9H')
  assert.equal(parseJoinInput('AB3D EF9H'), 'AB3DEF9H')
  assert.equal(parseJoinInput('https://evil.example/other'), null)
})

const row = (id, user, at, extra = {}) => ({
  id, user_id: user, author_name: 'Amy', specimen_id: 'B7QMAAAB2', voucher_id: null, timestamp: at,
  latitude: 39.7, longitude: -104.9, geoprivacy: 'obscured', field_notes: { speciesGuess: 'Amanita' }, updated_at: at,
  photos: [{ id: 'p', storage_path: 'u/photos/p', is_selected: true, captured_at: at }], ...extra,
})

test('feed rows map to peer finds and merge with file/mesh finds', () => {
  const f = feedRowToPeerFind(row('a', 'amy', '2026-10-09T17:00:00Z'), 'F', 'now')
  assert.equal(f.source, 'server')
  assert.equal(f.photos[0].storagePath, 'u/photos/p')
  assert.equal(feedRowToPeerFind(row('b', 'x', 't', { author_name: '' }), 'F', 'now').authorName, 'A member')
  const fromFile = { ...f, id: 'z', source: 'file', timestamp: '2026-10-09T16:00:00Z' }
  const dupOfServer = { ...f, source: 'mesh' }
  const staleServer = { ...f, id: 'gone' }
  const mine = feedRowToPeerFind(row('m', 'me', '2026-10-09T18:00:00Z'), 'F', 'now')
  const merged = mergeFeed([fromFile, dupOfServer, staleServer], [f, mine], 'me')
  assert.deepEqual(merged.map((x) => [x.id, x.source]), [['z', 'file'], ['a', 'server']])
})

test('suggestion summary tallies suggestions and agreements', () => {
  assert.deepEqual(summarizeSuggestions([
    { kind: 'suggestion', taxon: 'Amanita muscaria' }, { kind: 'agree', taxon: 'Amanita muscaria' },
    { kind: 'suggestion', taxon: 'Boletus edulis' }, { kind: 'comment', taxon: null },
  ]), [{ taxon: 'Amanita muscaria', votes: 2 }, { taxon: 'Boletus edulis', votes: 1 }])
})

test('JPEG metadata stripping keeps image data and drops EXIF', () => {
  const seg = (m, payload) => [0xff, m, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload]
  const exif = seg(0xe1, [...Buffer.from('Exif\0\0GPS-DATA')])
  const jfif = seg(0xe0, [...Buffer.from('JFIF\0')])
  const icc = seg(0xe2, [1, 2, 3])
  const sos = [0xff, 0xda, 0, 2, 9, 9, 9, 0xff, 0xd9]
  const jpg = new Uint8Array([0xff, 0xd8, ...jfif, ...exif, ...icc, ...sos])
  const out = stripJpegMetadata(jpg)
  assert.deepEqual([...out], [0xff, 0xd8, ...jfif, ...icc, ...sos])
  assert.ok(!Buffer.from(out).includes(Buffer.from('GPS')))
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
  assert.equal(stripJpegMetadata(png), png)
  const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])
  assert.equal(stripJpegMetadata(broken), broken)
})
