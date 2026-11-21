'use strict'
// The shared settings dialog's Restore defaults as a draft and its error status, at the `npm test` seam. Color by Digit and Auto Rules Resizer stand in as
// the scripts that hand the dialog a restore and a refusing save.
// Blind to real SudokuPad: rendering (the dialog fitting at 1280x720) and the Framework calls. `npm run test:live` covers them on sudokupad.app.
const test = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { loadLib } = require('./load-lib.js')

const ROOT = join(__dirname, '..')
const colorByDigit = require(join(ROOT, 'color-by-digit.user.js'))
const rulesResizer = require(join(ROOT, 'auto-rules-resizer.user.js'))
const { showSettingsDialog } = loadLib(['sudokupad', 'write-style', 'settings-dialog'], ['showSettingsDialog'], { Framework: {} })

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
