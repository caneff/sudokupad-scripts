// Not a check itself, so `live/**/*.live.mjs` skips it.
import assert from 'node:assert/strict'
import { closeDialogWith, openScriptDialog, openSettings } from './settings.mjs'
import { gridPoint, placeNote } from './board.mjs'
import { openPenTool, PAGE_BUTTON, penEntries } from './pen.mjs'
import { keydownDefaults } from './input.mjs'
import { settle } from './settle.mjs'

export const BLACK = 'rgb(0, 0, 0)'
export const DIGITS = '1234567890'
export const LETTER_MODE_KEY = 'ToolLetter_letterMode'
export const numberPadText = (p) => p.evaluate(() => [...document.querySelectorAll('.controls-buttons .digit')].map((d) => d.textContent).join(''))
// Each script's element ids the live suites use, named once here and set on its record in SCRIPTS (`button`, `style`, `dialog.editor`):
// a shared module imports no script's fixtures, which re-export them.
const COLOR_BY_DIGIT_BUTTON = '#control-colorbydigit'
export const TEXT_ANYWHERE_BUTTON = '#control-textanywhere'
export const TEXT_ANYWHERE_EDITOR = '#text-anywhere-dialog'
export const EXTRAS_EDITOR = '#pen-tool-extras-editor'
const DARK_PAGE_DIALOG = '#dark-page-dialog'
const UI_TWEAKS_DIALOG = '#ui-tweaks-dialog'
// Color by Digit's aria-label, `Color by Digit: ` and then the mode's word, and the mode read back off the label.
const LABEL_PREFIX = 'Color by Digit: '
export const modeLabel = (mode) => `${LABEL_PREFIX}${mode}`
export const labelOn = async (p) => {
  const label = await p.locator(COLOR_BY_DIGIT_BUTTON).getAttribute('aria-label')
  return label?.startsWith(LABEL_PREFIX) ? label.slice(LABEL_PREFIX.length) : label
}
const LETTER_TOGGLE = 'button[data-control="toggleletter"]'

const settingsEntry = async (p, text) => {
  const menu = await openSettings(p)
  await menu.locator('button, [role=button]').filter({ hasText: text }).first().waitFor({ state: 'visible' })
}

export const group = (key, digits) => ({ key, digits })
export const ODD_EVEN = [group('1', ['1', '3', '5', '7', '9']), group('2', ['0', '2', '4', '6', '8'])]

