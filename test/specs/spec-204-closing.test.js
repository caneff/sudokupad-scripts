'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const ROOT = join(__dirname, '..', '..')

const read = (file) => readFileSync(join(ROOT, file), 'utf8')
const extras = require('../../pen-tool-extras.user.js')
const byDigit = require('../../color-by-digit.user.js')

const storeOf = (saved) => ({
  getData: (key) => saved[key],
  setData: (key, value) => { saved[key] = value },
  removeData: (key) => { delete saved[key] }
})
const versionOf = (text) => /^\/\/ @version\s+(\S+)$/m.exec(text)[1]
const inlineStyles = (html) => html.match(/\sstyle="[^"]*"/g) || []

// Typed out from c126948, the commit spec 204 was written against, as the independent source.
const SECTIONS = ['Core', 'Pen colors', 'Pen pages', 'Dashed lines', 'Arrow lines', 'Marks', 'Right click erase', 'Line look', 'Pen panel', 'Settings dialog', 'Startup']
const MARK_VALUES_BEFORE = ['3', '4', 'b', 'c', '5', '6', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'w', 'u', 'x', 'v', 'y']
const VERSIONS_BEFORE = { 'pen-tool-extras.user.js': '1.14.11', 'color-by-digit.user.js': '0.5.6' }

// Spec 204's acceptance at `npm test`: the 11 sections, the one mark table, the one color-character map, the marks boxes in the
// settings table and the dialog stylesheets. This seam is blind to real SudokuPad: `npm run test:live` covers the marks cycles,
// Restore defaults leaving the mark boxes alone, the dialogs' look and the startup there, and a dialog's pixels were compared once
// in each stylesheet change. It is blind too to a real Tampermonkey install with marks saved by 1.14.13 and to crackingthecryptic.com,
// which no automated run reaches.
test('spec 204 makes Pen Tool Extras and the dialogs legible without changing a feature or a saved setting', () => {
  const pen = read('pen-tool-extras.user.js')

  // Sections: 11 headings in the ruled order, with the exports and start() (lib/steps.js, the Framework guard and getApp()) below the last.
  const headings = [...pen.matchAll(/^ {2}\/\/ (\d+)\. ([^:\n]+)/gm)]
  assert.deepEqual(headings.map((m) => Number(m[1])), SECTIONS.map((_, i) => i + 1))
  headings.forEach((m, i) => assert.ok(m[2].startsWith(SECTIONS[i]), `section ${i + 1} is ${m[2]}`))
  const startup = headings[10].index
  for (const tail of ['module.exports = {', 'start(SCRIPT, {']) assert.ok(pen.indexOf(tail) > startup, `${tail} is in Startup`)

  // One mark table: the parallel tables and their searches are gone, and the pen values and the marks that grow are as before.
  for (const gone of ['edgeOf', 'shapeOf', 'cornerMarkOf', 'ADDED', 'SHAPES', 'DEFAULT_MARK_SETTINGS', 'MARKS_KEY']) {
    assert.ok(!new RegExp(`\\b(function|const) ${gone}\\b`).test(pen), gone)
  }
  assert.deepEqual(extras.MARK_VALUES, MARK_VALUES_BEFORE)
  const growing = /^(.*) \{ stroke-width: [^;]+; transform: scale/m.exec(extras.buildThicknessCss(4))[1]
  assert.deepEqual(growing.split(', ').map((s) => /pen-(\w+)$/.exec(s)[1]), MARK_VALUES_BEFORE.filter((v) => v !== '5' && v !== '6'))

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
  const { SETTINGS, readSettings, saveSetting } = extras
  assert.equal(SETTINGS.marks.key, 'EdgeMarks_marks')
  assert.deepEqual(extras.draftWithBox({ marks: SETTINGS.marks.fallback }, 'marks.x', false).marks, { ...SETTINGS.marks.fallback, x: false }, 'a marks box writes the table\'s row')
  assert.ok(!/\blet markSettings\b/.test(pen), 'no marks variable of its own')
  const saved = { EdgeMarks_marks: { x: true, directions: true, dot: false, cornerX: true, cornerDot: false } }
  const store = storeOf(saved)
  const loaded = readSettings(store).marks
  assert.deepEqual(loaded, { x: true, directions: true, circle: false, cornerX: true, cornerCircle: false })
  saveSetting(store, SETTINGS.marks, { ...loaded, circle: true, cornerCircle: true })
  assert.equal('EdgeMarks_marks' in saved, false, 'all five ticked removes the key')
  assert.deepEqual(readSettings(store).marks, SETTINGS.marks.fallback)
  saveSetting(store, SETTINGS.marks, { ...SETTINGS.marks.fallback, directions: false })
  assert.deepEqual(saved.EdgeMarks_marks, { ...SETTINGS.marks.fallback, directions: false }, 'one unticked writes the key')

  // Dialog stylesheets: the hand-written look helpers are gone; the Pen Tool Extras editor carries no inline style and Color by
  // Digit's editor only its swatch colors and whether each digit button's digit is in its group.
  const digit = read('color-by-digit.user.js')
  for (const gone of ['important', 'BUTTON_LOOK', 'SAVE_BUTTON_LOOK', 'CANCEL_BUTTON_LOOK', 'DIALOG_BUTTON_LOOK', 'SMALL_BUTTON_LOOK', 'REMOVE_LOOK', 'PULLDOWN_LOOK']) {
    assert.ok(!new RegExp(`\\bconst ${gone} =`).test(digit), gone)
  }
  const state = { colors: extras.SUDOKUPAD_PEN_COLORS, preset: 'sudokupad', presets: ['sudokupad'], missing: [], ...extras.settingDefaults(), off: [] }
  assert.deepEqual(inlineStyles(extras.renderEditor(state)), [])
  assert.ok(!/<small style=/.test(pen), 'the title version has no inline style')
  const colorOf = (key) => ['#ff0000', '#00ff00', '#0000ff'][Number(key)]
  const html = byDigit.renderEditor({ groups: [{ key: '1', digits: ['1'] }], pages: byDigit.layoutPages([['0', '1', '2']], 0, colorOf), page: 0, brush: '1' })
  const styles = inlineStyles(html)
  assert.ok(styles.some((style) => style.startsWith(' style="background:')), 'the swatches are drawn')
  for (const style of styles) assert.match(style, /^ style="background:#[0-9a-f]{6}"$/, 'a swatch or digit key color')

  // Versions: Pen Tool Extras raised its version for the marks change; Color by Digit raised its own later, for auto mode (#234).
  assert.notEqual(versionOf(pen), VERSIONS_BEFORE['pen-tool-extras.user.js'])
  assert.equal(extras.VERSION, versionOf(pen))
  assert.notEqual(versionOf(digit), VERSIONS_BEFORE['color-by-digit.user.js'])
})
