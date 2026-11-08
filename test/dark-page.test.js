'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { buildCss, BOARD, BOARD_ID, VERSION, DEFAULT_COLOR, textColorFor, savedColor, readSaved, DATA_KEY, lackingInternals, FEATURES, copiedSettings, pastedSettings, READERS } = require('../dark-page.user.js')
const { contrastRatio, hexChannels } = require('./contrast.js')
const readPaste = (text) => pastedSettings(text, READERS)

function rules () {
  return buildCss(DEFAULT_COLOR).split('\n').map((line) => {
    const m = /^(.*?) \{ (.*) \}$/.exec(line)
    assert.ok(m, `not a one-line rule: ${line}`)
    return { selector: m[1], declarations: m[2] }
  })
}

const rule = (selector) => rules().find((r) => r.selector === selector)

test('the page background is black by default', () => {
  assert.equal(DEFAULT_COLOR, '#000000')
  assert.deepEqual(rule(BOARD), { selector: BOARD, declarations: 'background-color: #000000 !important' })
})

test('the page background is the color given', () => {
  const given = buildCss('#336699').split('\n').find((line) => line.startsWith(`${BOARD} {`))
  assert.equal(given, `${BOARD} { background-color: #336699 !important }`)
})

test('readSaved reads the saved color through the Framework, and lets a Framework it cannot read throw', () => {
  assert.equal(readSaved({ getData: (key) => (key === DATA_KEY ? '#ABCDEF' : null) }), '#abcdef')
  assert.equal(readSaved({ getData: () => null }), null)
  assert.throws(() => readSaved({}), TypeError)
  assert.throws(() => readSaved({ getData: () => { throw new Error('storage blocked') } }), /storage blocked/)
})

test('the credit line takes the text color for the page color given', () => {
  const credit = (color) => buildCss(color).split('\n').find((line) => line.startsWith(`${BOARD} .controls-footer`))
  assert.equal(credit('#ffffff'), `${BOARD} .controls-footer, ${BOARD} .controls-footer a { color: #000000 !important }`)
  assert.equal(credit('#000000'), `${BOARD} .controls-footer, ${BOARD} .controls-footer a { color: #ffffff !important }`)
})

