// Run: node --experimental-strip-types --test tests/voiceextract.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { extractFieldNotes as x, voicePatch } from '../utils/voiceExtract.ts'

test('a typical field note', () => {
  const r = x('Brown convex cap about 6 centimeters across, white gills, smells like anise. Growing under oaks in mixed woods.')
  assert.equal(r.capColor, 'brown')
  assert.equal(r.capShape, 'convex')
  assert.equal(r.capSize, '6 cm across')
  assert.equal(r.gillColor, 'white')
  assert.equal(r.underside, 'gills')
  assert.equal(r.odor, 'anise')
  assert.equal(r.hostTree, 'oak')
  assert.equal(r.habitat, 'mixed woods')
})

test('colours go to the nearest part', () => {
  const r = x('The cap is reddish brown and the gills are pale yellow. Stem is white.')
  assert.equal(r.capColor, 'reddish brown')
  assert.equal(r.gillColor, 'pale yellow')
  assert.equal(r.stemColor, 'white')
  const r2 = x('cap orange, gills white to cream')
  assert.equal(r2.capColor, 'orange')
  assert.equal(r2.gillColor, 'white to cream')
})

test('sizes with ranges, number words and stem dimensions', () => {
  const r = x('Cap three to five cm wide. The stem is eight centimeters long and one and a half centimeters thick.')
  assert.equal(r.capSize, '3-5 cm wide')
  assert.equal(r.stemSize, '8 cm long, 1.5 cm thick')
  assert.equal(x('cap 2 inches across').capSize, '2 inches across')
  assert.equal(x('the stem is 10cm tall').stemSize, '10 cm tall')
})

test('staining, including negation, does not leak into colours', () => {
  const r = x('The pores bruise blue when touched. Cap is brown.')
  assert.equal(r.staining, 'bruises blue')
  assert.equal(r.underside, 'pores')
  assert.equal(r.gillColor, undefined)
  assert.equal(r.capColor, 'brown')
  assert.equal(x('no staining at all').staining, 'none')
  assert.equal(x('the flesh turns yellow when cut').staining, 'bruises yellow')
  assert.equal(x('cap turns brown with age').staining, undefined)
})

test('odor', () => {
  assert.equal(x('it smells mealy, like cucumber').odor, 'farinaceous')
  assert.equal(x('no smell').odor, 'none')
  assert.equal(x("it doesn't smell like anything").odor, 'none')
  assert.equal(x('smells like apricots').odor, 'fruity')
  assert.equal(x('smells like bubblegum').odor, 'bubblegum')
  assert.equal(x('strong licorice odor').odor, 'anise')
})

test('spore print', () => {
  assert.equal(x('spore print is purple brown').sporePrint, 'purple brown')
  assert.equal(x('white spore print').sporePrint, 'white')
})

test('stem features and gill attachment', () => {
  const r = x('Gills are decurrent. The stem has a ring and a bulbous base with a volva. Stem is hollow.')
  assert.equal(r.gillAttachment, 'decurrent')
  assert.equal(r.stemFeatures, 'ring, bulbous base, volva, hollow')
  assert.equal(x('free gills, no ring').gillAttachment, 'free')
  assert.equal(x('free gills, no ring').stemFeatures, 'no ring')
  assert.equal(x('gills running down the stem').gillAttachment, 'decurrent')
})

test('texture goes to cap unless the stem is named', () => {
  const r = x('Cap slimy, stem fibrous')
  assert.equal(r.capTexture, 'slimy')
  assert.equal(r.stemFeatures, 'fibrous')
  assert.equal(x('it is sticky').capTexture, 'sticky')
})

test('substrate, growth and hosts', () => {
  const r = x('A cluster growing on a rotting pine log')
  assert.equal(r.growth, 'clustered')
  assert.equal(r.substrate, 'decaying conifer')
  assert.equal(r.hostTree, 'pine')
  assert.equal(x('on a dead oak stump').substrate, 'hardwood log')
  assert.equal(x('growing in moss near hemlock and douglas fir').hostTree, 'hemlock, Douglas fir')
  assert.equal(x('growing in moss near hemlock and douglas fir').substrate, 'moss')
  assert.equal(x('scattered in the grass').habitat, 'lawn/grass')
  assert.equal(x('in a fairy ring on the lawn').growth, 'fairy ring')
  assert.equal(x('in a fairy ring on the lawn').stemFeatures, undefined)
  assert.equal(x('shelving brackets on a living maple').substrate, 'living tree')
  assert.equal(x('growing from soil').substrate, 'soil')
})

test('species and genus', () => {
  assert.equal(x('I think this is Cantharellus cibarius').speciesGuess, 'Cantharellus cibarius')
  assert.equal(x('Some kind of russula').speciesGuess, 'Russula')
  assert.equal(x('looks like Russula paludosa', ['Russula paludosa']).speciesGuess, 'Russula paludosa')
  assert.equal(x('a brown mushroom').speciesGuess, undefined)
})

test('a later correction wins for single-value fields', () => {
  assert.equal(x('It has gills. Actually no, it has pores.').underside, 'pores')
})

test('mushroom stands in for cap only when no cap is named', () => {
  assert.equal(x('a small brown mushroom').capColor, 'brown')
})

test('nothing to find', () => {
  assert.deepEqual(x(''), {})
  assert.deepEqual(x('okay let me get the camera'), {})
})

test('voicePatch fills empty fields and its own earlier values, never typed ones', () => {
  const cur = { capColor: 'tan', odor: 'mild', gillColor: 'white' }
  const ext = { capColor: 'brown', odor: 'anise', gillColor: 'white', stemColor: 'red' }
  assert.deepEqual(voicePatch(cur, ext, { odor: 'mild' }), { odor: 'anise', stemColor: 'red' })
})

test('coloured warts and scales are texture, not colour', () => {
  const r = x('Red cap with white warts, white gills free')
  assert.equal(r.capColor, 'red')
  assert.equal(r.capTexture, 'white warts')
  assert.equal(r.gillColor, 'white')
})

test('common names fill the species guess when no Latin name is said', () => {
  assert.equal(x('looks like a chanterelle').speciesGuess, 'Cantharellus')
  assert.equal(x("big lion's mane on a beech").speciesGuess, 'Hericium erinaceus')
  assert.equal(x('chanterelle, I mean Cantharellus formosus').speciesGuess, 'Cantharellus formosus')
  assert.equal(x('a false morel').speciesGuess, 'Gyromitra')
})
