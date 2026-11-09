import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { quietPage } from './fake-target.mjs'
import { RULES, ruleViolations } from './rules.mjs'

const rule = (name) => RULES.find((r) => r.name === name)
// `earlier` is the step before `before` as overrides of its page: `{ action, page }`, with its own `earlier` the same way.
const check = (name, now, { before = {}, action = 'click cell', earlier = null } = {}) => {
  const step = (e) => e && { action: e.action, before: { page: quietPage(e.page) }, earlier: step(e.earlier) }
  const earlierStep = step(earlier)
  return rule(name).check({ now: { page: quietPage(now) }, before: { page: quietPage(before) }, action, earlier: earlierStep })
}

const colorByDigit = (mode, cells, groups = [{ key: '5', digits: ['5'] }, { key: '9', digits: ['6', '7', '8', '9'] }]) => ({ mode, groups, cells: cells.map(([digit, colours = [], given = false]) => ({ digit, given, colours })) })

describe('the rules', () => {
  it('the rule names are unique', () => {
    const names = RULES.map((r) => r.name)
    assert.equal(new Set(names).size, names.length)
  })

  it('a quiet page breaks none, and a violation is reported with its rule name', () => {
    assert.deepEqual(ruleViolations({ now: { page: quietPage() }, before: { page: quietPage() }, action: 'click cell' }), [])
    assert.deepEqual(ruleViolations({ now: { page: quietPage({ pageColor: 'rgb(255, 255, 255)' }) }, before: { page: quietPage() }, action: 'click cell' }), ['page-stays-dark: the page color rgb(255, 255, 255) is not dark'])
  })

  describe('undo-to-start', () => {
    it('holds while the undo stack has steps, whatever the cells hold', () => {
      assert.deepEqual(check('undo-to-start', { undoDepth: 2, cells: ['5///5', '', ''] }), [])
    })
    it('holds when the undo stack is empty and the board is bare', () => {
      assert.deepEqual(check('undo-to-start', { undoDepth: 0, cells: ['', '', ''] }), [])
    })
    it('fails when the undo stack is empty and a cell still holds something', () => {
      assert.deepEqual(check('undo-to-start', { undoDepth: 0, cells: ['', '////12', ''] }), ['the undo stack is empty but cell 1 still holds "////12"'])
    })
    it('fails when the undo stack is empty and a pen stroke is still drawn, though the state holds none', () => {
      assert.deepEqual(check('undo-to-start', { undoDepth: 0, penDrawn: ['pen-1 pencolor-2'] }), ['the undo stack is empty but a pen stroke is still drawn: pen-1 pencolor-2'])
    })
    it('fails when the undo stack is empty and a cell is still colored', () => {
      const colored = colorByDigit('Cell', [[''], ['', ['5']]])
      assert.deepEqual(check('undo-to-start', { undoDepth: 0, colorByDigit: colored }), ['the undo stack is empty but cell 1 is still colored 5'])
    })
    it('leaves the notes alone, which do not ride the undo stack', () => {
      assert.deepEqual(check('undo-to-start', { undoDepth: 0, notesSaved: [{ kind: 'text', text: '15' }], notesDrawn: ['15'], notesSeen: ['15'] }), [])
    })
  })

  describe('pen-lines-drawn', () => {
    it('holds when the state and the board have the same strokes, in any order and with repeats', () => {
      assert.deepEqual(check('pen-lines-drawn', { penState: ['pen-1 pencolor-2', 'pen-1 pencolor-2', 'pen-5 pencolor-3'], penDrawn: ['pen-5 pencolor-3', 'pen-1 pencolor-2', 'pen-1 pencolor-2'] }), [])
    })
    it('fails for a stroke in the state that is not drawn', () => {
      assert.deepEqual(check('pen-lines-drawn', { penState: ['pen-1 pencolor-2'], penDrawn: [] }), ['in the state but not drawn: pen-1 pencolor-2'])
    })
    it('fails for a stroke drawn that is not in the state', () => {
      assert.deepEqual(check('pen-lines-drawn', { penState: [], penDrawn: ['pen-1 pencolor-2'] }), ['drawn but not in the state: pen-1 pencolor-2'])
    })
    it('fails for a stroke drawn once that the state holds twice', () => {
      assert.deepEqual(check('pen-lines-drawn', { penState: ['pen-1 pencolor-2', 'pen-1 pencolor-2'], penDrawn: ['pen-1 pencolor-2'] }), ['in the state but not drawn: pen-1 pencolor-2'])
    })
  })

  describe('notes-saved-match-drawn', () => {
    const items = (...texts) => texts.map((text) => ({ kind: 'text', text }))
    it('holds with no notes saved and none drawn, and with the same notes in another order', () => {
      assert.deepEqual(check('notes-saved-match-drawn', { notesSaved: null, notesDrawn: [] }), [])
      assert.deepEqual(check('notes-saved-match-drawn', { notesSaved: items('15', 'a→b'), notesDrawn: ['a→b', '15'] }), [])
    })
    it('fails for a note saved and not drawn', () => {
      assert.deepEqual(check('notes-saved-match-drawn', { notesSaved: items('15'), notesDrawn: [] }), ['saved but not drawn: "15"'])
    })
    it('fails for a note drawn and not saved', () => {
      assert.deepEqual(check('notes-saved-match-drawn', { notesSaved: null, notesDrawn: ['15'] }), ['drawn but not saved: "15"'])
    })
    it('ignores a saved item that is not a note', () => {
      assert.deepEqual(check('notes-saved-match-drawn', { notesSaved: [{ kind: 'stroke' }, { kind: 'text', text: '15' }], notesDrawn: ['15'] }), [])
    })
    it('fails for a note whose saved text differs from the drawn one', () => {
      assert.equal(check('notes-saved-match-drawn', { notesSaved: items('15'), notesDrawn: ['51'] }).length, 2)
    })
  })

  describe('notes-survive-reload', () => {
    it('holds when the notes drawn after a reload are the ones drawn before it, in any order', () => {
      assert.deepEqual(check('notes-survive-reload', { notesSeen: ['b', 'a'] }, { before: { notesSeen: ['a', 'b'] }, action: 'reload' }), [])
    })
    it('fails when a reload loses a note', () => {
      assert.deepEqual(check('notes-survive-reload', { notesSeen: ['a'] }, { before: { notesSeen: ['a', 'b'] }, action: 'reload' }), ['seen before the reload and not after it: "b"'])
    })
    it('fails when a reload adds a note', () => {
      assert.equal(check('notes-survive-reload', { notesSeen: ['a', 'a'] }, { before: { notesSeen: ['a'] }, action: 'reload' }).length, 1)
    })
    it('holds when a note that was open for typing before the reload is a finished note after it', () => {
      const open = check('notes-survive-reload', { notesDrawn: ['15', '1'], notesSeen: ['15', '1'] }, { before: { notesDrawn: ['15'], notesSeen: ['15', '1'] }, action: 'reload' })
      assert.deepEqual(open, [])
    })
    it('fails when a reload loses the note that was open for typing', () => {
      assert.deepEqual(check('notes-survive-reload', { notesDrawn: ['15'], notesSeen: ['15'] }, { before: { notesDrawn: ['15'], notesSeen: ['15', '1'] }, action: 'reload' }), ['seen before the reload and not after it: "1"'])
    })
    it('says nothing after any other action, which may change the notes', () => {
      assert.deepEqual(check('notes-survive-reload', { notesSeen: [] }, { before: { notesSeen: ['a'] }, action: 'undo' }), [])
    })
  })

  describe('reload-changes-nothing', () => {
    const board = { cells: ['5///5', '', ''], penState: ['pen-1 pencolor-2'], penDrawn: ['pen-1 pencolor-2'], pageColor: 'rgb(0, 0, 32)', colorByDigit: colorByDigit('Digit', [['5', ['5']], [''], ['']]) }
    it('holds when the page after a reload is the page before it', () => {
      assert.deepEqual(check('reload-changes-nothing', board, { before: board, action: 'reload' }), [])
    })
    it('fails when a reload changes a cell, naming the field', () => {
      assert.deepEqual(check('reload-changes-nothing', { ...board, cells: ['', '', ''] }, { before: board, action: 'reload' }), ['cells was ["5///5","",""] and is now ["","",""]'])
    })
    it('fails when a reload changes the pen strokes drawn, the page color or the Color by Digit mode', () => {
      assert.equal(check('reload-changes-nothing', { ...board, penDrawn: [] }, { before: board, action: 'reload' }).length, 1)
      assert.equal(check('reload-changes-nothing', { ...board, pageColor: 'rgb(0, 0, 0)' }, { before: board, action: 'reload' }).length, 1)
      assert.equal(check('reload-changes-nothing', { ...board, colorByDigit: colorByDigit('Off', [['5', ['5']], [''], ['']]) }, { before: board, action: 'reload' }).length, 1)
    })
    it('holds when a reload draws the same strokes in another order', () => {
      const two = { penState: ['pen-1 pencolor-1', 'pen-e pencolor-1'], penDrawn: ['pen-1 pencolor-1', 'pen-e pencolor-1'] }
      assert.deepEqual(check('reload-changes-nothing', { ...two, penState: [...two.penState].reverse(), penDrawn: [...two.penDrawn].reverse() }, { before: two, action: 'reload' }), [])
    })
    // SudokuPad serializes a pen entry, color included, after its cell's fifth slash.
    const penned = (color, mode = 'Digit') => ({ ...board, cells: ['5///5', `/////2${color}`, ''], penState: [`pen-2 pencolor-${color}`], penDrawn: [`pen-2 pencolor-${color}`], colorByDigit: colorByDigit(mode, [['5', ['5']], [''], ['']]) })
    const afterPen = { before: penned(2), action: 'reload', earlier: { action: 'pen drag, second button', page: board } }
    it('holds when a reload right after a pen action draws every stroke in color 1, in every Color by Digit mode (SudokuPad alone does it, #681)', () => {
      for (const mode of ['Cell', 'Digit', 'Both', 'Off']) assert.deepEqual(check('reload-changes-nothing', penned(1, mode), { ...afterPen, before: penned(2, mode) }), [], mode)
    })
    it('fails when a reload gives a stroke another color than color 1, or changes its shape', () => {
      assert.equal(check('reload-changes-nothing', penned(3), afterPen).length, 3)
      assert.equal(check('reload-changes-nothing', { ...penned(1), penState: ['pen-5 pencolor-1'], penDrawn: ['pen-5 pencolor-1'] }, afterPen).length, 2)
    })
    it('fails on the color reset after any action but a pen action, which a script could cause', () => {
      assert.equal(check('reload-changes-nothing', penned(1), { ...afterPen, earlier: { action: 'click cell', page: board } }).length, 3)
      assert.equal(check('reload-changes-nothing', penned(1), { ...afterPen, earlier: null }).length, 3)
    })
    it('still compares the marks of a cell when it ignores the pen colors', () => {
      assert.equal(check('reload-changes-nothing', { ...penned(1), cells: ['6///5', '/////21', ''] }, afterPen).length, 1)
    })
    it('fails when a reload changes a digit', () => {
      assert.equal(check('reload-changes-nothing', { ...board, colorByDigit: colorByDigit('Digit', [['6', ['5']], [''], ['']]) }, { before: board, action: 'reload' }).length, 1)
    })
    it('fails when a reload changes the cell colors in Digit mode, which colors no cell', () => {
      assert.equal(check('reload-changes-nothing', { ...board, colorByDigit: colorByDigit('Digit', [['5', []], [''], ['']]) }, { before: board, action: 'reload' }).length, 1)
    })
    it('holds when a reload colors the cells in Cell or Both mode, which Color by Digit does every time the page opens', () => {
      for (const mode of ['Cell', 'Both']) {
        const bare = { cells: ['', '', ''], colorByDigit: colorByDigit(mode, [['5'], [''], ['']]) }
        const colored = { cells: ['5///5', '', ''], colorByDigit: colorByDigit(mode, [['5', ['5']], [''], ['']]) }
        assert.deepEqual(check('reload-changes-nothing', colored, { before: bare, action: 'reload' }), [], mode)
      }
    })
    it('leaves the notes to notes-survive-reload and the undo stack depth alone', () => {
      assert.deepEqual(check('reload-changes-nothing', { ...board, notesSeen: [], undoDepth: 0 }, { before: { ...board, notesSeen: ['a'], undoDepth: 4 }, action: 'reload' }), [])
    })
    it('says nothing after any other action, which may change the page', () => {
      assert.deepEqual(check('reload-changes-nothing', { cells: ['', '', ''] }, { before: board, action: 'undo' }), [])
    })
  })

  describe('undo-redo-restores', () => {
    const board = { undoDepth: 2, cells: ['5///5', '', ''], penState: ['pen-1 pencolor-2'], penDrawn: ['pen-1 pencolor-2'], colorByDigit: colorByDigit('Cell', [['5', ['5']], [''], ['']]) }
    const undone = { undoDepth: 1, cells: ['', '', ''], penState: [], penDrawn: [], colorByDigit: colorByDigit('Cell', [[''], [''], ['']]) }
    const undoThenRedo = (now, earlierPage = board) => check('undo-redo-restores', now, { before: undone, action: 'redo', earlier: { action: 'undo', page: earlierPage } })
    it('holds when a redo right after an undo gives back the page from before the undo', () => {
      assert.deepEqual(undoThenRedo(board), [])
    })
    it('holds when the reload before the undo brought the strokes back in color 1 and the redo gives their saved color back (#681)', () => {
      const reloaded = { ...board, cells: ['5///5', '/////21', ''], penState: ['pen-2 pencolor-1'], penDrawn: ['pen-2 pencolor-1'] }
      const redone = { ...reloaded, cells: ['5///5', '/////27', ''], penState: ['pen-2 pencolor-7'], penDrawn: ['pen-2 pencolor-7'] }
      const afterReload = { action: 'undo', page: reloaded, earlier: { action: 'reload', page: redone } }
      assert.deepEqual(check('undo-redo-restores', redone, { before: undone, action: 'redo', earlier: afterReload }), [])
      assert.equal(check('undo-redo-restores', redone, { before: undone, action: 'redo', earlier: { ...afterReload, earlier: { action: 'click cell', page: redone } } }).length, 3)
    })
    it('fails when the page differs, naming the field', () => {
      assert.deepEqual(undoThenRedo({ ...board, penDrawn: [] }), ['penDrawn was ["pen-1 pencolor-2"] and is now []'])
    })
    it('fails when the redo puts the cells back differently', () => {
      assert.equal(undoThenRedo({ ...board, cells: ['6///6', '', ''] }).length, 1)
    })
    it('says nothing when the undo found an empty stack and took nothing, so the redo gives back an older step', () => {
      const older = { ...board, undoDepth: 11 }
      assert.deepEqual(check('undo-redo-restores', older, { before: { ...undone, undoDepth: 0 }, action: 'redo', earlier: { action: 'undo', page: { ...undone, undoDepth: 0 } } }), [])
    })
    it('says nothing when the undo took two steps (SudokuPad\'s selection entry with the rest) and the redo gave one back', () => {
      assert.deepEqual(check('undo-redo-restores', { ...board, undoDepth: 11 }, { before: { ...undone, undoDepth: 9 }, action: 'redo', earlier: { action: 'undo', page: { ...board, undoDepth: 12 } } }), [])
    })
    it('says nothing for a redo after another action, or an undo followed by another action', () => {
      assert.deepEqual(check('undo-redo-restores', undone, { before: board, action: 'redo', earlier: { action: 'click cell', page: board } }), [])
      assert.deepEqual(check('undo-redo-restores', undone, { before: board, action: 'redo' }), [])
      assert.deepEqual(check('undo-redo-restores', undone, { before: board, action: 'click cell', earlier: { action: 'undo', page: board } }), [])
    })
    it('holds when the strokes come back drawn in another order', () => {
      const two = { penState: ['pen-1 pencolor-1', 'pen-2 pencolor-1'], penDrawn: ['pen-1 pencolor-1', 'pen-2 pencolor-1'] }
      assert.deepEqual(undoThenRedo({ ...board, ...two, penDrawn: [...two.penDrawn].reverse() }, { ...board, ...two }), [])
    })
    it('leaves the rules pane out, which is layout', () => {
      assert.deepEqual(undoThenRedo({ ...board, rulesPane: { fontPx: 12, ownFontPx: 17.6, scrollHeight: 900, clientHeight: 300 } }), [])
    })
  })

  describe('digit-cells-colored', () => {
    it('holds when a digit just entered has its group color, in Cell and in Both mode', () => {
      for (const mode of ['Cell', 'Both']) {
        assert.deepEqual(check('digit-cells-colored', { colorByDigit: colorByDigit(mode, [['5', ['5']], ['']]) }, { before: { colorByDigit: colorByDigit(mode, [[''], ['']]) } }), [], mode)
      }
    })
    it('fails when a digit just entered has no color, naming the cell and the color it should have', () => {
      assert.deepEqual(
        check('digit-cells-colored', { colorByDigit: colorByDigit('Cell', [['7', ['5']], ['']]) }, { before: { colorByDigit: colorByDigit('Cell', [[''], ['']]) } }),
        ['cell 0 holds 7 in Cell mode and has colors 5, not its group\'s 9'])
    })
    it('fails for a digit with no color at all', () => {
      assert.equal(check('digit-cells-colored', { colorByDigit: colorByDigit('Both', [['6', []]]) }, { before: { colorByDigit: colorByDigit('Both', [['']]) } }).length, 1)
    })
    it('holds in Digit and Off modes, which color no cell', () => {
      for (const mode of ['Digit', 'Off']) assert.deepEqual(check('digit-cells-colored', { colorByDigit: colorByDigit(mode, [['7', []]]) }, { before: { colorByDigit: colorByDigit(mode, [['']]) } }), [], mode)
    })
    it('holds for a cell whose digit did not change, so a color taken off by hand stays off', () => {
      const same = colorByDigit('Cell', [['7', []]])
      assert.deepEqual(check('digit-cells-colored', { colorByDigit: same }, { before: { colorByDigit: same } }), [])
    })
    it('checks every cell when the mode just changed', () => {
      assert.equal(check('digit-cells-colored', { colorByDigit: colorByDigit('Cell', [['7', []]]) }, { before: { colorByDigit: colorByDigit('Off', [['7', []]]) } }).length, 1)
    })
    it('leaves a given and a digit no group holds alone', () => {
      assert.deepEqual(check('digit-cells-colored', { colorByDigit: colorByDigit('Cell', [['7', [], true], ['1', []]]) }, { before: { colorByDigit: colorByDigit('Cell', [[''], ['']]) } }), [])
    })
  })

  describe('page-stays-dark', () => {
    it('holds for the dark colors the fuzz picks', () => {
      for (const color of ['rgb(0, 0, 0)', 'rgb(16, 16, 48)', 'rgb(0, 32, 16)', 'rgb(32, 16, 16)']) assert.deepEqual(check('page-stays-dark', { pageColor: color }), [], color)
    })
    it('fails for white, for a light grey, and for a transparent page', () => {
      for (const color of ['rgb(255, 255, 255)', 'rgb(200, 200, 200)', 'rgba(0, 0, 0, 0)']) assert.equal(check('page-stays-dark', { pageColor: color }).length, 1, color)
    })
    it('fails for a color it cannot read, so a changed format is not read as dark', () => {
      assert.deepEqual(check('page-stays-dark', { pageColor: 'oklch(0 0 0)' }), ['the page color "oklch(0 0 0)" is not an opaque rgb color'])
    })
  })

  describe('rules-fit-pane', () => {
    it('a puzzle with no rules text has no pane to fit, and nothing is checked (#679)', () => {
      assert.deepEqual(check('rules-fit-pane', { rulesPane: null }), [])
    })

    const pane = (over) => ({ fontPx: 17.6, ownFontPx: 17.6, scrollHeight: 300, clientHeight: 300, ...over })
    it('holds when the rules fit', () => {
      assert.deepEqual(check('rules-fit-pane', { rulesPane: pane() }), [])
    })
    it('holds when a pixel of rounding is all that overflows', () => {
      assert.deepEqual(check('rules-fit-pane', { rulesPane: pane({ scrollHeight: 301 }) }), [])
    })
    it('fails when the rules scroll above the smallest font', () => {
      assert.deepEqual(check('rules-fit-pane', { rulesPane: pane({ scrollHeight: 400, fontPx: 20 }) }), ['the rules need 400px in a pane of 300px at 20px, above the smallest font 12.32px'])
    })
    it('holds when the rules scroll at the smallest font, which is as far as the script shrinks them', () => {
      assert.deepEqual(check('rules-fit-pane', { rulesPane: pane({ scrollHeight: 1000, fontPx: 12.32 }) }), [])
    })
    it('fails when the rules scroll one step above the smallest font', () => {
      assert.equal(check('rules-fit-pane', { rulesPane: pane({ scrollHeight: 1000, fontPx: 13 }) }).length, 1)
    })
  })

  describe('tab-not-letters', () => {
    it('holds when Tab leaves the pad on digits', () => {
      assert.deepEqual(check('tab-not-letters', { letterMode: false }, { action: 'tab' }), [])
    })
    it('fails when Tab turns the pad to letters', () => {
      assert.deepEqual(check('tab-not-letters', { letterMode: true }, { action: 'tab' }), ['Tab switched the number pad to letters'])
    })
    it('holds when the pad was on letters already, or another action turns it', () => {
      assert.deepEqual(check('tab-not-letters', { letterMode: true }, { before: { letterMode: true }, action: 'tab' }), [])
      assert.deepEqual(check('tab-not-letters', { letterMode: true }, { action: 'undo' }), [])
    })
  })
})
