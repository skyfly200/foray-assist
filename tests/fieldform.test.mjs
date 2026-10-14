// Run: node --experimental-strip-types --test tests/fieldform.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { FIELD_DEFS, FIELD_GROUPS, rulerTicks, rulerSvg } from '../utils/fieldForm.ts'
import { labelScaleTicks, LABEL_SCALE_MM } from '../utils/label.ts'

test('every field is in exactly one group', () => {
  const grouped = FIELD_GROUPS.flatMap((g) => g.keys)
  assert.equal(new Set(grouped).size, grouped.length)
  assert.deepEqual([...grouped].sort(), FIELD_DEFS.map((f) => f.key).sort())
})

test('ruler ticks: labelled whole units, mid and short ticks', () => {
  const t = rulerTicks(1, 10)
  assert.equal(t.length, 11)
  assert.deepEqual(t.map((x) => x.len), ['long', 'short', 'short', 'short', 'short', 'mid', 'short', 'short', 'short', 'short', 'long'])
  assert.deepEqual(t.filter((x) => x.label).map((x) => x.label), ['0', '1'])
})

test('paper ruler is sized in millimetres', () => {
  const svg = rulerSvg(150)
  assert.match(svg, /^<svg[^>]* width="160mm"[^>]* viewBox="0 0 160 22"/)
  // 151 cm/mm ticks + 47 eighth-inch ticks (5 7/8 in) + baseline
  assert.equal((svg.match(/<line /g) ?? []).length, 151 + 48 + 1)
  assert.match(svg, />15</)
})

test('label scale bar is true size at 203 dpi', () => {
  const t = labelScaleTicks()
  assert.equal(t.length, LABEL_SCALE_MM + 1)
  assert.equal(t[0].x, 0)
  assert.equal(t[10].x, 80) // 10 mm = 79.9 dots
  assert.equal(t[30].x, 240)
  assert.deepEqual(t.filter((x) => x.label).map((x) => x.label), ['0', '1', '2', '3'])
})

test('form config: hide, add, sanitise', async () => {
  const { normalizeFormConfig, formGroups, visibleKeys, customFieldKey, paginate } = await import('../utils/fieldForm.ts')
  const cfg = normalizeFormConfig({ hidden: ['capSize', 'bogus', 'staining', 'odor', 'sporePrint'], custom: [{ key: 'x_taste', label: ' Taste ', options: ['mild', ''] }, { key: 'bad key', label: 'x' }], perPage: 3 })
  assert.deepEqual(cfg.hidden, ['capSize', 'staining', 'odor', 'sporePrint'])
  assert.deepEqual(cfg.custom, [{ key: 'x_taste', label: 'Taste', options: ['mild'] }])
  assert.equal(cfg.perPage, 1)
  const ids = formGroups(cfg).map((g) => g.id)
  assert.ok(!ids.includes('tests')) // all of its fields hidden
  assert.equal(ids.at(-1), 'mine')
  const keys = visibleKeys(cfg)
  assert.ok(keys.has('x_taste') && keys.has('capColor') && !keys.has('capSize'))
  assert.equal(customFieldKey('Latex color!'), 'x_latex_color')
  assert.equal(customFieldKey('Taste', ['x_taste']), 'x_taste_2')
  assert.deepEqual(paginate([1, 2, 3], 2, true), [[1, 2], [3, null]])
  assert.deepEqual(paginate([], 4, true), [[null, null, null, null]])
})
