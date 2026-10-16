// Run: node --experimental-strip-types --test tests/score.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { checklist, computeScores, shotsDone, thoroughness, MIN_THOROUGHNESS } from '../utils/score.ts'

const find = (id, day, notes = {}, extra = {}) => ({ id, forayId: 'f1', timestamp: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`, fieldNotes: notes, ...extra })
const full = { speciesGuess: 'Amanita muscaria', habitat: 'mixed woods', capColor: 'red', gillColor: 'white', stemFeatures: 'ring', odor: 'none', sporePrint: 'white' }
const allShots = (id) => ['cap', 'underside', 'stem', 'habitat'].map((angle) => ({ specimenRowId: id, angle }))

test('tagged shots fill their angle; untagged photos fill the rest in order', () => {
  assert.deepEqual(shotsDone([{ specimenRowId: 'a', angle: 'stem' }, { specimenRowId: 'a' }]), { cap: true, underside: false, stem: true, habitat: false })
  assert.deepEqual(shotsDone([]), { cap: false, underside: false, stem: false, habitat: false })
})

test('a fully documented find is 100%', () => {
  const f = find('a', 1, full, { latitude: 1, longitude: 2, specimenId: 'B7QM4T9RX' })
  const items = checklist(f, allShots('a'), 1)
  assert.equal(items.filter((i) => !i.done).length, 0)
  assert.equal(thoroughness(items), 1)
})

test('an empty find is 0%', () => {
  assert.equal(thoroughness(checklist(find('a', 1), [], 0)), 0)
})

test('finds count only from the minimum thoroughness; species come from counted finds', () => {
  const good = find('a', 1, full, { latitude: 1, longitude: 2, specimenId: 'X' })
  const thin = find('b', 1, { speciesGuess: 'Russula emetica' })
  const s = computeScores([good, thin], allShots('a'), { a: 1 })
  assert.equal(s.total, 2)
  assert.equal(s.finds, 1)
  assert.equal(s.species, 1)
  assert.equal(s.complete, 1)
  assert.ok(s.perFind.b < MIN_THOROUGHNESS)
  assert.equal(s.thoroughness, (1 + s.perFind.b) / 2)
  assert.deepEqual(s.perForay, [{ forayId: 'f1', finds: 1, species: 1, thoroughness: s.thoroughness }])
  assert.equal(s.badges.find((b) => b.id === 'first-complete').earned, true)
  assert.equal(s.badges.find((b) => b.id === 'ten-finds').detail, 'Ten counted finds (1 of 10)')
})

test('streaks count days in a row with a counted find', () => {
  const ids = ['a', 'b', 'c', 'd']
  const finds = [find('a', 1, full), find('b', 2, full), find('c', 3, full), find('d', 7, full)]
  const s = computeScores(finds, ids.flatMap(allShots), Object.fromEntries(ids.map((i) => [i, 1])))
  assert.deepEqual(s.streak, { current: 1, best: 3 })
  assert.equal(s.badges.find((b) => b.id === 'streak-3').earned, true)
})
