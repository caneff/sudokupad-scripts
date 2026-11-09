import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyPlant, PLANTS, plantById, plantPatch } from './plants.mjs'
import { isCatch, plantTable } from './plant-table.mjs'

const ROOT = new URL('../../', import.meta.url)
const scriptText = (file) => readFileSync(new URL(file, ROOT), 'utf8')
const occurrences = (text, find) => text.split(find).length - 1

describe('applyPlant', () => {
  const plant = { id: 'x', file: 'a.user.js', find: 'alpha', replace: 'beta' }

  it('swaps the one match', () => {
    assert.equal(applyPlant(plant, 'one alpha two'), 'one beta two')
  })

  it('fails loudly when the find text is gone', () => {
    assert.throws(() => applyPlant(plant, 'one two'), /plant x: .*"alpha".* matches 0 times/)
  })

  it('fails loudly when the find text is not unique', () => {
    assert.throws(() => applyPlant(plant, 'alpha alpha'), /matches 2 times/)
  })

  it('plantPatch changes only the plant\'s script', () => {
    const patch = plantPatch(plant)
    assert.equal(patch('a.user.js', 'alpha'), 'beta')
    assert.equal(patch('b.user.js', 'alpha'), 'alpha')
  })

  it('plantById names the known ids when asked for another', () => {
    assert.throws(() => plantById('nope'), /no plant "nope"/)
  })
})

describe('the plants against the shipped scripts', () => {
  it('there are about ten, spread over all six scripts and both kinds of failure', () => {
    assert.ok(PLANTS.length >= 10 && PLANTS.length <= 14, `got ${PLANTS.length}`)
    assert.equal(new Set(PLANTS.map((p) => p.file)).size, 6)
    assert.deepEqual([...new Set(PLANTS.map((p) => p.kind))].sort(), ['crash', 'rule'])
    assert.equal(new Set(PLANTS.map((p) => p.id)).size, PLANTS.length)
  })

  for (const plant of PLANTS) {
    it(`${plant.id}: its find text matches ${plant.file} exactly once and changes it`, () => {
      const text = scriptText(plant.file)
      assert.equal(occurrences(text, plant.find), 1)
      assert.notEqual(applyPlant(plant, text), text)
    })
  }

  it('no shipped script holds a replacement', () => {
    for (const plant of PLANTS) assert.equal(occurrences(scriptText(plant.file), plant.replace), 0, `${plant.id}: ${plant.file} holds the bug`)
  })
})

describe('plantTable', () => {
  const a = { id: 'a-bug', kind: 'rule', expect: /rule-a/ }
  const b = { id: 'b-bug', kind: 'crash', expect: /crash signal/ }
  const c = { id: 'c-bug', kind: 'rule', expect: /rule-c/ }
  const text = plantTable([
    { plant: a, caught: true, puzzle: '6x6', seconds: 12, runs: 9, error: 'rule broken after "undo": rule-a: x', sequence: ['click r1c1', 'undo'] },
    { plant: b, caught: false, seconds: 90, runs: 40 },
    { plant: c, caught: false, other: true, seconds: 30, runs: 5, error: 'rule broken after "reload": other-rule: y' }
  ])

  it('says which were caught, how fast and with what steps', () => {
    assert.match(text, /a-bug +rule +CAUGHT +6x6 +12 s/)
    assert.match(text, /a-bug: shrunk to 2 steps\n {2}1\. click r1c1\n {2}2\. undo/)
    assert.match(text, /1 of 3 planted bugs caught/)
  })

  it('a miss shows its lists, and a failure that is not the plant\'s is not a catch', () => {
    assert.match(text, /b-bug +crash +missed +- +90 s, 40 lists/)
    assert.match(text, /c-bug +rule +other failure/)
    assert.match(text, /c-bug: a failure that is not the plant's: rule broken after "reload": other-rule: y/)
  })

  it('isCatch reads the plant\'s expect', () => {
    assert.equal(isCatch(a, 'rule broken after "x": rule-a: z'), true)
    assert.equal(isCatch(a, 'rule broken after "x": rule-b: z'), false)
  })
})