test('the credit line and the replay readout reach 4.5:1 on each of these page colors, mid greys either side of where white and black swap included', () => {
  const textOf = (line) => /color: (#[0-9a-f]{6}) !important/.exec(line)[1]
  for (const color of ['#808080', '#767676', '#757575', '#747474', '#6b6b6b', '#777777', '#ffcc00', '#336699', '#000000', '#ffffff', '#0000ff']) {
    for (const start of [`${BOARD} .controls-footer`, `${BOARD} .controls-input::after`]) {
      const line = buildCss(color).split('\n').find((l) => l.startsWith(start))
      assert.ok(contrastRatio(hexChannels(textOf(line)), hexChannels(color)) >= 4.5, `${start} on ${color}: ${textOf(line)}`)
    }
  }
})

test('the replay tool\'s readout (the ::after of .controls-input) takes the text color for the page color given', () => {
  const readout = (color) => buildCss(color).split('\n').find((line) => line.startsWith(`${BOARD} .controls-input::after`))
  assert.equal(readout('#ffffff'), `${BOARD} .controls-input::after { color: #000000 !important }`)
  assert.equal(readout('#000000'), `${BOARD} .controls-input::after { color: #ffffff !important }`)
  assert.equal(readout('#ffcc00'), `${BOARD} .controls-input::after { color: #000000 !important }`)
})

const buttonRules = (color) => buildCss(color).split('\n').filter((line) => /button/.test(line.split(' {')[0]))

test('on a dark page color the control buttons go dark gray with light purple text, and a button that is on keeps its own fill and gets a purple border', () => {
  const scoped = (selectors) => selectors.map((selector) => `${BOARD} ${selector}`).join(', ')
  const groups = ['.controls-app', '.controls-tool', '.controls-aux']
  assert.deepEqual(buttonRules('#000000'), [
    `${scoped(groups.map((g) => `${g} button:not(.selected):not(.selectedperm)`))} { background-color: #2a2a2a !important; color: #d2a8f0 !important; border-color: #4a4a4a !important }`,
    `${scoped(groups.flatMap((g) => [`${g} button.selected`, `${g} button.selectedperm`]))} { border-color: #d2a8f0 !important }`,
    `${scoped(['.button-row button'])} { border-color: #4a4a4a !important }`,
    `${scoped(groups.map((g) => `${g} button:focus-visible`))} { outline: 2px solid #d2a8f0 !important; outline-offset: 2px !important }`,
    `${scoped(groups.map((g) => `${g} button:not(.selected):not(.selectedperm):hover`))} { background-color: #37343a !important }`,
    `${scoped(groups.map((g) => `${g} button:not(.selected):not(.selectedperm):active`))} { background-color: #3b373e !important }`
  ])
})

test('on a light page color SudokuPad\'s buttons are left as they are', () => {
  assert.deepEqual(buttonRules('#ffffff'), [])
  assert.deepEqual(buttonRules('#ffcc00'), [])
})

test('the buttons switch exactly where the credit text does', () => {
  for (const color of ['#000000', '#333333', '#747474', '#757575', '#cccccc', '#ffffff', '#0000ff', '#ffff00']) {
    assert.equal(buttonRules(color).length > 0, textColorFor(color) === '#dddddd', color)
  }
})

test('savedColor reads a saved #rrggbb string as lowercase, and anything else as nothing saved', () => {
  assert.equal(savedColor('#336699'), '#336699')
  assert.equal(savedColor('#ABCDEF'), '#abcdef')
  for (const bad of [null, undefined, '', 'red', '#fff', '#12345g', 5, {}, ['#000000']]) assert.equal(savedColor(bad), null, String(bad))
})

test('the board\'s own box takes SudokuPad\'s own page background, so it follows SudokuPad\'s dark mode', () => {
  assert.deepEqual(rule(`${BOARD} #${BOARD_ID}`), { selector: `${BOARD} #${BOARD_ID}`, declarations: 'background-color: var(--body-bg) !important' })
})

test('every rule applies only while a board is on the page, so a page with no board keeps its own colors', () => {
  for (const { selector } of rules()) {
    for (const part of selector.split(',').map((s) => s.trim())) assert.ok(part.startsWith(BOARD), `${selector}: ${part}`)
  }
})

test('every declaration is !important, so SudokuPad\'s own rules, dark mode included, lose', () => {
  for (const { selector, declarations } of rules()) {
    for (const d of declarations.split('; ')) assert.ok(d.endsWith(' !important'), `${selector}: ${d}`)
  }
})

test('no rule declares a theme variable, which would reach the grid through the shared :root', () => {
  for (const { selector, declarations } of rules()) {
    assert.ok(!/(^|[;\s])--[\w-]+\s*:/.test(declarations), `${selector} declares a variable`)
    assert.ok(!/:root|\bhtml\b/.test(selector), `${selector} reaches the root`)
  }
})

test('no rule reaches inside the board, or sets color on body or a container of it; the one rule on the board\'s own box sets only its background', () => {
  const boardBox = `${BOARD} #${BOARD_ID}`
  for (const { selector, declarations } of rules()) {
    for (const part of selector.split(',').map((s) => s.trim())) {
      if (part === boardBox) {
        assert.ok(/^background-color: [^;]+$/.test(declarations.replace(' !important', '')), `${selector}: ${declarations}`)
        continue
      }
      const rest = part.replace(BOARD, '').trim()
      assert.ok(!/svg|\.grid|\.cells|\.game|\.app|#board|\*/.test(rest), `${selector} reaches the board or a container of it: ${rest}`)
      if (/(^|[;\s])color\s*:/.test(declarations)) assert.notEqual(rest, '', selector)
    }
  }
})

test('VERSION is the @version in the script header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, '..', 'dark-page.user.js'), 'utf8')))
})

// Starts the script on a page that has a document with a head and a body, with `framework` as the page's Framework, or none.
// `appended` is what went in the head; `bar` is the text of the notice bar, or null for none.
function startOnBoard (framework) {
  const file = require.resolve('../dark-page.user.js')
  const appended = []
  const inBody = []
  const element = () => {
    const el = { style: {}, children: [], textContent: '', attributes: {}, setAttribute (name, value) { el.attributes[name] = value }, addEventListener () {}, append (...kids) { el.children.push(...kids) }, remove () { el.removed = true } }
    return el
  }
  const textOf = (el) => el.textContent + el.children.map(textOf).join('')
  const saved = { document: global.document, window: global.window, Framework: global.Framework }
  global.document = {
    createElement: element,
    head: { appendChild: (el) => appended.push(el) },
    body: { append: (el) => inBody.push(el) },
    documentElement: { outerHTML: '<script src="/script.js?v=0.611.0"></script>' },
    getElementById: () => null
  }
  global.window = {}
  delete global.Framework
  if (framework) global.Framework = framework
  const warnings = []
  const realWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  delete require.cache[file]
  try {
    require(file)
  } finally {
    console.warn = realWarn
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete global[name]
      else global[name] = value
    }
    delete require.cache[file]
  }
  const [bar] = inBody.flatMap((host) => host.children).filter((el) => el.attributes['data-script'] === 'dark-page' && !el.removed)
  return { warnings, style: appended.find((el) => el.id === 'dark-page-style'), appended, bar: bar ? textOf(bar) : null }
}

