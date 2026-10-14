// Run: node --experimental-strip-types --test tests/authflow.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { isNewUser, landingPath, openForay, safeReturnPath } from '../utils/authFlow.ts'

test('safeReturnPath keeps in-app pages and drops anything off-site', () => {
  assert.equal(safeReturnPath('/join/ABCDEFGH'), '/join/ABCDEFGH')
  assert.equal(safeReturnPath('/forays/x?tab=map#top'), '/forays/x?tab=map#top')
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'forays/x', '', null, 42, '/a\nb'])
    assert.equal(safeReturnPath(bad), '', String(bad))
})

test('safeReturnPath skips pages not worth returning to', () => {
  for (const p of ['/', '/settings', '/settings?x=1', '/auth/callback', '/welcome']) assert.equal(safeReturnPath(p), '', p)
  assert.equal(safeReturnPath('/settingsx'), '/settingsx')
})

test('isNewUser: fresh account without the flag', () => {
  const now = Date.parse('2026-10-14T12:00:00Z')
  const fresh = { created_at: '2026-10-14T11:55:00Z', last_sign_in_at: '2026-10-14T11:58:00Z' }
  assert.equal(isNewUser(fresh, now), true)
  assert.equal(isNewUser({ ...fresh, user_metadata: { welcomed: true } }, now), false)
  // Link opened the next morning still counts as first sign-in.
  assert.equal(isNewUser({ created_at: '2026-10-13T20:00:00Z', last_sign_in_at: '2026-10-14T08:00:00Z' }, now), true)
  // Accounts from before the welcome existed go straight in.
  assert.equal(isNewUser({ created_at: '2026-10-01T10:00:00Z', last_sign_in_at: '2026-10-14T11:58:00Z' }, now), false)
  assert.equal(isNewUser(null, now), false)
  assert.equal(isNewUser({}, now), false)
})

test('returning users land on their page, else the open foray, else home', () => {
  const forays = [
    { id: 'old', startedAt: '2026-10-01T09:00:00Z', endedAt: '2026-10-01T15:00:00Z' },
    { id: 'a', startedAt: '2026-10-10T09:00:00Z' },
    { id: 'b', startedAt: '2026-10-12T09:00:00Z' },
  ]
  assert.equal(openForay(forays)?.id, 'b')
  assert.equal(landingPath('/join/ABCDEFGH', forays), '/join/ABCDEFGH')
  assert.equal(landingPath('/settings', forays), '/forays/b')
  assert.equal(landingPath('', [forays[0]]), '/')
  assert.equal(landingPath(undefined, []), '/')
})
