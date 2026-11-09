// Unit tests of the fuzz's rules with hand-built snapshots: each rule passes on a page where it holds and fails, naming what broke, on one where it does not.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { quietPage } from './fake-target.mjs'
import { RULES, ruleViolations } from './rules.mjs'

const rule = (name) => RULES.find((r) => r.name === name)
// The violations of one rule between a snapshot `before` and one `now` (page overrides), for the kind of action between them.
const check = (name, now, { before = {}, action = 'click cell' } = {}) => rule(name).check({ now: { page: quietPage(now) }, before: { page: quietPage(before) }, action })

const colorByDigit = (mode, cells, groups = [{ key: '5', digits: ['5'] }, { key: '9', digits: ['6', '7', '8', '9'] }]) => ({ mode, groups, cells: cells.map(([digit, colours = [], given = false]) => ({ digit, given, colours })) })

describe('the rules', () => {
  it('each script has a rule, and the names are unique', () => {
    assert.deepEqual(RULES.map((r) => r.name), ['undo-to-start', 'pen-lines-drawn', 'notes-saved-match-drawn', 'notes-survive-reload', 'digit-cells-colored', 'page-stays-dark', 'rules-fit-panel', 'tab-not-letters'])
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
    it('fails for a note whose saved text differs from the drawn one', () => {
      assert.equal(check('notes-saved-match-drawn', { notesSaved: items('15'), notesDrawn: ['51'] }).length, 2)
    })
  })

  describe('notes-survive-reload', () => {
    it('holds when the notes drawn after a reload are the ones drawn before it, in any order', () => {
      assert.deepEqual(check('notes-survive-reload', { notesDrawn: ['b', 'a'] }, { before: { notesDrawn: ['a', 'b'] }, action: 'reload' }), [])
    })
    it('fails when a reload loses a note', () => {
      assert.deepEqual(check('notes-survive-reload', { notesDrawn: ['a'] }, { before: { notesDrawn: ['a', 'b'] }, action: 'reload' }), ['the notes before the reload were ["a","b"] and after it ["a"]'])
    })
    it('fails when a reload adds a note', () => {
      assert.equal(check('notes-survive-reload', { notesDrawn: ['a', 'a'] }, { before: { notesDrawn: ['a'] }, action: 'reload' }).length, 1)
    })
    it('says nothing after any other action, which may change the notes', () => {
      assert.deepEqual(check('notes-survive-reload', { notesDrawn: [] }, { before: { notesDrawn: ['a'] }, action: 'undo' }), [])
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
      assert.deepEqual(check('page-stays-dark', { pageColor: 'oklch(0 0 0)' }), ['the page color "oklch(0 0 0)" is not an rgb color'])
    })
  })

  describe('rules-fit-panel', () => {
    const pane = (over) => ({ fontPx: 17.6, ownFontPx: 17.6, scrollHeight: 300, clientHeight: 300, ...over })
    it('holds with no rules, and when the rules fit', () => {
      assert.deepEqual(check('rules-fit-panel', { rulesPane: null }), [])
      assert.deepEqual(check('rules-fit-panel', { rulesPane: pane() }), [])
    })
    it('holds when a pixel of rounding is all that overflows', () => {
      assert.deepEqual(check('rules-fit-panel', { rulesPane: pane({ scrollHeight: 301 }) }), [])
    })
    it('fails when the rules scroll above the smallest font', () => {
      assert.deepEqual(check('rules-fit-panel', { rulesPane: pane({ scrollHeight: 400, fontPx: 20 }) }), ['the rules need 400px in a pane of 300px at 20px, above the smallest font 12.32px'])
    })
    it('holds when the rules scroll at the smallest font, which is as far as the script shrinks them', () => {
      assert.deepEqual(check('rules-fit-panel', { rulesPane: pane({ scrollHeight: 1000, fontPx: 12.32 }) }), [])
    })
    it('fails when the rules scroll one step above the smallest font', () => {
      assert.equal(check('rules-fit-panel', { rulesPane: pane({ scrollHeight: 1000, fontPx: 13 }) }).length, 1)
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
