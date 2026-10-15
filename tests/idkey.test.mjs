// Run: node --experimental-strip-types --test tests/idkey.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { KEY_SPECIES, QUESTIONS, rankSpecies, inRunning, nextQuestion, answersFromNotes, pickPatch, traitFit, UNSURE } from '../utils/idKey.ts'
import { SPECIES } from '../utils/mycoVocab.ts'

test('every built-in species is in the key, once', () => {
  const names = new Set()
  for (const s of KEY_SPECIES) for (const n of [s.name, ...s.aka]) {
    assert.ok(!names.has(n), `duplicate ${n}`)
    names.add(n)
  }
  const missing = SPECIES.filter((n) => !names.has(n))
  assert.deepEqual(missing, [])
  assert.ok(KEY_SPECIES.every((s) => s.common && s.traits.group?.length))
})

test('answering a species\' own traits keeps it in the running', () => {
  for (const sp of KEY_SPECIES) {
    const answers = Object.fromEntries(Object.entries(sp.traits).map(([q, v]) => [q, v[0]]))
    const ranked = rankSpecies(answers)
    assert.ok(inRunning(ranked).some((m) => m.species === sp), sp.name)
  }
})

test('walking the key always ends, asks nothing twice, and keeps the right species', () => {
  let worst = 0
  let total = 0
  for (const sp of KEY_SPECIES) {
    const answers = {}
    const asked = new Set()
    for (let i = 0; i < QUESTIONS.length + 1; i++) {
      const q = nextQuestion(answers)
      if (!q) break
      assert.ok(!asked.has(q.id), `${sp.name}: asked ${q.id} twice`)
      asked.add(q.id)
      answers[q.id] = sp.traits[q.id]?.[0] ?? UNSURE
    }
    assert.equal(nextQuestion(answers) === null || asked.size === QUESTIONS.length, true)
    const left = inRunning(rankSpecies(answers))
    assert.ok(left.some((m) => m.species === sp), sp.name)
    worst = Math.max(worst, left.length)
    total += left.length
  }
  // The table should tell species apart well enough to get to a short list.
  assert.ok(worst <= 10, `worst shortlist ${worst}`)
  assert.ok(total / KEY_SPECIES.length <= 4, `average shortlist ${total / KEY_SPECIES.length}`)
})

test('the type is asked first', () => {
  assert.equal(nextQuestion({}).id, 'group')
})

test('one wrong answer demotes but keeps a species', () => {
  const ranked = rankSpecies({ group: 'gills', sp: 'white', ring: 'y', volva: 'y', col: 'red', milk: 'y' })
  const fly = ranked.findIndex((m) => m.species.name === 'Amanita muscaria')
  assert.ok(fly >= 0 && fly < 10)
  assert.deepEqual(ranked[fly].misses, ['milk'])
  assert.ok(!inRunning(ranked).includes(ranked[fly]))
  const r2 = rankSpecies({ group: 'gills', sp: 'brown', ring: 'y', volva: 'y', col: 'red' })
  const m2 = r2.find((m) => m.species.name === 'Amanita muscaria')
  assert.deepEqual(m2.misses, ['sp'])
  assert.ok(r2.indexOf(m2) < 20)
})

test('close answers count half, unknowns not at all', () => {
  const chan = KEY_SPECIES.find((s) => s.name === 'Cantharellus cibarius')
  assert.equal(traitFit(chan, 'col', 'orange'), 1)
  assert.equal(traitFit(chan, 'col', 'brown'), -0.5)
  assert.equal(traitFit(chan, 'col', 'blue'), -1)
  assert.equal(traitFit(chan, 'milk', 'y'), 0)
  const stink = KEY_SPECIES.find((s) => s.name === 'Phallus impudicus')
  assert.equal(traitFit(stink, 'odor', 'none'), -1)
  assert.equal(traitFit(chan, 'odor', 'none'), 0)
  // One close answer keeps a species in the running; two drop it.
  const one = rankSpecies({ group: 'ridges', col: 'brown' }).find((m) => m.species === chan)
  assert.ok(inRunning([one]).length === 1)
  const two = rankSpecies({ group: 'ridges', col: 'brown', sz: 's' }).find((m) => m.species === chan)
  assert.ok(inRunning([two]).length === 0)
})

test('reads the field form', () => {
  const a = answersFromNotes({
    underside: 'gills', sporePrint: 'purple-brown', gillAttachment: 'free', stemFeatures: 'ring',
    capTexture: 'smooth', staining: 'bruises yellow', odor: 'anise', substrate: 'soil', hostTree: 'oak',
    capColor: 'white', growth: 'scattered', capSize: '12 cm across',
  })
  assert.deepEqual(a, { group: 'gills', sp: 'purple', att: 'free', ring: 'y', stain: 'yellow', odor: 'anise', sub: 'ground', host: 'hardwood', col: 'white', grow: 'single', sz: 'l' })
  const top = inRunning(rankSpecies(a)).map((m) => m.species.name)
  assert.ok(top.includes('Agaricus arvensis') || top.includes('Agaricus silvicola'))
  assert.deepEqual(answersFromNotes({ underside: 'pores', capColor: 'red and yellow', capSize: '2 in', substrate: 'decaying conifer' }), { sub: 'wood', host: 'conifer', sz: 'm' })
  assert.deepEqual(answersFromNotes({ staining: 'none', odor: 'mild', capSize: '8 mm' }), { stain: 'none', odor: 'none', sz: 's' })
})

test('picking a species fills the guess and only empty fields', () => {
  const p = pickPatch('Amanita muscaria', { group: 'gills', sp: 'white', ring: 'y', volva: 'y' }, { sporePrint: 'cream' })
  assert.deepEqual(p, { speciesGuess: 'Amanita muscaria?', underside: 'gills', stemFeatures: 'ring, volva' })
})
