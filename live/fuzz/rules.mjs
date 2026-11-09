// What "working" means for each script in a fuzz run, one rule per script (#590 Q10, #594), as pure functions over page snapshots so they are unit-tested
// with hand-built ones (`rules.test.mjs`). The engine (`engine.mjs`) checks every rule after every action; `page-state.mjs` reads a snapshot's `page`.
// Not a check itself.
//
// A rule is `{ name, check({ now, before, action }) }`: `now` is the snapshot after the action, `before` the one before it and `action` the action's
// kind (`actions.mjs`). It returns one readable line per violation; none means the rule holds. A snapshot's `page` is:
//   undoDepth     how many steps SudokuPad's undo stack holds
//   cells         SudokuPad's serialized state of every cell, in row order: '' for a cell that holds nothing
//   penState      one `pen-<value> pencolor-<color>` per pen entry in the cells, as SudokuPad names the stroke it draws
//   penDrawn      the same for every stroke on the board
//   notesSaved    the notes Text Anywhere saved for the puzzle, as its stored items; null when none is saved
//   notesDrawn    the text of every note on the board
//   colorByDigit  { mode: 'Cell' | 'Digit' | 'Both' | 'Off', groups: [{ key, digits }], cells: [{ digit, given, colours }] with `colours` the keys the cell holds }
//   pageColor     the page's background as a computed `rgb(r, g, b)`
//   rulesPane     the puzzle's rules text: null when there is none, else { fontPx, ownFontPx, scrollHeight, clientHeight }
//   letterMode    whether the number pad shows letters

// The Dark Page rule: a page color this light or lighter is not dark. WCAG relative luminance, 0 black to 1 white; the fuzz's dark colors are under 0.02.
export const DARK_PAGE_MAX_LUMINANCE = 0.2
// Auto Rules Resizer shrinks the text to this share of SudokuPad's own font at the least (`MIN_FONT_RATIO` in auto-rules-resizer.user.js); rules too long
// for that are left to scroll.
export const MIN_FONT_RATIO = 0.7
// A scrollHeight and clientHeight are rounded to whole pixels, so one pixel of difference is no overflow.
const SCROLL_TOLERANCE_PX = 1

const sorted = (list) => [...list].sort()

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

function luminance (rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const RGB = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/

// Every digit that changed in a cell between two snapshots: a cell entered, replaced, erased, or one an undo, a redo or a reload put back.
const digitsChanged = (now, before) => now.cells.flatMap((cell, i) => (cell.digit === before.cells[i]?.digit ? [] : [i]))

export const RULES = [
  {
    name: 'undo-to-start',
    // All scripts: SudokuPad's own start is a board with nothing but its givens, which its serialized state leaves out.
    check: ({ now }) => {
      if (now.page.undoDepth !== 0) return []
      return now.page.cells.flatMap((cell, i) => (cell === '' ? [] : [`the undo stack is empty but cell ${i} still holds ${JSON.stringify(cell)}`]))
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
    check: ({ now, before, action }) => {
      if (action !== 'reload') return []
      const [was, is] = [sorted(before.page.notesDrawn), sorted(now.page.notesDrawn)]
      if (JSON.stringify(was) === JSON.stringify(is)) return []
      return [`the notes before the reload were ${JSON.stringify(was)} and after it ${JSON.stringify(is)}`]
    }
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
      const match = RGB.exec(now.page.pageColor)
      if (!match) return [`the page color ${JSON.stringify(now.page.pageColor)} is not an rgb color`]
      const alpha = match[4] === undefined ? 1 : Number(match[4])
      const value = luminance(match.slice(1, 4).map(Number))
      return alpha === 0 || value >= DARK_PAGE_MAX_LUMINANCE ? [`the page color ${now.page.pageColor} is not dark`] : []
    }
  },
  {
    name: 'rules-fit-panel',
    // Auto Rules Resizer: it shrinks the text until the rules fit the pane, down to 70% of SudokuPad's font, and past that the rules scroll.
    check: ({ now }) => {
      const pane = now.page.rulesPane
      if (!pane) return []
      const overflow = pane.scrollHeight - pane.clientHeight
      if (overflow <= SCROLL_TOLERANCE_PX) return []
      if (pane.fontPx <= pane.ownFontPx * MIN_FONT_RATIO + 0.01) return []
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
