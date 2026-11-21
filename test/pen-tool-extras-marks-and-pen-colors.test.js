'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { fakeStore } = require('./fake-store.js')
const extras = require('../pen-tool-extras.user.js')
const byDigit = require('../color-by-digit.user.js')

const inlineStyles = (html) => html.match(/\sstyle="[^"]*"/g) || []

// Typed out from c126948 as the independent source: the pen values shipped installs saved inside puzzles.
const MARK_VALUES_BEFORE = ['3', '4', 'b', 'c', '5', '6', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'w', 'u', 'x', 'v', 'y']

// Blind to real SudokuPad: `npm run test:live` covers the marks cycles, Restore defaults leaving the mark boxes alone, the dialogs' look and the
// startup there. It is blind too to marks saved by an older version in a real Tampermonkey install, which `npm run test:tampermonkey` does not set up.
test('Pen Tool Extras keeps its saved pen values, its one color-character map, its marks settings row and its dialogs free of inline style', () => {
  // The pen values and the marks that grow are as saved before; a mark added since (the cell dot, z) comes after them.
  assert.deepEqual(extras.MARK_VALUES.slice(0, MARK_VALUES_BEFORE.length), MARK_VALUES_BEFORE)
  const growing = /^(.*) \{ stroke-width: [^;]+; transform: scale/m.exec(extras.buildThicknessCss(4))[1]
  const growingBefore = MARK_VALUES_BEFORE.filter((v) => v !== '5' && v !== '6')
  assert.deepEqual(growing.split(', ').map((s) => /pen-(\w+)$/.exec(s)[1]).slice(0, growingBefore.length), growingBefore)

  // One color-character map: each pen page's characters answer from it, and a reverse direction character is no pen of its own.
  const { PEN_PAGES, penPageOf, penNumber, arrowLineWayOf, directionCharOf, lineIdentityOf } = extras
  PEN_PAGES.forEach((page, index) => page.chars.forEach((char, i) => {
    assert.equal(penPageOf(char), index, char)
    assert.equal(penNumber(char), penNumber(PEN_PAGES[0].chars[i]), char)
    assert.equal(arrowLineWayOf(char), page.arrowLines ? true : null, char)
    if (!page.arrowLines) return
    const back = page.reverse[i]
    assert.equal(directionCharOf(char, false), back)
    assert.equal(arrowLineWayOf(back), false, back)
    assert.equal(penPageOf(back), -1, `${back} is no pen of its own`)
    assert.equal(lineIdentityOf(back), char, `${back} draws the line of ${char}`)
  }))

  // Marks in the settings table: one row under the old key, read through the old circle names, saved like every other row.
  const { SETTINGS, readSettings, saveRow } = extras
  assert.equal(SETTINGS.marks.key, 'EdgeMarks_marks')
  assert.deepEqual(extras.draftWithBox({ marks: SETTINGS.marks.fallback }, 'marks.x', false).marks, { ...SETTINGS.marks.fallback, x: false }, 'a marks box writes the table\'s row')
  const saved = { EdgeMarks_marks: { x: true, directions: true, dot: false, cornerX: true, cornerDot: false } }
  const store = fakeStore(saved)
  const kept = store.data
  const loaded = readSettings(store).marks
  // Saved before the Cell row (#479): its three boxes read as ticked.
  assert.deepEqual(loaded, { x: true, directions: true, circle: false, cornerX: true, cornerCircle: false, cellCircle: true, cellCross: true, cellDot: true })
  saveRow(store, SETTINGS.marks, { ...loaded, circle: true, cornerCircle: true })
  assert.equal('EdgeMarks_marks' in kept, false, 'every box ticked removes the key')
  assert.deepEqual(readSettings(store).marks, SETTINGS.marks.fallback)
  saveRow(store, SETTINGS.marks, { ...SETTINGS.marks.fallback, directions: false })
  assert.deepEqual(kept.EdgeMarks_marks, { ...SETTINGS.marks.fallback, directions: false }, 'one unticked writes the key')

  // The Pen Tool Extras editor carries no inline style and Color by Digit's editor only its swatch colors.
  const state = { colors: extras.SUDOKUPAD_PEN_COLORS, preset: 'sudokupad', presets: ['sudokupad'], missing: [], ...extras.settingDefaults(), off: [] }
  assert.deepEqual(inlineStyles(extras.renderEditor(state)), [])
  const colorOf = (key) => ['#ff0000', '#00ff00', '#0000ff'][Number(key)]
  const html = byDigit.renderEditor({ groups: [{ key: '1', digits: ['1'] }], pages: byDigit.layoutPages([['0', '1', '2']], 0, colorOf), page: 0, brush: '1' })
  const styles = inlineStyles(html)
  assert.ok(styles.some((style) => style.startsWith(' style="background:')), 'the swatches are drawn')
  for (const style of styles) assert.match(style, /^ style="background:color-mix\(in srgb, #[0-9a-f]{6} 60%, transparent\)"$/, 'a swatch or digit key color')
})
