// Live check of the Color by Digit dialog's layout (#304, #333) at 1200x900 and 390x800 on sudokupad.app in headless Chromium: the Mode, Cell
// and Digit pulldowns one per row with the label left of each, Copy and Paste settings as icons in the title row, two columns on a
// desktop and one on a phone, with no sideways overflow. How it looks is judged by sight in the PR.
/* global document */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { EDITOR, group, openSession, paintedKeys, savedProfiles, SEEDED_OFF, MODE_STORAGE_KEY } from './color-by-digit-fixtures.mjs'
import { openScriptDialog } from './settings.mjs'

const script = readFileSync(new URL('../color-by-digit.user.js', import.meta.url), 'utf8')
const DESKTOP = { width: 1200, height: 900 }
const PHONE = { width: 390, height: 800 }
const DESKTOP_DIALOG_PX = 640
const NEAR_PX = 1

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

for (const [viewport, columns] of [[DESKTOP, 2], [PHONE, 1]]) {
  describe(`the dialog at ${viewport.width} px`, { concurrency: false }, () => {
    let context, p
    const rect = (selector) => p.locator(selector).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right } })
    before(async () => {
      ;({ context, p } = await openSession(browser, script, { contextOptions: { viewport } }))
      await openScriptDialog(p, 'Color by Digit', EDITOR)
    })
    after(async () => { await context?.close() })

    it('lays the Mode, Cell and Digit pulldowns one per row, each label left of its select in one label column, with no checkbox and no mode button', async () => {
      const boxes = await p.locator(`${EDITOR} .cbd-pulldown`).evaluateAll((es) => es.map((e) => {
        const label = e.querySelector('span').getBoundingClientRect(); const select = e.querySelector('select').getBoundingClientRect()
        return { role: e.querySelector('select').dataset.role, labelX: Math.round(label.x), labelRight: Math.round(label.right), labelY: label.y + label.height / 2, selectX: Math.round(select.x), selectRight: Math.round(select.right), selectY: select.y + select.height / 2, top: Math.round(select.y) }
      }))
      assert.deepEqual(boxes.map((b) => b.role), ['mode-draft', 'cell-profile', 'digit-profile'])
      assert.equal(await p.locator(`${EDITOR} input[type=checkbox], ${EDITOR} button[data-role="mode-draft"]`).count(), 0)
      assert.equal(new Set(boxes.map((b) => b.top)).size, 3, `one row each: ${JSON.stringify(boxes)}`)
      assert.equal(new Set(boxes.map((b) => b.labelX)).size, 1, `labels share a left edge: ${JSON.stringify(boxes)}`)
      assert.equal(new Set(boxes.map((b) => b.selectX)).size, 1, `selects line up: ${JSON.stringify(boxes)}`)
      assert.equal(new Set(boxes.map((b) => b.selectRight)).size, 1, `selects share a width: ${JSON.stringify(boxes)}`)
      const dialog = await rect('.dialog')
      for (const b of boxes) {
        assert.equal(b.labelRight <= b.selectX, true, `label left of its select: ${JSON.stringify(b)}`)
        assert.equal(Math.abs(b.labelY - b.selectY) <= NEAR_PX, true, `label centred on its row: ${JSON.stringify(b)}`)
        assert.equal(b.selectRight <= dialog.right, true, `inside the dialog: ${JSON.stringify(b)}`)
      }
    })

    it(`has ${columns} column${columns === 1 ? '' : 's'}, the list left of or above the editor, and no sideways overflow`, async () => {
      const list = await rect(`${EDITOR} .cbd-column:nth-child(1)`)
      const groups = await rect(`${EDITOR} .cbd-column:nth-child(2)`)
      if (columns === 2) assert.equal(groups.x >= list.right, true, `side by side: ${JSON.stringify([list, groups])}`)
      else assert.equal(Math.abs(groups.x - list.x) <= NEAR_PX, true, `stacked: ${JSON.stringify([list, groups])}`)
      const overflow = await p.locator('.dialog').first().evaluate((d) => ({ scroll: d.scrollWidth, client: d.clientWidth, doc: document.documentElement.scrollWidth, win: window.innerWidth }))
      assert.equal(overflow.scroll <= overflow.client, true, JSON.stringify(overflow))
      assert.equal(overflow.doc <= overflow.win, true, JSON.stringify(overflow))
    })

    it('puts Copy settings and Paste settings as two icons at the right end of the title row, and only Cancel and Save in the bottom row', async () => {
      const icons = await p.locator('.cbd-title-row [data-act$="-settings"]').evaluateAll((es) => es.map((e) => ({ act: e.dataset.act, label: e.getAttribute('aria-label'), title: e.title, text: e.textContent.trim(), ...(({ x, y, right, width, height }) => ({ x, y, right, width, height }))(e.getBoundingClientRect()) })))
      assert.deepEqual(icons.map((i) => [i.act, i.label, i.title, i.text]), [['copy-settings', 'Copy settings', 'Copy settings', ''], ['paste-settings', 'Paste settings', 'Paste settings', '']])
      const row = await rect('.cbd-title-row')
      assert.equal(row.right - icons[1].right <= 12, true, `paste icon sits at the row's right end: ${JSON.stringify([row, icons])}`)
      assert.equal(icons[1].x >= icons[0].right - NEAR_PX && Math.abs(icons[0].y - icons[1].y) <= NEAR_PX, true, JSON.stringify(icons))
      for (const i of icons) assert.equal(i.width >= 20 && i.height >= 20 && i.height <= 40, true, `icon size: ${JSON.stringify(i)}`)
      assert.deepEqual(await p.locator('.dialog-options button').evaluateAll((es) => es.map((e) => e.textContent.trim())), ['Cancel', 'Save'])
    })

    if (viewport === DESKTOP) {
      it('is about 640 px wide', async () => {
        const { width } = await rect('.dialog')
        assert.equal(Math.abs(width - DESKTOP_DIALOG_PX) <= NEAR_PX, true, `width ${width}`)
      })
    }
  })
}

