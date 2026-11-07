import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { MAX_AGE_MS, modeFor } from './live/cache.mjs'
import { AUTO_KEY, AUTO_STORAGE_KEY, MODE_KEY, MODE_STORAGE_KEY, PROFILES_KEY, PROFILES_STORAGE_KEY } from './live/color-by-digit-fixtures.mjs'

const source = (name) => readFileSync(new URL(`./live/${name}`, import.meta.url), 'utf8')
const moduleNames = readdirSync(new URL('./live/', import.meta.url)).filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs'))
const liveNames = moduleNames.filter((name) => name.endsWith('.live.mjs'))
const declares = (text, name) => new RegExp(`^\\s*(?:export\\s+)?(?:(?:async\\s+)?function\\s+|(?:const|let|var)\\s+)${name}\\b`, 'm').test(text)
const declarers = (name) => moduleNames.filter((file) => declares(source(file), name))

// What each shared module owns: nothing else in live/ may declare its own copy.
const OWNED = {
  'cache.mjs': ['START'],
  'page.mjs': ['openPage', 'startPuzzle', 'waitForFramework', 'gotoPuzzle', 'newPage', 'captureConsoleErrors'],
  'settings.mjs': ['openScriptDialog', 'closeDialogWith'],
  'settle.mjs': ['clickUntil', 'POLL_MS', 'SETTLE_MS'],
  'pen.mjs': ['openPenTool', 'padValues', 'penEntries', 'penValuesNoColor', 'penValuesAt', 'penStrings', 'cellCentre', 'gridPoint', 'mouseDrag', 'drag', 'draw', 'setSlider', 'plantSaved', 'plantUnchecked', 'keydownDefaults']
}
// The names the spec removed: their job is now a shared module's.
const REMOVED = ['closeWith', 'pressUntil', 'sleep', 'selectPen']
// What a live file boots with when it goes round page.mjs.
const OWN_BOOT = /\.newContext\(|\.goto\(|routeSudokuPad|puzzle-url\.txt|typeof Framework\b.*waitForFunction|waitForFunction\(.*typeof Framework\b/
const COLOR_BY_DIGIT = ['color-by-digit.live.mjs', 'color-by-digit-mode.live.mjs', 'color-by-digit-profiles.live.mjs', 'color-by-digit-digits.live.mjs', 'color-by-digit-sync.live.mjs']
// What the fixtures own for those files: the board, the keys, the selectors and the shared press, count and paint helpers.
const FIXTURE_NAMES = ['GIVENS', 'SEED', 'ODD_EVEN', 'LOW_FIVE_HIGH', 'BUTTON', 'EDITOR', 'ARROW', 'MENU', 'PROFILES_KEY', 'AUTO_KEY', 'MODE_KEY', 'buttonPoint', 'pressTo', 'labelOn', 'modeLabel', 'ROW_CORNER', 'coloredCountOn', 'givensColoredOn', 'paintOn']

// Spec 129's acceptance as one pass over the live harness, at `npm test`: the live files are read as text, and
// modeFor is run for each answer the version check can give. This seam is blind to real SudokuPad, so that the live
// files still pass through this harness is `npm run test:live`'s to show, and neither run covers a real Tampermonkey
// install or crackingthecryptic.com.
test('the live files share one harness, and the recording is replaced only when SudokuPad\'s version changed', () => {
  for (const [owner, names] of Object.entries(OWNED)) {
    for (const name of names) assert.deepEqual(declarers(name), [owner], name)
  }
  for (const name of REMOVED) assert.deepEqual(declarers(name), [], name)
  assert.deepEqual(moduleNames.filter((file) => /Start Puzzle\|Continue/.test(source(file))), ['cache.mjs'])

  for (const file of liveNames) {
    const text = source(file)
    assert.match(text, /from '\.\/(page|color-by-digit-fixtures)\.mjs'/, `${file} boots through the shared modules`)
    assert.doesNotMatch(text, OWN_BOOT, `${file} boots through page.mjs`)
  }

  for (const file of COLOR_BY_DIGIT) {
    const text = source(file)
    assert.match(text, /from '\.\/color-by-digit-fixtures\.mjs'/, file)
    for (const name of FIXTURE_NAMES) assert.equal(declares(text, name), false, `${file} declares ${name}`)
    assert.doesNotMatch(text, /ColorByDigit_|svencodes_|#control-colorbydigit|#color-by-digit-editor|#color-by-digit-menu|data-role="(?:mode|menu)"|530070000/, `${file} types the fixtures' board, keys or selectors`)
  }
  assert.equal(PROFILES_STORAGE_KEY, `svencodes_${PROFILES_KEY}`)
  assert.equal(AUTO_STORAGE_KEY, `svencodes_${AUTO_KEY}`)
  assert.equal(MODE_STORAGE_KEY, `svencodes_${MODE_KEY}`)
  assert.doesNotMatch(source('color-by-digit-fixtures.mjs'), /user\.js/, 'the keys are typed out (ADR 0001)')

  const recording = { env: {}, exists: true, mtimeMs: 0, now: MAX_AGE_MS + 1, refreshedThisRun: false }
  assert.equal(modeFor({ ...recording, now: MAX_AGE_MS }), 'replay', 'a recording checked within the day')
  assert.equal(modeFor(recording), 'needs-check', 'an older recording asks for the check')
  assert.equal(modeFor({ ...recording, versionCheck: 'same' }), 'restamp')
  assert.equal(modeFor({ ...recording, versionCheck: 'changed' }), 'record')
  assert.equal(modeFor({ ...recording, versionCheck: 'failed' }), 'replay')
  assert.equal(modeFor({ ...recording, exists: false }), 'record')
})
