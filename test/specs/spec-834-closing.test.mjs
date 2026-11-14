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
  await assert.rejects(runFuzz({ openTarget: async () => { throw new Error('opened') }, puzzles: [{ name: 'p' }], seed: 1, runs: 1 }))
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
