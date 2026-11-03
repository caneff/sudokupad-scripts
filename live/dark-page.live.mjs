// Live check of dark-page.user.js on sudokupad.app, in headless Chromium.
// Run with `npm run test:live`. It needs the network and a Playwright Chromium, so
// it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so
// Tampermonkey's real injection time and crackingthecryptic.com stay untested.
// Each injection time runs the same checks:
//   document-idle: at DOMContentLoaded, as `@run-at document-idle` approximates it
//   before-start:  after the page loads, before Start Puzzle
//   after-start:   after Start Puzzle, when the controls already exist
//
// The reference for every board check is the same page with the script switched off (its style
// disabled, its rectangle removed): a separate page that never had the script rasterizes the board
// with a different history, which shifts some antialiased line pixels by a level or two.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../dark-page.user.js', import.meta.url), 'utf8')

const BLACK = 'rgb(0, 0, 0)'
const CREDIT_TEXT = 'rgb(221, 221, 221)'
// SudokuPad's red accent (`--main-color` of `.setting-uitheme-red`), read with no script installed.
const ACCENT_RED = 'rgb(212, 17, 89)'
const START = /Start Puzzle|Continue|Resume/i
const STYLE = '#dark-page-style'
const POLL_MS = 50
const SETTLE_MS = 10000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Boards of other sizes with text outside the grid lines, as little killer and sandwich clues
// are drawn, in the page's own puzzle format.
function boardWithOutsideText (size, boxHeight, boxWidth) {
  const cells = Array.from({ length: size }, () => Array.from({ length: size }, () => ({})))
  const regions = []
  for (let r = 0; r < size; r += boxHeight) {
    for (let c = 0; c < size; c += boxWidth) {
      const region = []
      for (let i = 0; i < boxHeight; i++) for (let j = 0; j < boxWidth; j++) region.push([r + i, c + j])
      regions.push(region)
    }
  }
  const clue = (row, col, text) => ({ center: [row, col], width: 0.8, height: 0.6, text, fontSize: 18, color: '#000000', backgroundColor: '#00000000', borderColor: '#00000000' })
  return {
    size,
    metadata: { title: `outside text ${size}` },
    cells,
    regions,
    overlays: [clue(-0.5, 1.5, '7'), clue(size / 2, -0.5, '12'), clue(size + 0.5, 2.5, '9'), clue(1.5, size + 0.5, '30'), clue(-0.5, -0.5, '4')]
  }
}
const OTHER_BOARDS = { 'a 6x6 board with outside text': boardWithOutsideText(6, 2, 3), 'a 16x16 board with outside text': boardWithOutsideText(16, 4, 4) }

// Loads the puzzle, running `beforeStart` / `afterStart` around Start Puzzle.
async function openPuzzle (p, { beforeStart = async () => {}, afterStart = async () => {} } = {}) {
  await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
  const start = p.getByRole('button', { name: START }).first()
  await start.waitFor({ state: 'visible' })
  await beforeStart()
  await start.click()
  await start.waitFor({ state: 'hidden' })
  await p.locator('#control-undo').waitFor({ state: 'visible' })
  await afterStart()
}

// Enters digits, corner marks, centre marks and colored cells, then deselects, so the board holds
// every kind of entry the script could disturb and no selection highlight.
async function fillBoard (p) {
  const select = (r, c) => p.evaluate(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [r, c])
  const enter = async (r, c, digit) => { await select(r, c); await p.keyboard.press(digit) }
  const markMode = async (id, fn) => { await p.click(id); try { await fn() } finally { await p.click('#control-normal') } }
  await enter(0, 2, '4')
  await enter(0, 3, '2')
  await markMode('#control-corner', async () => { await enter(0, 5, '8'); await enter(0, 5, '6'); await enter(7, 1, '8') })
  await markMode('#control-centre', async () => { await enter(1, 6, '8'); await enter(1, 6, '7') })
  await p.evaluate(() => {
    const a = Framework.app
    a.deselect(); a.select(a.grid.getCell(2, 0)); a.act({ type: 'colour', arg: '3' })
    a.deselect(); a.select(a.grid.getCell(0, 2)); a.act({ type: 'colour', arg: '5' })
    a.deselect()
  })
}

// The region the board checks read: `#svgrenderer`'s box snapped outward to whole pixels. The svg
// clips everything the puzzle draws, so no drawn pixel lies outside it. The mascot that peeks over
// the grid and the top bar, which a narrow window slides the board under, are hidden on every page:
// they belong to SudokuPad, not to the puzzle.
const HIDE_PAGE_UI = '#svenpeek { display: none !important } .topbar { visibility: hidden !important }'
async function regionOf (p) {
  return p.evaluate(() => {
    const b = document.querySelector('#svgrenderer').getBoundingClientRect()
    const x = Math.floor(b.x)
    const y = Math.floor(b.y)
    return { x, y, width: Math.ceil(b.right) - x, height: Math.ceil(b.bottom) - y }
  })
}

