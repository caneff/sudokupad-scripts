// Live check of draw-tool.user.js's ~~strikethrough~~ on sudokupad.app in headless Chromium at 1280x720: a note with no Background box shows its struck letters as whole
// with the Halo round the letters on Thick and Thin as with None (the halo does not cover the top half of the letters), and a done checklist line reads the same.
// The pixels of the struck text are counted from a screenshot.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as draw from './draw-tool-fixtures.mjs'
import { useBrowser } from '../session.mjs'

const { OUTLINE_KEY, STRIKE_PIECES, TEXTS } = draw
// A letter pixel is a green one: pen color 1 is green, and the board's grid lines and digits are not.
const GREEN_LEAD = 30
// With a halo the letters may lose at most this share of their pixels to antialiasing against white instead of the board.
const LOSS_MAX = 0.04
const NOTES = [
  { name: 'strikethrough', text: '~~HEXAM~~', at: [80, 80] },
  { name: 'a done checklist line', text: '- [x] HEXAM', at: [80, 208] }
]

const browser = useBrowser()

describe('Text Anywhere\'s struck text under the halo', { concurrency: false }, () => {
  let context, p, errors

  const reload = () => draw.reloadOnDraw(p)
  // Which pixels of a screen rectangle are the note's green, one flag each, row by row: the board's grid lines and digits are not green.
  const greenIn = async (clip) => {
    const png = await p.screenshot({ clip })
    return p.evaluate(async ([base64, lead]) => {
      const image = new window.Image()
      await new Promise((resolve) => { image.onload = resolve; image.src = `data:image/png;base64,${base64}` })
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      const flags = []
      for (let i = 0; i < data.length; i += 4) flags.push(data[i + 1] - data[i] > lead && data[i + 1] - data[i + 2] > lead)
      return { width: canvas.width, flags }
    }, [png.toString('base64'), GREEN_LEAD])
  }
  // The rectangle of what the first element matching `selector` holds that reads `text`: the text's own extent, the same whatever the halo's padding.
  const textRect = (selector, text) => p.evaluate(([sel, want]) => {
    const element = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(want))
    const range = document.createRange()
    range.selectNodeContents(element)
    return { ...range.getBoundingClientRect().toJSON(), size: parseFloat(window.getComputedStyle(element).fontSize) }
  }, [selector, text])
  const inkOf = async (text) => {
    const { x, y, width, height } = await textRect(TEXTS, text)
    return (await greenIn({ x, y, width, height })).flags.filter(Boolean).length
  }

  before(async () => {
    ;({ context, p, errors } = await draw.open(browser(), { contextOptions: { viewport: { width: 1280, height: 720 } } }))
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

  it('the line runs unbroken across a gap between struck words, past the halo of the letters beside it', async () => {
    await draw.plantDrawing(p, [{ kind: 'text', color: 1, size: 40, opacity: 100, text: '~~HE XAM~~', at: [80, 80] }])
    await p.evaluate(([key, value]) => Framework.setData(key, value), [OUTLINE_KEY, 'medium'])
    await reload()
    const { x, y, width, height, size } = await p.evaluate((selector) => {
      const gap = [...document.querySelectorAll(selector)].find((e) => e.textContent === ' ')
      return { ...gap.getBoundingClientRect().toJSON(), size: parseFloat(window.getComputedStyle(gap).fontSize) }
    }, STRIKE_PIECES)
    const line = await greenIn({ x, y: y + height * 0.52 + size * 0.015, width, height: size * 0.05 })
    const columns = Array.from({ length: line.width }, (_, c) => line.flags.some((flag, i) => flag && i % line.width === c))
    assert.ok(columns.length > 4, `the gap is ${line.width} px wide`)
    assert.ok(columns.every(Boolean), `a neighbor's halo covers the line in the gap: ${columns.map(Number).join('')}`)
  })

  it('a note drawn later, with a box, covers a struck note\'s line', async () => {
    await draw.plantDrawing(p, [
      { kind: 'text', color: 1, size: 40, opacity: 100, text: '~~HEXAM~~', at: [80, 80] },
      { kind: 'text', color: 2, size: 40, opacity: 100, bg: true, text: 'ZZZZZZ', at: [80, 80] }
    ])
    await reload()
    const { x, y, width, height } = await textRect(TEXTS, 'ZZZZZZ')
    const over = await greenIn({ x, y, width, height })
    assert.ok(over.flags.filter(Boolean).length < 10, `the struck line shows through the later note's box: ${over.flags.filter(Boolean).length} green pixels`)
  })

  it('the page threw nothing', () => assert.deepEqual(errors, []))
})