// The `dialog` record of a script with a settings dialog: `asDefault`, where there is one, is the value that Copy writes for a setting at its default and that the script saves as no key.
// `saved` is a value the script saves under `key`, inside a `{ v, data }` envelope where `enveloped` is set; `badKey` and `bad` are a value the script's reader refuses.
// Per script: its file, its element ids (`button`, its tool button; `style`, the style element it adds), what shows it has started (`ready`), its control (`control`) and one representative action (`act`).
// `ready` runs after Start Puzzle and the injection, `act` and then `control` after `ready`.
export const SCRIPTS = [
  {
    name: 'Color by Digit',
    file: 'color-by-digit.user.js',
    button: COLOR_BY_DIGIT_BUTTON,
    dialog: { owns: /^ColorByDigit_/, editor: '#color-by-digit-editor', key: 'ColorByDigit_profiles', saved: { profiles: [{ name: 'Mine', groups: ODD_EVEN }], active: 0 }, enveloped: true, badKey: 'ColorByDigit_mode', bad: 'sideways' },
    ready: (p) => p.locator(COLOR_BY_DIGIT_BUTTON).waitFor({ state: 'attached' }),
    control: (p) => p.locator(COLOR_BY_DIGIT_BUTTON).waitFor({ state: 'visible' }),
    // A fresh install starts in Cell, which colors the board's givens, and a press steps it to Digit, which takes them off.
    act: async (p) => {
      const colored = () => p.evaluate(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).some((c) => (c.colours || []).length > 0))
      assert.equal(await settle(colored, true), true, 'Cell colored a cell')
      assert.equal(await labelOn(p), 'Cell')
      await p.click(COLOR_BY_DIGIT_BUTTON)
      assert.equal(await settle(() => labelOn(p), 'Digit'), 'Digit')
      assert.equal(await settle(colored, false), false, 'Digit took the colors off')
    }
  },
  {
    name: 'Dark Page',
    file: 'dark-page.user.js',
    style: '#dark-page-style',
    dialog: { owns: /^DarkPage_/, editor: DARK_PAGE_DIALOG, key: 'DarkPage_color', saved: '#336699', asDefault: '#000000', badKey: 'DarkPage_color', bad: 'blue' },
    ready: (p) => p.locator(scriptRecord('dark-page.user.js').style).waitFor({ state: 'attached' }),
    control: (p) => settingsEntry(p, /^\s*Dark Page\s*$/),
    act: async (p) => {
      const background = () => p.evaluate(() => window.getComputedStyle(document.body).backgroundColor)
      assert.equal(await settle(background, BLACK), BLACK)
    }
  },
  {
    name: 'UI Tweaks',
    file: 'ui-tweaks.user.js',
    style: '#ui-tweaks-style',
    dialog: { owns: /^UiTweaks_/, editor: UI_TWEAKS_DIALOG, key: 'UiTweaks_hideSelect', saved: true, asDefault: false, badKey: 'UiTweaks_hideSelect', bad: 'yes' },
    // The letter tool's own button, which the Tab option leaves in place, shows once the tool is on.
    ready: async (p) => {
      await p.locator(scriptRecord('ui-tweaks.user.js').style).waitFor({ state: 'attached' })
      await p.evaluate(() => Framework.setSetting('toolletter', true))
      await p.locator(LETTER_TOGGLE).waitFor({ state: 'attached' })
    },
    control: (p) => settingsEntry(p, /^\s*UI Tweaks\s*$/),
    // Tab is swallowed: it leaves the number pad on digits and saves no letter mode (the keydown default is prevented either way, since
    // SudokuPad's own Tab toggle prevents it too, so that alone would pass without the script). Then Hide the Toggle Selection button
    // in the dialog and Save: the button goes.
    act: async (p) => {
      assert.deepEqual(await keydownDefaults(p, 'Tab'), [true])
      assert.equal(await settle(() => numberPadText(p), DIGITS), DIGITS, 'the number pad stayed on digits')
      assert.equal(await p.evaluate((key) => Framework.getData(key), LETTER_MODE_KEY), null, 'no letter mode was saved')
      const select = p.locator('.controls-aux [data-control="select"]')
      await select.waitFor({ state: 'visible' })
      await openScriptDialog(p, 'UI Tweaks', UI_TWEAKS_DIALOG)
      await p.locator(`${UI_TWEAKS_DIALOG} input[data-option="hideSelect"]`).check()
      await p.locator('.dialog button').filter({ hasText: /^\s*Save\s*$/ }).click()
      await select.waitFor({ state: 'hidden' })
    }
  },
  {
    name: 'Auto Rules Resizer',
    file: 'auto-rules-resizer.user.js',
    style: '#auto-rules-resizer-style',
    dialog: { owns: /^AutoRulesResizer_/, editor: '#rules-resizer-dialog', key: 'AutoRulesResizer_maxWidth', saved: 640, enveloped: true, asDefault: null, badKey: 'AutoRulesResizer_maxHeight', bad: 'tall' },
    // The recorded puzzle has no rules: SudokuPad is given some, and its own layout calls the script's fit.
    ready: async (p) => {
      await p.locator(scriptRecord('auto-rules-resizer.user.js').style).waitFor({ state: 'attached' })
      await p.evaluate(() => {
        Framework.app.showMetaInfoUI({ title: 'Rules', author: 'Tester', rules: 'Normal sudoku rules apply. Digits along an arrow sum to the digit in its circle.' })
        Framework.app.resize()
      })
    },
    control: async (p) => {
      const box = await p.locator('.puzzle-rules').boundingBox()
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await p.locator('#auto-rules-resizer-font').waitFor({ state: 'visible' })
    },
    // The rules get a larger font than SudokuPad's own 17.6 px.
    act: async (p) => {
      const font = () => p.evaluate(() => parseFloat(window.getComputedStyle(document.querySelector('.puzzle-rules')).fontSize))
      assert.equal(await settle(async () => (await font()) > 17.6, true), true)
    }
  },
  {
    name: 'Pen Tool Extras',
    file: 'pen-tool-extras.user.js',
    style: 'style#pen-tool-extras-style',
    dialog: { owns: /^(PenColor_|EdgeMarks_)/, editor: EXTRAS_EDITOR, key: 'PenColor_thickness', saved: 9, asDefault: 5, badKey: 'PenColor_opacity', bad: 7 },
    ready: async (p) => {
      await p.locator(scriptRecord('pen-tool-extras.user.js').style).waitFor({ state: 'attached' })
      await p.evaluate(() => Framework.setSetting('toolpen', true))
      await p.locator('#control-pen').waitFor({ state: 'visible' })
      assert.equal(await openPenTool(p), true, 'the pen tool opened')
    },
    control: (p) => p.locator(PAGE_BUTTON).waitFor({ state: 'visible' }),
    // Two clicks on one cell edge: SudokuPad's own X, then this script's arrow 'm'.
    act: async (p) => {
      // 2 px inside the top edge of cell (2, 2).
      const [x, edgeY] = await gridPoint(p, [2, 2.5])
      const y = edgeY + 2
      const edge = async () => (await penEntries(p)).map((v) => v.split(':')[1][0])
      await p.mouse.click(x, y)
      assert.deepEqual(await settle(edge, ['4']), ['4'], 'the first click made SudokuPad\'s X')
      await p.mouse.click(x, y)
      assert.deepEqual(await settle(edge, ['m']), ['m'], 'the second click made the arrow')
    }
  },
  {
    name: 'Text Anywhere',
    file: 'text-anywhere.user.js',
    button: TEXT_ANYWHERE_BUTTON,
    dialog: { owns: /^TextAnywhere_/, editor: TEXT_ANYWHERE_EDITOR, key: 'TextAnywhere_width', saved: 3.5, badKey: 'TextAnywhere_width', bad: 500 },
    ready: (p) => p.locator(TEXT_ANYWHERE_BUTTON).waitFor({ state: 'attached' }),
    control: (p) => p.locator(TEXT_ANYWHERE_BUTTON).waitFor({ state: 'visible' }),
    act: (p) => placeNote(p, [2.5, 2.5], '15')
  }
]

// A script's record in SCRIPTS, by file name.
export const scriptRecord = (file) => SCRIPTS.find((script) => script.file === file)

// Pen Tool Extras' settings dialog, opened the way a user finds it and closed by one of its buttons.
export const openExtrasEditor = (p) => openScriptDialog(p, 'Pen Tool Extras', EXTRAS_EDITOR)
export const closeExtrasEditorWith = (p, text) => closeDialogWith(p, text, EXTRAS_EDITOR)

// The scripts with a settings dialog, one flat record each, in the order SCRIPTS lists them; `open` opens the dialog the way a user finds it.
export const SETTINGS_SCRIPTS = SCRIPTS.filter((script) => script.dialog).map(({ name, file, dialog }) => ({
  file,
  entry: name,
  ...dialog,
  open: (p) => openScriptDialog(p, name, dialog.editor)
}))

export const settingsScript = (file) => SETTINGS_SCRIPTS.find((script) => script.file === file)

export const COLOR_BY_DIGIT_DIALOG = settingsScript('color-by-digit.user.js')
