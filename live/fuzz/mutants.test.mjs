import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SCRIPT_FILES, scriptSource } from '../session.mjs'
import { applyMutant, FAMILIES, mutantPlant, mutantsOf, sampleMutants, seededRandom } from './mutants.mjs'

const code = `(function () {
  const limit = 3
  let seen = 0
  function bump (n) {
    seen += n
    if (n < limit && seen !== 0) record(n)
    return n === 1 ? 'one' : 'many'
  }
  bump(1)
})()
`
const find = (family, original) => mutantsOf('one.user.js', code).find((m) => m.family === family && m.original === original)
const mutated = (family, original) => applyMutant(find(family, original), code)

test('a relational operator is replaced by its neighbour', () => {
  assert.match(mutated('relational', '<'), /n <= limit/)
  assert.match(mutated('relational', '!=='), /seen === 0/)
  assert.match(mutated('relational', '==='), /n !== 1 \?/)
})

test('a tested condition is negated and && and || swap', () => {
  assert.match(mutated('conditional', 'n < limit && seen !== 0'), /if \(!\(n < limit && seen !== 0\)\) record/)
  assert.match(mutated('conditional', 'n === 1'), /!\(n === 1\) \?/)
  assert.match(mutated('conditional', '&&'), /n < limit \|\| seen/)
})

test('a call, assignment or update statement is deleted, and a declaration or return is not', () => {
  assert.equal(mutated('deletion', 'bump(1)').includes('bump(1)'), false)
  assert.equal(mutated('deletion', 'seen += n').includes('seen += n'), false)
  const originals = mutantsOf('one.user.js', code).filter((m) => m.family === 'deletion').map((m) => m.original)
  assert.deepEqual(originals, ['seen += n', 'record(n)', 'bump(1)'])
})

test('a mutated text differs from the script only at the edit', () => {
  const all = mutantsOf('one.user.js', code)
  assert.ok(all.length >= 9)
  for (const m of all) {
    const text = applyMutant(m, code)
    assert.equal(text.slice(0, m.start), code.slice(0, m.start))
    assert.equal(text.slice(m.start + m.text.length), code.slice(m.end))
  }
})

test('a script that changed under the mutant is an error', () => {
  const m = find('relational', '<')
  assert.throws(() => applyMutant(m, code.replace('n < limit', 'n > limit')), /no longer holds/)
})

test('a mutant is a plant that any failure catches, in the script it came from', () => {
  const plant = mutantPlant(find('relational', '<'))
  assert.equal(plant.file, 'one.user.js')
  assert.equal(plant.expect.test('anything at all'), true)
  assert.throws(() => plant.apply(code.replace('n < limit', 'n > limit')), /no longer holds/)
  assert.match(plant.apply(code), /n <= limit/)
})

test('seededRandom repeats for a seed and differs for another', () => {
  const a = seededRandom(5)
  const b = seededRandom(5)
  assert.deepEqual([a(), a(), a()], [b(), b(), b()])
  assert.notEqual(seededRandom(6)(), seededRandom(5)())
})

test('sampleMutants takes each family in turn, repeats for a seed and gives a short family\'s share to the others', () => {
  const all = mutantsOf('one.user.js', code)
  const first = sampleMutants(all, 6, 1)
  assert.deepEqual(first.map((m) => m.id), sampleMutants(all, 6, 1).map((m) => m.id))
  assert.deepEqual(first.map((m) => m.family), ['relational', 'conditional', 'deletion', 'relational', 'conditional', 'deletion'])
  assert.equal(sampleMutants(all, 1000, 1).length, all.length)
  assert.notDeepEqual(first.map((m) => m.id), sampleMutants(all, 6, 2).map((m) => m.id))
})

test('sampleMutants gives a family that has fewer than its share to the others', () => {
  const some = (family, count) => Array.from({ length: count }, (_, i) => ({ id: `${family}${i}`, family }))
  const sample = sampleMutants([...some('relational', 1), ...some('conditional', 5), ...some('deletion', 5)], 7, 1)
  assert.equal(sample.length, 7)
  assert.equal(sample.filter((m) => m.family === 'relational').length, 1)
})

test('every shipped script parses and has mutants of all three families', () => {
  for (const file of SCRIPT_FILES) {
    const families = new Set(mutantsOf(file, scriptSource(file)).map((m) => m.family))
    assert.deepEqual([...families].sort(), [...FAMILIES].sort(), file)
  }
})
