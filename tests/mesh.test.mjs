// Phase 13 protocol: alerts, signed records, record sync between simulated devices, single-find
// packages. Runs under plain Node (WebCrypto) with the in-memory LoopbackHub as the radio.
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateDeviceKey, importForayKey, importPublicKey, toB64 } from '../utils/mesh/crypto.ts'
import { ALERT_BYTES, decodeAlert, encodeAlert, nearbySummary, shouldAlert } from '../utils/mesh/alert.ts'
import { judge, recordFromFind, signRecord, verifyRecord, wanted } from '../utils/mesh/records.ts'
import { LoopbackHub, DutyCycle } from '../utils/mesh/transport.ts'
import { MeshNode } from '../utils/mesh/node.ts'
import { buildPackage, judgeImport, packageFileName, parsePackage } from '../utils/findPackage.ts'
import { formatId } from '../utils/idCode.ts'

const rndKey = () => toB64(crypto.getRandomValues(new Uint8Array(32)))
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))

async function member() {
  const k = await generateDeviceKey()
  return k
}
function lookupFor(...devices) {
  const m = new Map()
  return async (id) => {
    if (!m.size) for (const d of devices) m.set(d.keyId, await importPublicKey(d.publicB64))
    return m.get(id) ?? null
  }
}

const find = (over = {}) => ({
  specimenId: formatId('B7QM', 3, 42),
  latitude: 39.7392,
  longitude: -104.9903,
  geoprivacy: 'open',
  speciesGuess: 'Amanita muscaria',
  timestamp: '2026-10-09T17:42:00.000Z',
  ...over,
})

test('alert round trip: 128 bytes, fine cell for open finds', async () => {
  const fk = await importForayKey(rndKey())
  const dev = await member()
  const bytes = await encodeAlert(find(), fk, dev)
  assert.equal(bytes.length, ALERT_BYTES)
  assert.equal(ALERT_BYTES, 128)
  const a = await decodeAlert(bytes, fk, lookupFor(dev))
  assert.equal(a.specimenId, find().specimenId)
  assert.equal(a.species, 'Amanita musca') // 13 bytes
  assert.equal(a.at, '2026-10-09T17:42:00.000Z')
  assert.ok(Math.abs(a.latitude - 39.7392) < 0.002 && Math.abs(a.longitude - -104.9903) < 0.002)
  assert.equal(a.precisionM, 222)
})

test('alert for an obscured find only carries the 0.2 degree cell; no location stays empty', async () => {
  const fk = await importForayKey(rndKey())
  const dev = await member()
  const a = await decodeAlert(await encodeAlert(find({ geoprivacy: 'obscured' }), fk, dev), fk, lookupFor(dev))
  assert.ok(Math.abs(a.latitude - 39.7) < 1e-9 && Math.abs(a.longitude - -104.9) < 1e-9)
  assert.equal(a.precisionM, 22200)
  const b = await decodeAlert(await encodeAlert(find({ latitude: undefined, longitude: undefined, speciesGuess: 'Café 🍄 x' }), fk, dev), fk, lookupFor(dev))
  assert.equal(b.latitude, undefined)
  assert.equal(b.species, 'Café 🍄 x')
})

test('alerts: other forays, strangers and tampering are rejected', async () => {
  const fk = await importForayKey(rndKey())
  const other = await importForayKey(rndKey())
  const dev = await member()
  const stranger = await member()
  const bytes = await encodeAlert(find(), fk, dev)
  assert.equal(await decodeAlert(bytes, other, lookupFor(dev)), null)
  assert.equal(await decodeAlert(await encodeAlert(find(), fk, stranger), fk, lookupFor(dev)), null)
  for (const i of [5, 20, 60, 127]) {
    const t = bytes.slice(); t[i] ^= 1
    assert.equal(await decodeAlert(t, fk, lookupFor(dev)), null, `flip at ${i}`)
  }
})

test('private and sensitive finds are never announced', () => {
  assert.equal(shouldAlert(find({ geoprivacy: 'private' })), false)
  assert.equal(shouldAlert(find({ speciesGuess: 'Morchella esculenta' })), false)
  assert.equal(shouldAlert(find({ specimenId: '' })), false)
  assert.equal(shouldAlert(find()), true)
})

test('nearby summary counts recent alerts within the radius', () => {
  const now = Date.parse('2026-10-09T18:00:00Z')
  const here = { latitude: 39.7392, longitude: -104.9903 }
  const alerts = [
    { latitude: 39.7393, longitude: -104.9904, precisionM: 222, at: '2026-10-09T17:50:00Z' },
    { latitude: 39.76, longitude: -104.99, precisionM: 222, at: '2026-10-09T17:55:00Z' }, // 2.3 km away
    { latitude: 39.7392, longitude: -104.9903, precisionM: 222, at: '2026-10-09T14:00:00Z' }, // too old
  ]
  assert.deepEqual(nearbySummary(alerts, here, 200, 120, now), { recent: 2, near: 1, radiusM: 200 })
})

