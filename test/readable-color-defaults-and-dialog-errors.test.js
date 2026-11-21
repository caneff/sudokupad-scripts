'use strict'
// Readable color defaults that never override a saved choice, Text Anywhere's new-note size and size-step repeat, Auto Rules Resizer's refused limits and
// floors, Restore defaults as a draft, and the shared dialog's error status, at the `npm test` seam.
// Blind to real SudokuPad: rendering (the measured contrast, the selected-color ring, the dialog fitting at 1280x720, Dark Page's trays and
// overlay), the Framework calls and undo. `npm run test:live` covers them on sudokupad.app.
const test = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { loadLib } = require('./load-lib.js')
const { fakeStore, quietly } = require('./fake-store.js')

const ROOT = join(__dirname, '..')
const colorByDigit = require(join(ROOT, 'color-by-digit.user.js'))
const textAnywhere = require(join(ROOT, 'text-anywhere.user.js'))
const rulesResizer = require(join(ROOT, 'auto-rules-resizer.user.js'))
const { showSettingsDialog } = loadLib(['sudokupad', 'write-style', 'settings-dialog'], ['showSettingsDialog'], { Framework: {} })

const PROFILES_KEY = 'ColorByDigit_profiles'
const LEGACY_KEY = 'ColorByDigit_groups'
const lowFiveHigh = (low, high) => [{ key: low, digits: ['0', '1', '2', '3', '4'] }, { key: '5', digits: ['5'] }, { key: high, digits: ['6', '7', '8', '9'] }]
const loaded = (stored) => quietly(() => colorByDigit.stateFromStored(fakeStore(stored))).result

test('Color by Digit\'s Low/5/High preloads keys 6, 5 and q; the old 1, 5, 9 groups convert to it with no Custom profile; saved profiles are kept', () => {
  const { PRELOADS, activeGroups } = colorByDigit
  assert.deepEqual(PRELOADS['Low/5/High'], lowFiveHigh('6', 'q'))
  const fresh = loaded({})
  assert.deepEqual(activeGroups(fresh), lowFiveHigh('6', 'q'))
  const converted = loaded({ [LEGACY_KEY]: lowFiveHigh('1', '9') })
  assert.deepEqual(converted.profiles.map((profile) => profile.name), fresh.profiles.map((profile) => profile.name))
  assert.deepEqual(activeGroups(converted), lowFiveHigh('6', 'q'))
  const saved = { profiles: [{ name: 'Low/5/High', groups: lowFiveHigh('1', '9') }], active: 0 }
  assert.deepEqual(activeGroups(loaded({ [PROFILES_KEY]: structuredClone(saved) })), lowFiveHigh('1', '9'))
})

test('Text Anywhere\'s note color is 2 with nothing saved and a saved 1 stays 1', () => {
  const { readColor } = textAnywhere
  assert.equal(readColor(undefined), 2)
  assert.equal(readColor(null), 2)
  assert.equal(readColor(1), 1)
})

test('a new note\'s size follows the cell size against a 9x9, and holding + or - repeats faster as it is held, up to a cap', () => {
  const { newNoteWidth, textSizeFor, DEFAULT_WIDTH, REFERENCE_GRID, heldSliderSteps, HELD_SLIDER_MAX_STEPS, HELD_REPEAT_MS, HELD_RAMP_MS } = textAnywhere
  assert.equal(REFERENCE_GRID, 9)
  assert.equal(newNoteWidth(DEFAULT_WIDTH, 9), DEFAULT_WIDTH)
  // Measured in cells, the drawn size on a 4x4 and a 16x16 is within a fifth of a 9x9's.
  const inCells = (grid) => textSizeFor(newNoteWidth(DEFAULT_WIDTH, grid)) / grid
  for (const grid of [4, 16]) assert.ok(Math.abs(inCells(grid) / inCells(9) - 1) < 0.2, `${grid}x${grid}`)
  // Not the 9x9's size unchanged, which against the cell would be 2.25 times as big on a 4x4 and little over half on a 16x16.
  assert.ok(newNoteWidth(DEFAULT_WIDTH, 4) < DEFAULT_WIDTH && newNoteWidth(DEFAULT_WIDTH, 16) > DEFAULT_WIDTH)
  // Steps a tick, by how long the key has been held: none before the pause, then one, ramping to the cap.
  assert.equal(heldSliderSteps(HELD_REPEAT_MS - 1), 0, 'a short press is one step, taken on the press')
  assert.equal(heldSliderSteps(HELD_REPEAT_MS), 1)
  const ticks = [HELD_REPEAT_MS, HELD_RAMP_MS / 2, HELD_RAMP_MS, HELD_RAMP_MS * 2].map(heldSliderSteps)
  assert.ok(ticks.every((steps, i) => i === 0 || steps >= ticks[i - 1]) && ticks.at(-1) > ticks[0], `${ticks}`)
  assert.equal(HELD_SLIDER_MAX_STEPS > 1, true)
  assert.equal(heldSliderSteps(HELD_RAMP_MS * 10), HELD_SLIDER_MAX_STEPS)
})

