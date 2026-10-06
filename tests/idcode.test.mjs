import test from 'node:test'
import assert from 'node:assert/strict'
import { ID_ALPHABET, BLOCK_SIZE, checkChar, formatId, parseId, isValidId, pickBlock, normalizeCollector } from '../utils/idCode.ts'

test('format: collector-block-number-check, 8 chars for a 2-letter collector', () => {
  const id = formatId('SF', 'M', 42)
  assert.match(id, /^SF-M042[A-HJ-NP-Z2-9]$/)
  assert.equal(id.length, 8) // "SF-" + 5
  assert.equal(parseId(id).number, 42)
  assert.ok(isValidId(id))
})

test('alphabet has 32 unambiguous characters', () => {
  assert.equal(ID_ALPHABET.length, 32)
  for (const bad of ['I', 'O', '0', '1']) assert.ok(!ID_ALPHABET.includes(bad))
})

test('every single-character substitution is detected', () => {
  const id = formatId('SF', 'K', 7)
  const chars = id.split('')
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '-') continue
    const pool = i === 3 ? ID_ALPHABET : i >= 4 && i <= 6 ? '0123456789' : ID_ALPHABET
    for (const c of pool) {
      if (c === chars[i]) continue
      const t = chars.slice(); t[i] = c
      if (i < 2) continue // collector letters: any A-Z handled below
      assert.ok(!isValidId(t.join('')), `substituting position ${i} with ${c} in ${id} went undetected`)
    }
  }
  for (let i = 0; i < 2; i++) for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (c === id[i]) continue
    const t = id.split(''); t[i] = c
    assert.ok(!isValidId(t.join('')), `collector substitution ${c} undetected`)
  }
})

test('adjacent transpositions of digits and block/digit are detected', () => {
  let missed = 0, total = 0
  for (const block of ['A', 'M', 'Z', '7']) for (let n = 1; n <= BLOCK_SIZE; n += 7) {
    const id = formatId('SF', block, n)
    const body = id.slice(3, 8) // block + 3 digits + check
    for (let i = 0; i < body.length - 1; i++) {
      if (body[i] === body[i + 1]) continue
      const t = body.split(''); [t[i], t[i + 1]] = [t[i + 1], t[i]]
      const cand = id.slice(0, 3) + t.join('')
      // a transposed candidate must either fail the shape or the check
      total++
      if (isValidId(cand)) missed++
    }
  }
  assert.ok(total > 0)
  assert.equal(missed, 0, `${missed}/${total} adjacent swaps undetected`)
})

test('rejects bad shapes and out-of-range numbers', () => {
  assert.ok(!isValidId('SF-M000' + checkChar('SFM000')))
  assert.ok(!isValidId('FORAY-20261005-K7-001'))
  assert.ok(!isValidId('SF-O042K')) // O is not in the alphabet
  assert.throws(() => formatId('SF', 'M', 0))
  assert.throws(() => formatId('SF', 'M', 1000))
  assert.throws(() => formatId('SF', 'O', 5))
  assert.throws(() => formatId('S', 'M', 5))
})

test('all 999 numbers in a block are unique and valid', () => {
  const seen = new Set()
  for (let n = 1; n <= BLOCK_SIZE; n++) { const id = formatId('SF', 'M', n); assert.ok(isValidId(id)); seen.add(id) }
  assert.equal(seen.size, BLOCK_SIZE)
})

test('pickBlock avoids used blocks and returns null when exhausted', () => {
  assert.equal(pickBlock(['A'], () => 0), 'B')
  assert.equal(pickBlock(ID_ALPHABET.split('')), null)
  const used = ID_ALPHABET.split('').slice(1)
  assert.equal(pickBlock(used, () => 0.9), 'A')
})

test('collector normalisation', () => {
  assert.equal(normalizeCollector(' sf '), 'SF')
  assert.equal(normalizeCollector('s'), 'SF')
  assert.equal(normalizeCollector('abcd'), 'ABC')
  assert.equal(normalizeCollector(undefined), 'SF')
})