test('records: location setting applied before leaving; signature covers every field', async () => {
  const dev = await member()
  const base = { id: crypto.randomUUID(), forayId: 'f', specimenId: find().specimenId, timestamp: find().timestamp, latitude: 39.7392, longitude: -104.9903, fieldNotes: { speciesGuess: 'Amanita', notes: '' }, updatedAt: '2026-10-09T17:43:00Z' }
  const priv = recordFromFind({ ...base, geoprivacy: 'private' }, 'Skyler', dev.keyId)
  assert.equal(priv.latitude, undefined)
  const obs = recordFromFind({ ...base, geoprivacy: 'obscured' }, 'Skyler', dev.keyId)
  assert.ok(Math.abs(obs.latitude - 39.7) < 1e-9)
  assert.deepEqual(obs.fieldNotes, { speciesGuess: 'Amanita' })
  const signed = await signRecord(recordFromFind({ ...base, geoprivacy: 'open' }, 'Skyler', dev.keyId), dev)
  assert.equal(await verifyRecord(signed, lookupFor(dev)), true)
  for (const patch of [{ authorName: 'Eve' }, { latitude: 39.74 }, { fieldNotes: { speciesGuess: 'Boletus' } }, { updatedAt: '2030-01-01T00:00:00Z' }]) {
    assert.equal(await verifyRecord({ ...signed, ...patch }, lookupFor(dev)), false, JSON.stringify(patch))
  }
})

test('judge: own rows never overwritten, ID reuse refused, newer wins', () => {
  const rec = { id: 'r1', specimenId: 'S1', updatedAt: '2026-01-02' }
  assert.equal(judge(rec, new Map(), new Set(['r1']), new Map()), 'own')
  assert.equal(judge(rec, new Map(), new Set(), new Map([['S1', 'r9']])), 'conflict')
  assert.equal(judge(rec, new Map(), new Set(), new Map()), 'new')
  assert.equal(judge(rec, new Map([['r1', { updatedAt: '2026-01-01' }]]), new Set(), new Map()), 'newer')
  assert.equal(judge(rec, new Map([['r1', { updatedAt: '2026-01-03' }]]), new Set(), new Map()), 'stale')
  assert.deepEqual(wanted([['a', '1'], ['b', '1']], [['a', '2'], ['b', '1'], ['c', '1']]), ['a', 'c'])
})

/** A simulated phone: its own finds plus what it has received. */
async function phone(hub, fk, name, dev, lookup, nFinds) {
  const own = []
  for (let i = 0; i < nFinds; i++) {
    const r = recordFromFind({
      id: crypto.randomUUID(), forayId: 'f', specimenId: formatId('B7Q' + name[0], 0, i), timestamp: new Date(Date.UTC(2026, 9, 9, 17, i)).toISOString(),
      latitude: 39.7, longitude: -105, geoprivacy: 'open', fieldNotes: { notes: `${name} #${i}` }, updatedAt: '2026-10-09T18:00:00Z',
    }, name, dev.keyId)
    own.push(await signRecord(r, dev))
  }
  const held = new Map()
  const store = {
    ownRecords: async () => own,
    heldRecords: async () => [...held.values()],
    specimenIndex: async () => new Map([...own, ...held.values()].map((r) => [r.specimenId, r.id])),
    save: async (r) => { held.set(r.id, r) },
  }
  const alerts = []
  const node = new MeshNode({ transport: hub.connect(), foray: fk, lookup, store, onAlert: (a) => alerts.push(a) })
  return { node, own, held, alerts, dev }
}

test('three phones converge by relaying, with nobody online', async () => {
  const fk = await importForayKey(rndKey())
  const devs = await Promise.all([member(), member(), member()])
  const lookup = lookupFor(...devs)
  // A meets B, then B walks over to C. A and C never meet.
  const hubAB = new LoopbackHub()
  const hubBC = new LoopbackHub()
  const A = await phone(hubAB, fk, 'A', devs[0], lookup, 3)
  const B = await phone(hubAB, fk, 'B', devs[1], lookup, 2)
  A.node.start(); B.node.start()
  await A.node.announce(); await tick(150)
  assert.equal(B.held.size, 3, 'B got all of A')
  assert.equal(A.held.size, 2, 'A got all of B')
  A.node.stop(); B.node.stop()

  // B's second radio session, now near C.
  const B2 = new MeshNode({ transport: hubBC.connect(), foray: fk, lookup, store: {
    ownRecords: async () => B.own, heldRecords: async () => [...B.held.values()],
    specimenIndex: async () => new Map([...B.own, ...B.held.values()].map((r) => [r.specimenId, r.id])), save: async (r) => { B.held.set(r.id, r) },
  } })
  const C = await phone(hubBC, fk, 'C', devs[2], lookup, 1)
  B2.start(); C.node.start()
  await C.node.announce(); await tick(150)
  assert.equal(C.held.size, 5, "C has A's finds via B")
  assert.equal(B.held.size, 4)
  // A forged record relayed by someone else is refused.
  assert.ok(C.node.stats.rejected === 0)
})