const EACH_DIGIT = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d, i) => group(String(i + 1), [d]))

for (const viewport of [DESKTOP, PHONE]) {
  describe(`the paint editor with Each digit's nine groups at ${viewport.width} px`, { concurrency: false }, () => {
    let context, p
    const heights = () => p.evaluate(() => ({ dialog: document.querySelector('.dialog').getBoundingClientRect().bottom, window: window.innerHeight }))
    before(async () => {
      const saved = { ...SEEDED_OFF, ...savedProfiles({ profiles: [{ name: 'Each digit', groups: EACH_DIGIT }], active: 0 }), [MODE_STORAGE_KEY]: 'off' }
      ;({ context, p } = await openSession(browser, script, { saved, contextOptions: { viewport } }))
      await openScriptDialog(p, 'Color by Digit', EDITOR)
    })
    after(async () => { await context?.close() })

    it('shows the palette and the ten digit keys in one grid, one key per digit, and the dialog stays inside the window', async () => {
      assert.equal(await p.locator(`${EDITOR} button[data-act=open]`).count(), 0)
      assert.deepEqual(await paintedKeys(p), { 0: '', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9' })
      if (viewport === DESKTOP) {
        const { dialog, window } = await heights()
        assert.equal(dialog <= window, true, `dialog bottom ${dialog} within window ${window}`)
      }
    })

    it('puts each swatch row level with a pad row, 0 right of 9, and the pad inside the column at this width', async () => {
      const box = (selector) => p.locator(selector).first().boundingBox()
      const [swatch1, swatch4, swatch7, d1, d4, d7, d9, d0, column] = await Promise.all([
        box(`${EDITOR} button[data-act=color]`), box(`${EDITOR} button[data-act=color] >> nth=3`), box(`${EDITOR} button[data-act=color] >> nth=6`),
        box(`${EDITOR} [data-digit="1"]`), box(`${EDITOR} [data-digit="4"]`), box(`${EDITOR} [data-digit="7"]`), box(`${EDITOR} [data-digit="9"]`), box(`${EDITOR} [data-digit="0"]`),
        box(`${EDITOR} .cbd-column:nth-child(2)`)
      ])
      assert.deepEqual([swatch1.y, swatch4.y, swatch7.y], [d1.y, d4.y, d7.y])
      assert.equal(d0.y, d7.y)
      assert.equal(d0.x > d9.x, true, JSON.stringify([d9, d0]))
      assert.equal(d0.x + d0.width <= column.x + column.width + 1, true, `pad inside the column: ${JSON.stringify([d0, column])}`)
      if (viewport === DESKTOP) {
        const { dialog, window } = await heights()
        assert.equal(dialog <= window, true, `dialog bottom ${dialog} within window ${window}`)
      }
    })
  })
}
