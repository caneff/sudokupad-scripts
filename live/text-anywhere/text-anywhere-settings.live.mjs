// Live check of draw-tool.user.js's settings dialog on sudokupad.app: it opens from SudokuPad's settings (Experimental) and from the
// panel's gear, shows the version, a preset sets all nine colors and Save writes them, and Copy then Paste in a fresh page restores
// the colors and the size.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { STATUS, actButton, closeDialogWith, dialogButton, headerVersion, openScriptDialog } from '../settings.mjs'
import { useBrowser } from '../session.mjs'

const { BOX_KEY, COLORS_KEY, FONT_KEY, FRAME_KEY, OPACITY_KEY, OUTLINE_KEY, SETTINGS_BUTTON, SETTINGS_EDITOR: EDITOR, SIZE_SLIDER, WIDTH_KEY, pickTextAnywhere, script, valueOf } = textAnywhere
const PRESET = `${EDITOR} select[data-role="color-choice"]`
const SUDOKUPAD_COLORS = { 1: '#1f8020', 2: '#e87cf1', 3: '#e49632', 4: '#f53a37', 5: '#d2be32', 6: '#3d99f5', 7: '#d6d6d6', 8: '#7c7c7c', 9: '#000000' }

const browser = useBrowser()

const open = () => textAnywhere.open(browser(), { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } })
const read = (p, fn, arg) => p.evaluate(fn, arg)
const savedColors = (p) => read(p, (key) => Framework.getData(key) ?? null, COLORS_KEY)
const dialogColors = (p) => p.locator(`${EDITOR} input[type=color]`).evaluateAll((inputs) => Object.fromEntries(inputs.map((i) => [i.dataset.key, i.value])))