test('mesh: a forged or altered record is rejected and never stored', async () => {
  const fk = await importForayKey(rndKey())
  const [d1, d2] = await Promise.all([member(), member()])
  const lookup = lookupFor(d1, d2)
  const hub = new LoopbackHub()
  const A = await phone(hub, fk, 'A', d1, lookup, 1)
  const B = await phone(hub, fk, 'B', d2, lookup, 0)
  A.own[0] = { ...A.own[0], authorName: 'Someone else' } // breaks the signature
  A.node.start(); B.node.start()
  await A.node.announce(); await tick(120)
  assert.equal(B.held.size, 0)
  assert.equal(B.node.stats.rejected, 1)
})

test('mesh: alerts reach members once; outsiders on another foray hear nothing', async () => {
  const fk = await importForayKey(rndKey())
  const other = await importForayKey(rndKey())
  const [d1, d2, d3] = await Promise.all([member(), member(), member()])
  const hub = new LoopbackHub()
  const A = await phone(hub, fk, 'A', d1, lookupFor(d1, d2), 0)
  const B = await phone(hub, fk, 'B', d2, lookupFor(d1, d2), 0)
  const X = await phone(hub, other, 'X', d3, lookupFor(d1, d2, d3), 0)
  A.node.start(); B.node.start(); X.node.start()
  const bytes = await encodeAlert(find(), fk, d1)
  A.node.sendAlert(bytes); A.node.sendAlert(bytes)
  await tick(60)
  assert.equal(B.alerts.length, 1)
  assert.equal(X.alerts.length, 0)
})

test('duty cycle switches the radio on and off', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] }) // deterministic, even on a busy machine
  const hub = new LoopbackHub()
  const tr = hub.connect()
  let wakes = 0
  const dc = new DutyCycle(tr, 100, 300, () => wakes++)
  try {
    dc.start()
    assert.equal(dc.active, true)
    t.mock.timers.tick(150) // on for 100 ms, then off
    assert.equal(dc.active, false)
    t.mock.timers.tick(200) // next window starts at 300 ms
    assert.equal(dc.active, true)
  } finally {
    dc.stop() // never leave timers running, even when an assertion fails
  }
  assert.equal(dc.active, false)
  assert.equal(wakes, 2)
})

test('find package: build, parse, refuse junk, and judge imports', async () => {
  const dev = await member()
  const rec = await signRecord(recordFromFind({
    id: 'row-1', forayId: 'f', specimenId: formatId('B7QM', 0, 1), timestamp: '2026-10-09T17:00:00Z', geoprivacy: 'obscured',
    latitude: 39.7392, longitude: -104.99, fieldNotes: { speciesGuess: 'Amanita' }, updatedAt: '2026-10-09T17:05:00Z',
  }, 'Skyler', dev.keyId), dev)
  const pkg = buildPackage(rec, [{ id: 'p1', mimeType: 'image/jpeg', capturedAt: '2026-10-09T17:01:00Z', data: 'AAAA' }], [{ id: 'v1', transcript: 'gills white', model: 'web-speech', at: '2026-10-09T17:02:00Z' }])
  const back = parsePackage(JSON.stringify(pkg))
  assert.equal(await verifyRecord(back.record, lookupFor(dev)), true)
  assert.match(packageFileName(back), /^find-B7QM-AAAB-.\.forayfind$/)
  assert.throws(() => parsePackage('{"format":"x"}'), /isn't a shared find/)
  assert.throws(() => parsePackage('not json'), /isn't a shared find/)
  assert.throws(() => parsePackage(JSON.stringify({ ...pkg, version: 9 })), /newer version/)
  assert.throws(() => parsePackage(JSON.stringify({ ...pkg, photos: [{ id: 'x', mimeType: 'text/html', data: 'AA' }] })), /photo/)

  const none = new Set(), noMap = new Map()
  assert.deepEqual(judgeImport(rec, new Set(['row-1']), none, noMap, noMap), { ok: false, reason: 'This is one of your own finds.' })
  assert.deepEqual(judgeImport(rec, none, new Set([rec.specimenId]), noMap, noMap).ok, false)
  assert.deepEqual(judgeImport(rec, none, none, noMap, new Map([[rec.specimenId, 'row-9']])).ok, false)
  assert.deepEqual(judgeImport(rec, none, none, noMap, noMap), { ok: true, replace: false })
  assert.deepEqual(judgeImport(rec, none, none, new Map([['row-1', { updatedAt: '2026-10-09T17:00:00Z' }]]), noMap), { ok: true, replace: true })
  assert.equal(judgeImport(rec, none, none, new Map([['row-1', { updatedAt: '2026-10-09T17:05:00Z' }]]), noMap).ok, false)
})
