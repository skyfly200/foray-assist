// Run: node --experimental-strip-types --test tests/modelrouting.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canConnect, connectEdges, defaultRouting, edgeId, failReason, graphToRouting, normalizeRouting, pickStep,
  routingToGraph, runRoute, RouteFailedError, taskNodeId, modelNodeId,
} from '../utils/modelRouting.ts'

test('default routing is today\'s behaviour', () => {
  const r = defaultRouting()
  assert.deepEqual(r.routes.speech.map((s) => s.model), ['whisper', 'web-speech', 'record-only'])
  assert.deepEqual(r.routes.extract.map((s) => s.model), ['word-list'])
})

test('normalize drops unknown and misplaced models, duplicates and bad numbers', () => {
  const r = normalizeRouting({
    routes: {
      speech: [{ model: 'web-speech', timeoutSec: 5000 }, { model: 'nope' }, { model: 'word-list' }, { model: 'web-speech' }, { model: 'whisper', cooldownMin: 'x' }],
      extract: [],
    },
  })
  assert.deepEqual(r.routes.speech, [{ model: 'web-speech', timeoutSec: 600 }, { model: 'whisper' }])
  assert.deepEqual(r.routes.extract, [])
  assert.deepEqual(normalizeRouting(null).routes, defaultRouting().routes)
  assert.deepEqual(normalizeRouting({ routes: {} }).routes, defaultRouting().routes)
})

test('graph round trip keeps the order and settings', () => {
  const r = normalizeRouting({ routes: { speech: [{ model: 'web-speech', cooldownMin: 10 }, { model: 'whisper', timeoutSec: 20 }], extract: [{ model: 'word-list' }] } })
  const g = routingToGraph(r)
  // record-only is drawn but not linked
  assert.ok(g.nodes.some((n) => n.id === modelNodeId('speech', 'record-only')))
  assert.equal(g.edges.length, 3)
  const back = graphToRouting(g.nodes, g.edges)
  assert.deepEqual(back.routes, r.routes)
  assert.ok(back.layout[taskNodeId('speech')])
})

test('rewiring changes the route', () => {
  const g = routingToGraph(defaultRouting())
  const t = taskNodeId('speech')
  const ws = modelNodeId('speech', 'web-speech')
  const make = (s, t) => ({ id: edgeId(s, t), source: s, target: t })
  // Start with browser speech: the old first link is replaced, whisper becomes unlinked from the task.
  let edges = connectEdges(g.edges, t, ws, make)
  let r = graphToRouting(g.nodes, edges)
  assert.deepEqual(r.routes.speech.map((s) => s.model), ['web-speech', 'record-only'])
  // Browser speech falls back to Whisper (replaces web-speech -> record-only).
  edges = connectEdges(edges, ws, modelNodeId('speech', 'whisper'), make)
  r = graphToRouting(g.nodes, edges)
  assert.deepEqual(r.routes.speech.map((s) => s.model), ['web-speech', 'whisper'])
})

test('canConnect refuses cross-task links, links into a task, and loops', () => {
  const { edges } = routingToGraph(defaultRouting())
  assert.match(canConnect(taskNodeId('extract'), modelNodeId('speech', 'whisper'), edges), /can't do/)
  assert.match(canConnect(modelNodeId('speech', 'whisper'), taskNodeId('speech'), edges), /only start/)
  assert.match(canConnect(modelNodeId('speech', 'record-only'), modelNodeId('speech', 'whisper'), edges), /loop/)
  assert.equal(canConnect(taskNodeId('speech'), modelNodeId('speech', 'record-only'), edges), null)
})

test('failReason sorts errors', () => {
  assert.equal(failReason(Object.assign(new Error('x'), { name: 'TimeoutError' })), 'timeout')
  assert.equal(failReason({ status: 429 }), 'quota')
  assert.equal(failReason(new Error('Quota exceeded for this key')), 'quota')
  assert.equal(failReason(new TypeError('Failed to fetch')), 'offline')
  assert.equal(failReason(new Error('boom'), false), 'offline')
  assert.equal(failReason(new Error('boom')), 'error')
})

test('runRoute falls back, times out and rests a model after a quota error', async () => {
  const cooldowns = new Map()
  let now = 1000
  const steps = [{ model: 'web-speech', cooldownMin: 5 }, { model: 'whisper', timeoutSec: 0.05 }, { model: 'record-only' }]
  const calls = []
  const call = async (s) => {
    calls.push(s.model)
    if (s.model === 'web-speech') throw Object.assign(new Error('rate limit'), { status: 429 })
    if (s.model === 'whisper') return new Promise(() => {}) // never answers
    return 'ok'
  }
  const r = await runRoute(steps, call, { cooldowns, now: () => now })
  assert.equal(r.value, 'ok')
  assert.equal(r.model, 'record-only')
  assert.deepEqual(r.attempts.map((a) => a.reason), ['quota', 'timeout'])
  // Next run skips browser speech while it rests
  calls.length = 0
  await runRoute(steps, call, { cooldowns, now: () => now })
  assert.deepEqual(calls, ['whisper', 'record-only'])
  now += 5 * 60_000 + 1
  calls.length = 0
  await runRoute(steps, call, { cooldowns, now: () => now })
  assert.equal(calls[0], 'web-speech')
})

test('runRoute reports every attempt when all fail', async () => {
  await assert.rejects(
    runRoute([{ model: 'whisper' }, { model: 'web-speech' }], async () => { throw new Error('nope') }, { isAvailable: (m) => m === 'whisper' }),
    (e) => e instanceof RouteFailedError && /Whisper failed \(nope\), then Browser speech is not available/.test(e.message),
  )
  await assert.rejects(runRoute([], async () => 1), /No model is set up/)
})

test('pickStep skips unavailable and resting models', () => {
  const cooldowns = new Map([['whisper', 2000]])
  const steps = defaultRouting().routes.speech
  assert.equal(pickStep(steps, { cooldowns, now: () => 1000 }).step.model, 'web-speech')
  const p = pickStep(steps, { cooldowns, now: () => 1000, isAvailable: (m) => m !== 'web-speech' })
  assert.equal(p.step.model, 'record-only')
  assert.deepEqual(p.skipped.map((a) => a.reason), ['cooling', 'unavailable'])
  assert.equal(pickStep([], {}).step, undefined)
})

test('phone layout runs top to bottom and keeps the wide layout when saved', () => {
  const base = graphToRouting(routingToGraph(defaultRouting()).nodes, routingToGraph(defaultRouting()).edges)
  const g = routingToGraph(base, true)
  const pos = (id) => g.nodes.find((n) => n.id === id).position
  assert.ok(pos(modelNodeId('speech', 'whisper')).y > pos(taskNodeId('speech')).y)
  assert.equal(pos(modelNodeId('speech', 'whisper')).x, pos(taskNodeId('speech')).x)
  const saved = graphToRouting(g.nodes, g.edges, true, base)
  assert.deepEqual(saved.layout, base.layout)
  assert.deepEqual(saved.layoutTall[taskNodeId('extract')], pos(taskNodeId('extract')))
})
