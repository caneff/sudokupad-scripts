import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { SETTINGS_SCRIPTS } from '../../live/scripts.mjs'
import { KINDS } from '../../live/fuzz/actions.mjs'
import { runFuzz } from '../../live/fuzz/engine.mjs'

// Spec #834's closing test: the live harness's shape, read off the tree and driven at the `npm test` seam. One settings record per dialog script that
// settings-shell, settings-copy-paste and attacks-storage loop over; shared live/*.mjs never import a script's folder; the board actions each have one home in
// live/board.mjs; the fuzz has no swarm and its engine takes its kinds; loadInPlace has one home; Pen Tool Extras' suites use the shared editor selector.
// Blind to real SudokuPad: the Framework calls, rendering and undo, so that the helpers still work against sudokupad.app is `npm run test:live`'s to show.
const ROOT = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8')
const liveFiles = readdirSync(new URL('live/', ROOT), { recursive: true }).filter((name) => name.endsWith('.mjs')).map((name) => `live/${name}`)
const sharedLive = readdirSync(new URL('live/', ROOT)).filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs') && !name.endsWith('.live.mjs')).map((name) => `live/${name}`)
const declares = (text, name) => new RegExp(`^\\s*(?:export\\s+)?(?:(?:async\\s+)?function\\s+|(?:const|let|var)\\s+)${name}\\b`, 'm').test(text)
const FROZEN = ['draw-tool.user.js']

test('#834: every script that copies in lib:settings-dialog has a settings record, UI Tweaks included, and the three dialog suites loop over the records', () => {
  const copying = readdirSync(ROOT).filter((f) => f.endsWith('.user.js') && !FROZEN.includes(f) && read(f).includes('// <lib:settings-dialog>'))
  assert.ok(copying.includes('ui-tweaks.user.js'))
  assert.deepEqual(copying.filter((f) => !SETTINGS_SCRIPTS.some((r) => r.file === f)), [])
  for (const suite of ['settings-shell', 'settings-copy-paste', 'attacks-storage']) {
    const text = read(`live/${suite}.live.mjs`)
    assert.match(text, /SETTINGS_SCRIPTS/, `${suite} loops over the records`)
    assert.doesNotMatch(text, /for \(const [^)]*\) of \[\s*\{/, `${suite} types no table of its own`)
  }
})

test('#834: no shared live/*.mjs imports from a script\'s folder', () => {
  const importing = sharedLive.filter((file) => /from\s+'\.\/(?!fuzz\/)[\w-]+\//.test(read(file)))
  assert.deepEqual(importing, [])
})

test('#834: live/board.mjs exports selectCell, colorCell, clickCell and currentTool, each defined once under live/', () => {
  const board = read('live/board.mjs')
  for (const name of ['selectCell', 'colorCell', 'clickCell', 'currentTool']) {
    assert.ok(declares(board, name) && new RegExp(`export\\s+(?:async\\s+)?(?:function\\s+|const\\s+)${name}\\b`).test(board), `${name} is exported by board.mjs`)
    assert.deepEqual(liveFiles.filter((file) => declares(read(file), name)), ['live/board.mjs'], name)
  }
})

test('#834: the fuzz has no swarm option left', () => {
  const files = liveFiles.filter((file) => file.startsWith('live/fuzz/') && !file.endsWith('.test.mjs'))
  assert.deepEqual(files.filter((file) => /\bswarm\b/i.test(read(file))), [])
  assert.doesNotMatch(read('live/README.md'), /\bswarm\b/i)
})

test('#834: the engine\'s unit tests do not import the real kind list, and runFuzz requires its kinds', async () => {
  assert.doesNotMatch(read('live/fuzz/engine.test.mjs'), /import\s*\{[^}]*\b(?:KINDS|KIND_NAMES|KIND_GROUPS)\b[^}]*\}\s*from\s*'\.\/actions\.mjs'/)
  await assert.rejects(runFuzz({ openTarget: async () => { throw new Error('opened') }, puzzles: [{ name: 'p' }], seed: 1, runs: 1 }), /needs kinds/)
})

test('#834: every real kind declares its scripts, whether it draws a stroke and whether it may start a list', () => {
  assert.ok(KINDS.length > 0)
  for (const k of KINDS) {
    assert.ok(Array.isArray(k.scripts), `${k.kind}: scripts`)
    assert.equal(typeof k.stroke, 'boolean', `${k.kind}: stroke`)
    assert.equal(typeof k.start, 'boolean', `${k.kind}: start`)
  }
  const engine = read('live/fuzz/engine.mjs') + read('live/fuzz/actions.mjs')
  assert.doesNotMatch(engine, /\b(?:KIND_SCRIPTS|START_KINDS|STROKE_KIND)\b\s*=/)
})

