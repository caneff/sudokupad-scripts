// Live check of draw-tool.user.js's Background box setting and Frame checkbox on sudokupad.app: each preset and a custom color recolor every boxed note
// at Save and survive a reload, Tint tints each note from its own color, Cancel changes nothing, a note without a box gets neither, and Copy then Paste
// in a fresh page carries both, an invalid pasted value reading as Page and as off.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { closeDialogWith } from '../settings.mjs'

const { BOX_KEY, FRAME_KEY, SETTINGS_BUTTON, SETTINGS_EDITOR: EDITOR, SETTINGS_STATUS: STATUS, TEXTS, pickDraw } = draw
const CHOICE = `${EDITOR} select[data-role="box-choice"]`
const CUSTOM = `${EDITOR} input[data-role="box-custom"]`
const FRAME = `${EDITOR} input[data-role="frame"]`
const ITEMS = [
  { kind: 'text', color: 1, size: 20, opacity: 100, bg: true, text: 'one', at: [30, 30] },
  { kind: 'text', color: 6, size: 20, opacity: 100, bg: true, text: 'six', at: [90, 30] },
  { kind: 'text', color: 4, size: 20, opacity: 100, text: 'bare', at: [150, 30] }
]
const TRANSPARENT = 'rgba(0, 0, 0, 0)'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

const open = () => openPage(browser, { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } })
const stored = (p, key) => p.evaluate((k) => Framework.getData(k) ?? null, key)
// Each note's box fill and shadow as the browser computes them, by text.
const looks = (p) => p.evaluate((selector) => Object.fromEntries([...document.querySelectorAll(selector)].map((e) => {
  const style = window.getComputedStyle(e)
  return [e.textContent, { fill: style.backgroundColor, shadow: style.boxShadow }]
})), TEXTS)
const pageColor = (p) => p.evaluate(() => {
  const probe = Object.assign(document.createElement('div'), { style: 'background: var(--body-bg, #fff)' })
  document.body.appendChild(probe)
  const color = window.getComputedStyle(probe).backgroundColor
  probe.remove()
  return color
})
const dialog = async (p, work, close = 'Save') => {
  await p.click(SETTINGS_BUTTON)
  await p.locator(EDITOR).waitFor({ state: 'visible' })
  await work()
  await closeDialogWith(p, close, EDITOR)
}
const choose = (p, value) => p.locator(CHOICE).selectOption(value)

