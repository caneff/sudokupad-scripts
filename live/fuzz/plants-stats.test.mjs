import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compareTable, medianSeconds, plantStats } from './plants-stats.mjs'

const run = (plant, caught, seconds, extra = {}) => ({ plant, caught, seconds, ...extra })

describe('medianSeconds', () => {
  it('is the middle catch time of an odd number of runs', () => {
    assert.equal(medianSeconds([run('a', true, 30), run('a', true, 10), run('a', true, 20)]), 20)
  })

  it('is the mean of the two middle times of an even number', () => {
    assert.equal(medianSeconds([run('a', true, 10), run('a', true, 20), run('a', true, 30), run('a', true, 40)]), 25)
  })

  it('counts a miss as slower than any catch, so a median that falls on a miss is null', () => {
    assert.equal(medianSeconds([run('a', true, 10), run('a', false, 60), run('a', false, 60)]), null)
    assert.equal(medianSeconds([run('a', true, 10), run('a', true, 20), run('a', false, 60)]), 20)
  })

  it('an even count whose upper middle is a miss is null, not the lower catch', () => {
    assert.equal(medianSeconds([run('a', true, 10), run('a', true, 20), run('a', false, 60), run('a', false, 60)]), null)
  })

  it('a failure that is not the plant\'s counts as a miss', () => {
    assert.equal(medianSeconds([run('a', false, 5, { other: true }), run('a', false, 60), run('a', true, 9)]), null)
  })

  it('no runs have no median', () => {
    assert.equal(medianSeconds([]), null)
  })
})

describe('plantStats', () => {
  const runs = [
    run('a', true, 10), run('a', true, 30), run('a', false, 60),
    run('b', false, 60), run('b', false, 60, { other: true }), run('b', false, 60)
  ]

  it('gives each plant its catch fraction and median, in the order the plants first appear', () => {
    assert.deepEqual(plantStats(runs).map(({ plant, caught, total, median }) => ({ plant, caught, total, median })), [
      { plant: 'a', caught: 2, total: 3, median: 30 },
      { plant: 'b', caught: 0, total: 3, median: null }
    ])
  })

  it('counts the other failures and the failures that did not replay', () => {
    const stats = plantStats([...runs, run('a', true, 12, { replayed: false }), run('a', true, 13, { replayed: true })])
    const a = stats.find((s) => s.plant === 'a')
    assert.equal(a.notReplayed, 1)
    assert.equal(a.replayChecked, 2)
    assert.equal(stats.find((s) => s.plant === 'b').other, 1)
  })
})

describe('compareTable', () => {
  const current = [run('a-bug', true, 40), run('a-bug', false, 60), run('b-bug', true, 5), run('b-bug', true, 7)]
  const candidate = [run('a-bug', true, 20), run('a-bug', true, 30), run('b-bug', true, 6), run('b-bug', false, 60)]
  const text = compareTable({ current, candidate }, { kinds: { 'a-bug': 'rule', 'b-bug': 'rule' }, budget: 60 })

  it('puts each configuration\'s fraction and median side by side on the same plants', () => {
    assert.match(text, /plant +kind +current +candidate/)
    assert.match(text, /a-bug +rule +1\/2 > 60 s +2\/2 25 s/)
    assert.match(text, /b-bug +rule +2\/2 6 s +1\/2 > 60 s/)
  })

  it('totals each configuration', () => {
    assert.match(text, /total +3\/4 .*3\/4 /)
  })

  it('prints one configuration alone, with its kind column and total, and a median that is a miss as over the budget', () => {
    const one = compareTable({ current: [run('a-bug', true, 10), run('a-bug', false, 60), run('a-bug', false, 60)] }, { kinds: { 'a-bug': 'crash' }, budget: 60 })
    assert.match(one, /plant +kind +current\n/)
    assert.match(one, /a-bug +crash +1\/3 > 60 s/)
    assert.match(one, /total +1\/3 > 60 s/)
  })
})
