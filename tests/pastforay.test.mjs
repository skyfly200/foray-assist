// Run: node --experimental-strip-types --test tests/pastforay.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizePhotos, pastForayTimes, pastForayName, placeFromNominatim, localDay } from '../utils/pastForay.ts'

test('range comes from the earliest and latest camera times', () => {
  const s = summarizePhotos([
    { capturedAt: '2026-09-20T15:30:00Z', timeSource: 'exif' },
    { capturedAt: '2026-09-20T14:00:00Z', timeSource: 'exif' },
    { capturedAt: '2026-10-14T09:00:00Z', timeSource: 'file' }, // downloaded copy, ignored
  ])
  assert.equal(s.startedAt, '2026-09-20T14:00:00.000Z')
  assert.equal(s.endedAt, '2026-09-20T15:30:00.000Z')
  assert.equal(s.day, localDay(new Date('2026-09-20T14:00:00Z')))
  assert.equal(s.fromExif, true)
  assert.equal(s.center, undefined)
})

test('file times are used when no photo has a camera time', () => {
  const s = summarizePhotos([{ capturedAt: '2026-09-01T10:00:00Z', timeSource: 'file' }])
  assert.equal(s.fromExif, false)
  assert.equal(s.startedAt, '2026-09-01T10:00:00.000Z')
})

test('centre is the median of geotagged photos, so one stray fix does not move it', () => {
  const s = summarizePhotos([
    { capturedAt: '2026-09-20T14:00:00Z', timeSource: 'exif', latitude: 39.64, longitude: -105.19 },
    { capturedAt: '2026-09-20T14:10:00Z', timeSource: 'exif', latitude: 39.65, longitude: -105.2 },
    { capturedAt: '2026-09-20T14:20:00Z', timeSource: 'exif', latitude: 10, longitude: 10 },
    { capturedAt: '2026-09-20T14:30:00Z', timeSource: 'exif' },
  ])
  assert.deepEqual(s.center, { latitude: 39.64, longitude: -105.19 })
  assert.equal(s.gpsCount, 3)
})

test('nothing usable gives null', () => {
  assert.equal(summarizePhotos([]), null)
  assert.equal(summarizePhotos([{ capturedAt: 'nope', timeSource: 'file' }]), null)
})

test('photo times are kept when the date matches; a changed date spans that day', () => {
  const s = summarizePhotos([{ capturedAt: '2026-09-20T18:00:00Z', timeSource: 'exif' }])
  assert.deepEqual(pastForayTimes(s.day, s), { startedAt: s.startedAt, endedAt: s.startedAt })
  const t = pastForayTimes('2026-08-02', s, new Date('2026-10-15T12:00:00Z'))
  assert.equal(t.startedAt, new Date(2026, 7, 2, 9).toISOString())
  assert.equal(t.endedAt, new Date(2026, 7, 2, 23, 59).toISOString())
})

test('a foray logged for today never ends in the future', () => {
  const now = new Date(2026, 9, 15, 14, 0)
  const t = pastForayTimes(localDay(now), null, now)
  assert.equal(t.endedAt, now.toISOString())
})

test('name uses the place when known', () => {
  assert.match(pastForayName('2026-09-20', 'Mount Falcon Park'), /^Mount Falcon Park · /)
  assert.match(pastForayName('2026-09-20'), /^Foray /)
})

test('place prefers parks and woods over towns', () => {
  assert.equal(placeFromNominatim({ address: { park: 'Mount Falcon Park', town: 'Morrison' } }), 'Mount Falcon Park')
  assert.equal(placeFromNominatim({ address: { town: 'Morrison', county: 'Jefferson County' } }), 'Morrison')
  assert.equal(placeFromNominatim({}), null)
})
