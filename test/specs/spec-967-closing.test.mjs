// Spec #967's closing test: the fuzz report written and read by one module, one issue trailer for the watch and the nightly, a checked
// targetAt, a mutant's load error told from the harness's own, attack 17 written once, plantSaved and useTool gone, and every workflow
// reading Node's version from .nvmrc, driven at the `npm test` seam. The shared live modules' single homes (#984) are checked in
// spec-834-closing.test.mjs, and the test-audit rewrites (#985, #986) are tests themselves, each shown to fail on a planted break.
// Blind to real SudokuPad: the Framework calls, rendering and undo the rewritten live suites and attack 17 drive (`npm run test:live`
// covers them on sudokupad.app), and to GitHub Actions itself: setup-node reading .nvmrc is checked in the workflow files, not run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatFuzzReport, parseFuzzOutput } from '../../live/fuzz/fuzz-report.mjs'
import { didNotRunIssue as nightlyDidNotRun } from '../../live/fuzz/nightly.mjs'
import { mutantLoadProblem } from '../../live/fuzz/mutants-stats.mjs'
import { FUZZ_PUZZLES, targetAt } from '../../live/fuzz/puzzle-set.mjs'
import { didNotRunIssue as watchDidNotRun, issueTrailer } from '../../live/watch.mjs'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const read = (file) => readFileSync(join(ROOT, file), 'utf8')
const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [relative(ROOT, join(ROOT, dir, e.name))])
const liveFiles = walk('live').filter((file) => file.endsWith('.mjs'))

test('#981: a failed fuzz run printed by fuzz-report.mjs is read back whole by the same module', () => {
  const result = { failed: true, puzzle: 'killer', seed: 42, error: 'TypeError: x is undefined\n    at note.js:3', sequence: ['press Tab', 'click r1c1'], replayCommand: 'npm run test:fuzz -- --seed 42 --path "1:0"', errorLog: ['text-anywhere: boom'] }
  assert.deepEqual(parseFuzzOutput(formatFuzzReport(result, 12).join('\n')), {
    failed: true, puzzle: 'killer', seed: 42, error: result.error, steps: result.sequence, replay: result.replayCommand, log: result.errorLog
  })
  assert.deepEqual(parseFuzzOutput(formatFuzzReport({ failed: false, runs: 3, seed: 1, puzzleRuns: { killer: 3 } }, 5).join('\n')), { passed: true })
})

test('#983: the watch and the nightly end their issues with the one trailer builder, and plantSaved and useTool are gone', () => {
  assert.ok(watchDidNotRun('v1', 'why').body.endsWith(issueTrailer('npm run watch:live', 'live/watch.mjs')))
  assert.ok(nightlyDidNotRun('why').body.endsWith(issueTrailer('npm run fuzz:nightly', 'live/fuzz/nightly.mjs')))
  assert.deepEqual(liveFiles.filter((file) => !file.endsWith('.test.mjs') && read(file).includes('## Blocked by')), ['live/watch.mjs'], 'one file writes the Blocked by section')
  for (const name of ['plantSaved', 'useTool']) {
    assert.deepEqual(liveFiles.filter((file) => new RegExp(`export (?:async )?(?:function|const) ${name}\\b`).test(read(file))), [], name)
  }
})

test('#982: targetAt names a mistyped cell at once, and a mutant\'s load error is told from the harness failing', async () => {
  const puzzle = FUZZ_PUZZLES[0]
  const [row, col] = puzzle.cells[2]
  assert.equal(targetAt(puzzle, row, col), 2)
  assert.throws(() => targetAt(puzzle, 99, 99), /r100c100 is no target/)
  const page = { snapshot: async () => ({ errors: [] }), close: async () => {} }
  const broken = async () => { throw new Error('mutant page did not open') }
  assert.equal(await mutantLoadProblem(broken, async () => page), 'mutant page did not open', 'a mutant that alone fails to load is the mutant\'s')
  await assert.rejects(mutantLoadProblem(broken, broken), /harness failure/, 'a failure the unmutated scripts share is the harness\'s')
})

test('#986: attack 17 is written once, in slider.mjs, and run by both scripts\' suites', () => {
  assert.deepEqual(liveFiles.filter((file) => /export async function assertSliderDragEndsOnHotkey\b/.test(read(file))), ['live/slider.mjs'])
  const callers = liveFiles.filter((file) => file.endsWith('.live.mjs') && read(file).includes('assertSliderDragEndsOnHotkey('))
  assert.equal(callers.length, 2, callers.join(', '))
})

test('#987: all four workflows read Node\'s version from .nvmrc, and none pins it', () => {
  const workflows = readdirSync(join(ROOT, '.github', 'workflows')).filter((f) => f.endsWith('.yml')).map((f) => read(join('.github', 'workflows', f)))
  const settingUpNode = workflows.filter((text) => text.includes('actions/setup-node'))
  assert.equal(settingUpNode.length, 4)
  for (const text of settingUpNode) {
    assert.match(text, /node-version-file: \.nvmrc/)
    assert.doesNotMatch(text, /node-version: /)
  }
  assert.match(read('.nvmrc'), /^\d+\s*$/)
})