function assertDarkens ({ style, appended }) {
  assert.equal(style.textContent, buildCss(DEFAULT_COLOR))
  assert.deepEqual(appended, [style], 'the stylesheet is all the script puts on the page')
}

test('a Framework without getApp turns the settings entry off with one warning and the bar, and the page still darkens', () => {
  const page = startOnBoard({ getData: () => null })
  assert.deepEqual(page.warnings, ['dark-page: settings entry skipped because SudokuPad has no Framework.getApp'])
  assert.match(page.bar, /^Dark Page: settings entry is off — SudokuPad changed\.Report/)
  assertDarkens(page)
})

test('a Framework whose getData throws (a frame with storage blocked) turns the saved color off, and the page darkens in the default', () => {
  const page = startOnBoard({ getData () { throw new Error('storage blocked') } })
  assert.deepEqual(page.warnings.filter((warning) => warning.includes('saved color')), ['dark-page: saved color skipped because SudokuPad changed: Error: storage blocked'])
  assert.match(page.bar, /^Dark Page: settings entry, saved color are off/)
  assertDarkens(page)
})

test('a page with no Framework at all darkens without a warning', () => {
  const page = startOnBoard()
  assert.deepEqual(page.warnings, [])
  assert.equal(page.bar, null)
  assertDarkens(page)
})

test('copiedSettings: the color in force, the default when none is saved', () => {
  assert.deepEqual(JSON.parse(copiedSettings({ getData: () => null })), { [DATA_KEY]: DEFAULT_COLOR })
  assert.deepEqual(JSON.parse(copiedSettings({ getData: (key) => ({ [DATA_KEY]: '#123456', Other_key: 1 }[key]) })), { [DATA_KEY]: '#123456' })
})

test('pastedSettings: a valid color is kept lower-case, a bad one is skipped and counted, other keys are ignored', () => {
  assert.deepEqual(readPaste(JSON.stringify({ [DATA_KEY]: '#ABCDEF', ColorByDigit_auto: true })), { values: { [DATA_KEY]: '#abcdef' }, skipped: 0 })
  assert.deepEqual(readPaste(JSON.stringify({ [DATA_KEY]: 'red' })), { values: {}, skipped: 1 })
})

test('pastedSettings: text with none of this script\'s keys pastes and skips nothing; an array is no settings object', () => {
  assert.deepEqual(readPaste('{}'), { values: {}, skipped: 0 })
  assert.deepEqual(readPaste(JSON.stringify({ ColorByDigit_auto: true })), { values: {}, skipped: 0 })
  assert.throws(() => readPaste('[{"DarkPage_color":"#ffffff"}]'), /not a settings object/)
})

// A SudokuPad with every internal Dark Page needs.
const completeFramework = () => ({ Framework: { getApp () {}, getData () {}, addSetting () {}, showDialog () {}, closeDialog () {}, setData () {}, removeData () {} } })

test('Dark Page declares each SudokuPad internal it calls, and a complete SudokuPad lacks none', () => {
  assert.deepEqual(lackingInternals(FEATURES, completeFramework()), new Map())
})

test('without one internal, only the feature that needs it is lacking', () => {
  for (const [internal, feature] of [['getData', 'savedColor'], ['getApp', 'settings'], ['addSetting', 'settings'], ['showDialog', 'settings'], ['closeDialog', 'settings'], ['setData', 'settings'], ['removeData', 'settings']]) {
    const roots = completeFramework()
    delete roots.Framework[internal]
    assert.deepEqual(lackingInternals(FEATURES, roots), new Map([[`Framework.${internal}`, [feature]]]), internal)
  }
})
