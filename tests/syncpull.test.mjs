import test from 'node:test'
import assert from 'node:assert/strict'
import {
  remoteToLocal, shouldApply, rowsDeletedElsewhere, pullSince, advanceCursor, PULL_OVERLAP_MS,
} from '../utils/syncPull.ts'

test('remoteToLocal maps columns and drops server-only ones', () => {
  const s = remoteToLocal('specimens', {
    id: 'a', user_id: 'u', specimen_id: 'B7QM4T9RX', foray_id: 'f', field_notes: { habitat: 'oak' },
    inat_observation_id: 42, voucher_id: null, updated_at: '2026-10-15T02:00:00+00:00', synced_at: 'x',
  })
  assert.deepEqual(s, {
    id: 'a', specimenId: 'B7QM4T9RX', forayId: 'f', fieldNotes: { habitat: 'oak' },
    iNatObservationId: 42, updatedAt: '2026-10-15T02:00:00+00:00',
  })
  const p = remoteToLocal('photos', { id: 'p', specimen_row_id: null, storage_path: 'u/photos/p' })
  assert.equal(p.specimenRowId, '')
  assert.equal(p.storagePath, 'u/photos/p') // the image downloads later from here
  const f = remoteToLocal('forays', { id: 'f', name: 'N', join_code: 'ABCD', mesh_key: 'k', society_id: null })
  assert.deepEqual(f, { id: 'f', name: 'N' })
})

test('shouldApply: last write wins, local queued edits are kept', () => {
  assert.equal(shouldApply(undefined, '2026-10-15T02:00:00Z', false), true)
  assert.equal(shouldApply({ updatedAt: '2026-10-15T01:00:00.000Z' }, '2026-10-15T02:00:00+00:00', false), true)
  assert.equal(shouldApply({ updatedAt: '2026-10-15T02:00:00.000Z' }, '2026-10-15T02:00:00+00:00', false), false)
  assert.equal(shouldApply({ updatedAt: '2026-10-15T03:00:00.000Z' }, '2026-10-15T02:00:00+00:00', false), false)
  assert.equal(shouldApply(undefined, '2026-10-15T02:00:00Z', true), false)
})

test('rowsDeletedElsewhere only removes synced, unqueued, own rows the server lacks', () => {
  const local = [
    { id: 'kept', syncedAt: 't' },
    { id: 'gone', syncedAt: 't' },
    { id: 'never-synced' },
    { id: 'queued', syncedAt: 't' },
    { id: 'joined', syncedAt: 't', joined: true },
  ]
  assert.deepEqual(rowsDeletedElsewhere(local, new Set(['kept', 'other']), new Set(['queued']), true), ['gone'])
  // the last row of a table was deleted elsewhere, other tables still have rows
  assert.deepEqual(rowsDeletedElsewhere([{ id: 'x', syncedAt: 't' }], new Set(), new Set(), true), ['x'])
  // server has nothing at all for the account: never wipe the device
  assert.deepEqual(rowsDeletedElsewhere(local, new Set(), new Set(), false), [])
})

test('cursor: full pull without one, overlap with one, advances to newest', () => {
  assert.equal(pullSince(undefined), null)
  const c = '2026-10-15T02:00:00.000Z'
  assert.equal(Date.parse(pullSince(c)), Date.parse(c) - PULL_OVERLAP_MS)
  assert.equal(advanceCursor(c, [{ synced_at: '2026-10-15T01:00:00+00:00' }, { synced_at: '2026-10-15T02:30:00+00:00' }]), '2026-10-15T02:30:00.000Z')
  assert.equal(advanceCursor(c, []), c)
  assert.equal(advanceCursor(undefined, []), undefined)
})