// The kept rectangle in page pixels, read once two readings in a row agree: the script moves it
// on the next frame after a change.
async function settledRectangle (p) {
  const read = () => p.evaluate(() => {
    const el = document.getElementById('dark-page-rect')
    if (!el || window.getComputedStyle(el).display === 'none') return null
    const b = el.getBoundingClientRect()
    return { x: b.x, y: b.y, width: b.width, height: b.height }
  })
  let previous = await read()
  const deadline = Date.now() + SETTLE_MS
  for (;;) {
    await sleep(POLL_MS)
    const next = await read()
    if (JSON.stringify(next) === JSON.stringify(previous) || Date.now() > deadline) return next
    previous = next
  }
}

// A PNG of `clip`, taken until two in a row agree, so a fade or a late repaint is waited on by
// its condition and not by a sleep.
async function settledShot (p, clip) {
  const shoot = () => p.screenshot({ clip, animations: 'disabled' })
  let previous = await shoot()
  const deadline = Date.now() + SETTLE_MS
  for (;;) {
    const next = await shoot()
    if (next.equals(previous) || Date.now() > deadline) return next
    previous = next
    await sleep(POLL_MS)
  }
}

// The board region now, with the kept rectangle relative to it (null for a page with no script).
// The region is read again after the shot and the shot repeated until both agree, so a relayout
// still under way (a resize, a puzzle just loaded) is waited on by its condition.
async function boardShot (p) {
  const deadline = Date.now() + SETTLE_MS
  for (;;) {
    const region = await regionOf(p)
    const png = await settledShot(p, region)
    const rect = await settledRectangle(p)
    if (JSON.stringify(await regionOf(p)) === JSON.stringify(region) || Date.now() > deadline) {
      return { png, region, rect: rect && { x: rect.x - region.x, y: rect.y - region.y, width: rect.width, height: rect.height } }
    }
  }
}

// Compares the board region of a page with no script (`off`) with the same region with the script
// on, inside `on.rect`: `changed` counts pixels that differ there, `clipped` counts pixels the
// page with no script draws outside it that are not the white of the page. Both are 0 when the
// rectangle holds the whole drawing and leaves it as it was; null when the sizes differ.
const compareBoards = (p, off, on) => p.evaluate(async ([offPng, onPng, rect]) => {
  const load = async (base64) => {
    const bitmap = await window.createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0)
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  }
  const [a, b] = [await load(offPng), await load(onPng)]
  if (a.width !== b.width || a.height !== b.height) return null
  let changed = 0
  let clipped = 0
  // The page color is what the region's corner shows with no script: white, or the dark of SudokuPad's dark mode.
  const page = [a.data[0], a.data[1], a.data[2]]
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4
      const inside = x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
      if (inside) {
        if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) changed++
      } else if (a.data[i] !== page[0] || a.data[i + 1] !== page[1] || a.data[i + 2] !== page[2]) {
        clipped++
      }
    }
  }
  return { changed, clipped }
}, [off.png.toString('base64'), on.png.toString('base64'), on.rect])

// The unique colors in a small strip of the page, `r,g,b`.
const colorsIn = (p, clip) => settledShot(p, clip).then((png) => p.evaluate(async (base64) => {
  const bitmap = await window.createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob())
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0)
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
  const seen = new Set()
  for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
  return [...seen]
}, png.toString('base64')))

// Selects the cells in order, leaving them all selected.
const selectCells = (p, cells) => p.evaluate((cells) => {
  const a = Framework.app
  a.deselect()
  cells.forEach(([r, c]) => a.select(a.grid.getCell(r, c)))
}, cells)
const deselect = (p) => p.evaluate(() => Framework.app.deselect())

// `off` and `on` are boardShot results; the failure message names what differed.
async function expectKept (p, off, on) {
  const result = await compareBoards(p, off, on)
  assert.deepEqual(result, { changed: 0, clipped: 0 }, 'pixels that differ inside the rectangle, and pixels of the puzzle outside it')
}

const CORNERS = [[0, 0], [8, 8]]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

