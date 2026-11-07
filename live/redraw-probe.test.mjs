import { test } from 'node:test'
import assert from 'node:assert/strict'
import { combine, summarize, worstEventMs } from './redraw-probe.mjs'

const mutation = (where, added, removed) => ({ type: 'childList', added, removed, where })

test('summarize gives per-event node counts, handler time by kind and counts by region', () => {
  const recording = {
    handlerMs: [{ kind: 'frame', ms: 1 }, { kind: 'frame', ms: 3 }, { kind: 'observer', ms: 0.5 }],
    mutations: [mutation('g in #a', 4, 2), mutation('circle in #a', 2, 0), mutation('g in #b', 0, 2)]
  }
  assert.deepEqual(summarize(recording, 2), {
    events: 2,
    handlers: {
      frame: { calls: 2, totalMs: 4, meanMs: 2, p95Ms: 3, maxMs: 3 },
      observer: { calls: 1, totalMs: 0.5, meanMs: 0.5, p95Ms: 0.5, maxMs: 0.5 }
    },
    handlerMsPerEvent: 2.25,
    nodesAddedPerEvent: 3,
    nodesRemovedPerEvent: 2,
    regions: { '#a': { records: 2, added: 6, removed: 2 }, '#b': { records: 1, added: 0, removed: 2 } }
  })
})

test('combine joins recordings and worstEventMs is the most handler time one event spent', () => {
  const rows = [
    { handlerMs: [{ kind: 'frame', ms: 1 }, { kind: 'frame', ms: 1 }], mutations: [mutation('g in #a', 1, 0)] },
    { handlerMs: [{ kind: 'frame', ms: 3 }], mutations: [] }
  ]
  assert.equal(combine(rows).handlerMs.length, 3)
  assert.equal(combine(rows).mutations.length, 1)
  assert.equal(worstEventMs(rows), 3)
})
