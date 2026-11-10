import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyPlant, PLANTS, plantById, plantPatch } from './plants.mjs'
import { scriptSource } from '../session.mjs'

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
      const text = scriptSource(plant.file)
      assert.equal(occurrences(text, plant.find), 1)
      assert.notEqual(applyPlant(plant, text), text)
    })
  }

  it('no plant\'s expect matches a crash or a rule of some other script', () => {
    const unrelated = 'crash signal after "click": page error or console error: TypeError: cell.somethingElse is not a function; rule broken after "undo": undo-to-start: x'
    for (const plant of PLANTS.filter((p) => p.kind === 'crash')) assert.equal(plant.expect.test(unrelated), false, plant.id)
  })

  it('no shipped script holds a replacement', () => {
    for (const plant of PLANTS) assert.equal(occurrences(scriptSource(plant.file), plant.replace), 0, `${plant.id}: ${plant.file} holds the bug`)
  })
})
