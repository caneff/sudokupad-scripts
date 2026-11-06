// Live check of auto-rules-resizer.user.js on sudokupad.app, in headless Chromium. The recorded puzzle has no rules,
// so each page is given short rules through SudokuPad's own showMetaInfoUI, as a loaded puzzle gets them, before the
// script is injected.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { settle, stable } from './settle.mjs'

const script = readFileSync(new URL('../auto-rules-resizer.user.js', import.meta.url), 'utf8')

// Three lines at SudokuPad's own width in a 1920 x 1080 window, well under its 14rem cap: short rules.
const RULES = 'Normal sudoku rules apply. Digits along an arrow sum to the digit in its circle. Cells separated by a white dot contain consecutive digits.'
const LANDSCAPE = { width: 1920, height: 1080 }
const SMALLER = { width: 1600, height: 900 }
// SudokuPad's own rules font (1.1rem), and the gap the script keeps to the window's right edge.
const SUDOKUPAD_FONT_PX = 17.6
const EDGE_PX = 8
const PORTRAIT = { width: 800, height: 1100 }
const STYLE = '#auto-rules-resizer-style'
const FONT_BAR = '#auto-rules-resizer-font'
const CORNER = (corner) => `#auto-rules-resizer-drag-${corner}`

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// A page in a `viewport` window with the puzzle started and RULES shown. `seed()` runs before the script goes in.
async function rulesPage (viewport, seed) {
  const opened = await openPage(browser, { contextOptions: { viewport } })
  await startPuzzle(opened.p)
  await opened.p.evaluate((rules) => {
    Framework.app.showMetaInfoUI({ title: 'Arrows and dots', author: 'Tester', rules })
    Framework.app.resize()
  }, RULES)
  if (seed) await seed(opened.p)
  return opened
}

const inject = async (p) => {
  await p.addScriptTag({ content: script })
  await p.locator(STYLE).waitFor({ state: 'attached' })
}

// The rules pane as it lays out now, in visual px, with its computed font in px.
const pane = (p) => p.evaluate(() => {
  const rules = document.querySelector('.puzzle-rules')
  const r = rules.getBoundingClientRect()
  return {
    font: parseFloat(window.getComputedStyle(rules).fontSize),
    inlineFont: rules.style.fontSize,
    left: Math.round(r.left),
    right: Math.round(r.right),
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    width: Math.round(r.width),
    scrolls: rules.scrollHeight > rules.clientHeight
  }
})
const fontPx = async (p) => (await pane(p)).font
const controlsMoved = (p) => p.evaluate(() => document.getElementById('controls').style.translate)
// The controls column's top and bottom, in visual px.
const column = (p) => p.evaluate(() => {
  const r = document.getElementById('controls').getBoundingClientRect()
  return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
})
const boardRight = (p) => p.evaluate(() => document.getElementById('board').getBoundingClientRect().right)
const clickFont = (p, label) => p.locator(`${FONT_BAR} button`, { hasText: label }).click()

// Drags `corner` by (dx, dy) in steps, the way a hand does: over the pane first, so the corner shows.
async function dragCorner (p, corner, dx, dy) {
  const now = await pane(p)
  await p.mouse.move((now.left + now.right) / 2, (now.top + now.bottom) / 2)
  await p.locator(CORNER(corner)).waitFor({ state: 'visible' })
  const box = await p.locator(CORNER(corner)).boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await p.mouse.move(x, y)
  await p.mouse.down()
  await p.mouse.move(x + dx, y + dy, { steps: 8 })
  await p.mouse.up()
}

