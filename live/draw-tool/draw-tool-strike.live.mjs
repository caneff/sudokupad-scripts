// Live check of draw-tool.user.js's ~~strikethrough~~ on sudokupad.app in headless Chromium at 1280x720: a note with no Background box shows its struck letters as whole
// with the Halo round the letters on Thick and Thin as with None (the halo does not cover the top half of the letters), and a done checklist line reads the same.
// The pixels of the struck text are counted from a screenshot.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'

const { OUTLINE_KEY, TEXTS } = draw
// A letter pixel is a green one: pen color 1 is green, and the board's grid lines and digits are not.
const GREEN_LEAD = 30
// With a halo the letters may lose at most this share of their pixels to antialiasing against white instead of the board.
const LOSS_MAX = 0.04
const NOTES = [
  { name: 'strikethrough', text: '~~HEXAM~~', at: [80, 80] },
  { name: 'a done checklist line', text: '- [x] HEXAM', at: [80, 208] }
]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s struck text under the halo', { concurrency: false }, () => {
  let context, p, errors

  const reload = async () => {
    await draw.reload(p)
    await draw.pickDraw(p)
  }
  // How many of the pixels over the note's text are the note's green: the same screen rectangle whatever the halo, since the padding a halo adds to the note moves nothing.
  const inkOf = async (text) => {
    const box = await p.evaluate(([selector, want]) => {
      const note = [...document.querySelectorAll(selector)].find((e) => e.textContent.includes(want))
      const range = document.createRange()
      range.selectNodeContents(note)
      return range.getBoundingClientRect().toJSON()
    }, [TEXTS, text])
    const png = await p.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } })
    return p.evaluate(async ([base64, lead]) => {
      const image = new window.Image()
      await new Promise((resolve) => { image.onload = resolve; image.src = `data:image/png;base64,${base64}` })
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      let count = 0
      for (let i = 0; i < data.length; i += 4) if (data[i + 1] - data[i] > lead && data[i + 1] - data[i + 2] > lead) count++
      return count
    }, [png.toString('base64'), GREEN_LEAD])
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport: { width: 1280, height: 720 } } }))
    await draw.boot(p)
    await draw.forgetDrawings(p)
  })
  after(async () => { await context.close() })

  for (const { name, text, at } of NOTES) {
    it(`${name} keeps its letters whole with a Thick or Thin halo`, async () => {
      await draw.plantDrawing(p, [{ kind: 'text', color: 1, size: 40, opacity: 100, text, at }])
      const inks = {}
      for (const outline of ['none', 'thin', 'medium']) {
        await p.evaluate(([key, value]) => Framework.setData(key, value), [OUTLINE_KEY, outline])
        await reload()
        inks[outline] = await inkOf('HEXAM')
      }
      assert.ok(inks.none > 200, `the letters are drawn: ${JSON.stringify(inks)}`)
      for (const outline of ['thin', 'medium']) assert.ok(inks[outline] >= inks.none * (1 - LOSS_MAX), `${outline} halo covers the letters: ${JSON.stringify(inks)}`)
    })
  }

  it('the page threw nothing', () => assert.deepEqual(errors, []))
})
