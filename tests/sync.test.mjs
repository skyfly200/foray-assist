import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyError, nextBackoffMs, shouldPark, pickNext, planFailure, countParked, countPending,
} from '../utils/syncPolicy.ts'

test('classifyError: transient', () => {
  assert.equal(classifyError(new TypeError('Failed to fetch')), 'transient')
  assert.equal(classifyError({ message: 'TypeError: Failed to fetch', code: '' }), 'transient')
  for (const status of [408, 425, 429, 500, 502, 503]) assert.equal(classifyError({ status }), 'transient')
  assert.equal(classifyError({ code: '57014', message: 'statement timeout' }), 'transient')
  assert.equal(classifyError({ code: '08006' }), 'transient')
  assert.equal(classifyError({ code: 'PGRST002' }), 'transient')
  assert.equal(classifyError({ name: 'AbortError' }), 'transient')
  assert.equal(classifyError(undefined), 'transient')
})

test('classifyError: auth pauses everything', () => {
  assert.equal(classifyError({ status: 401 }), 'auth')
  assert.equal(classifyError({ code: 'PGRST301', message: 'JWT expired' }), 'auth')
  assert.equal(classifyError({ message: 'Auth session missing!' }), 'auth')
})

test('classifyError: permanent', () => {
  assert.equal(classifyError({ code: '42501', message: 'new row violates row-level security policy' }), 'permanent')
  assert.equal(classifyError({ code: '23502', message: 'null value in column' }), 'permanent')
  assert.equal(classifyError({ code: '42703', message: 'column does not exist' }), 'permanent')
  assert.equal(classifyError({ code: 'PGRST204', message: 'column not found in schema cache' }), 'permanent')
  assert.equal(classifyError({ status: 400 }), 'permanent')
  assert.equal(classifyError({ status: 403 }), 'permanent')
  assert.equal(classifyError({ status: 413 }), 'permanent')
  assert.equal(classifyError({ statusCode: '404' }), 'permanent')
})

test('nextBackoffMs grows exponentially and caps', () => {
  assert.equal(nextBackoffMs(1), 2000)
  assert.equal(nextBackoffMs(2), 4000)
  assert.equal(nextBackoffMs(3), 8000)
  assert.equal(nextBackoffMs(100), 5 * 60_000)
  assert.equal(nextBackoffMs(0), 2000)
})

test('shouldPark thresholds', () => {
  assert.equal(shouldPark(4, 'permanent'), false)
  assert.equal(shouldPark(5, 'permanent'), true)
  assert.equal(shouldPark(5, 'transient'), false)
  assert.equal(shouldPark(30, 'transient'), true)
  assert.equal(shouldPark(99, 'auth'), false)
})

const it = (id, table, rowId, extra = {}) => ({ id, table, rowId, op: 'upsert', attempts: 0, ...extra })
const NOW = Date.parse('2026-01-01T00:00:00Z')
const iso = (ms) => new Date(ms).toISOString()

test('pickNext: FIFO among due, unrelated rows', () => {
  assert.equal(pickNext([it(2, 'specimens', 'b'), it(1, 'specimens', 'a')], NOW).id, 1)
  assert.equal(pickNext([], NOW), null)
})

test('pickNext: skips parked item and continues with unrelated rows', () => {
  const items = [it(1, 'specimens', 'a', { parkedAt: iso(NOW) }), it(2, 'specimens', 'b')]
  assert.equal(pickNext(items, NOW).id, 2)
})

test('pickNext: later op on a parked row stays blocked', () => {
  const items = [it(1, 'specimens', 'a', { parkedAt: iso(NOW) }), it(2, 'specimens', 'a', { op: 'delete' })]
  assert.equal(pickNext(items, NOW), null)
})

test('pickNext: later op on a backing-off row stays blocked; unrelated proceeds', () => {
  const items = [
    it(1, 'photos', 'p', { nextAttemptAt: iso(NOW + 5000) }),
    it(2, 'photos', 'p'),
    it(3, 'photos', 'q'),
  ]
  assert.equal(pickNext(items, NOW).id, 3)
  assert.equal(pickNext(items.slice(0, 2), NOW), null)
  assert.equal(pickNext(items.slice(0, 2), NOW + 5000).id, 1) // due again
})

test('pickNext: same rowId in different tables is independent', () => {
  const items = [it(1, 'photos', 'x', { parkedAt: iso(NOW) }), it(2, 'specimens', 'x')]
  assert.equal(pickNext(items, NOW).id, 2)
})

test('pickNext: legacy items without retry fields, bad dates are due', () => {
  assert.equal(pickNext([it(1, 'forays', 'f', { nextAttemptAt: 'garbage' })], NOW).id, 1)
})

test('planFailure: permanent backs off then parks at 5, drain continues', () => {
  let item = it(1, 'specimens', 'a')
  for (let n = 1; n <= 4; n++) {
    const p = planFailure(item, { code: '42501', message: 'rls' }, NOW)
    assert.equal(p.cls, 'permanent')
    assert.equal(p.stop, false)
    assert.equal(p.patch.attempts, n)
    assert.equal(p.patch.parkedAt, undefined)
    assert.equal(p.patch.nextAttemptAt, iso(NOW + nextBackoffMs(n)))
    item = { ...item, ...p.patch }
  }
  const last = planFailure(item, { code: '42501', message: 'rls' }, NOW)
  assert.equal(last.patch.attempts, 5)
  assert.equal(last.patch.parkedAt, iso(NOW))
  assert.equal(last.patch.nextAttemptAt, undefined)
  assert.match(last.patch.lastError, /42501/)
})

test('planFailure: transient stops drain, does not park at 5', () => {
  const p = planFailure(it(1, 'specimens', 'a', { attempts: 4 }), new TypeError('Failed to fetch'), NOW)
  assert.equal(p.cls, 'transient')
  assert.equal(p.stop, true)
  assert.equal(p.patch.parkedAt, undefined)
  assert.equal(p.patch.attempts, 5)
})

test('planFailure: auth stops drain and does not count an attempt', () => {
  const p = planFailure(it(1, 'specimens', 'a', { attempts: 2 }), { status: 401 }, NOW)
  assert.equal(p.stop, true)
  assert.equal(p.patch.attempts, undefined)
})

test('counts exclude parked from pending', () => {
  const items = [it(1, 'a', '1', { parkedAt: iso(NOW) }), it(2, 'a', '2'), it(3, 'a', '3')]
  assert.equal(countParked(items), 1)
  assert.equal(countPending(items), 2)
})
