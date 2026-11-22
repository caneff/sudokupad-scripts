'use strict'
require('./fake-page-storage.js')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { startScript } = require('./unit-start.js')
const { buildCss, PAGE, BOARD_ID, DEFAULT_COLOR, readSaved, earlyColor, LOCAL_DATA_KEY, DATA_KEY, lackingInternals, FEATURES, copiedSettings, pastedSettings, READERS, PAGE_COLOR_VAR } = require('../dark-page.user.js')
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
  assert.equal(rule(PAGE).declarations.split('; ')[0], 'background-color: #000000 !important')
})

test('the page background is the color given', () => {
  const given = buildCss('#336699').split('\n').find((line) => line.startsWith(`${PAGE} {`))
  assert.match(given, /^body:has\(#svgrenderer\) \{ background-color: #336699 !important;/)
})

test('readSaved reads the saved color through the Framework, and lets a Framework it cannot read throw', () => {
  assert.equal(readSaved({ getData: (key) => (key === DATA_KEY ? '#ABCDEF' : null) }), '#abcdef')
  assert.equal(readSaved({ getData: () => null }), DEFAULT_COLOR)
  assert.throws(() => readSaved({}), TypeError)
  assert.throws(() => readSaved({ getData: () => { throw new Error('storage blocked') } }), /storage blocked/)
})

test('earlyColor reads the saved color straight from localStorage, where Framework has put it, and lets blocked storage throw', () => {
  assert.equal(LOCAL_DATA_KEY, 'svencodes_DarkPage_color')
  assert.equal(DATA_KEY, 'DarkPage_color')
  assert.equal(earlyColor({ getItem: (key) => (key === LOCAL_DATA_KEY ? '#ABCDEF' : null) }), '#abcdef')
  assert.equal(earlyColor({ getItem: () => null }), null)
  assert.equal(earlyColor({ getItem: () => 'red' }), null)
  assert.throws(() => earlyColor({ getItem: () => { throw new Error('storage blocked') } }), /storage blocked/)
})

test('the script runs at document-start, so the page color is there before the first paint', () => {
  const header = fs.readFileSync(path.join(__dirname, '..', 'dark-page.user.js'), 'utf8').split('==/UserScript==')[0]
  assert.match(header, /^\/\/ @run-at\s+document-start$/m)
})

test('the credit line takes the text color for the page color given', () => {
  const credit = (color) => buildCss(color).split('\n').find((line) => line.startsWith(`${PAGE} .controls-footer`))
  assert.equal(credit('#ffffff'), `${PAGE} .controls-footer, ${PAGE} .controls-footer a { color: #000000 !important }`)
  assert.equal(credit('#000000'), `${PAGE} .controls-footer, ${PAGE} .controls-footer a { color: #ffffff !important }`)
})

test('the credit line and the replay readout reach 4.5:1 on each of these page colors, mid greys either side of where white and black swap included', () => {
  const textOf = (line) => /color: (#[0-9a-f]{6}) !important/.exec(line)[1]
  for (const color of ['#808080', '#767676', '#757575', '#747474', '#6b6b6b', '#777777', '#ffcc00', '#336699', '#000000', '#ffffff', '#0000ff']) {
    for (const start of [`${PAGE} .controls-footer`, `${PAGE} .controls-input::after`]) {
      const line = buildCss(color).split('\n').find((l) => l.startsWith(start))
      assert.ok(contrastRatio(hexChannels(textOf(line)), hexChannels(color)) >= 4.5, `${start} on ${color}: ${textOf(line)}`)
    }
  }
})

test('the replay tool\'s readout (the ::after of .controls-input) takes the text color for the page color given', () => {
  const readout = (color) => buildCss(color).split('\n').find((line) => line.startsWith(`${PAGE} .controls-input::after`))
  assert.equal(readout('#ffffff'), `${PAGE} .controls-input::after { color: #000000 !important }`)
  assert.equal(readout('#000000'), `${PAGE} .controls-input::after { color: #ffffff !important }`)
  assert.equal(readout('#ffcc00'), `${PAGE} .controls-input::after { color: #000000 !important }`)
})

const TRAYS = ['.pen-tool-extras-tray', '.text-anywhere-tray']
// The script panels' buttons on a tray: every button of the panel but its color buttons, which carry a `data-key`.
const TRAY_PANELS = TRAYS.map((tray) => `.controls-input:has(${tray})`)
// Every rule but the four a page of any color gets: its color, the board box, the credit line and the readout's text.
const ALWAYS = [`${PAGE} {`, `${PAGE} #${BOARD_ID} {`, `${PAGE} .controls-footer,`, `${PAGE} .controls-input::after { color:`]
const darkRules = (color) => buildCss(color).split('\n').filter((line) => !ALWAYS.some((start) => line.startsWith(start)))
const buttonRules = (color) => buildCss(color).split('\n').filter((line) => /button/.test(line.split(' {')[0]))
const scoped = (selectors) => selectors.map((selector) => `${PAGE} ${selector}`).join(', ')
// SudokuPad's three control button groups, and a script tray's buttons in a given state.
const GROUPS = ['.controls-app', '.controls-tool', '.controls-aux']
const trayButton = (state) => TRAY_PANELS.map((panel) => `${panel} button:not([data-key])${state}`)
// Auto Rules Resizer's f+ and f- buttons wear SudokuPad's button face, so they go dark with SudokuPad's.
const fontBar = (state) => [`#auto-rules-resizer-font button${state}`]

test('on a dark page color the control buttons go dark gray with light purple text, and a button that is on keeps its own fill and gets a purple border', () => {
  assert.deepEqual(buttonRules('#000000').slice(0, 2), [
    `${scoped([...GROUPS.map((g) => `${g} button:not(.selected):not(.selectedperm)`), ...trayButton(':not([aria-pressed="true"])'), ...fontBar('')])} { background-color: #2a2a2a !important; color: #d2a8f0 !important; border-color: #4a4a4a !important }`,
    `${scoped(GROUPS.flatMap((g) => [`${g} button.selected`, `${g} button.selectedperm`]))} { border-color: #d2a8f0 !important }`
  ])
})

test('on a dark page color a control button lifts its fill on hover and press, and a keyboard-focused one gets a purple outline', () => {
  const rules = buttonRules('#000000')
  for (const rule of [
    `${scoped([...GROUPS.map((g) => `${g} button:not(.selected):not(.selectedperm):hover`), ...trayButton(':not([aria-pressed="true"]):hover'), ...fontBar(':hover')])} { background-color: #37343a !important }`,
    `${scoped([...GROUPS.map((g) => `${g} button:not(.selected):not(.selectedperm):active`), ...trayButton(':not([aria-pressed="true"]):active'), ...fontBar(':active')])} { background-color: #3b373e !important }`,
    `${scoped(GROUPS.map((g) => `${g} button:focus-visible`))} { outline: 2px solid #d2a8f0 !important; outline-offset: 2px !important }`
  ]) assert.ok(rules.includes(rule), `missing rule:\n${rule}\nbutton rules:\n${rules.join('\n')}`)
})

test('on a dark page color the two script trays go dark, a step above the page and below the buttons', () => {
  assert.ok(buildCss('#000000').split('\n').includes(`${scoped(TRAYS)} { background-color: #1d1a20 !important }`))
})

test('on a dark page color a dialog\'s overlay dims the page with black, and the replay readout box takes the dark button border', () => {
  const lines = buildCss('#000000').split('\n')
  assert.ok(lines.includes(`${scoped(['.dialog-overlay'])} { background-color: rgb(0 0 0 / 0.6) !important }`), 'overlay')
  assert.ok(lines.includes(`${scoped(['.controls-input::after'])} { border-color: #4a4a4a !important }`), 'readout border')
})

test('on a light page color SudokuPad\'s buttons, trays, overlay and readout box are left as they are', () => {
  for (const color of ['#ffffff', '#ffcc00']) assert.deepEqual(darkRules(color), [], color)
})

test('the page color is on the body as --dark-page-color, which Text Anywhere reads for a note off the board', () => {
  assert.equal(PAGE_COLOR_VAR, '--dark-page-color')
  for (const color of ['#000000', '#ffcc00']) {
    assert.equal(buildCss(color).split('\n')[0], `${PAGE} { background-color: ${color} !important; ${PAGE_COLOR_VAR}: ${color} !important }`)
  }
})

test('the page text is white up to #757575 and black from #767676', () => {
  const footerColor = (color) => /\.controls-footer a \{ color: (#\w+) !important \}/.exec(buildCss(color))[1]
  for (const grey of ['#000000', '#333333', '#747474', '#757575']) assert.equal(footerColor(grey), '#ffffff', grey)
  for (const grey of ['#767676', '#777777', '#cccccc', '#ffffff']) assert.equal(footerColor(grey), '#000000', grey)
})

test('the buttons go dark on #747474 and darker, and stay light from #757575 up (one step before the credit text switches at #767676)', () => {
  assert.equal(buttonRules('#747474').length > 0, true)
  assert.equal(buttonRules('#757575').length, 0)
})

test('the page color row reads a saved #rrggbb string as lowercase and refuses anything else, for the saved reader and the paste reader alike', () => {
  const readSavedAs = (data) => readSaved({ getData: () => data })
  const earlyAs = (data) => earlyColor({ getItem: () => data })
  assert.equal(readSavedAs('#ABCDEF'), '#abcdef')
  assert.equal(READERS[DATA_KEY]('#ABCDEF'), '#abcdef')
  for (const bad of [null, undefined, '', 'red', '#fff', '#12345g', 5, {}, ['#000000']]) {
    assert.equal(READERS[DATA_KEY](bad), undefined, `paste ${String(bad)}`)
    assert.equal(readSavedAs(bad), DEFAULT_COLOR, `saved ${String(bad)}`)
    assert.equal(earlyAs(bad), null, `early ${String(bad)}`)
  }
})

test('the board\'s own box takes SudokuPad\'s own page background, so it follows SudokuPad\'s dark mode', () => {
  assert.deepEqual(rule(`${PAGE} #${BOARD_ID}`), { selector: `${PAGE} #${BOARD_ID}`, declarations: 'background-color: var(--body-bg) !important' })
})

test('every rule applies only while a board is on the page, so a page with no board keeps its own colors', () => {
  for (const { selector } of rules()) {
    for (const part of selector.split(',').map((s) => s.trim())) assert.ok(part.startsWith(PAGE), `${selector}: ${part}`)
  }
})

test('every declaration is !important, so SudokuPad\'s own rules, dark mode included, lose', () => {
  for (const { selector, declarations } of rules()) {
    for (const d of declarations.split('; ')) assert.ok(d.endsWith(' !important'), `${selector}: ${d}`)
  }
})

test('no rule declares a theme variable, which would reach the grid through the shared :root; the one variable is Dark Page\'s own', () => {
  for (const { selector, declarations } of rules()) {
    const declared = [...declarations.matchAll(/(?:^|[;\s])(--[\w-]+)\s*:/g)].map((m) => m[1])
    assert.deepEqual(declared, selector === PAGE ? [PAGE_COLOR_VAR] : [], `${selector} declares a variable`)
    assert.ok(!/:root|\bhtml\b/.test(selector), `${selector} reaches the root`)
  }
})

test('no rule reaches inside the board, or sets color on body or a container of it; the one rule on the board\'s own box sets only its background', () => {
  const boardBox = `${PAGE} #${BOARD_ID}`
  for (const { selector, declarations } of rules()) {
    for (const part of selector.split(',').map((s) => s.trim())) {
      if (part === boardBox) {
        assert.ok(/^background-color: [^;]+$/.test(declarations.replace(' !important', '')), `${selector}: ${declarations}`)
        continue
      }
      const rest = part.replace(PAGE, '').trim()
      assert.ok(!/svg|\.grid|\.cells|\.game|\.app|#board|\*/.test(rest), `${selector} reaches the board or a container of it: ${rest}`)
      if (/(^|[;\s])color\s*:/.test(declarations)) assert.notEqual(rest, '', selector)
    }
  }
})

function startOnBoard (framework) {
  const appended = []
  const inBody = []
  const element = () => {
    const el = { style: {}, children: [], textContent: '', attributes: {}, setAttribute (name, value) { el.attributes[name] = value }, addEventListener () {}, append (...kids) { el.children.push(...kids) }, remove () { el.removed = true } }
    return el
  }
  const textOf = (el) => el.textContent + el.children.map(textOf).join('')
  const document = {
    createElement: element,
    head: { appendChild: (el) => appended.push(el) },
    body: { append: (el) => inBody.push(el) },
    documentElement: { outerHTML: '<script src="/script.js?v=0.611.0"></script>' },
    getElementById: () => null
  }
  const { warnings } = startScript('../dark-page.user.js', { document, window: {}, Framework: framework })
  const [bar] = inBody.flatMap((host) => host.children).filter((el) => el.attributes['data-script'] === 'dark-page' && !el.removed)
  return { warnings, style: appended.find((el) => el.id === 'dark-page-style'), appended, bar: bar ? textOf(bar) : null }
}

function assertDarkens ({ style, appended }) {
  assert.equal(style.textContent, buildCss(DEFAULT_COLOR))
  assert.deepEqual(appended, [style], 'the stylesheet is all the script puts on the page')
}

test('a Framework without getApp gets the settings entry at once, with no warning and no bar, and the page still darkens', () => {
  const added = []
  const page = startOnBoard({ getData: () => null, setData () {}, removeData () {}, addSetting: (setting) => added.push(setting.name), showDialog () {}, closeDialog () {} })
  assert.deepEqual(added, ['darkpage'])
  assert.deepEqual(page.warnings, [])
  assert.equal(page.bar, null)
  assertDarkens(page)
})

test('a Framework whose getData throws (a frame with storage blocked) turns the saved color off, and the page darkens in the default', () => {
  const page = startOnBoard({ getData () { throw new Error('storage blocked') } })
  assert.deepEqual(page.warnings.filter((warning) => warning.includes('saved color')), ['dark-page: saved color skipped because SudokuPad changed: Error: storage blocked'])
  assert.match(page.bar, /^Dark Page: settings, saved color are off/)
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

const completeFramework = () => ({ Framework: { getApp () {}, getData () {}, addSetting () {}, showDialog () {}, closeDialog () {}, setData () {}, removeData () {} } })

test('a SudokuPad with every Framework call Dark Page makes lacks none of them', () => {
  assert.deepEqual(lackingInternals(FEATURES, completeFramework()), new Map())
})

test('without one internal, only the feature that needs it is lacking', () => {
  for (const [internal, feature] of [['getData', 'savedPageColor'], ['addSetting', 'settings'], ['showDialog', 'settings'], ['closeDialog', 'settings'], ['setData', 'settings'], ['removeData', 'settings']]) {
    const roots = completeFramework()
    delete roots.Framework[internal]
    assert.deepEqual(lackingInternals(FEATURES, roots), new Map([[`Framework.${internal}`, [feature]]]), internal)
  }
  const roots = completeFramework()
  delete roots.Framework.getApp
  assert.deepEqual(lackingInternals(FEATURES, roots), new Map(), 'getApp')
})
