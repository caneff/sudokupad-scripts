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
})

describe('sweep', () => {
  it('runs every plant on every seed under every configuration, the same seeds for each, with the budget as minutes', async () => {
    const { fuzz, calls } = fakeFuzz({})
    const runs = await sweep({ fuzz, plants: [plantA, plantB], configs: ['current', 'varied-wait'], seeds: [1, 2], budgetSeconds: 30, shrinkMinutes: 1, checkReplay: false })
    assert.equal(calls.length, 8)
    assert.deepEqual(Object.keys(runs), ['current', 'varied-wait'])
    assert.equal(runs.current.length, 4)
    assert.deepEqual(runs.current.map((r) => [r.plant, r.seed]), runs['varied-wait'].map((r) => [r.plant, r.seed]))
    assert.deepEqual([...new Set(calls.map((c) => `${c.minutes}/${c.shrinkMinutes}`))], ['0.5/1'])
  })

  it('a run that failed with the plant\'s error is a catch, at its hunt time; a miss costs the budget', async () => {
    const { fuzz } = fakeFuzz({ 'a/current/1': { failed: true, error: 'rule broken after "x": rule-a: y', huntMs: 12340, path: '1:0@C', replayCommand: 'replay 1', runs: 5 } })
    const runs = await sweep({ fuzz, plants: [plantA], configs: ['current'], seeds: [1, 2], budgetSeconds: 60, shrinkMinutes: 1, checkReplay: false })
    assert.deepEqual(runs.current.map(({ caught, seconds, other, replayCommand }) => ({ caught, seconds, other, replayCommand })), [
      { caught: true, seconds: 12.3, other: false, replayCommand: 'replay 1' },
      { caught: false, seconds: 60, other: false, replayCommand: undefined }
    ])
  })

  it('a failure that is not the plant\'s is a miss, marked other, and keeps its error and the command that replays it', async () => {
    const { fuzz } = fakeFuzz({ 'a/current/1': { failed: true, error: 'rule broken: rule-zzz', huntMs: 5000, path: 'p', replayCommand: 'replay p', runs: 1 } })
    const [run] = (await sweep({ fuzz, plants: [plantA], configs: ['current'], seeds: [1], budgetSeconds: 60, shrinkMinutes: 1, checkReplay: false })).current
    assert.deepEqual({ caught: run.caught, other: run.other, seconds: run.seconds, error: run.error, replayCommand: run.replayCommand }, { caught: false, other: true, seconds: 5, error: 'rule broken: rule-zzz', replayCommand: 'replay p' })
  })

  it('replays each catch from its path and records whether it failed again with the plant\'s error, not another', async () => {
    const found = { failed: true, error: 'rule-a', huntMs: 1000, path: '1:0@C', runs: 5 }
    const again = { 1: { failed: true, error: 'rule-a' }, 2: { failed: false }, 3: { failed: true, error: 'rule-zzz' } }
    const { fuzz, calls } = fakeFuzz({ 'a/current/1': found, 'a/current/2': found, 'a/current/3': found, replay: (o) => again[o.seed] })
    const runs = await sweep({ fuzz, plants: [plantA], configs: ['current'], seeds: [1, 2, 3], budgetSeconds: 60, shrinkMinutes: 1, checkReplay: true })
    assert.deepEqual(runs.current.map((r) => r.replayed), [true, false, false])
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
