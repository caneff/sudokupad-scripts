'use strict'
// Text Anywhere's notes go through one note session over the guarded store, old strokes and shapes ride aside and round-trip, Color by Digit and Text Anywhere
// take the Undo after a Restart by one shared tracker, and a note is found by one padded box, at the `npm test` seam.
// Blind to real SudokuPad: the Framework calls (localStorage behind getData and setData), the guard's bar on the page, rendering, and
// SudokuPad's own Restart and Undo. `npm run test:live` covers them on sudokupad.app: attack 73 in live/attacks-storage.live.mjs (a full
// store told in the bar), attack 49 in live/sudokupad-attacks.live.mjs and live/text-anywhere/text-anywhere-note-undo.live.mjs (Restart
// then Undo with both scripts installed).
require('./fake-page-storage.js')
const test = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { loadLib } = require('./load-lib.js')
const { quietly } = require('./fake-store.js')

const ROOT = join(__dirname, '..')
const textAnywhere = require(join(ROOT, 'text-anywhere.user.js'))
const { noteSession, textItem, readNotes, notesTouched, noteBox, noteScreenBox, noteStyle, flagStyle, pieceKinds, parseMarkdown, NOTES_PREFIX, RESTARTED_PREFIX, INDEX_KEY } = textAnywhere

const Framework = {}
const { createGuard, trackRestartUndo } = loadLib(['sudokupad'], ['createGuard', 'trackRestartUndo'], { Framework })

const quotaError = () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' })
const note = textItem([100, 50], '15', 3, 20)
const oldStroke = { kind: 'stroke', color: 1, width: 6, opacity: 100, points: [[0, 50], [200, 50]] }
const puzzles = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

// The script's note session over its guarded store, on a Framework holding `saved`; `fail(call, key)` is the error a write throws, or nothing.
function sessionOn (saved, fail = () => null) {
  const thrown = (call, key) => { const error = fail(call, key); if (error) throw error }
  Object.assign(Framework, {
    getData: (key) => (key in saved ? saved[key] : null),
    setData (key, value) { thrown('setData', key); saved[key] = value },
    removeData (key) { thrown('removeData', key); delete saved[key] }
  })
  const guard = createGuard({ script: 'text-anywhere', name: 'Text Anywhere', version: '1.0.0', features: { saved: { label: 'saved notes and settings', needs: {} } } })
  const reports = []
  return { session: noteSession({ store: guard.storeFor(guard.features.saved), report: (message) => reports.push(message) }), guard, reports }
}

test('notes saved through the guarded store load back for their puzzle, and an old stroke rides aside, never drawn, and is saved back as it was', () => {
  const saved = { [INDEX_KEY]: ['p1'], [NOTES_PREFIX + 'p1']: [note, oldStroke] }
  const { session, reports } = sessionOn(saved)
  assert.deepEqual(session.load('p1'), [note])
  session.save([note, { ...note, text: '16' }])
  assert.deepEqual(readNotes(saved[NOTES_PREFIX + 'p1'].data), { items: [note, { ...note, text: '16' }], kept: [oldStroke] })
  assert.deepEqual(sessionOn(saved).session.load('p1'), [note, { ...note, text: '16' }])
  assert.deepEqual(reports, [], 'an old entry is not reported as unreadable')
})

test('a save the browser refuses (a full store) is told by the guard, loses no other puzzle\'s notes, and leaves saving on', () => {
  const saved = { [INDEX_KEY]: puzzles(50) }
  for (const key of puzzles(50)) saved[NOTES_PREFIX + key] = [note]
  const before = structuredClone(saved)
  const { session, guard } = sessionOn(saved, (call, key) => (call === 'setData' && key === NOTES_PREFIX + 'p51' ? quotaError() : null))
  const { warnings } = quietly(() => {
    session.load('p51')
    session.save([note])
  })
  assert.deepEqual(saved, before)
  assert.deepEqual(guard.off, [])
  assert.equal(warnings.some((warning) => /browser refused the write/.test(warning)), true, JSON.stringify(warnings))
})