test('Auto Rules Resizer refuses a limit under its floor or not whole pixels, and reads a saved one under the floor as the floor', () => {
  const { limitFromBox, readLimits, LIMIT_FLOORS, MAX_HEIGHT_KEY, MAX_WIDTH_KEY } = rulesResizer
  assert.deepEqual(LIMIT_FLOORS, { maxWidth: 240, maxHeight: 112 })
  assert.equal(limitFromBox('', 'maxHeight'), null)
  assert.equal(limitFromBox('112', 'maxHeight'), 112)
  for (const [text, name] of [['111', 'maxHeight'], ['239', 'maxWidth'], ['300.5', 'maxHeight'], ['abc', 'maxWidth']]) {
    assert.throws(() => limitFromBox(text, name), /must be a whole number of pixels/, `${name} ${text}`)
  }
  const { result } = quietly(() => readLimits(fakeStore({ [MAX_HEIGHT_KEY]: { v: 0, data: 50 }, [MAX_WIDTH_KEY]: { v: 0, data: 100 } })))
  assert.deepEqual(result, { maxWidth: 240, maxHeight: 112 })
})

// The shared dialog, with SudokuPad's showDialog and the page faked: Save, Cancel and the extra buttons are the options showDialog is given.
function fakeDialog ({ save, restore }) {
  const status = { textContent: '', dataset: {} }
  const listeners = []
  const dialog = {
    addEventListener () {},
    querySelector: (selector) => selector === '[data-role="settings-status"]' ? status : selector === '.dialog-options' ? { querySelectorAll: () => [] } : { textContent: '', addEventListener () {} }
  }
  const body = { closest: () => dialog, addEventListener: (type, fn) => listeners.push({ type, fn }) }
  const doc = { head: { appendChild () {} }, createElement: () => ({}), getElementById: (id) => id === 'body' ? body : null }
  let options = []
  let closed = 0
  const framework = { showDialog: (config) => { options = config.parts.find((part) => part.tag === 'options').options }, closeDialog: () => { closed++ } }
  const win = { addEventListener () {}, removeEventListener () {} }
  showSettingsDialog(framework, {
    prefix: 'x-',
    name: 'Demo',
    version: '1',
    bodyId: 'body',
    off: [],
    changed: () => true,
    save,
    snapshot: () => () => {},
    feature: { runInDialog: (fn) => fn() },
    copyPaste: { copied: () => '{}', readers: {}, apply () {} },
    restore,
    extraButtons: [{ content: 'Reset puzzle size', role: 'reset-size', handler () {} }]
  }, { doc, win })
  const press = (label) => options.find((option) => option.content === label).handler()
  const input = () => listeners.filter((l) => l.type === 'input').forEach((l) => l.fn({ type: 'input', target: {} }))
  return { status, press, input, closed: () => closed }
}

test('Restore defaults changes only the draft, so Cancel undoes it and Save applies it', () => {
  const { openingDraft, reduceDraft, layoutPages } = colorByDigit
  const saved = { profiles: [{ name: 'Mine', groups: [{ key: '1', digits: ['1'] }] }], active: 0 }
  const kept = structuredClone(saved)
  const restored = reduceDraft(openingDraft(saved, 'cell', layoutPages([['1', '6', 'q'].map((key) => ({ key }))], 1, () => '#fff')), { type: 'restore' })
  assert.deepEqual(restored.state.profiles.map((profile) => profile.name), ['Low/5/High', 'Odd/Even', 'Entropic', 'Modular', 'Each digit'])
  assert.deepEqual(saved, kept, 'the saved profiles are untouched until Save')
  const writes = []
  const cancelled = fakeDialog({ save: () => writes.push('save'), restore: () => writes.push('draft') })
  cancelled.press('Restore defaults')
  cancelled.press('Cancel')
  assert.deepEqual([writes, cancelled.closed()], [['draft'], 1])
  const savedDialog = fakeDialog({ save: () => writes.push('save'), restore () {} })
  savedDialog.press('Restore defaults')
  savedDialog.press('Save')
  assert.deepEqual([writes, savedDialog.closed()], [['draft', 'save'], 1])
})

test('a refused Save keeps the dialog open with an error in the status line, which the next edit clears and Reset puzzle size does not', () => {
  const save = () => rulesResizer.limitFromBox('50', 'maxHeight')
  const dialog = fakeDialog({ save, restore () {} })
  dialog.press('Save')
  assert.equal(dialog.closed(), 0)
  assert.match(dialog.status.textContent, /^Not saved: Max auto height must be a whole number of pixels, 112 or more$/)
  assert.equal(dialog.status.dataset.tone, 'error')
  dialog.press('Reset puzzle size')
  assert.equal(dialog.status.dataset.tone, 'error')
  dialog.input()
  assert.deepEqual([dialog.status.textContent, dialog.status.dataset.tone], ['', undefined])
  dialog.press('Save')
  dialog.press('Restore defaults')
  assert.deepEqual([dialog.status.textContent, dialog.status.dataset.tone], ['', undefined])
})
