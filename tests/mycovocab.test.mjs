// Run: node --experimental-strip-types --test tests/mycovocab.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWhisperPrompt, correctTranscript, parseNameList, levenshtein } from '../utils/mycoVocab.ts'

test('levenshtein', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3)
  assert.equal(levenshtein('', 'abc'), 3)
})

test('prompt puts foray names first and includes glossary', () => {
  const p = buildWhisperPrompt(['Russula paludosa'])
  assert.ok(p.indexOf('Russula paludosa') < p.indexOf('Amanita muscaria'))
  for (const w of ['stipe', 'umbo', 'spore print']) assert.ok(p.includes(w), w)
})

test('fixes glossary mishearings', () => {
  assert.equal(correctTranscript('Stype is white with a small umbow and a volvo'), 'Stipe is white with a small umbo and a volva')
  assert.equal(correctTranscript('spoor print brown'), 'spore print brown')
})

test('snaps misspelled and split binomials', () => {
  assert.equal(correctTranscript('found amanita muscarea under birch'), 'found Amanita muscaria under birch')
  assert.equal(correctTranscript('this is a monita muscaria.'), 'this is Amanita muscaria.')
  assert.equal(correctTranscript('Can tharellus cibarius on moss'), 'Cantharellus cibarius on moss')
  assert.equal(correctTranscript('Laetiporus sulfureus, on oak'), 'Laetiporus sulphureus, on oak')
  assert.equal(correctTranscript('Hericium erinacious'), 'Hericium erinaceus')
})

test('does not swallow neighbouring words', () => {
  assert.equal(correctTranscript('an amanita muscaria is here'), 'an Amanita muscaria is here')
  assert.equal(correctTranscript('the russula emetica'), 'the Russula emetica')
})

test('genus alone', () => {
  assert.equal(correctTranscript('probably a russula'), 'probably a Russula')
  assert.equal(correctTranscript('some kind of lactarious'), 'some kind of Lactarius')
})

test('leaves unknown species of a known genus alone', () => {
  assert.equal(correctTranscript('Russula paludosa near pine'), 'Russula paludosa near pine')
})

test('extra names are used', () => {
  assert.equal(correctTranscript('Russula paludosah near pine', ['Russula paludosa']), 'Russula paludosa near pine')
})

test('leaves ordinary sentences alone', () => {
  const s = 'Cap is three centimetres wide, smells like radish, growing on a rotting log near the trail.'
  assert.equal(correctTranscript(s), s)
})

test('parseNameList', () => {
  assert.deepEqual(parseNameList('Russula paludosa\n Suillus  lakei, Boletus edulis;'), ['Russula paludosa', 'Suillus lakei', 'Boletus edulis'])
})
