import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

// The live harness's shared helpers each have one home: the cell actions and board reads in live/board.mjs, middleOf and the hold-for-pickers gesture in
// live/input.mjs, the saved-value reads in live/settings.mjs, and Color by Digit's row drag and name typing in its fixtures. A check by name misses a copy
// under a new name, so these read the bodies too. Blind to real SudokuPad: that the helpers still work on sudokupad.app is `npm run test:live`'s to show.
const ROOT = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8')
const liveFiles = readdirSync(new URL('live/', ROOT), { recursive: true }).filter((name) => name.endsWith('.mjs')).map((name) => `live/${name}`)
const declares = (text, name) => new RegExp(`^\\s*(?:export\\s+)?(?:(?:async\\s+)?function\\s+|(?:const|let|var)\\s+)${name}\\b`, 'm').test(text)
const declarersOf = (name) => liveFiles.filter((file) => declares(read(file), name))
// A wait inside a try whose finally lets the mouse go: every hold-for-pickers copy had this shape, whatever pressed first.
const holding = (file) => /try \{\s*\n\s*await [^\n]*waitFor\([^\n]*\n\s*\} finally \{\s*\n\s*await [^\n]*mouse\.up\(/.test(read(file))

test('board.mjs is the only home of the cell actions and the board reads, and attack-fixtures.mjs is folded into it', () => {
  assert.equal(liveFiles.includes('live/attack-fixtures.mjs'), false)
  for (const name of ['pickTool', 'emptyCell', 'cellState', 'boardState', 'cellProps']) assert.deepEqual(declarersOf(name), ['live/board.mjs'], name)
  assert.deepEqual(declarersOf('paintOn'), [], 'paintOn is colorCell under another name')
  // SudokuPad's select call on a cell given by variables, as selectCell makes it, and a cell's box read off its element, as cellCentre reads it.
  assert.deepEqual(liveFiles.filter((file) => /a\.deselect\(\); a\.select\(a\.grid\.getCell\([a-z]\w*, [a-z]\w*\)\)/.test(read(file))), ['live/board.mjs'])
  assert.doesNotMatch(read('live/scripts.mjs'), /getBoundingClientRect/, 'Pen Tool Extras\' act finds its point through board.mjs')
  assert.deepEqual(liveFiles.filter((file) => read(file).includes("c.propGet('normal'), c.propGet('corner'), c.propGet('centre'), c.propGet('colour')")), ['live/board.mjs'])
})

test('input.mjs is the only home of middleOf and the hold-for-pickers gesture', () => {
  for (const name of ['middleOf', 'holdUntil']) assert.deepEqual(declarersOf(name), ['live/input.mjs'], name)
  const boxCentre = /^\s*(?:export\s+)?const (?:center|centre|middle)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/m
  assert.deepEqual(liveFiles.filter((file) => boxCentre.test(read(file))), [], 'a box centre helper under another name')
  assert.deepEqual(liveFiles.filter(holding), ['live/input.mjs'], 'a press, a wait for the pickers and a release in finally, written again')
})

test('settings.mjs is the only home of the saved-value reads, and no other script\'s suite imports Color by Digit\'s fixtures', () => {
  for (const name of ['savedState', 'savedValue']) assert.deepEqual(declarersOf(name), ['live/settings.mjs'], name)
  const savedRead = /(?:evaluate|read)\((?:\w+, )?\(\w+\) => Framework\.getData\(\w+\) \?\? null, \w+\)/
  assert.deepEqual(liveFiles.filter((file) => savedRead.test(read(file))), ['live/settings.mjs'])
  const penSuites = liveFiles.filter((file) => file.startsWith('live/pen-tool-extras/'))
  assert.ok(penSuites.length > 0)
  assert.deepEqual(penSuites.filter((file) => /color-by-digit-fixtures/.test(read(file))), [])
  assert.deepEqual(liveFiles.filter((file) => /import \{[^}]*\bsavedState\b[^}]*\} from '[^']*color-by-digit-fixtures\.mjs'/.test(read(file))), [])
})

test('Color by Digit\'s profiles suite drags rows and types names through its fixtures', () => {
  const suite = read('live/color-by-digit/color-by-digit-profiles.live.mjs')
  assert.doesNotMatch(suite, /pressSequentially|DROP_PAST_MIDDLE_PX/, 'the suite types or places a drag of its own')
  assert.match(suite, /\bdragProfileRow\b/)
  assert.match(suite, /\btypeProfileName\b/)
})
