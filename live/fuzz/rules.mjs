// What "working" means for each script in a fuzz run, a rule or more per script, and some for every script at once (#590 Q10, #594, #677), as pure functions over page snapshots so they are unit-tested
// with hand-built ones (`rules.test.mjs`). The engine (`engine.mjs`) checks every rule after every action; `page-state.mjs` reads a snapshot's `page`.
// Not a check itself.
//
// A rule is `{ name, check({ now, before, action, earlier }) }`: `now` is the snapshot after the action, `before` the one before it and `action` the action's
// kind (`actions.mjs`); `earlier` is the step before that, `{ action, before, strokeSinceReload, earlier }` with its own `earlier` (the step before it, without one of its own), or null for the first. It returns one readable line per violation; none means the rule holds. A snapshot's `page` is:
//   undoDepth     how many steps SudokuPad's undo stack holds
//   cells         SudokuPad's serialized state of every cell, in row order: '' for a cell that holds nothing
//   penState      one `pen-<value> pencolor-<color>` per pen entry in the cells, as SudokuPad names the stroke it draws
//   penDrawn      the same for every stroke on the board
//   notesSaved    the notes Text Anywhere saved for the puzzle, as its stored items; null when none is saved
//   notesDrawn    the text of every finished note on the board
//   notesSeen     the same plus the text typed so far in the note open for typing, which is not yet in notesSaved
//   colorByDigit  { mode: 'Cell' | 'Digit' | 'Both' | 'Off', groups: [{ key, digits }], cells: [{ digit, given, colours }] with `colours` the keys the cell holds }
//   pageColor     the page's background as a computed `rgb(r, g, b)`
//   rulesPane     the pane that shows the puzzle's rules: { fontPx, ownFontPx, scrollHeight, clientHeight, fontOffsetPx }; null on a puzzle with no rules text (#679)
//   letterMode    whether the number pad shows letters
//   noteBoxes     one { text, fill, expected } per finished note with a box: its computed fill, and the fill of the box color Text Anywhere has saved (`boxFill` of the stored value and the note's color), both as computed rgb text
import { createRequire } from 'node:module'

// The shared color module is pasted text for the scripts, not a module, so it is evaluated here by the lib tests' loader.
const { loadLib } = createRequire(import.meta.url)('../../test/load-lib.js')
const { parseColor, wcagLuminance } = loadLib(['color-math'], ['parseColor', 'wcagLuminance'])

// The Dark Page rule: a page color this light or lighter is not dark. WCAG relative luminance, 0 black to 1 white; the fuzz's dark colors are under 0.02.
const DARK_PAGE_MAX_LUMINANCE = 0.2
// Auto Rules Resizer shrinks the text to this share of SudokuPad's own font at the least (`MIN_FONT_RATIO` in auto-rules-resizer.user.js, typed out here
// because the script does not export it and exporting it would raise its version); rules too long for that are left to scroll.
const MIN_FONT_RATIO = 0.7
// A scrollHeight and clientHeight are rounded to whole pixels, so one pixel of difference is no overflow.
const SCROLL_TOLERANCE_PX = 1
// A computed font size is a float: this much above the smallest font is the smallest font.
const FONT_TOLERANCE_PX = 0.01

