import test from 'node:test'
import assert from 'node:assert/strict'
import { formatId, displayId } from '../utils/idCode.ts'
import { buildObservationPayload, composeDescription, parseCreatedId, backoffMs, authorizeUrl, signState, verifyState } from '../server/utils/inat.ts'

const find = {
  specimenId: formatId('B7QM', 5, 42), timestamp: '2026-10-05T14:30:00.000Z',
  latitude: 45.1, longitude: -122.5, geoprivacy: 'open',
  fieldNotes: { speciesGuess: ' Cantharellus ', substrate: 'soil', hostTree: 'Douglas fir', notes: 'Fruity odor' },
}

test('maps a find to an observation payload', () => {
  const { observation: o } = buildObservationPayload({ ...find, positionalAccuracy: 12.4 })
  assert.equal(o.observed_on_string, find.timestamp)
  assert.equal(o.latitude, 45.1); assert.equal(o.longitude, -122.5)
  assert.equal(o.geoprivacy, 'open'); assert.equal(o.species_guess, 'Cantharellus')
  assert.equal(o.positional_accuracy, 12)
  assert.match(o.description, /Fruity odor[\s\S]*Substrate: soil[\s\S]*Host tree: Douglas fir[\s\S]*Specimen ID: /)
  assert.ok(o.description.endsWith('Specimen ID: ' + displayId(find.specimenId)))
  assert.match(displayId(find.specimenId), /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]$/)
})
test('omits coords/accuracy when missing; defaults geoprivacy to obscured', () => {
  const { observation: o } = buildObservationPayload({ timestamp: find.timestamp, positionalAccuracy: 5, geoprivacy: 'bogus' })
  assert.equal('latitude' in o, false); assert.equal('positional_accuracy' in o, false)
  assert.equal('species_guess' in o, false); assert.equal(o.geoprivacy, 'obscured')
})
test('rejects bad timestamp', () => assert.throws(() => buildObservationPayload({ timestamp: 'nope' })))
test('empty description', () => assert.equal(composeDescription({ timestamp: 'x' }), ''))
test('parseCreatedId', () => {
  assert.equal(parseCreatedId([{ id: 7 }]), 7); assert.equal(parseCreatedId({ results: [{ id: 8 }] }), 8)
  assert.equal(parseCreatedId({}), undefined)
})
test('backoff', () => { assert.equal(backoffMs(0), 500); assert.equal(backoffMs(9), 4000); assert.equal(backoffMs(0, '2'), 2000) })
test('authorizeUrl', () => {
  const u = new URL(authorizeUrl('id', 'https://a.b/api/inat/callback', 's'))
  assert.equal(u.pathname, '/oauth/authorize'); assert.equal(u.searchParams.get('response_type'), 'code')
})
test('state binds user, rejects tamper/expiry/wrong secret', async () => {
  const s = await signState('sec', 'user-1')
  assert.equal(await verifyState('sec', s), 'user-1')
  assert.equal(await verifyState('other', s), null)
  assert.equal(await verifyState('sec', s.slice(0, -2) + '00'), null)
  assert.equal(await verifyState('sec', await signState('sec', 'u', -1)), null)
})
