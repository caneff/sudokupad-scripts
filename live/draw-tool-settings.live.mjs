// Live check of draw-tool.user.js's settings dialog on sudokupad.app: it opens from SudokuPad's settings (Experimental) and from the
// panel's gear, shows the version, a preset sets all nine colors and Save writes them, and Copy then Paste in a fresh page restores
// the colors and both sliders.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from './page.mjs'
import { closeDialogWith, dialogButton, headerVersion, openScriptDialog } from './settings.mjs'

const { COLORS_KEY, OPACITY_KEY, OPACITY_SLIDER, SETTINGS_BUTTON, SIZE_SLIDER, WIDTH_KEY, pickDraw, script } = draw
const EDITOR = '#draw-tool-dialog'
const PRESET = `${EDITOR} select[data-role="preset"]`
const STATUS = '.dialog [data-role="settings-status"]'
const NINE = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const SUDOKUPAD_COLORS = { 1: '#1f8020', 2: '#e87cf1', 3: '#e49632', 4: '#f53a37', 5: '#d2be32', 6: '#3d99f5', 7: '#d6d6d6', 8: '#7c7c7c', 9: '#000000' }

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

const open = () => openPage(browser, { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } })
const read = (p, fn, arg) => p.evaluate(fn, arg)
const savedColors = (p) => read(p, (key) => Framework.getData(key) ?? null, COLORS_KEY)
const dialogColors = (p) => p.locator(`${EDITOR} input[type=color]`).evaluateAll((inputs) => Object.fromEntries(inputs.map((i) => [i.dataset.color, i.value])))

describe('Draw Tool\'s settings dialog', { concurrency: false }, () => {
  let context, p, errors
  before(async () => {
    ;({ context, p, errors } = await open())
    await draw.boot(p)
  })
  after(async () => { await context.close() })

  it('the Experimental settings entry opens it, with the version from the script header beside the heading', async () => {
    await openScriptDialog(p, 'Draw Tool', EDITOR)
    assert.equal((await p.locator('.dialog b').first().textContent()).trim(), 'Draw Tool')
    assert.equal((await p.locator('.dialog small').textContent()).trim(), `v${headerVersion(script)}`)
    assert.equal(await p.locator(`${EDITOR} input[type=color]`).count(), 9)
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('the panel\'s gear opens the same dialog', async () => {
    await pickDraw(p)
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
    assert.equal(labels.some((l) => l === 'Darker page 1'), true, 'a Darker page 1 preset')
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('a preset sets all nine colors in the dialog, and Save writes them and recolors the panel', async () => {
    await p.click(SETTINGS_BUTTON)
    await p.locator(PRESET).selectOption('sudokupad')
    assert.deepEqual(await dialogColors(p), SUDOKUPAD_COLORS)
    await closeDialogWith(p, 'Save', EDITOR)
    assert.deepEqual(await savedColors(p), SUDOKUPAD_COLORS)
    const lines = await p.locator('.controls-input button.digit').evaluateAll((bs) => bs.map((b) => window.getComputedStyle(b, '::after').backgroundColor))
    assert.equal(lines[3], 'rgb(245, 58, 55)', 'color 4 shows SudokuPad\'s red')
  })

  it('a Darker page preset sets nine colors that are not SudokuPad's, and Save writes them', async () => {
    await p.click(SETTINGS_BUTTON)
    await p.locator(PRESET).selectOption('page-1')
    const colors = await dialogColors(p)
    assert.equal(NINE.some((n) => colors[n] !== SUDOKUPAD_COLORS[n]), true)
    await closeDialogWith(p, 'Save', EDITOR)
    assert.deepEqual(await savedColors(p), Object.fromEntries(NINE.map((n) => [String(n), colors[n]])))
  })

  it('editing one color in the dialog makes the list Custom, and Save keeps the edit', async () => {
    await p.click(SETTINGS_BUTTON)
    await p.locator(PRESET).selectOption('sudokupad')
    await p.locator(`${EDITOR} input[data-color="2"]`).fill('#123456')
    assert.equal(await p.locator(PRESET).inputValue(), '')
    await closeDialogWith(p, 'Save', EDITOR)
    assert.deepEqual(await savedColors(p), { ...SUDOKUPAD_COLORS, 2: '#123456' })
  })

  it('Copy settings then Paste settings in a fresh page restores the colors and both sliders', async () => {
    await read(p, ([w, o]) => { Framework.setData(w, 3.5); Framework.setData(o, 45) }, [WIDTH_KEY, OPACITY_KEY])
    await p.click(SETTINGS_BUTTON)
    await p.locator('.dialog button[data-act="copy-settings"]').click()
    await p.locator(STATUS).filter({ hasText: 'Settings copied.' }).waitFor()
    const copied = await p.evaluate(() => navigator.clipboard.readText())
    await closeDialogWith(p, 'Cancel', EDITOR)

    const other = await open()
    try {
      await draw.boot(other.p)
      await pickDraw(other.p)
      await other.p.evaluate((t) => navigator.clipboard.writeText(t), copied)
      await other.p.click(SETTINGS_BUTTON)
      await other.p.locator('.dialog button[data-act="paste-settings"]').click()
      await other.p.locator(STATUS).filter({ hasText: 'Pasted 3 settings.' }).waitFor()
      assert.deepEqual(await savedColors(other.p), { ...SUDOKUPAD_COLORS, 2: '#123456' })
      assert.deepEqual(await dialogColors(other.p), { ...SUDOKUPAD_COLORS, 2: '#123456' })
      assert.deepEqual(await read(other.p, ([a, b]) => [Number(document.querySelector(a).value), Number(document.querySelector(b).value)], [SIZE_SLIDER, OPACITY_SLIDER]), [3.5, 45])
      assert.equal(await dialogButton(other.p, 'Save').count(), 1)
      assert.deepEqual(other.errors, [])
    } finally {
      await other.context.close()
    }
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
