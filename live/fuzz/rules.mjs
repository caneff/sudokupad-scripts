// What "working" means for each script in a fuzz run, one rule per script (#590 Q10, #594), as pure functions over page snapshots so they are unit-tested
// with hand-built ones (`rules.test.mjs`). The engine (`engine.mjs`) checks every rule after every action; `page-state.mjs` reads a snapshot's `page`.
// Not a check itself.
//
// A rule is `{ name, check({ now, before, action, earlier }) }`: `now` is the snapshot after the action, `before` the one before it and `action` the action's
// kind (`actions.mjs`); `earlier` is the step before that, `{ action, before }`, or null for the first. It returns one readable line per violation; none means the rule holds. A snapshot's `page` is:
//   undoDepth     how many steps SudokuPad's undo stack holds
//   cells         SudokuPad's serialized state of every cell, in row order: '' for a cell that holds nothing
//   penState      one `pen-<value> pencolor-<color>` per pen entry in the cells, as SudokuPad names the stroke it draws
//   penDrawn      the same for every stroke on the board
//   notesSaved    the notes Text Anywhere saved for the puzzle, as its stored items; null when none is saved
//   notesDrawn    the text of every finished note on the board
//   notesSeen     the same plus the text typed so far in the note open for typing, which is not yet in notesSaved
//   colorByDigit  { mode: 'Cell' | 'Digit' | 'Both' | 'Off', groups: [{ key, digits }], cells: [{ digit, given, colours }] with `colours` the keys the cell holds }
//   pageColor     the page's background as a computed `rgb(r, g, b)`
//   rulesPane     the pane that shows the puzzle's rules: { fontPx, ownFontPx, scrollHeight, clientHeight }
//   letterMode    whether the number pad shows letters
import { readFileSync } from 'node:fs'

// The shared color module is pasted text for the scripts, not a module, so it is evaluated here as its own test does.
const { parseColor, wcagLuminance } = new Function(`${readFileSync(new URL('../../lib/color-math.js', import.meta.url), 'utf8')}\nreturn { parseColor, wcagLuminance }`)() // eslint-disable-line no-new-func

// The Dark Page rule: a page color this light or lighter is not dark. WCAG relative luminance, 0 black to 1 white; the fuzz's dark colors are under 0.02.
const DARK_PAGE_MAX_LUMINANCE = 0.2
// Auto Rules Resizer shrinks the text to this share of SudokuPad's own font at the least (`MIN_FONT_RATIO` in auto-rules-resizer.user.js, typed out here
// because the script does not export it and exporting it would raise its version); rules too long for that are left to scroll.
const MIN_FONT_RATIO = 0.7
// A scrollHeight and clientHeight are rounded to whole pixels, so one pixel of difference is no overflow.
const SCROLL_TOLERANCE_PX = 1
// A computed font size is a float: this much above the smallest font is the smallest font.
const FONT_TOLERANCE_PX = 0.01

// The lines in `a` and not in `b`, counting repeats: [x, x] against [x] leaves one x.
function without (a, b) {
  const left = [...b]
  return a.filter((item) => {
    const at = left.indexOf(item)
    if (at < 0) return true
    left.splice(at, 1)
    return false
  })
}

// Every digit that changed in a cell between two snapshots: a cell entered, replaced, erased, or one an undo, a redo or a reload put back.
const digitsChanged = (now, before) => now.cells.flatMap((cell, i) => (cell.digit === before.cells[i]?.digit ? [] : [i]))

// What a rule that compares two snapshots reads, leaving out `rulesPane`, which is a measure of the layout and is checked by its own rule.
const comparable = (page) => {
  const { rulesPane, ...rest } = page // eslint-disable-line no-unused-vars
  return rest
}

// One line per field that differs between two views of a page, naming the field and both values.
const viewDifferences = (was, now) => Object.keys(was).filter((field) => JSON.stringify(was[field]) !== JSON.stringify(now[field]))
  .map((field) => `${field} was ${JSON.stringify(was[field])} and is now ${JSON.stringify(now[field])}`)

// What a reload must leave as it was. Color by Digit colors the entered cells every time the page opens in Cell or Both mode, as one undo step, so a coloring
// undone before the reload comes back by design: in those modes the cells' colors (and the serialized cells that hold them) are left out. Not read: the notes
// (notes-survive-reload counts a note still open for typing), the undo stack depth and the letter pad, none of which a reload promises to keep.
// The strokes are compared as a set: the order they sit in on the page is not something a player sees.
const reloadView = (page) => {
  const { mode, groups, cells } = page.colorByDigit
  const base = { penState: [...page.penState].sort(), penDrawn: [...page.penDrawn].sort(), pageColor: page.pageColor, colorMode: mode, groups, digits: cells.map((cell) => cell.digit) }
  return mode === 'Cell' || mode === 'Both' ? base : { ...base, cells: page.cells, colours: cells.map((cell) => cell.colours) }
}

// Whether the rules pane shows all its text, or has shrunk the text as far as Auto Rules Resizer goes.
export function rulesPaneFits (pane) {
  return pane.scrollHeight - pane.clientHeight <= SCROLL_TOLERANCE_PX || pane.fontPx <= pane.ownFontPx * MIN_FONT_RATIO + FONT_TOLERANCE_PX
}

