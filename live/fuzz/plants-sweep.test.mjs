import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { seedList, sweep } from './plants-sweep.mjs'

const plantA = { id: 'a', expect: /rule-a/ }
const plantB = { id: 'b', expect: /rule-b/ }

// A fuzz that answers from a table keyed by plant, config and seed, and records its calls.
function fakeFuzz (table) {
  const calls = []
  const fuzz = async (options) => {
    calls.push(options)
    if (options.path != null) return table.replay?.(options) ?? { failed: true, error: `rule broken: rule-${options.plant.id}` }
    return table[`${options.plant.id}/${options.config}/${options.seed}`] ?? { failed: false, runs: 3, huntMs: 60000 }
  }
  return { fuzz, calls }
}

describe('seedList', () => {
  it('is K consecutive seeds from the base', () => {
    assert.deepEqual(seedList({ base: 10, count: 3 }), [10, 11, 12])
  })

  it('an explicit list wins over the count', () => {
    assert.deepEqual(seedList({ base: 10, count: 3, list: [4, 9] }), [4, 9])
  })
})

describe('sweep', () => {
  it('runs every plant on every seed under every configuration, the same seeds for each, with the budget as minutes', async () => {
    const { fuzz, calls } = fakeFuzz({})
    const runs = await sweep({ fuzz, plants: [plantA, plantB], configs: ['current', 'varied-wait'], seeds: [1, 2], budgetSeconds: 30, shrinkMinutes: 1, checkReplay: false })
    assert.equal(calls.length, 8)
    assert.deepEqual(Object.keys(runs), ['current', 'varied-wait'])
    assert.equal(runs.current.length, 4)
    assert.deepEqual(runs.current.map((r) => [r.plant, r.seed]), runs['varied-wait'].map((r) => [r.plant, r.seed]))
    assert.ok(calls.every((c) => c.minutes === 0.5 && c.shrinkMinutes === 1))
  })

  it('a run that failed with the plant\'s error is a catch, at its hunt time; a miss costs the budget', async () => {
    const { fuzz } = fakeFuzz({ 'a/current/1': { failed: true, error: 'rule broken after "x": rule-a: y', huntMs: 12340, path: '1:0@C', runs: 5 } })
    const runs = await sweep({ fuzz, plants: [plantA], configs: ['current'], seeds: [1, 2], budgetSeconds: 60, shrinkMinutes: 1, checkReplay: false })
    assert.deepEqual(runs.current.map(({ caught, seconds, other, path }) => ({ caught, seconds, other, path })), [
      { caught: true, seconds: 12.3, other: false, path: '1:0@C' },
      { caught: false, seconds: 60, other: false, path: undefined }
    ])
  })

  it('a failure that is not the plant\'s is a miss and is marked other', async () => {
    const { fuzz } = fakeFuzz({ 'a/current/1': { failed: true, error: 'rule broken: rule-zzz', huntMs: 5000, path: 'p', runs: 1 } })
    const [run] = (await sweep({ fuzz, plants: [plantA], configs: ['current'], seeds: [1], budgetSeconds: 60, shrinkMinutes: 1, checkReplay: false })).current
    assert.deepEqual({ caught: run.caught, other: run.other, seconds: run.seconds }, { caught: false, other: true, seconds: 5 })
  })

  it('replays each catch from its path and records whether it failed again with the plant\'s error', async () => {
    const found = { failed: true, error: 'rule-a', huntMs: 1000, path: '1:0@C', runs: 5 }
    const { fuzz, calls } = fakeFuzz({ 'a/current/1': found, 'a/current/2': found, replay: (o) => (o.seed === 1 ? { failed: true, error: 'rule-a' } : { failed: false }) })
    const runs = await sweep({ fuzz, plants: [plantA], configs: ['current'], seeds: [1, 2], budgetSeconds: 60, shrinkMinutes: 1, checkReplay: true })
    assert.deepEqual(runs.current.map((r) => r.replayed), [true, false])
    const replay = calls.find((c) => c.path != null)
    assert.equal(replay.config, 'current')
    assert.equal(replay.path, '1:0@C')
    assert.equal(replay.minutes, undefined)
  })

  it('reports each run as it finishes', async () => {
    const { fuzz } = fakeFuzz({})
    const seen = []
    await sweep({ fuzz, plants: [plantA], configs: ['current'], seeds: [1, 2], budgetSeconds: 60, shrinkMinutes: 1, checkReplay: false, onRun: (r) => seen.push(`${r.plant}/${r.config}/${r.seed}`) })
    assert.deepEqual(seen, ['a/current/1', 'a/current/2'])
  })
})
