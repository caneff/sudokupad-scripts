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

// The top-level suites (live/*.live.mjs), whose tests run the attacks of #590 and #628 with all six scripts on one page.
const topLevelSuites = liveFiles.filter((file) => /^live\/[^/]+\.live\.mjs$/.test(file))
const attackNumbers = (file) => [...read(file).matchAll(/\bit\(['`]attack (\d+):/g)].map((m) => Number(m[1]))

test('every top-level attack number belongs to one suite, and its suite is named attacks-*, so a rule can say attacks-*', () => {
  const seen = new Map()
  for (const file of topLevelSuites) {
    for (const n of new Set(attackNumbers(file))) seen.set(n, [...(seen.get(n) ?? []), file])
  }
  assert.ok(seen.size > 0)
  assert.deepEqual([...seen].filter(([, files]) => files.length > 1), [], 'an attack number used by two suites')
  assert.deepEqual(topLevelSuites.filter((file) => attackNumbers(file).length > 0 && !/^live\/attacks-[a-z-]+\.live\.mjs$/.test(file)), [])
  assert.ok(liveFiles.includes('live/attacks-replay.live.mjs'), 'attack 65, the replay tool, is an attacks-* suite too')
})

test('the suites that test the harness itself are named harness-*', () => {
  for (const file of ['live/harness-settings-dialog.live.mjs', 'live/harness-page-errors.live.mjs']) assert.ok(liveFiles.includes(file), file)
  assert.match(read('live/harness-settings-dialog.live.mjs'), /\bopenScriptDialog\b/)
  assert.match(read('live/harness-page-errors.live.mjs'), /\bcollectSkipLines\b|\berrors\b/)
})

test('all-scripts.mjs holds the all-six-scripts helpers, and no module is named attacks.mjs', () => {
  assert.equal(liveFiles.includes('live/attacks.mjs'), false)
  assert.deepEqual(declarersOf('openWithAllScripts'), ['live/all-scripts.mjs'])
})

test('page.mjs is the only home of the console-warning capture', () => {
  assert.deepEqual(liveFiles.filter((file) => /\.type\(\) === 'warning'/.test(read(file))), ['live/page.mjs'])
})

test('the slider helper reads the thumb\'s size from lib/panel.js, not a copy', () => {
  assert.doesNotMatch(read('live/slider.mjs'), /SLIDER_THUMB_REM\s*=\s*[\d.]/)
})

test('each script\'s element ids sit on its record in scripts.mjs, and settings.mjs keeps only the dialog mechanics', () => {
  const scriptId = /#(?:control-(?:colorbydigit|textanywhere)|(?:color-by-digit|dark-page|ui-tweaks|auto-rules-resizer|rules-resizer|pen-tool-extras|text-anywhere)-)/
  assert.doesNotMatch(read('live/settings.mjs'), scriptId, 'a script\'s element id in the settings helper')
  assert.deepEqual(topLevelSuites.concat(['live/all-scripts.mjs', 'live/puzzles.mjs']).filter((file) => /#control-(?:colorbydigit|textanywhere)'|'#dark-page-(?:style|dialog)'/.test(read(file))), [], 'a script id written out again')
  assert.deepEqual(declarersOf('EXTRAS_EDITOR'), ['live/scripts.mjs'])
  assert.doesNotMatch(read('live/settings.mjs'), /headerVersion/, 'the header is read from userscript-header.js')
})

test('issue filing and its trailer live in issues.mjs, not in the watch', () => {
  for (const name of ['fileIssue', 'issueTrailer']) assert.deepEqual(declarersOf(name), ['live/issues.mjs'], name)
  assert.doesNotMatch(read('live/watch.mjs'), /'issue', 'create'/)
})