export const RULES = [
  {
    name: 'undo-to-start',
    // All scripts: SudokuPad's own start is a board with nothing but its givens, which its serialized state leaves out. Not the first snapshot of the list: Color by
    // Digit's coloring of the board when the page opens is an undo step of its own, so undoing back to the start undoes it too. Pen strokes and cell colors ride the undo
    // stack, so what is drawn goes too; Text Anywhere's notes do not, and stay.
    check: ({ now }) => {
      if (now.page.undoDepth !== 0) return []
      return [
        ...now.page.cells.flatMap((cell, i) => (cell === '' ? [] : [`the undo stack is empty but cell ${i} still holds ${JSON.stringify(cell)}`])),
        ...now.page.penDrawn.map((stroke) => `the undo stack is empty but a pen stroke is still drawn: ${stroke}`),
        ...now.page.colorByDigit.cells.flatMap(({ colours }, i) => (colours.length === 0 ? [] : [`the undo stack is empty but cell ${i} is still colored ${colours.join(',')}`]))
      ]
    }
  },
  {
    name: 'pen-lines-drawn',
    // Pen Tool Extras: it redraws SudokuPad's strokes, so the board and the state must hold the same ones.
    check: ({ now }) => [
      ...without(now.page.penState, now.page.penDrawn).map((s) => `in the state but not drawn: ${s}`),
      ...without(now.page.penDrawn, now.page.penState).map((s) => `drawn but not in the state: ${s}`)
    ]
  },
  {
    name: 'notes-saved-match-drawn',
    // Text Anywhere: no open note at a snapshot (every action finishes the note it opened), so the saved notes are exactly the ones on the board.
    check: ({ now }) => {
      const saved = (now.page.notesSaved ?? []).filter((item) => item.kind === 'text').map((item) => item.text)
      return [
        ...without(saved, now.page.notesDrawn).map((t) => `saved but not drawn: ${JSON.stringify(t)}`),
        ...without(now.page.notesDrawn, saved).map((t) => `drawn but not saved: ${JSON.stringify(t)}`)
      ]
    }
  },
  {
    name: 'notes-survive-reload',
    // Compares what the player sees, so a note still open for typing counts: Text Anywhere saves it as you type and brings it back as a finished note.
    check: ({ now, before, action }) => {
      if (action !== 'reload') return []
      return [
        ...without(before.page.notesSeen, now.page.notesSeen).map((t) => `seen before the reload and not after it: ${JSON.stringify(t)}`),
        ...without(now.page.notesSeen, before.page.notesSeen).map((t) => `seen after the reload and not before it: ${JSON.stringify(t)}`)
      ]
    }
  },
  {
    name: 'reload-changes-nothing',
    // All scripts: what the player sees after a reload is what they saw before it, as far as `reloadView` reads.
    check: ({ now, before, action }) => (action === 'reload' ? viewDifferences(reloadView(before.page), reloadView(now.page)) : [])
  },
  {
    name: 'undo-redo-restores',
    // All scripts: a redo straight after an undo puts the page back exactly as it was before the undo.
    check: ({ now, action, earlier }) => (action === 'redo' && earlier?.action === 'undo' ? viewDifferences(comparable(earlier.before.page), comparable(now.page)) : [])
  },
  {
    name: 'digit-cells-colored',
    // Color by Digit: in Cell or Both mode a cell that has an entered digit holds its group's color. Checked on the cells whose digit just changed and, when the
    // mode just changed, on every cell: a color taken off by hand with the color tool is the player's, and stays.
    check: ({ now, before }) => {
      const { mode, groups, cells } = now.page.colorByDigit
      if (mode !== 'Cell' && mode !== 'Both') return []
      const keyOf = (digit) => groups.find((g) => g.digits.includes(digit))?.key
      const checked = mode === before.page.colorByDigit.mode ? digitsChanged(now.page.colorByDigit, before.page.colorByDigit) : cells.map((_, i) => i)
      return checked.flatMap((i) => {
        const { digit, given, colours } = cells[i]
        const key = keyOf(digit)
        if (given || digit === '' || key === undefined || colours.includes(key)) return []
        return [`cell ${i} holds ${digit} in ${mode} mode and has color${colours.length ? 's ' + colours.join(',') : 's none'}, not its group's ${key}`]
      })
    }
  },
  {
    name: 'page-stays-dark',
    // Dark Page: the page color is the setting, and every color the fuzz can choose is dark.
    check: ({ now }) => {
      const rgb = parseColor(now.page.pageColor)
      if (!rgb) return [`the page color ${JSON.stringify(now.page.pageColor)} is not an opaque rgb color`]
      return wcagLuminance(rgb) >= DARK_PAGE_MAX_LUMINANCE ? [`the page color ${now.page.pageColor} is not dark`] : []
    }
  },
  {
    name: 'rules-fit-pane',
    // Auto Rules Resizer: it shrinks the text until the rules fit the pane, down to 70% of SudokuPad's font, and past that the rules scroll.
    check: ({ now }) => {
      const pane = now.page.rulesPane
      if (rulesPaneFits(pane)) return []
      return [`the rules need ${pane.scrollHeight}px in a pane of ${pane.clientHeight}px at ${pane.fontPx}px, above the smallest font ${(pane.ownFontPx * MIN_FONT_RATIO).toFixed(2)}px`]
    }
  },
  {
    name: 'tab-not-letters',
    // No Tab Letters (UI Tweaks' Tab option): Tab leaves a number pad of digits as it is.
    check: ({ now, before, action }) => (action === 'tab' && !before.page.letterMode && now.page.letterMode ? ['Tab switched the number pad to letters'] : [])
  }
]

// The violations of every rule for one action, as `<rule name>: <line>`.
export const ruleViolations = (context) => RULES.flatMap((rule) => rule.check(context).map((line) => `${rule.name}: ${line}`))
