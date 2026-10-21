// Run: node --experimental-strip-types --test tests/forayname.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultForayName, forayDateLabel, isDateOnlyName, nearestCachedPlace, medianPoint, dayOf } from '../utils/forayName.ts'

test('default name has the place and date, or just the date', () => {
  const date = forayDateLabel('2026-10-03')
  assert.equal(defaultForayName('2026-10-03', 'Mount Falcon Park'), `Mount Falcon Park · ${date}`)
  assert.equal(defaultForayName('2026-10-03', '  '), `Foray ${date}`)
  assert.equal(defaultForayName('2026-10-03'), `Foray ${date}`)
})

test('date-only names are recognised, in the new and the old format', () => {
  const started = new Date(2026, 9, 3, 10).toISOString()
  assert.equal(dayOf(started), '2026-10-03')
  assert.equal(isDateOnlyName(defaultForayName('2026-10-03'), started), true)
  assert.equal(isDateOnlyName(`Foray ${new Date(started).toLocaleDateString()}`, started), true)
})

test('user titles and named forays are left alone', () => {
  const started = new Date(2026, 9, 3, 10).toISOString()
  assert.equal(isDateOnlyName('Chanterelle hunt', started), false)
  assert.equal(isDateOnlyName(defaultForayName('2026-10-03', 'Mount Falcon Park'), started), false)
  // a date-only name for a different day was typed by someone, not made by the app
  assert.equal(isDateOnlyName(defaultForayName('2026-10-04'), started), false)
})

test('a cached place is reused nearby, not far away', () => {
  const cache = [
    { latitude: 39.64, longitude: -105.19, name: 'Mount Falcon Park' },
    { latitude: 39.75, longitude: -105.22, name: 'Golden' },
  ]
  assert.equal(nearestCachedPlace(cache, { latitude: 39.645, longitude: -105.195 }), 'Mount Falcon Park')
  assert.equal(nearestCachedPlace(cache, { latitude: 40.5, longitude: -105.0 }), null)
  assert.equal(nearestCachedPlace([], { latitude: 0, longitude: 0 }), null)
})

test('median point ignores rows without GPS and stray fixes', () => {
  assert.equal(medianPoint([{}, {}]), null)
  assert.deepEqual(medianPoint([
    { latitude: 39.64, longitude: -105.19 },
    { latitude: 39.65, longitude: -105.2 },
    { latitude: 10, longitude: 10 },
    {},
  ]), { latitude: 39.64, longitude: -105.19 })
})
