import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wrapText, packLuminance, locationText, qrPayload, buildLabelModel, bitmapToRgba, rgbaToBitmap } from '../utils/label.ts'
import { formatId, displayId, isPendingId } from '../utils/idCode.ts'
import { encodeEscPos } from '../utils/escpos.ts'
import { encodeTspl } from '../utils/tspl.ts'

const ID = formatId('B7QM', 5, 42)

test('wrapText wraps, hard-splits and truncates', () => {
  assert.deepEqual(wrapText('aaa bbb ccc', 7), ['aaa bbb', 'ccc'])
  assert.deepEqual(wrapText('abcdefghij', 4), ['abcd', 'efgh', 'ij'])
  const t = wrapText('one two three four five six', 7, 2)
  assert.equal(t.length, 2)
  assert.ok(t[1].endsWith('…'))
  assert.deepEqual(wrapText('', 5), [])
})

test('packLuminance packs MSB first, pads rows', () => {
  const lum = [0, 255, 0, 0, 0, 0, 0, 0, 0, 255] // 10x1
  const b = packLuminance(lum, 10, 1)
  assert.equal(b.bytesPerRow, 2)
  assert.deepEqual([...b.data], [0b10111111, 0b10000000])
})

test('rgba roundtrip', () => {
  const rgba = new Uint8ClampedArray([0,0,0,255, 255,255,255,255, 0,0,0,0, 10,10,10,255])
  const b = rgbaToBitmap(rgba, 4, 1)
  assert.deepEqual([...b.data], [0b10010000])
  assert.deepEqual([...bitmapToRgba(b)].filter((_, i) => i % 4 === 0), [0, 255, 255, 0])
})

test('location privacy', () => {
  const base = { latitude: 47.61234, longitude: -122.33456 }
  assert.equal(locationText({ ...base, geoprivacy: 'private' }), '')
  assert.equal(locationText({ ...base, geoprivacy: 'obscured' }), '~47.6, -122.3')
  assert.equal(locationText({ ...base, geoprivacy: 'open' }), '47.61234, -122.33456')
  assert.equal(locationText({ geoprivacy: 'open' }), '')
})

test('qr payload', () => {
  assert.equal(qrPayload({ specimenId: ID }), `foray://specimen/${ID}`)
  assert.equal(qrPayload({ specimenId: ID, iNatObservationId: 42 }), 'https://www.inaturalist.org/observations/42')
})

test('buildLabelModel', () => {
  const m = buildLabelModel({ id: 'u', specimenId: ID, forayId: 'f', timestamp: '2026-10-05T12:00:00Z', geoprivacy: 'private', latitude: 1, longitude: 2,
    fieldNotes: { speciesGuess: 'Amanita muscaria', substrate: 'soil', notes: 'red cap white spots' }, updatedAt: '' })
  assert.equal(m.location, '')
  assert.deepEqual(m.substrate, ['Sub: soil'])
  assert.equal(m.qr, `foray://specimen/${ID}`)
  assert.equal(m.id, displayId(ID))
  assert.match(m.id, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]$/)
  assert.equal(isPendingId(''), true)
})

const bmp = { width: 16, height: 2, bytesPerRow: 2, data: new Uint8Array([0xff, 0x00, 0x0f, 0xf0]) }

test('ESC/POS GS v 0 header', () => {
  const o = encodeEscPos(bmp, { feedLines: 1 })
  assert.deepEqual([...o.slice(0, 2)], [0x1b, 0x40])
  assert.deepEqual([...o.slice(2, 10)], [0x1d, 0x76, 0x30, 0, 2, 0, 2, 0])
  assert.deepEqual([...o.slice(10, 14)], [0xff, 0x00, 0x0f, 0xf0])
  assert.equal(o[14], 0x0a)
  assert.equal(o.length, 15)
})

test('TSPL commands and inverted data', () => {
  const o = encodeTspl(bmp)
  const s = Buffer.from(o).toString('latin1')
  assert.ok(s.startsWith('SIZE 50 mm,30 mm\r\nGAP 2 mm,0 mm\r\nDIRECTION 1\r\nCLS\r\nBITMAP 0,0,2,2,0,'))
  assert.ok(s.endsWith('\r\nPRINT 1,1\r\n'))
  const i = s.indexOf('BITMAP 0,0,2,2,0,') + 'BITMAP 0,0,2,2,0,'.length
  assert.deepEqual([...o.slice(i, i + 4)], [0x00, 0xff, 0xf0, 0x0f])
})
