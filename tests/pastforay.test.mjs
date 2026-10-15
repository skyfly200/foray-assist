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

import { photoStamp, findStamp, FRESH_PHOTO_MS } from '../utils/pastForay.ts'
import { pickCaptureForay } from '../utils/captureTarget.ts'

const NOW = Date.parse('2026-10-15T18:00:00Z')

test('an old photo keeps its own time and never borrows the device position', () => {
  const s = photoStamp({ capturedAt: '2026-09-20T14:00:00Z', timeSource: 'exif' }, NOW)
  assert.deepEqual(s, { timestamp: '2026-09-20T14:00:00Z', useDevicePosition: false })
})

test('a photo taken just now may use the device position; its own GPS still wins', () => {
  const fresh = new Date(NOW - 60_000).toISOString()
  assert.equal(photoStamp({ capturedAt: fresh, timeSource: 'exif' }, NOW).useDevicePosition, true)
  const g = photoStamp({ capturedAt: fresh, timeSource: 'exif', latitude: 1, longitude: 2 }, NOW)
  assert.equal(g.latitude, 1)
})

test('an old gallery file counts as old even without EXIF', () => {
  assert.equal(photoStamp({ capturedAt: '2026-09-20T14:00:00Z', timeSource: 'file' }, NOW).useDevicePosition, false)
})

test('a find from old photos takes the earliest time and their place', () => {
  const s = findStamp([
    { capturedAt: '2026-09-20T14:10:00Z', timeSource: 'exif', latitude: 39.6, longitude: -105.2 },
    { capturedAt: '2026-09-20T14:00:00Z', timeSource: 'exif' },
  ], NOW)
  assert.deepEqual(s, { timestamp: '2026-09-20T14:00:00.000Z', latitude: 39.6, longitude: -105.2, useDevicePosition: false })
})

test('a find from fresh photos is stamped now', () => {
  const s = findStamp([{ capturedAt: new Date(NOW - FRESH_PHOTO_MS / 2).toISOString(), timeSource: 'exif' }], NOW)
  assert.equal(s.timestamp, new Date(NOW).toISOString())
  assert.equal(s.useDevicePosition, true)
})

const fr = (id, start, end) => ({ id, startedAt: start, endedAt: end })

test('old photos go to the foray they were taken during, not the open one', () => {
  const forays = [fr('past', '2026-09-20T13:00:00Z', '2026-09-20T16:00:00Z'), fr('open', '2026-10-15T17:00:00Z')]
  assert.equal(pickCaptureForay(forays, null, '2026-09-20T14:00:00Z', NOW), 'past')
})

test('old photos with no matching foray get null, so a past foray is started', () => {
  assert.equal(pickCaptureForay([fr('open', '2026-10-15T17:00:00Z')], null, '2026-09-20T14:00:00Z', NOW), null)
})

test('the foray on screen still wins for old photos', () => {
  assert.equal(pickCaptureForay([fr('a', '2026-10-01T10:00:00Z')], 'a', '2026-09-20T14:00:00Z', NOW), 'a')
})
