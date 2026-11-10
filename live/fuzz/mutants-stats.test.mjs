import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mutantTables, mutantVerdict } from './mutants-stats.mjs'

const run = (caught, seconds, reached) => ({ caught, seconds, reached })

test('a mutant any seed caught is caught, even if another seed missed it', () => {
  assert.equal(mutantVerdict([run(false, 30, true), run(true, 4)]), 'caught')
})

test('a mutant no hunt ran the code of is unreachable, and one a hunt did run is missed', () => {
  assert.equal(mutantVerdict([run(false, 30, false), run(false, 30, false)]), 'unreachable')
  assert.equal(mutantVerdict([run(false, 30, false), run(false, 30, true)]), 'missed')
  assert.equal(mutantVerdict([run(false, 30)]), 'missed')
})

test('a mutant that crashed at load is a load error whatever its runs', () => {
  assert.equal(mutantVerdict([], { loadError: true }), 'load-error')
})

test('mutantTables gives each script a table of families, a total, and a median over the fuzzed mutants only, and names a script with no mutant', () => {
  const o = (file, family, verdict, runs) => ({ mutant: { file, family }, verdict, runs })
  const lines = mutantTables([
    o('a.user.js', 'relational', 'caught', [run(true, 4), run(false, 30, true)]),
    o('a.user.js', 'relational', 'missed', [run(false, 30, true), run(false, 30, true)]),
    o('a.user.js', 'deletion', 'unreachable', [run(false, 30, false), run(false, 30, false)]),
    o('a.user.js', 'deletion', 'load-error', []),
    o('b.user.js', 'conditional', 'caught', [run(true, 2), run(true, 6)])
  ], { files: ['a.user.js', 'b.user.js', 'c.user.js'], families: ['relational', 'conditional', 'deletion'], budget: 30 })
  assert.deepEqual(lines, [
    'a.user.js',
    'family      mutants  caught  missed  unreachable  load-error  seeds caught  median',
    '----------  -------  ------  ------  -----------  ----------  ------------  ------',
    'relational  2        1       1       0            0           1/4           > 30 s',
    'deletion    2        0       0       1            1           -             -',
    'total       4        1       1       1            1           1/4           > 30 s',
    '',
    'b.user.js',
    'family       mutants  caught  missed  unreachable  load-error  seeds caught  median',
    '-----------  -------  ------  ------  -----------  ----------  ------------  ------',
    'conditional  1        1       0       0            0           2/2           4 s',
    'total        1        1       0       0            0           2/2           4 s',
    '',
    'c.user.js: no mutants sampled',
    ''
  ])
})