describe('Text Annotation\'s background box color and frame', { concurrency: false }, () => {
  let context, p, errors
  before(async () => {
    ;({ context, p, errors } = await open())
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await p.evaluate(([box, frame]) => { Framework.removeData(box); Framework.removeData(frame) }, [BOX_KEY, FRAME_KEY])
    await draw.plantDrawing(p, ITEMS)
    await draw.reload(p)
    await pickDraw(p)
  })
  after(async () => { await context.close() })

  it('by default the boxes are the page color, there is no frame, and a note without a box has neither', async () => {
    const page = await pageColor(p)
    assert.deepEqual(await looks(p), { one: { fill: page, shadow: 'none' }, six: { fill: page, shadow: 'none' }, bare: { fill: TRANSPARENT, shadow: 'none' } })
    await p.click(SETTINGS_BUTTON)
    assert.equal(await p.locator(CHOICE).inputValue(), 'page')
    assert.deepEqual(await p.locator(`${CHOICE} option`).allTextContents(), ['Page', 'White', 'Sticky yellow', 'Tint', 'Custom'])
    assert.equal(await p.locator(FRAME).isChecked(), false)
    assert.equal(await p.locator(CUSTOM).count(), 0)
    // SudokuPad stretches a dialog's inputs: the checkbox must stay its own size, on the pulldown's left edge, with its word right beside it.
    const { check, word, choice } = await p.evaluate(() => {
      const row = document.querySelector('#draw-tool-dialog .draw-tool-frame-row')
      const range = document.createRange()
      range.selectNodeContents([...row.childNodes].find((node) => node.nodeType === window.Node.TEXT_NODE && node.textContent.trim()))
      return { check: row.querySelector('input').getBoundingClientRect(), word: range.getBoundingClientRect(), choice: document.querySelector('#draw-tool-dialog select[data-role="box-choice"]').getBoundingClientRect() }
    })
    assert.equal(check.width < 30, true, `the checkbox is ${check.width}px wide`)
    assert.equal(Math.abs(check.left - choice.left) <= 2, true, `the checkbox is at ${check.left}, the pulldown at ${choice.left}`)
    assert.equal(word.left >= check.right && word.left - check.right <= 16, true, `the word starts ${word.left - check.right}px from the checkbox`)
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('Page follows the page\'s own color and White does not, and picking Page again restores it', async () => {
    await p.evaluate(() => document.body.style.setProperty('--body-bg', 'rgb(221, 238, 255)'))
    try {
      await dialog(p, () => choose(p, 'page'))
      assert.equal((await looks(p)).one.fill, 'rgb(221, 238, 255)')
      await dialog(p, () => choose(p, 'white'))
      assert.equal((await looks(p)).one.fill, 'rgb(255, 255, 255)')
      await dialog(p, () => choose(p, 'page'))
      assert.equal((await looks(p)).six.fill, 'rgb(221, 238, 255)')
      assert.equal(await stored(p, BOX_KEY), 'page')
    } finally {
      await p.evaluate(() => document.body.style.removeProperty('--body-bg'))
    }
  })

  it('White and Sticky yellow recolor every boxed note at Save and survive a reload', async () => {
    for (const [preset, fill] of [['white', 'rgb(255, 255, 255)'], ['yellow', 'rgb(255, 244, 176)']]) {
      await dialog(p, () => choose(p, preset))
      assert.equal(await stored(p, BOX_KEY), preset)
      assert.deepEqual(await looks(p), { one: { fill, shadow: 'none' }, six: { fill, shadow: 'none' }, bare: { fill: TRANSPARENT, shadow: 'none' } }, preset)
    }
    await draw.reload(p)
    await pickDraw(p)
    assert.equal((await looks(p)).six.fill, 'rgb(255, 244, 176)')
  })

  it('Tint gives each boxed note a box tinted from its own color', async () => {
    await dialog(p, () => choose(p, 'tint'))
    const { one, six, bare } = await looks(p)
    assert.notEqual(one.fill, six.fill)
    assert.equal(bare.fill, TRANSPARENT)
    // Color 1 is green and 6 blue, so the green note's box is greener than blue and the blue note's the other way; a mix computes as color(srgb r g b).
    const [r1, g1, b1] = one.fill.match(/[\d.]+/g).slice(-3).map(Number)
    const [r6, g6, b6] = six.fill.match(/[\d.]+/g).slice(-3).map(Number)
    for (const channel of [r1, g1, b1, r6, g6, b6]) assert.equal(channel > 0.8, true, `a light tint, not the note's own color: ${one.fill}, ${six.fill}`)
    assert.equal(g1 > b1 && g1 > r1, true, one.fill)
    assert.equal(b6 > g6 && b6 > r6, true, six.fill)
  })

  it('Custom shows a color picker, and its color fills every boxed note, kept on a reload', async () => {
    await dialog(p, async () => {
      await choose(p, 'custom')
      await p.locator(CUSTOM).fill('#ffc0cb')
    })
    assert.equal(await stored(p, BOX_KEY), '#ffc0cb')
    const fill = 'rgb(255, 192, 203)'
    assert.deepEqual(await looks(p), { one: { fill, shadow: 'none' }, six: { fill, shadow: 'none' }, bare: { fill: TRANSPARENT, shadow: 'none' } })
    await draw.reload(p)
    await pickDraw(p)
    assert.equal((await looks(p)).one.fill, fill)
    await p.click(SETTINGS_BUTTON)
    assert.equal(await p.locator(CHOICE).inputValue(), 'custom')
    assert.equal(await p.locator(CUSTOM).inputValue(), '#ffc0cb')
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('Cancel leaves the box color and the frame as they were', async () => {
    const before = await looks(p)
    await dialog(p, async () => {
      await choose(p, 'white')
      await p.locator(FRAME).check()
    }, 'Cancel')
    assert.deepEqual(await looks(p), before)
    assert.equal(await stored(p, BOX_KEY), '#ffc0cb')
    assert.equal(await stored(p, FRAME_KEY), null)
  })

  it('Frame on frames every boxed note with a thin light gray ring and no other, off removes it, and both survive a reload', async () => {
    await dialog(p, () => p.locator(FRAME).check())
    assert.equal(await stored(p, FRAME_KEY), true)
    // The ring is one screen pixel, which on the board is 1 / scale of a board unit.
    const ring = (shadow) => assert.match(shadow, /^rgb\(196, 196, 196\) 0px 0px 0px [\d.]+px$/)
    let { one, six, bare } = await looks(p)
    ring(one.shadow)
    ring(six.shadow)
    const onScreen = await p.evaluate((selector) => {
      const note = [...document.querySelectorAll(selector)].find((e) => e.textContent === 'one')
      return parseFloat(window.getComputedStyle(note).boxShadow.match(/([\d.]+)px$/)[1]) * new window.DOMMatrix(window.getComputedStyle(note.parentElement).transform).a
    }, TEXTS)
    assert.equal(Math.abs(onScreen - 1) < 0.01, true, `the ring is ${onScreen} screen pixels wide`)
    assert.equal(bare.shadow, 'none')
    await draw.reload(p)
    await pickDraw(p)
    ring((await looks(p)).one.shadow)
    await dialog(p, async () => {
      assert.equal(await p.locator(FRAME).isChecked(), true)
      await p.locator(FRAME).uncheck()
    })
    ;({ one, six, bare } = await looks(p))
    assert.deepEqual([one.shadow, six.shadow, bare.shadow], ['none', 'none', 'none'])
    await draw.reload(p)
    await pickDraw(p)
    assert.equal((await looks(p)).one.shadow, 'none')
  })

  it('Copy then Paste in a fresh page carries the box color and the frame, and an invalid pasted value reads as Page and off', async () => {
    await dialog(p, async () => {
      await choose(p, 'yellow')
      await p.locator(FRAME).check()
    })
    await p.click(SETTINGS_BUTTON)
    await p.locator('.dialog button[data-act="copy-settings"]').click()
    await p.locator(STATUS).filter({ hasText: 'Settings copied.' }).waitFor()
    const copied = JSON.parse(await p.evaluate(() => navigator.clipboard.readText()))
    assert.equal(copied[BOX_KEY], 'yellow')
    assert.equal(copied[FRAME_KEY], true)
    await closeDialogWith(p, 'Cancel', EDITOR)

    const other = await open()
    try {
      await draw.boot(other.p)
      await draw.plantDrawing(other.p, ITEMS)
      await draw.reload(other.p)
      await pickDraw(other.p)
      for (const [text, box, frame] of [[JSON.stringify(copied), 'yellow', true], [JSON.stringify({ [BOX_KEY]: 'plaid', [FRAME_KEY]: 'yes' }), 'page', false]]) {
        await other.p.evaluate((t) => navigator.clipboard.writeText(t), text)
        await other.p.click(SETTINGS_BUTTON)
        await other.p.locator('.dialog button[data-act="paste-settings"]').click()
        await other.p.locator(STATUS).filter({ hasText: /^Pasted \d settings?\.$/ }).waitFor()
        assert.equal(await stored(other.p, BOX_KEY), box)
        assert.equal(await stored(other.p, FRAME_KEY), frame)
        assert.equal(await other.p.locator(CHOICE).inputValue(), box)
        assert.equal(await other.p.locator(FRAME).isChecked(), frame)
        assert.equal((await looks(other.p)).one.shadow === 'none', !frame, `the shadow is ${(await looks(other.p)).one.shadow}`)
        await closeDialogWith(other.p, 'Cancel', EDITOR)
      }
      assert.deepEqual(other.errors, [])
    } finally {
      await other.context.close()
    }
    assert.deepEqual(errors, [])
  })
})