// A note's letters and digits alone, after the check box markers a line carries, which are drawn as boxes. The marker is `CHECK_MARK`'s in text-anywhere.user.js: the dash is optional and the box may end the line.
const wordsOf = (text) => text.replace(/^\s*(?:[-*+] )?\[[ xX]?\](?: |$)/gm, '').replace(/[^\p{L}\p{N}]/gu, '')
// Whether Text Anywhere draws a note's text other than as typed: a list line, a check box, a code fence, bold or inline code.
const hasMarkup = (text) => /^\s*(?:[-*+] |(?:[-*+] )?\[[ xX]?\](?: |$)|```)|\*\*|`/m.test(text)

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

const digitsChanged = (now, before) => now.cells.flatMap((cell, i) => (cell.digit === before.cells[i]?.digit ? [] : [i]))

// What a rule that compares two snapshots reads, leaving out `rulesPane`, which is a measure of the layout and is checked by its own rule.
// The strokes are compared as a set: the order they sit in on the page is not something a player sees.
const sorted = (list) => [...list].sort()
const comparable = (page) => {
  const { rulesPane, ...rest } = page // eslint-disable-line no-unused-vars
  return { ...rest, penState: sorted(page.penState), penDrawn: sorted(page.penDrawn) }
}

// Whether Color by Digit colors the cells in this mode.
const colorsCells = (mode) => mode === 'Cell' || mode === 'Both'

// One line per field of `was` that differs in `now`, naming the field and both values; a field only `now` has is not compared.
const viewDifferences = (was, now) => Object.keys(was).filter((field) => JSON.stringify(was[field]) !== JSON.stringify(now[field]))
  .map((field) => `${field} was ${JSON.stringify(was[field])} and is now ${JSON.stringify(now[field])}`)

// A reload within about half a second of a pen stroke can bring every stroke back in color 1, and SudokuPad does it alone, without any script (#681,
// docs/research/pen-reload-color.md). Such a page is read with the pen colors left out; a stroke of any other color after a reload still counts.
const PEN_COLOR = / pencolor-(\S+)$/
const resetToColorOne = (page) => page.penState.length > 0 && page.penState.concat(page.penDrawn).every((stroke) => PEN_COLOR.exec(stroke)?.[1] === '1')
// A cell's serialized state holds its pen entries, colors included, after its fifth slash.
const withoutPenColors = (page) => ({
  ...page,
  penState: page.penState.map((stroke) => stroke.replace(PEN_COLOR, '')),
  penDrawn: page.penDrawn.map((stroke) => stroke.replace(PEN_COLOR, '')),
  cells: page.cells.map((cell) => cell.split('/').slice(0, 5).join('/'))
})

// What a reload must leave as it was. Color by Digit colors the entered cells every time the page opens in Cell or Both mode, as one undo step, so a coloring
// undone before the reload comes back by design: in those modes the cells' colors (and the serialized cells that hold them) are left out. Not read: the notes
// (notes-survive-reload counts a note still open for typing), the undo stack depth and the letter pad, none of which a reload promises to keep.
const reloadView = (page, ignorePenColors) => {
  const { mode, groups, cells } = page.colorByDigit
  const shown = ignorePenColors ? withoutPenColors(page) : page
  const base = { penState: sorted(shown.penState), penDrawn: sorted(shown.penDrawn), pageColor: page.pageColor, colorMode: mode, groups, digits: cells.map((cell) => cell.digit) }
  return colorsCells(mode) ? base : { ...base, cells: shown.cells, colours: cells.map((cell) => cell.colours) }
}

// A positive font offset (f+) is a font the player asked for, which the script grows past what the widest pane holds (`fitRulesPane`'s test, "then only the font grows"), so it may scroll.
export function rulesPaneFits (pane) {
  return pane.scrollHeight - pane.clientHeight <= SCROLL_TOLERANCE_PX || pane.fontPx <= pane.ownFontPx * MIN_FONT_RATIO + FONT_TOLERANCE_PX || pane.fontOffsetPx > 0
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
    // A plain note is drawn as it was typed. A note with markup is drawn with the markup left out, so a saved one that finds no drawn twin as typed is matched to one with the same letters and digits (`wordsOf`).
    check: ({ now }) => {
      const saved = (now.page.notesSaved ?? []).filter((item) => item.kind === 'text').map((item) => item.text)
      const unmatchedSaved = without(saved, now.page.notesDrawn)
      const unmatchedDrawn = without(now.page.notesDrawn, saved)
      const stillSaved = unmatchedSaved.filter((text) => {
        const twin = hasMarkup(text) ? unmatchedDrawn.findIndex((drawn) => wordsOf(drawn) === wordsOf(text)) : -1
        if (twin >= 0) unmatchedDrawn.splice(twin, 1)
        return twin < 0
      })
      return [
        ...stillSaved.map((t) => `saved but not drawn: ${JSON.stringify(t)}`),
        ...unmatchedDrawn.map((t) => `drawn but not saved: ${JSON.stringify(t)}`)
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
    // All scripts: what the player sees after a reload is what they saw before it, as far as `reloadView` reads. The exception: `resetToColorOne`.
    check: ({ now, before, action, earlier }) => {
      if (action !== 'reload') return []
      // Only when a stroke was drawn since the last reload (the engine's `strokeSinceReload`): the bug needs the reload soon after one, and a key press can come between.
      const ignorePenColors = earlier?.strokeSinceReload === true && resetToColorOne(now.page)
      return viewDifferences(reloadView(before.page, ignorePenColors), reloadView(now.page, ignorePenColors))
    }
  },
  {
    name: 'undo-redo-restores',
    // All scripts: a redo straight after an undo puts the page back exactly as it was before the undo. Read only when the undo took some steps off the stack and the
    // redo put the same number back: an undo on an empty stack does nothing and leaves the redo stack for the next redo, and an undo that also drops SudokuPad's selection
    // entry gets back only the rest.
    check: ({ now, before, action, earlier }) => {
      if (action !== 'redo' || earlier?.action !== 'undo') return []
      const took = earlier.before.page.undoDepth - before.page.undoDepth
      if (!(took > 0 && now.page.undoDepth - before.page.undoDepth === took)) return []
      // A reload that brought the strokes back in color 1 (above) makes the undo start from that page; the redo gives the saved colors back.
      const reset = earlier.earlier?.action === 'reload' && resetToColorOne(earlier.before.page)
      const [was, is] = reset ? [withoutPenColors(earlier.before.page), withoutPenColors(now.page)] : [earlier.before.page, now.page]
      return viewDifferences(comparable(was), comparable(is))
    }
  },
  {
    name: 'digit-cells-colored',
    // Color by Digit: in Cell or Both mode a cell that has an entered digit holds its group's color. Checked on the cells whose digit just changed and, when the
    // mode or the groups (a profile switch, a saved dialog) just changed, on every cell: a color taken off by hand with the color tool is the player's, and stays.
    check: ({ now, before }) => {
      const { mode, groups, cells } = now.page.colorByDigit
      if (!colorsCells(mode)) return []
      const keyOf = (digit) => groups.find((g) => g.digits.includes(digit))?.key
      const sameView = mode === before.page.colorByDigit.mode && JSON.stringify(groups) === JSON.stringify(before.page.colorByDigit.groups)
      const checked = sameView ? digitsChanged(now.page.colorByDigit, before.page.colorByDigit) : cells.map((_, i) => i)
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
    check: ({ now }) => {
      const pane = now.page.rulesPane
      // A puzzle with no rules text shows no pane, and there is nothing to fit.
      if (pane === null || rulesPaneFits(pane)) return []
      return [`the rules need ${pane.scrollHeight}px in a pane of ${pane.clientHeight}px at ${pane.fontPx}px, above the smallest font ${(pane.ownFontPx * MIN_FONT_RATIO).toFixed(2)}px`]
    }
  },
  {
    name: 'note-box-color',
    // Text Anywhere: every note with a box is filled with the box color the script has saved, however many times the color changed before the note was made.
    check: ({ now }) => now.page.noteBoxes.filter(({ fill, expected }) => fill !== expected).map(({ text, fill, expected }) => `the note ${JSON.stringify(text)} has a box filled ${fill}, not the saved box color ${expected}`)
  },
  {
    name: 'tab-not-letters',
    // No Tab Letters (UI Tweaks' Tab option): Tab leaves a number pad of digits as it is.
    check: ({ now, before, action }) => (action === 'tab' && !before.page.letterMode && now.page.letterMode ? ['Tab switched the number pad to letters'] : [])
  }
]

export const ruleViolations = (context) => RULES.flatMap((rule) => rule.check(context).map((line) => `${rule.name}: ${line}`))
