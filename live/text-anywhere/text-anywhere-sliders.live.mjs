// Live check of text-anywhere.user.js's Size and Opacity sliders on sudokupad.app in headless Chromium at 1280x720: the two sliders under the controls in the shared
// style (no Size or Outline button), a drag that follows the pointer, a move with nothing selected (the next note, saved), with notes selected (those only), with a note
// open, and a saved size off the old menu's six that is kept. Real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { readUntil } from '../settle.mjs'
import { useBrowser } from '../session.mjs'
import { clickAt, finishNote, gridPoint, typeText } from '../board.mjs'
import { slideTo } from '../slider.mjs'

const { COLOR_KEY, OPACITY_KEY, OPACITY_SLIDER, SIZE_SLIDER, SLIDERS, TEXT_BOX, WIDTH_KEY, valueOf } = textAnywhere
const A = [1.5, 1.5]
const B = [1.5, 3.5]
const C = [5.5, 5.5]

const browser = useBrowser()

describe('Text Anywhere\'s Size and Opacity sliders', { concurrency: false }, () => {
  let context, p, errors

  const saved = () => textAnywhere.saved(p)
  const savedNote = async (text) => (await saved()).find((item) => item.text === text)
  const stored = (name) => p.evaluate((k) => Framework.getData(k) ?? null, name)
  const reload = () => textAnywhere.reloadOnTextAnywhere(p)
  const focusedSlider = () => p.evaluate((s) => document.activeElement?.matches(`${s} input`) === true, SLIDERS)

  before(async () => {
    ;({ context, p, errors } = await textAnywhere.open(browser(), { contextOptions: { viewport: { width: 1280, height: 720 } } }))
    await textAnywhere.forgetNotes(p)
    await p.evaluate((keys) => keys.forEach((k) => Framework.removeData(k)), [COLOR_KEY, WIDTH_KEY, OPACITY_KEY])
    await reload()
  })
  after(async () => { await context.close() })

  it('the panel shows a Size slider and a Opacity slider under the controls, and no Size or Outline button', async () => {
    assert.equal(await p.locator(`${SLIDERS} input[type=range]`).count(), 2)
    assert.equal(await p.locator('.text-anywhere-menu-row, .text-anywhere-menu-button, .text-anywhere-menu').count(), 0, 'no Size or Outline menu button')
    const rect = (selector) => p.locator(selector).evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom } })
    const [clear, size, opacity, panel] = await Promise.all([textAnywhere.CLEAR_BUTTON, SIZE_SLIDER, OPACITY_SLIDER, '.controls-input'].map(rect))
    assert.ok(size.y >= clear.bottom && opacity.y >= size.bottom - 1, 'Size, then Opacity, under the controls')
    assert.ok(opacity.bottom <= panel.bottom, 'both fit inside the keypad')
    assert.deepEqual(await p.evaluate(([a, b]) => [a, b].map((s) => { const i = document.querySelector(s); return [Number(i.min), Number(i.max), Number(i.step)] }), [SIZE_SLIDER, OPACITY_SLIDER]), [[1, 16, 0.5], [20, 100, 5]])
    assert.deepEqual([await valueOf(p, SIZE_SLIDER), await valueOf(p, OPACITY_SLIDER)], [6, 100])
  })

  it('the tracks are drawn as Pen Tool Extras\' are: the Size one a wedge picture, the Opacity one a fade', async () => {
    // The browser gives no computed style for a track's pseudo-element, so the panel's own rules are read.
    const rule = (selector) => p.evaluate((s) => document.getElementById('text-anywhere-style').textContent.split('\n').find((line) => line.startsWith(`${s}::-webkit-slider-runnable-track`)) ?? '', selector)
    assert.match(await rule(SIZE_SLIDER), /background: url\("data:image\/svg\+xml/)
    assert.match(await rule(OPACITY_SLIDER), /background: linear-gradient\(/)
  })

  it('a press on a track away from the thumb and a drag across make the value follow the pointer, and the focus goes back to the page on release', async () => {
    for (const selector of [SIZE_SLIDER, OPACITY_SLIDER]) {
      const { min, max } = await p.evaluate((s) => ({ min: Number(document.querySelector(s).min), max: Number(document.querySelector(s).max) }), selector)
      const box = await p.locator(selector).boundingBox()
      const at = (fraction) => [box.x + box.width * fraction, box.y + box.height / 2]
      await p.mouse.move(...at(0.1))
      await p.mouse.down()
      await p.mouse.move(...at(0.9), { steps: 12 })
      await readUntil(() => valueOf(p, selector), (v) => v >= min + (max - min) * 0.8)
      await p.mouse.up()
      assert.equal(await focusedSlider(), false, 'no slider keeps the focus')
    }
    await slideTo(p, SIZE_SLIDER, 6)
    await slideTo(p, OPACITY_SLIDER, 100)
  })

  it('a move with nothing selected sets the next note only, is saved, and survives a reload', async () => {
    await typeText(p, A, 'A')
    assert.deepEqual([(await savedNote('A')).size, (await savedNote('A')).opacity], [20, 100])
    await slideTo(p, SIZE_SLIDER, 12)
    await slideTo(p, OPACITY_SLIDER, 60)
    assert.deepEqual([await stored(WIDTH_KEY), await stored(OPACITY_KEY)], [12, 60])
    assert.deepEqual([(await savedNote('A')).size, (await savedNote('A')).opacity], [20, 100], 'the earlier note keeps its look')
    await typeText(p, B, 'B')
    assert.deepEqual([(await savedNote('B')).size, (await savedNote('B')).opacity], [32, 60])
    await reload()
    assert.deepEqual([await valueOf(p, SIZE_SLIDER), await valueOf(p, OPACITY_SLIDER)], [12, 60])
  })

  it('with notes selected the sliders show the first note\'s values, and a move changes those notes, is saved and is also the next-note values', async () => {
    await clickAt(p, A)
    assert.deepEqual([await valueOf(p, SIZE_SLIDER), await valueOf(p, OPACITY_SLIDER)], [6, 100])
    await p.keyboard.down('Shift')
    await clickAt(p, B)
    await p.keyboard.up('Shift')
    assert.deepEqual([await valueOf(p, SIZE_SLIDER), await valueOf(p, OPACITY_SLIDER)], [6, 100], 'a mixed selection shows the first note\'s')
    await slideTo(p, SIZE_SLIDER, 3)
    await slideTo(p, OPACITY_SLIDER, 40)
    await finishNote(p)
    await typeText(p, C, 'C')
    assert.deepEqual((await saved()).map((i) => [i.text, i.size, i.opacity]), [['A', 14, 40], ['B', 14, 40], ['C', 14, 40]])
    assert.deepEqual([await stored(WIDTH_KEY), await stored(OPACITY_KEY)], [3, 40], 'the next-note values are the ones picked')
    await reload()
    assert.deepEqual((await saved()).map((i) => [i.size, i.opacity]), [[14, 40], [14, 40], [14, 40]])
  })

  it('a move while a note is open changes that note, keeps it open and is also the next-note values', async () => {
    await textAnywhere.reopen(p, await gridPoint(p, A))
    assert.equal(await p.locator(TEXT_BOX).count(), 1)
    assert.deepEqual([await valueOf(p, SIZE_SLIDER), await valueOf(p, OPACITY_SLIDER)], [3, 40])
    await slideTo(p, SIZE_SLIDER, 9.5)
    await slideTo(p, OPACITY_SLIDER, 75)
    assert.equal(await p.locator(TEXT_BOX).count(), 1, 'the note is still open')
    await p.keyboard.type('x')
    await finishNote(p)
    const note = await savedNote('Ax')
    assert.deepEqual([note?.size, note?.opacity], [27, 75])
    assert.deepEqual([await stored(WIDTH_KEY), await stored(OPACITY_KEY)], [9.5, 75], 'the next-note values are the ones picked')
  })

  it('a size dragged on a selected note sticks: clicking off leaves the panel on it, and a new note has it', async () => {
    await clickAt(p, A)
    await slideTo(p, SIZE_SLIDER, 7)
    await finishNote(p)
    assert.equal(await valueOf(p, SIZE_SLIDER), 7, 'the panel still shows the dragged size after clicking off')
    await typeText(p, [3.5, 5.5], 'new')
    assert.equal((await savedNote('new')).size, (await savedNote('Ax')).size, 'a new note has the dragged size')
  })

  it('selecting a note and clicking off leaves the next-note size as it was', async () => {
    const next = await stored(WIDTH_KEY)
    await clickAt(p, B)
    assert.notEqual(await valueOf(p, SIZE_SLIDER), next, 'the panel shows the selected note\'s own size')
    await finishNote(p)
    assert.equal(await stored(WIDTH_KEY), next, 'the next-note size was not touched')
    assert.equal(await valueOf(p, SIZE_SLIDER), next)
  })

  it('a press on the sliders\' own padding, off both sliders, leaves an open note open with the focus in it', async () => {
    await textAnywhere.reopen(p, await gridPoint(p, A))
    assert.equal(await p.locator(TEXT_BOX).count(), 1)
    const box = await p.locator(SLIDERS).boundingBox()
    await p.mouse.click(box.x + 4, box.y + box.height / 2)
    assert.equal(await p.locator(TEXT_BOX).count(), 1, 'the note is still open')
    await p.keyboard.type('Q')
    assert.match(await p.locator(TEXT_BOX).textContent(), /Q$/)
    await finishNote(p)
  })

  it('a note saved with a size off the old menu\'s six keeps it, and a next-note size saved off them is kept as it is', async () => {
    await textAnywhere.plantNotes(p, [{ kind: 'text', color: 1, size: 23, opacity: 100, text: 'odd', at: [96, 96] }])
    await p.evaluate(([key, value]) => Framework.setData(key, value), [WIDTH_KEY, 7.5])
    await reload()
    assert.equal((await savedNote('odd')).size, 23)
    assert.equal(await valueOf(p, SIZE_SLIDER), 7.5, 'the saved next-note size shows as it is')
    await clickAt(p, A)
    assert.equal(await valueOf(p, SIZE_SLIDER), 7.5, 'and so does the 23 of the note: width 7.5')
    await finishNote(p)
    await typeText(p, [7.5, 1.5], 'kept')
    assert.equal((await savedNote('kept')).size, 23)
    assert.equal((await savedNote('odd')).size, 23)
  })

  it('a next-note opacity saved as something else reads as the default', async () => {
    await p.evaluate(([key, value]) => Framework.setData(key, value), [OPACITY_KEY, 57])
    await reload()
    assert.equal(await valueOf(p, OPACITY_SLIDER), 100)
  })

  it('opens no page error', () => {
    assert.deepEqual(errors, [])
  })
})
