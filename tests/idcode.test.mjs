import test from 'node:test'
import assert from 'node:assert/strict'
import { ID_ALPHABET, SET_SIZE, classOf, checkChar, encodeB32, decodeB32, formatId, parseId, isValidId, displayId, normalizeId, isPendingId } from '../utils/idCode.ts'
import { remaining, takeId, mergeSets, needsRefill } from '../utils/idStock.ts'

test('alphabet: 32 unambiguous symbols', () => {
  assert.equal(ID_ALPHABET.length, 32)
  assert.equal(new Set(ID_ALPHABET).size, 32)
  for (const bad of ['I', 'O', '0', '1']) assert.ok(!ID_ALPHABET.includes(bad))
})

test('base-32 round trip and bounds', () => {
  for (const n of [0, 1, 31, 32, 1023, 32767]) assert.equal(decodeB32(encodeB32(n, 3)), n)
  assert.throws(() => encodeB32(1024, 2))
  assert.throws(() => encodeB32(-1, 2))
})

test('format: 9 chars, class + network 4, set 2, obs 2, check 1', () => {
  const id = formatId('B7QM', 5, 42)
  assert.equal(id.length, 9)
  const p = parseId(id)
  assert.deepEqual({ k: p.kind, n: p.network, s: p.set, o: p.obs }, { k: 'personal', n: 'B7QM', s: 5, o: 42 })
  assert.ok(isValidId(id))
  assert.match(displayId(id), /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]$/)
})

test('display accepts separators, spaces and lower case', () => {
  const id = formatId('B7QM', 5, 42)
  const shown = displayId(id)
  assert.ok(isValidId(shown))
  assert.ok(isValidId(shown.toLowerCase()))
  assert.ok(isValidId(shown.replace(/-/g, ' ')))
  assert.equal(normalizeId(shown), id)
})

test('first character selects the layout', () => {
  assert.equal(classOf('A').kind, 'personal'); assert.equal(classOf('H').kind, 'personal')
  assert.equal(classOf('J').kind, 'extended'); assert.equal(classOf('N').length, 12)
  assert.equal(classOf('P').kind, 'local'); assert.equal(classOf('T').kind, 'local')
  assert.equal(classOf('U').kind, 'society'); assert.equal(classOf('Z').kind, 'society')
  assert.equal(classOf('2').kind, 'reserved'); assert.equal(classOf('9').length, null)
  assert.equal(classOf('O'), null)
  // each class char appears in exactly one class
  const counts = {}
  for (const c of ID_ALPHABET) counts[classOf(c).kind] = (counts[classOf(c).kind] ?? 0) + 1
  assert.deepEqual(counts, { personal: 8, extended: 5, local: 5, society: 6, reserved: 8 })
})

test('society and extended layouts format and validate', () => {
  const soc = formatId('U2KD', 3, 7)
  assert.equal(parseId(soc).kind, 'society'); assert.ok(isValidId(soc))
  assert.equal(formatId('J2345', 9, 9).length, 12)
  assert.ok(isValidId(formatId('J2345', 9, 9)))
  assert.equal(displayId(formatId('J2345', 9, 9)).length, 14)
})

test('every single-character substitution is detected', () => {
  let tested = 0
  for (const base of [formatId('B7QM', 5, 42), formatId('AAAA', 0, 0), formatId('H999', 1023, 1023), formatId('U2KD', 3, 7)]) {
    for (let i = 0; i < base.length; i++) for (const c of ID_ALPHABET) {
      if (c === base[i]) continue
      const t = base.slice(0, i) + c + base.slice(i + 1)
      assert.ok(!isValidId(t), `${base} -> ${t} (position ${i}) went undetected`)
      tested++
    }
  }
  assert.ok(tested > 1000)
})

test('every adjacent transposition is detected (random sample)', () => {
  let seed = 12345
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  let tested = 0
  for (let n = 0; n < 4000; n++) {
    const id = formatId(ID_ALPHABET[Math.floor(rnd() * 8)] + Array.from({ length: 3 }, () => ID_ALPHABET[Math.floor(rnd() * 32)]).join(''), Math.floor(rnd() * 1024), Math.floor(rnd() * 1024))
    for (let i = 0; i < id.length - 1; i++) {
      if (id[i] === id[i + 1]) continue
      const t = id.slice(0, i) + id[i + 1] + id[i] + id.slice(i + 2)
      assert.ok(!isValidId(t), `${id} -> ${t} (swap at ${i}) went undetected`)
      tested++
    }
  }
  assert.ok(tested > 20000)
})

test('rejects wrong length, unknown class, ambiguous characters, old formats', () => {
  const id = formatId('B7QM', 5, 42)
  assert.ok(!isValidId(id.slice(0, 8)))
  assert.ok(!isValidId(id + 'A'))
  assert.ok(!isValidId('SF-M042K'))
  assert.ok(!isValidId('FORAY-20261005-K7-001'))
  assert.ok(!isValidId(''))
  assert.ok(!isValidId(id.replace(/[A-Z2-9]/, 'O')))
  assert.equal(parseId('29999999A'), null) // reserved class has no layout yet
  assert.throws(() => formatId('B7Q', 0, 0))
  assert.throws(() => formatId('B7QM', 1024, 0))
  assert.throws(() => formatId('B7QM', 0, 1024))
  assert.throws(() => formatId('29AB', 0, 0))
})

test('all 1024 IDs in a set are unique and valid', () => {
  const seen = new Set()
  for (let o = 0; o < SET_SIZE; o++) { const id = formatId('B7QM', 3, o); assert.ok(isValidId(id)); seen.add(id) }
  assert.equal(seen.size, SET_SIZE)
})

test('check character is deterministic over the payload', () => {
  const payload = 'B7QM4T9'
  assert.equal(checkChar(payload), checkChar(payload))
  assert.ok(ID_ALPHABET.includes(checkChar(payload)))
})

test('pending IDs are the empty string', () => {
  assert.ok(isPendingId('')); assert.ok(isPendingId(undefined)); assert.ok(!isPendingId('B7QM4T9RX'))
})

test('stock: IDs come out in order, then run dry and refill', () => {
  let sets = mergeSets([], [{ network: 'B7QM', set: 0 }, { network: 'B7QM', set: 1 }])
  assert.equal(remaining(sets), 2048)
  const seen = new Set()
  for (let i = 0; i < 2048; i++) {
    const r = takeId(sets); assert.ok(r.id && isValidId(r.id)); assert.ok(!seen.has(r.id)); seen.add(r.id); sets = r.sets
  }
  assert.equal(remaining(sets), 0)
  assert.equal(takeId(sets).id, null)
  assert.ok(needsRefill(sets))
  sets = mergeSets(sets, [{ network: 'B7QM', set: 1 }, { network: 'B7QM', set: 2 }]) // set 1 already known
  assert.equal(sets.length, 3)
  assert.equal(remaining(sets), 1024)
  assert.ok(!seen.has(takeId(sets).id))
})

test('takeId does not mutate its input', () => {
  const sets = [{ network: 'B7QM', set: 0, next: 5 }]
  const r = takeId(sets)
  assert.equal(sets[0].next, 5)
  assert.equal(r.sets[0].next, 6)
})
