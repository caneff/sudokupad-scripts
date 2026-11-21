import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { mutantLoadProblem, mutantTables, mutantVerdict } from './mutants-stats.mjs'

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

describe('mutantLoadProblem', () => {
  const PLANT = { id: 'm1' }
  const page = (errors = []) => ({ snapshot: async () => ({ errors, notices: [] }), close: async () => {} })
  // A fake `openTarget` that opens the page `mutated` gives (or throws) with the plant, and the one `unmutated` gives without it, recording the options of every open.
  const opener = (mutated, unmutated = () => page()) => {
    const opened = []
    const open = async (options) => {
      opened.push(options)
      return options.plant ? mutated() : unmutated()
    }
    return Object.assign(open, { opened })
  }
  const boom = (message) => () => { throw new Error(message) }

  test('a mutant whose page loads clean has no problem, and no control is opened', async () => {
    const open = opener(() => page())
    assert.equal(await mutantLoadProblem(open, PLANT), null)
    assert.deepEqual(open.opened, [{ plant: PLANT }])
  })

  test('a crash signal the unmutated page does not show is the problem, as one line', async () => {
    const open = opener(() => page(['boom']))
    assert.equal(await mutantLoadProblem(open, PLANT), 'page error or console error: boom')
    assert.deepEqual(open.opened, [{ plant: PLANT }, {}])
  })

  test('of several crash signals, the first one the unmutated page does not show is the problem', async () => {
    const open = opener(() => page(['shared', 'own']), () => page(['shared']))
    assert.equal(await mutantLoadProblem(open, PLANT), 'page error or console error: own')
  })

  test('crash signals the unmutated page shows too are the harness crashing: it throws and is not a load error of the mutant', async () => {
    const open = opener(() => page(['release noise']), () => page(['release noise']))
    await assert.rejects(mutantLoadProblem(open, PLANT), /harness failure.*same crash signals.*release noise/)
  })

  test('a mutant that fails to open, while the unmutated scripts open, is a load error with its own message', async () => {
    const open = opener(boom('no free cells'))
    assert.equal(await mutantLoadProblem(open, PLANT), 'no free cells')
    assert.deepEqual(open.opened, [{ plant: PLANT }, {}])
  })

  test('a failure to open the unmutated scripts share is the harness crashing: it throws and is not a load error of the mutant', async () => {
    await assert.rejects(mutantLoadProblem(opener(boom('browser closed'), boom('browser closed')), PLANT), /harness failure.*browser closed/)
  })
})