for (const mode of ['document-idle', 'before-start', 'after-start']) {
  describe(`injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors

    const read = (fn, arg) => p.evaluate(fn, arg)
    const computed = (selector, property) => read(([selector, property]) => window.getComputedStyle(document.querySelector(selector))[property], [selector, property])
    // Switches the script's page changes off and on, in the page the checks already use: the
    // style off and the rectangle removed, or on again with the rectangle measured afresh.
    const setScript = async (on) => {
      await read((on) => {
        document.querySelector('#dark-page-style').disabled = !on
        if (!on) document.getElementById('dark-page-rect')?.remove()
        else document.querySelector('#board').setAttribute('data-dark-page-test', String(Date.now()))
      }, on)
      if (on) await p.waitForFunction(() => window.getComputedStyle(document.getElementById('dark-page-rect') || document.body).display === 'block' && document.getElementById('dark-page-rect'))
    }
    // The board as it is now with the script on, against the same board with it off.
    const expectBoardKept = async () => {
      const on = await boardShot(p)
      await setScript(false)
      const off = await boardShot(p)
      await setScript(true)
      await expectKept(p, off, on)
    }

    const boot = () => openPuzzle(p, {
      beforeStart: async () => { if (mode === 'before-start') await p.addScriptTag({ content: script }) },
      afterStart: async () => { if (mode === 'after-start') await p.addScriptTag({ content: script }) }
    }).then(() => p.locator(STYLE).waitFor({ state: 'attached' }))

    before(async () => {
      context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
      errors = []
      p = await context.newPage()
      p.on('pageerror', (e) => errors.push(String(e)))
      await p.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
      if (mode === 'document-idle') {
        await p.addInitScript((src) => {
          document.addEventListener('DOMContentLoaded', () => {
            const s = document.createElement('script')
            s.textContent = src
            document.documentElement.appendChild(s)
          })
        }, script)
      }
      await p.goto(url, { waitUntil: 'load', timeout: 60000 })
      await boot()
      await p.addStyleTag({ content: HIDE_PAGE_UI })
    })
    after(async () => { await context.close() })

    it('the page background is black', async () => {
      assert.equal(await computed('body', 'backgroundColor'), BLACK)
    })

    it('the page shows black on all four sides of the rectangle, and white inside it', async () => {
      await fillBoard(p)
      const rect = await settledRectangle(p)
      const gap = 6
      const strip = (x, y, width, height) => colorsIn(p, { x: Math.round(x), y: Math.round(y), width, height })
      assert.deepEqual(await strip(rect.x - gap - 4, rect.y + 40, 4, 40), ['0,0,0'], 'left')
      assert.deepEqual(await strip(rect.x + rect.width + gap, rect.y + 40, 4, 40), ['0,0,0'], 'right')
      assert.deepEqual(await strip(rect.x + 40, rect.y - gap - 4, 40, 4), ['0,0,0'], 'top')
      assert.deepEqual(await strip(rect.x + 40, rect.y + rect.height + gap, 40, 4), ['0,0,0'], 'bottom')
      assert.deepEqual(await strip(rect.x, rect.y, 1, 1), ['255,255,255'], 'inside, at the corner')
    })

    it('the rectangle has whole-pixel edges and lies within the board', async () => {
      const rect = await settledRectangle(p)
      for (const edge of [rect.x, rect.y, rect.width, rect.height]) assert.equal(Number.isInteger(edge), true, JSON.stringify(rect))
      const { x, y, width, height } = await regionOf(p)
      assert.equal(rect.x >= x && rect.y >= y && rect.x + rect.width <= x + width && rect.y + rect.height <= y + height, true, JSON.stringify({ rect, region: { x, y, width, height } }))
    })

    it('the credit line is readable on black', async () => {
      assert.equal(await computed('.controls-footer', 'color'), CREDIT_TEXT)
      assert.equal(await computed('.controls-footer a', 'color'), CREDIT_TEXT)
    })

    it('the puzzle is kept: no pixel inside the rectangle differs with the script off, and none of the puzzle lies outside it', async () => {
      await expectBoardKept()
    })

    for (const corner of CORNERS) {
      it(`a selection on the outermost cell ${JSON.stringify(corner)} sits on white, and the puzzle is kept`, async () => {
        await selectCells(p, [corner])
        try {
          await expectBoardKept()
        } finally {
          await deselect(p)
        }
      })
    }

    it('the controls sit in front of the page: the keypad is still what a click at its center reaches', async () => {
      const hit = await read(() => {
        const b = document.querySelector('button.digit').getBoundingClientRect()
        return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2).closest('button').className
      })
      assert.match(hit, /digit/)
    })

    it('SudokuPad\'s accent color setting still colors the keypad', async () => {
      await read(() => Framework.setSetting('uitheme', 'red'))
      try {
        assert.equal(await computed('button.digit', 'backgroundColor'), ACCENT_RED)
      } finally {
        await read(() => Framework.setSetting('uitheme', 'purple'))
      }
    })

    it('with SudokuPad\'s own dark mode on, the puzzle is kept', async () => {
      await read(() => Framework.setSetting('darkmode', true))
      try {
        assert.equal(await computed('body', 'backgroundColor'), BLACK)
        await expectBoardKept()
      } finally {
        await read(() => Framework.setSetting('darkmode', false))
      }
    })

    // The same page with the script switched off is the reference: only the script differs.
    for (const [name, data] of Object.entries(OTHER_BOARDS)) {
      for (const viewport of [{ width: 1200, height: 900 }, { width: 800, height: 1000 }]) {
        for (const selected of [false, true]) {
          it(`${name} at ${viewport.width}x${viewport.height}${selected ? ', outermost cells selected' : ''}: the puzzle is kept inside the rectangle`, async () => {
            await p.setViewportSize(viewport)
            await read((d) => Framework.app.loadCTCPuzzle(d), data)
            const start = p.getByRole('button', { name: START }).first()
            if (await start.isVisible()) await start.click()
            await p.locator('#svgrenderer text').first().waitFor({ state: 'attached' })
            if (selected) await selectCells(p, [[0, 0], [data.size - 1, data.size - 1]])
            await expectBoardKept()
            await deselect(p)
          })
        }
      }
    }

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })
}