describe('a landscape window, short rules', { concurrency: false }, () => {
  let context, p, errors, own

  before(async () => {
    ;({ context, p, errors } = await rulesPage(LANDSCAPE))
    own = await pane(p)
    await inject(p)
  })
  after(async () => { await context.close() })

  it('the rules get a larger font and a wider pane, reaching the window\'s right edge, with no scrolling', async () => {
    assert.equal(own.font, SUDOKUPAD_FONT_PX, 'SudokuPad\'s own font, before the script')
    const fitted = await settle(async () => (await fontPx(p)) > own.font, true)
    assert.equal(fitted, true, `font ${await fontPx(p)} after the fit`)
    const now = await pane(p)
    assert.equal(now.width > own.width, true, `width ${own.width} -> ${now.width}`)
    assert.equal(now.right, LANDSCAPE.width - EDGE_PX)
    assert.equal(now.scrolls, false)
  })

  it('f+ and f- move the font one px a press from the automatic size, and f- goes below SudokuPad\'s own', async () => {
    const auto = await fontPx(p)
    await clickFont(p, 'f+')
    assert.equal(await settle(() => fontPx(p), auto + 1), auto + 1, 'f+')
    const downs = Math.ceil(auto - own.font) + 2
    for (let i = 0; i < downs; i++) await clickFont(p, 'f-')
    const low = auto + 1 - downs
    assert.equal(await settle(() => fontPx(p), low), low, `f- ${downs} times`)
    assert.equal(low < own.font, true, `${low} is below SudokuPad's ${own.font}`)
    for (let i = 0; i < downs - 1; i++) await clickFont(p, 'f+')
    assert.equal(await settle(() => fontPx(p), auto), auto, 'back to the automatic size')
  })

  it('the drag corners show only while the pointer is over the rules pane', async () => {
    const shown = () => Promise.all(['ur', 'dl'].map((c) => p.locator(CORNER(c)).isVisible()))
    await p.mouse.move(200, 500) // over the board
    assert.deepEqual(await settle(shown, [false, false]), [false, false], 'pointer on the board')
    const now = await pane(p)
    await p.mouse.move((now.left + now.right) / 2, (now.top + now.bottom) / 2)
    assert.deepEqual(await settle(shown, [true, true]), [true, true], 'pointer on the pane')
  })

  it('the top-right corner grows the pane up and moves the controls up with it', async () => {
    const start = await pane(p)
    await dragCorner(p, 'ur', 0, -60)
    assert.equal(await settle(() => controlsMoved(p), '0px -60px'), '0px -60px')
    const now = await pane(p)
    assert.equal(now.top, start.top - 60)
    assert.equal(now.right, start.right, 'already at the window\'s edge, it grows no further right')
  })

  it('the bottom-left corner grows the pane left, and stops at the board', async () => {
    const start = await pane(p)
    const edge = await boardRight(p)
    await dragCorner(p, 'dl', -400, 0)
    const now = await stable(() => pane(p))
    assert.equal(now.left < start.left, true, `left ${start.left} -> ${now.left}`)
    assert.equal(now.left >= Math.floor(edge), true, `left ${now.left} is clear of the board's right edge ${edge}`)
    assert.equal(now.width > start.width, true, `width ${start.width} -> ${now.width}`)
    assert.equal(now.scrolls, false)
  })

  it('a corner dragged far past the window stops with the controls column inside it', async () => {
    await dragCorner(p, 'dl', 0, 900)
    const down = await stable(() => column(p))
    assert.equal(down.bottom <= LANDSCAPE.height, true, `column bottom ${down.bottom} in a ${LANDSCAPE.height} px window`)
    await dragCorner(p, 'dl', 0, -900)
    await dragCorner(p, 'ur', 0, -2000)
    const up = await stable(() => column(p))
    assert.equal(up.top, 0, 'the column stops at the window\'s top')
  })

  it('a drag made in a larger window is cut back to a smaller one', async () => {
    await p.setViewportSize(SMALLER)
    await settle(() => p.evaluate(() => window.innerHeight), SMALLER.height)
    const now = await stable(() => column(p))
    assert.equal(now.top >= 0, true, `column top ${now.top}`)
    assert.equal(now.bottom <= SMALLER.height, true, `column bottom ${now.bottom} in a ${SMALLER.height} px window`)
    const rect = await stable(() => pane(p))
    assert.equal(rect.left >= Math.floor(await boardRight(p)), true, `pane left ${rect.left} clear of the board`)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

describe('a portrait window', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ;({ context, p, errors } = await rulesPage(PORTRAIT))
    await inject(p)
  })
  after(async () => { await context.close() })

  it('leaves the rules pane as SudokuPad has it, with no font buttons', async () => {
    assert.equal((await pane(p)).inlineFont, '')
    assert.equal(await p.locator(FONT_BAR).isVisible(), false)
  })

  it('fits the pane once the window turns landscape, and takes the fit off when it turns back', async () => {
    await p.setViewportSize(LANDSCAPE)
    assert.equal(await settle(async () => (await fontPx(p)) > SUDOKUPAD_FONT_PX, true), true, 'fitted in landscape')
    assert.equal(await p.locator(FONT_BAR).isVisible(), true, 'font buttons in landscape')
    await p.setViewportSize(PORTRAIT)
    assert.equal(await settle(async () => (await pane(p)).inlineFont, ''), '', 'the fit taken off in portrait')
    assert.equal(await fontPx(p), SUDOKUPAD_FONT_PX)
    assert.equal(await p.locator(FONT_BAR).isVisible(), false, 'no font buttons in portrait')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

describe('beside twitch-rules-scroller\'s sync script', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    // The sync script's font bar, as it adds it on its first fit.
    ;({ context, p, errors } = await rulesPage(LANDSCAPE, (page) => page.evaluate(() => {
      const bar = document.createElement('div')
      bar.id = 'sudokupad-sync-nudge'
      document.body.appendChild(bar)
    })))
    await inject(p)
  })
  after(async () => { await context.close() })

  // The script's first fit runs as its style goes in, and SudokuPad's resize calls the next one synchronously.
  it('leaves the rules pane to it, on the first fit and after a resize', async () => {
    assert.equal((await pane(p)).inlineFont, '', 'first fit')
    await p.evaluate(() => Framework.app.resize())
    assert.equal((await pane(p)).inlineFont, '', 'after a resize')
    assert.equal(await p.locator(FONT_BAR).isVisible(), false)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
