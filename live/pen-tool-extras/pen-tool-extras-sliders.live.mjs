// Live check of Pen Tool Extras' Thickness and Opacity sliders in the pen panel, on sudokupad.app in headless Chromium at 1280x720:
// SudokuPad cancels every mouse move on the page, which stops the browser dragging a thumb unless the script keeps the move from it.
import { after, before, describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from '../page.mjs'
import { openPenTool } from '../pen.mjs'
import { readUntil } from '../settle.mjs'

const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const SLIDERS = '.pen-tool-extras-sliders'
const THICKNESS = '#pen-tool-extras-thickness'
const OPACITY = '#pen-tool-extras-opacity'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Pen Tool Extras\' sliders drag from the track', { concurrency: false }, () => {
  let context, p

  before(async () => {
    ;({ context, p } = await openPage(browser, { contextOptions: { viewport: { width: 1280, height: 720 } } }))
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
    await p.evaluate(() => Framework.setSetting('toolpen', true))
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await openPenTool(p)
    await p.locator(SLIDERS).waitFor({ state: 'visible' })
  })
  after(async () => { await context.close() })

  const valueOf = (selector) => p.evaluate((s) => Number(document.querySelector(s).value), selector)

  // A press on the track at `from` (a fraction of its length) away from the thumb, then a drag to `to`, with real mouse input; the button stays down.
  async function dragTrack (selector, from, to) {
    const box = await p.locator(selector).boundingBox()
    const at = (fraction) => [box.x + box.width * fraction, box.y + box.height / 2]
    await p.mouse.move(...at(from))
    await p.mouse.down()
    await p.mouse.move(...at(to), { steps: 12 })
  }

  for (const [name, selector] of [['Thickness', THICKNESS], ['Opacity', OPACITY]]) {
    it(`a press on the ${name} track away from the thumb and a drag across make the value follow the pointer`, async () => {
      const { min, max } = await p.evaluate((s) => ({ min: Number(document.querySelector(s).min), max: Number(document.querySelector(s).max) }), selector)
      const range = max - min
      await dragTrack(selector, 0.1, 0.9)
      await readUntil(() => valueOf(selector), (v) => v >= min + range * 0.8)
      await p.mouse.up()
      await dragTrack(selector, 0.9, 0.2)
      await readUntil(() => valueOf(selector), (v) => v <= min + range * 0.3)
      await p.mouse.up()
    })
  }
})