describe('Text Anywhere\'s settings dialog', { concurrency: false }, () => {
  let context, p, errors
  before(async () => {
    ;({ context, p, errors } = await open())
  })
  after(async () => { await context.close() })

  it('the Experimental settings entry opens it, with the version from the script header beside the heading', async () => {
    await openScriptDialog(p, 'Text Anywhere', EDITOR)
    assert.equal((await p.locator('.dialog b').first().textContent()).trim(), 'Text Anywhere')
    assert.equal((await p.locator('.dialog small').textContent()).trim(), `v${headerVersion(script)}`)
    assert.equal(await p.locator(`${EDITOR} input[type=color]`).count(), 9)
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('the panel\'s gear opens the same dialog', async () => {
    await pickTextAnywhere(p)
    await p.click(SETTINGS_BUTTON)
    await p.locator(EDITOR).waitFor({ state: 'visible' })
    assert.equal(await p.locator(`${EDITOR} input[type=color]`).count(), 9)
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('Cancel after picking a preset saves nothing', async () => {
    const before = await savedColors(p)
    await p.click(SETTINGS_BUTTON)
    await p.locator(PRESET).selectOption('sudokupad')
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.deepEqual(await savedColors(p), before)
  })

  it('the presets are Pen colors, a Darker page for each page the palette has, and SudokuPad colors', async () => {
    await p.click(SETTINGS_BUTTON)
    const labels = await p.locator(`${PRESET} option`).allTextContents()
    assert.deepEqual(labels.filter((l) => !l.startsWith('Darker page')), ['Custom', 'Pen colors', 'SudokuPad colors'])
    assert.equal(labels[2], 'Darker page 1')
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('a Darker page preset sets nine colors that are not SudokuPad\'s, and Save writes them', async () => {
    await p.click(SETTINGS_BUTTON)
    await p.locator(PRESET).selectOption('page-1')
    const colors = await dialogColors(p)
    assert.notDeepEqual(colors, SUDOKUPAD_COLORS)
    await closeDialogWith(p, 'Save', EDITOR)
    assert.deepEqual(await savedColors(p), colors)
  })

  it('SudokuPad colors, after Darker page 1, sets all nine colors in the dialog, and Save writes them and recolors the panel', async () => {
    await p.click(SETTINGS_BUTTON)
    await p.locator(PRESET).selectOption('sudokupad')
    assert.deepEqual(await dialogColors(p), SUDOKUPAD_COLORS)
    await closeDialogWith(p, 'Save', EDITOR)
    assert.deepEqual(await savedColors(p), SUDOKUPAD_COLORS)
    const lines = await p.locator('.controls-input button.digit').evaluateAll((bs) => bs.map((b) => window.getComputedStyle(b, '::after').color))
    assert.equal(lines[3], 'rgb(245, 58, 55)', 'color 4 shows SudokuPad\'s red')
  })

  it('editing one color in the dialog makes the list Custom, and Save keeps the edit', async () => {
    await p.click(SETTINGS_BUTTON)
    await p.locator(PRESET).selectOption('sudokupad')
    await p.locator(`${EDITOR} input[data-role="swatch"][data-key="2"]`).fill('#123456')
    assert.equal(await p.locator(PRESET).inputValue(), '')
    await closeDialogWith(p, 'Save', EDITOR)
    assert.deepEqual(await savedColors(p), { ...SUDOKUPAD_COLORS, 2: '#123456' })
  })

  it('Copy settings then Paste settings in a fresh page restores the colors, size, transparency, outline, box color, frame and font, and carries nothing else', async () => {
    await read(p, (values) => Object.entries(values).forEach(([key, value]) => Framework.setData(key, value)), { [WIDTH_KEY]: 3.5, [OPACITY_KEY]: 55, [OUTLINE_KEY]: 'thin', [BOX_KEY]: 'tint', [FRAME_KEY]: true, [FONT_KEY]: 'fixed' })
    await p.click(SETTINGS_BUTTON)
    await actButton(p, 'copy-settings').click()
    await p.locator(STATUS).filter({ hasText: 'Settings copied.' }).waitFor()
    const copied = await p.evaluate(() => navigator.clipboard.readText())
    assert.deepEqual(Object.keys(JSON.parse(copied)).sort(), [BOX_KEY, COLORS_KEY, FONT_KEY, FRAME_KEY, OPACITY_KEY, OUTLINE_KEY, WIDTH_KEY], 'colors, size, transparency, outline, box color, frame and font only')
    await closeDialogWith(p, 'Cancel', EDITOR)

    const other = await open()
    try {
      await pickTextAnywhere(other.p)
      await other.p.evaluate((t) => navigator.clipboard.writeText(t), copied)
      await other.p.click(SETTINGS_BUTTON)
      await actButton(other.p, 'paste-settings').click()
      await other.p.locator(STATUS).filter({ hasText: 'Pasted 7 settings.' }).waitFor()
      assert.deepEqual(await savedColors(other.p), { ...SUDOKUPAD_COLORS, 2: '#123456' })
      assert.deepEqual(await dialogColors(other.p), { ...SUDOKUPAD_COLORS, 2: '#123456' })
      // A size of 3.5 is off the old menu's six sizes, and is kept as it is.
      assert.equal(await valueOf(other.p, SIZE_SLIDER), 3.5)
      assert.equal(await read(other.p, (key) => Framework.getData(key), WIDTH_KEY), 3.5, 'the pasted size is saved as it is')
      assert.equal(await valueOf(other.p, textAnywhere.OPACITY_SLIDER), 55)
      for (const [key, value] of [[OUTLINE_KEY, 'thin'], [BOX_KEY, 'tint'], [FRAME_KEY, true], [FONT_KEY, 'fixed']]) assert.equal(await read(other.p, (k) => Framework.getData(k), key), value, `${key} is saved as pasted`)
      // The dialog's draft was reset to the pasted looks, so none of them reads as an unsaved edit.
      for (const [role, value] of [['outline-pick', 'thin'], ['box-pick', 'tint'], ['frame-pick', 'on']]) assert.equal(await other.p.locator(`${EDITOR} button[data-role="${role}"][data-value="${value}"]`).getAttribute('aria-pressed'), 'true', role)
      assert.equal(await other.p.locator(`${EDITOR} [data-role="font-choice"]`).inputValue(), 'fixed')
      assert.equal(await dialogButton(other.p, 'Save').count(), 1)
      assert.deepEqual(other.errors, [])
    } finally {
      await other.context.close()
    }
  })

  it('a palette of a shape the script does not know leaves the Darker page presets out, and the dialog says so', async () => {
    await read(p, () => { window.savedPalette = Framework.app.tools.colour.palette; Framework.app.tools.colour.palette = { pages: 'unknown' } })
    try {
      await p.click(SETTINGS_BUTTON)
      assert.deepEqual(await p.locator(`${PRESET} option`).allTextContents(), ['Custom', 'Pen colors', 'SudokuPad colors'])
      assert.match(await p.locator(`${EDITOR} [data-role="palette-note"]`).textContent(), /Darker page presets are left out/)
      await closeDialogWith(p, 'Cancel', EDITOR)
    } finally {
      await read(p, () => { Framework.app.tools.colour.palette = window.savedPalette })
    }
  })

  it('saved colors that cannot be read are left as they are when Text Anywhere is first made current, a bad color showing SudokuPad\'s', async () => {
    const bad = { 1: 'red', 4: '#123456' }
    const other = await open()
    try {
      await read(other.p, ([key, value]) => Framework.setData(key, value), [COLORS_KEY, bad])
      await textAnywhere.reload(other.p)
      await pickTextAnywhere(other.p)
      const lines = await other.p.locator('.controls-input button.digit:not([data-key="0"])').evaluateAll((bs) => bs.map((b) => window.getComputedStyle(b, '::after').color))
      assert.deepEqual([lines[0], lines[3]], ['rgb(31, 128, 32)', 'rgb(18, 52, 86)'], 'color 1 shows SudokuPad\'s green and color 4 the saved one')
      assert.deepEqual(await savedColors(other.p), bad)
      assert.deepEqual(other.errors, [])
    } finally {
      await other.context.close()
    }
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