test('#834: loadInPlace lives in live/puzzles.mjs and nowhere else', () => {
  assert.deepEqual(liveFiles.filter((file) => declares(read(file), 'loadInPlace')), ['live/puzzles.mjs'])
})

test('#834: Pen Tool Extras\' suites never type the editor selector, they import it', () => {
  const suites = liveFiles.filter((file) => file.startsWith('live/pen-tool-extras/') && file.endsWith('.live.mjs'))
  assert.ok(suites.length > 0)
  assert.deepEqual(suites.filter((file) => read(file).includes('#pen-tool-extras-editor')), [])
})

// #984 (spec #967): the name checks above miss a copy under a new name, so these read the bodies too.
const declarersOf = (name) => liveFiles.filter((file) => declares(read(file), name))
// A wait inside a try whose finally lets the mouse go: every hold-for-pickers copy had this shape, whatever pressed first.
const holding = (file) => /try \{\s*\n\s*await [^\n]*waitFor\([^\n]*\n\s*\} finally \{\s*\n\s*await [^\n]*mouse\.up\(/.test(read(file))

test('#984: board.mjs is the only home of the cell actions and the board reads, and attack-fixtures.mjs is folded into it', () => {
  assert.equal(liveFiles.includes('live/attack-fixtures.mjs'), false)
  for (const name of ['pickTool', 'emptyCell', 'cellState', 'boardState', 'cellProps']) assert.deepEqual(declarersOf(name), ['live/board.mjs'], name)
  assert.deepEqual(declarersOf('paintOn'), [], 'paintOn is colorCell under another name')
  // SudokuPad's select call on a cell given by variables, as selectCell makes it, and a cell's box read off its element, as cellCentre reads it.
  assert.deepEqual(liveFiles.filter((file) => /a\.deselect\(\); a\.select\(a\.grid\.getCell\([a-z]\w*, [a-z]\w*\)\)/.test(read(file))), ['live/board.mjs'])
  assert.doesNotMatch(read('live/scripts.mjs'), /getBoundingClientRect/, 'Pen Tool Extras\' act finds its point through board.mjs')
  assert.deepEqual(liveFiles.filter((file) => read(file).includes("c.propGet('normal'), c.propGet('corner'), c.propGet('centre'), c.propGet('colour')")), ['live/board.mjs'])
})

test('#984: input.mjs is the only home of middleOf and the hold-for-pickers gesture', () => {
  for (const name of ['middleOf', 'holdUntil']) assert.deepEqual(declarersOf(name), ['live/input.mjs'], name)
  const boxCentre = /^\s*(?:export\s+)?const (?:center|centre|middle)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/m
  assert.deepEqual(liveFiles.filter((file) => boxCentre.test(read(file))), [], 'a box centre helper under another name')
  assert.deepEqual(liveFiles.filter(holding), ['live/input.mjs'], 'a press, a wait for the pickers and a release in finally, written again')
})

test('#984: settings.mjs is the only home of the saved-value reads, and no other script\'s suite imports Color by Digit\'s fixtures', () => {
  for (const name of ['savedState', 'savedValue']) assert.deepEqual(declarersOf(name), ['live/settings.mjs'], name)
  const savedRead = /(?:evaluate|read)\((?:\w+, )?\(\w+\) => Framework\.getData\(\w+\) \?\? null, \w+\)/
  assert.deepEqual(liveFiles.filter((file) => savedRead.test(read(file))), ['live/settings.mjs'])
  const penSuites = liveFiles.filter((file) => file.startsWith('live/pen-tool-extras/'))
  assert.ok(penSuites.length > 0)
  assert.deepEqual(penSuites.filter((file) => /color-by-digit-fixtures/.test(read(file))), [])
  assert.deepEqual(liveFiles.filter((file) => /import \{[^}]*\bsavedState\b[^}]*\} from '[^']*color-by-digit-fixtures\.mjs'/.test(read(file))), [])
})

test('#984: Color by Digit\'s profiles suite drags rows and types names through its fixtures', () => {
  const suite = read('live/color-by-digit/color-by-digit-profiles.live.mjs')
  assert.doesNotMatch(suite, /pressSequentially|DROP_PAST_MIDDLE_PX/, 'the suite types or places a drag of its own')
  assert.match(suite, /\bdragProfileRow\b/)
  assert.match(suite, /\btypeProfileName\b/)
})