test('a remove that fails turns saving off by the guard\'s one policy, and nothing throws to the session\'s caller', () => {
  const saved = { [INDEX_KEY]: ['p1'], [RESTARTED_PREFIX + 'p1']: [note] }
  const { session, guard } = sessionOn(saved, (call) => (call === 'removeData' ? new Error('remove failed') : null))
  quietly(() => {
    assert.deepEqual(session.load('p1'), [])
    session.save([note])
    session.keepForRestart([note])
    assert.deepEqual(session.restoreAfterRestart(), [])
  })
  assert.deepEqual(guard.off, ['saved notes and settings'])
})

// SudokuPad's app as the tracker sees it, with Restart, a step and Undo as SudokuPad runs them.
function restartPage () {
  const handlers = { app: {}, puzzle: {} }
  const listen = (on) => (event, fn) => { (on[event] ??= []).push(fn) }
  const fire = (on, event, ...args) => (on[event] ?? []).forEach((fn) => fn(...args))
  const app = { preRestartSavedProgress: undefined, on: listen(handlers.app), puzzle: { undoStack: [], on: listen(handlers.puzzle) } }
  return {
    app,
    restart () {
      app.preRestartSavedProgress = { replay: 'kept' }
      app.puzzle.undoStack.length = 0
      fire(handlers.puzzle, 'reset')
      fire(handlers.app, 'restarted')
    },
    step () { app.puzzle.undoStack.push('sl:r1c1'); fire(handlers.puzzle, 'act', 'act', { type: 'select' }) },
    undo () {
      const { undoStack } = app.puzzle
      const loads = undoStack.length === 0 && app.preRestartSavedProgress !== undefined
      if (loads) app.preRestartSavedProgress = undefined
      else undoStack.pop()
      fire(handlers.puzzle, 'act', 'act', { type: 'undo' })
      if (loads) {
        undoStack.push('gs', 'cl:0', 'ge')
        fire(handlers.puzzle, 'progressloaded')
      }
    }
  }
}

test('the restart-Undo tracker tells Color by Digit and Text Anywhere which Undo loads the board from before a Restart', async () => {
  const page = restartPage()
  const tracker = trackRestartUndo(page.app, (fn) => fn)
  const undos = []
  tracker.onRestartUndo(() => { undos[undos.length - 1].notesBack = true })
  // Color by Digit asks before SudokuPad runs the Undo; Text Anywhere is called back after it.
  const undo = () => { undos.push({ modesBack: tracker.loadsBoard(), notesBack: false }); page.undo() }
  page.restart()
  await new Promise((resolve) => queueMicrotask(resolve))
  page.step()
  undo()
  undo()
  undo()
  assert.deepEqual(undos, [{ modesBack: false, notesBack: false }, { modesBack: true, notesBack: true }, { modesBack: false, notesBack: false }])
})

test('a note is found by one padded box, on the board and on the screen, and its style and pieces are pure functions', () => {
  const same = { toBoard: (point) => point, toScreen: (point) => point }
  for (const item of [note, { ...note, bg: true }]) {
    assert.deepEqual(noteScreenBox(item, same, 'medium'), noteBox(item, 'medium'))
    const { right } = noteBox(item, 'medium')
    assert.deepEqual(notesTouched([item], [right, 60], [right + 5, 60], 'medium'), [0])
    assert.deepEqual(notesTouched([item], [right + 0.1, 60], [right + 5, 60], 'medium'), [])
  }
  assert.equal(noteStyle(note, [0, 0], 1, '#fff', { outline: 'none', boxColor: 'page', frame: false }).textShadow, 'none')
  assert.deepEqual(flagStyle({ bold: true, underline: true }), { fontWeight: 'bold', textDecoration: 'underline' })
  assert.deepEqual(pieceKinds(parseMarkdown('- a\n```\nx\n```\nb')).map((piece) => piece.kind), ['bullet', 'code', 'plain'])
})
