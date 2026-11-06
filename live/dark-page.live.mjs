// Live check of dark-page.user.js on sudokupad.app, in headless Chromium.
//
// The reference for every board check is the same page with the script switched off (its
// stylesheet's media set to `not all`): a separate page that never had the script rasterizes the
// board with a different history, which shifts some antialiased line pixels by up to 8 levels.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { gotoPuzzle, openPage, START, startPuzzle } from './page.mjs'
import { headerVersion, openSettings } from './settings.mjs'
import { readUntil, SETTLE_MS, stable } from './settle.mjs'

const script = readFileSync(new URL('../dark-page.user.js', import.meta.url), 'utf8')
const { RECT_ID, STYLE_ID, SOLVER_REACH } = createRequire(import.meta.url)('../dark-page.user.js')
const DATA_KEY = 'DarkPage_color'

const settingsEntry = (group) => group.locator('button, [role=button]').filter({ hasText: /^\s*Dark Page\s*$/ })
const RECT = `#${RECT_ID}`
const STYLE = `#${STYLE_ID}`
const BLACK = 'rgb(0, 0, 0)'
const CREDIT_TEXT = 'rgb(221, 221, 221)'
const DARK_TEXT = 'rgb(34, 34, 34)'
// The color of the replay tool's readout, the ::after of .controls-input, on `page`.
const readoutColor = (page) => page.evaluate(() => window.getComputedStyle(document.querySelector('.controls-input'), '::after').color)
// The control buttons on a dark page: dark gray with light purple icons, and a purple border on
// the selected mode button. SudokuPad's own are `#eee` with `#ccc` borders.
const BUTTON_BG = 'rgb(42, 42, 42)'
const BUTTON_ACCENT = 'rgb(210, 168, 240)'
const BUTTON_BORDER = 'rgb(74, 74, 74)'
const OWN_BUTTON_BG = 'rgb(238, 238, 238)'
// SudokuPad's own purple for the keypad and for a button that is on, read with no script installed.
const OWN_PURPLE = 'rgb(106, 27, 154)'
const PICKER = 'input[type=color]'
// SudokuPad's red accent (`--main-color` of `.setting-uitheme-red`), read with no script installed.
const ACCENT_RED = 'rgb(212, 17, 89)'
// The most white the rectangle may keep past the drawing on a side that has text on it, in page
// pixels: the text's box is taller than its glyphs. The whole svg box leaves 20 or more.
const TIGHT_SLACK_PX = 12

// Boards of other sizes, in the page's own puzzle format. Outside text is drawn the way little
// killer and sandwich clues are: text beyond the grid lines.
const clue = (row, col, text, color = '#000000') => ({ center: [row, col], width: 0.8, height: 0.6, text, fontSize: 18, color, backgroundColor: '#00000000', borderColor: '#00000000' })
function board ({ size, boxHeight, boxWidth, offset = 0, overlays = [], arrows = [] }) {
  const cells = Array.from({ length: size }, () => Array.from({ length: size }, () => ({})))
  const regions = []
  for (let r = offset; r < size - offset; r += boxHeight) {
    for (let c = offset; c < size - offset; c += boxWidth) {
      const region = []
      for (let i = 0; i < boxHeight; i++) for (let j = 0; j < boxWidth; j++) region.push([r + i, c + j])
      regions.push(region)
    }
  }
  return { size, metadata: { title: `board ${size}` }, cells, regions, overlays, arrows }
}
const outsideText = (size) => [clue(-0.5, 1.5, '7'), clue(size / 2, -0.5, '12'), clue(size + 0.5, 2.5, '9'), clue(1.5, size + 0.5, '30'), clue(-0.5, -0.5, '4')]
// The text of `invisible` has a transparent fill and lies past the visible text; a rectangle that
// counted it would reach well past the '30'.
const invisible = clue(3, 6.75, '88', '#00000000')
const SIX = { size: 6, boxHeight: 2, boxWidth: 3, overlays: [...outsideText(6), invisible] }
const OTHER_BOARDS = {
  'a 6x6 board with outside text': board(SIX),
  'a 16x16 board with outside text': board({ size: 16, boxHeight: 4, boxWidth: 4, overlays: outsideText(16) }),
  'a 6x6 board with an arrow outside the grid': board({ size: 6, boxHeight: 2, boxWidth: 3, arrows: [{ wayPoints: [[-0.6, 1], [-0.6, 3]], headLength: 0.3, thickness: 2, color: '#000000' }] }),
  'an 11x11 board whose outer ring of cells is outside every region': board({ size: 11, boxHeight: 3, boxWidth: 3, offset: 1 })
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

const selectCells = (p, cells) => p.evaluate((cells) => {
  const a = Framework.app
  a.deselect()
  cells.forEach(([r, c]) => a.select(a.grid.getCell(r, c)))
}, cells)
const deselect = (p) => p.evaluate(() => Framework.app.deselect())

// The region the board checks read: `#svgrenderer`'s box snapped outward to whole pixels. The svg
// clips everything the puzzle draws, so no drawn pixel lies outside it. The mascot that peeks over
// the grid and the top bar, which a narrow window slides the board under, are hidden on every page:
// they belong to SudokuPad, not to the puzzle.
const HIDE_PAGE_UI = '#svenpeek { display: none !important } .topbar { visibility: hidden !important }'
const regionOf = (p) => p.evaluate(() => {
  const b = document.querySelector('#svgrenderer').getBoundingClientRect()
  const x = Math.floor(b.x)
  const y = Math.floor(b.y)
  return { x, y, width: Math.ceil(b.right) - x, height: Math.ceil(b.bottom) - y }
})

// The kept rectangle in page pixels, once it has held still: the script moves it on the
// next frame after a change.
const settledRectangle = (p) => stable(() => p.evaluate((selector) => {
  const el = document.querySelector(selector)
  if (!el || window.getComputedStyle(el).display === 'none') return null
  const b = el.getBoundingClientRect()
  return { x: b.x, y: b.y, width: b.width, height: b.height }
}, RECT))

// A PNG of `clip`, taken until its bytes have held still, so a fade or a late repaint is waited on by
// its condition and not by a sleep.
const settledShot = (p, clip) => stable(() => p.screenshot({ clip, animations: 'disabled' }), SETTLE_MS, (a, b) => a.equals(b))

// The board region now, with the kept rectangle relative to it (null for a page with no board).
// Each read takes the region, a settled shot of it, the settled rectangle and the region again, and the reads
// repeat until the region is the same before and after, so a relayout still under way (a resize, a puzzle just
// loaded) is waited on by its condition and a shot it moved during is not returned. The two regions come first
// in the read so a timeout's message, cut to its first characters, shows them and not the shot's bytes.
const boardShot = (p) => readUntil(async () => {
  const region = await regionOf(p)
  const png = await settledShot(p, region)
  const rect = await settledRectangle(p)
  const regionAfter = await regionOf(p)
  return { region, regionAfter, png, rect: rect && { x: rect.x - region.x, y: rect.y - region.y, width: rect.width, height: rect.height } }
}, (r) => JSON.stringify(r.region) === JSON.stringify(r.regionAfter))

// A PNG's pixels: { width, height, data } with `data` the RGBA bytes, carried out of the page as
// base64 because a plain array of them is slow to serialize.
const decode = async (p, png) => {
  const image = await p.evaluate(async (base64) => {
    const bitmap = await window.createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0)
    const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    let binary = ''
    for (let i = 0; i < image.data.length; i += 0x8000) binary += String.fromCharCode(...image.data.subarray(i, i + 0x8000))
    return { width: image.width, height: image.height, data: window.btoa(binary) }
  }, png.toString('base64'))
  return { ...image, data: Buffer.from(image.data, 'base64') }
}

const sameColor = (image, i, [r, g, b]) => image.data[i] === r && image.data[i + 1] === g && image.data[i + 2] === b
const at = (image, x, y) => (y * image.width + x) * 4

// Compares the board region with the script off (`off`) and on (`on`), inside `on.rect`:
// `changed` counts pixels that differ there; `clipped` counts pixels the page draws outside it
// that are not the page's own color, the corner pixel of the region with the script off; `slack`
// is, per side, the white the rectangle keeps past the drawing (the smallest distance from the
// rectangle to a drawn pixel of `off`). Null when the sizes differ.
async function compareBoards (p, off, on) {
  const [a, b] = [await decode(p, off.png), await decode(p, on.png)]
  if (a.width !== b.width || a.height !== b.height) return null
  const page = [a.data[0], a.data[1], a.data[2]]
  const { x: rx, y: ry, width: rw, height: rh } = on.rect
  let changed = 0
  let clipped = 0
  const drawn = { left: a.width, top: a.height, right: -1, bottom: -1 }
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = at(a, x, y)
      if (!sameColor(a, i, page)) {
        drawn.left = Math.min(drawn.left, x); drawn.right = Math.max(drawn.right, x)
        drawn.top = Math.min(drawn.top, y); drawn.bottom = Math.max(drawn.bottom, y)
      }
      if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) {
        if (!sameColor(b, i, [a.data[i], a.data[i + 1], a.data[i + 2]])) changed++
      } else if (!sameColor(a, i, page)) {
        clipped++
      }
    }
  }
  const slack = { left: drawn.left - rx, top: drawn.top - ry, right: rx + rw - 1 - drawn.right, bottom: ry + rh - 1 - drawn.bottom }
  return { changed, clipped, slack }
}

async function colorsIn (p, clip) {
  const image = await decode(p, await settledShot(p, clip))
  const seen = new Set()
  for (let i = 0; i < image.data.length; i += 4) seen.add(`${image.data[i]},${image.data[i + 1]},${image.data[i + 2]}`)
  return [...seen]
}

async function expectKept (p, off, on) {
  const result = await compareBoards(p, off, on)
  assert.notEqual(result, null, 'the board region has the same size with the script on and off')
  assert.deepEqual({ changed: result.changed, clipped: result.clipped }, { changed: 0, clipped: 0 }, 'pixels that differ inside the rectangle, and pixels of the puzzle outside it')
  return result
}

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const readButton = (selector) => read((selector) => { const c = window.getComputedStyle(document.querySelector(selector)); return { bg: c.backgroundColor, fg: c.color, border: c.borderTopColor } }, selector)
  const computed = (selector, property) => read(([selector, property]) => window.getComputedStyle(document.querySelector(selector))[property], [selector, property])
  // Switches the script's stylesheet off and on in the page the checks already use. Its rectangle
  // stays, as a transparent div that takes no click and changes no layout.
  const setScript = (on) => read(([selector, on]) => { document.querySelector(selector).media = on ? '' : 'not all' }, [STYLE, on])
  // The board as it is now with the script on, against the same board with it off.
  const expectBoardKept = async () => {
    const on = await boardShot(p)
    await setScript(false)
    const off = await boardShot(p)
    await setScript(true)
    return expectKept(p, off, on)
  }
  const loadBoard = async (data) => {
    await read((d) => Framework.app.loadCTCPuzzle(d), data)
    const start = p.getByRole('button', { name: START }).first()
    if (await start.isVisible()) await start.click()
    await p.locator('#svgrenderer').waitFor({ state: 'attached' })
    await p.waitForFunction((selector) => document.querySelector(selector)?.style.display === 'block', RECT)
  }

  const boot = async () => {
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator(STYLE).waitFor({ state: 'attached' })
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await boot()
    await p.addStyleTag({ content: HIDE_PAGE_UI })
  })
  after(async () => { await context.close() })

  it('the page background is black', async () => {
    assert.equal(await computed('body', 'backgroundColor'), BLACK)
  })

  it('the page shows black on all four sides of the rectangle, and white at its corner', async () => {
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

  // The replay tool's readout is the ::after of .controls-input. The replay tool itself is not entered
  // here; with the script's stylesheet off the readout shows SudokuPad's own color, so the rule is
  // seen beating it, which is what the tool's black on black needs.
  it('the replay tool\'s readout is readable on black, where SudokuPad\'s own color is not', async () => {
    assert.equal(await readoutColor(p), CREDIT_TEXT)
    const own = await p.evaluate(() => {
      const style = document.getElementById('dark-page-style')
      style.disabled = true
      const color = window.getComputedStyle(document.querySelector('.controls-input'), '::after').color
      style.disabled = false
      return color
    })
    assert.notEqual(own, CREDIT_TEXT)
  })

  it('the control buttons are dark gray with light purple icons, the digits and backspace keep their purple with the softer border, and the selected mode button keeps its purple with a purple border', async () => {
    for (const selector of ['#control-settings', '#control-undo', '#control-corner', '#control-colour']) {
      assert.deepEqual(await readButton(selector), { bg: BUTTON_BG, fg: BUTTON_ACCENT, border: BUTTON_BORDER }, selector)
    }
    for (const selector of ['.controls-input button.digit', '.controls-input button:not(.digit)']) {
      const key = await readButton(selector)
      assert.equal(key.bg, OWN_PURPLE, selector)
      assert.equal(key.border, BUTTON_BORDER, selector)
    }
    const selected = await readButton('#control-normal.selected')
    assert.equal(selected.bg, OWN_PURPLE)
    assert.equal(selected.border, BUTTON_ACCENT)
  })

  it('the Select button keeps its purple fill while it is on, with a purple border, and goes dark again when it is off', async () => {
    await p.click('#control-select')
    await p.waitForSelector('#control-select.selectedperm')
    await p.mouse.move(5, 5)
    const on = await readButton('#control-select')
    assert.equal(on.bg, OWN_PURPLE)
    assert.equal(on.border, BUTTON_ACCENT)
    await p.click('#control-select')
    await p.waitForSelector('#control-select:not(.selectedperm)')
    await p.mouse.move(5, 5)
    assert.deepEqual(await readButton('#control-select'), { bg: BUTTON_BG, fg: BUTTON_ACCENT, border: BUTTON_BORDER })
  })

  it('a button another script adds to the bottom row (.controls-aux) goes dark too', async () => {
    await read(() => {
      const button = document.createElement('button')
      button.id = 'dark-page-live-aux'
      document.querySelector('.controls-aux').appendChild(button)
    })
    assert.deepEqual(await readButton('#dark-page-live-aux'), { bg: BUTTON_BG, fg: BUTTON_ACCENT, border: BUTTON_BORDER })
    await read(() => document.getElementById('dark-page-live-aux').remove())
  })

  it('the color swatches in color mode keep their fills and take the softer border', async () => {
    await p.click('#control-colour')
    const swatches = () => read(() => [...document.querySelectorAll('.controls-input button')].map((b) => { const c = window.getComputedStyle(b); return [c.backgroundColor, c.color, c.filter] }))
    const borders = () => read(() => [...document.querySelectorAll('.controls-input button')].map((b) => window.getComputedStyle(b).borderTopColor))
    const on = await swatches()
    const onBorders = await borders()
    await setScript(false)
    const off = await swatches()
    await setScript(true)
    await p.click('#control-normal')
    assert.ok(on.length >= 9, `${on.length} swatches`)
    assert.deepEqual(on, off)
    assert.deepEqual(onBorders, onBorders.map(() => BUTTON_BORDER))
  })

  it('hover on a button changes nothing the script set, and brightens a digit as it does with the script off', async () => {
    await p.hover('#control-undo')
    assert.deepEqual(await readButton('#control-undo'), { bg: BUTTON_BG, fg: BUTTON_ACCENT, border: BUTTON_BORDER })
    const hovered = () => computed('.controls-input button.digit', 'filter')
    await p.hover('.controls-input button.digit')
    const on = await hovered()
    await setScript(false)
    const off = await hovered()
    await setScript(true)
    await p.mouse.move(5, 5)
    assert.notEqual(on, 'none')
    assert.equal(on, off)
  })

  it('the puzzle is kept: no pixel inside the rectangle differs with the script off, and none of the puzzle lies outside it', async () => {
    await expectBoardKept()
  })

  for (const corner of [[0, 0], [8, 8]]) {
    it(`a selection on the outermost cell ${JSON.stringify(corner)} sits on white, and the puzzle is kept`, async () => {
      await selectCells(p, [corner])
      try {
        await expectBoardKept()
      } finally {
        await deselect(p)
      }
    })
  }

  // The edge X is the pen mark that reaches farthest past a cell. The rectangle already holds it
  // before it is drawn: it does not move when the marks go on the outermost cells.
  it('pen marks on the outermost cells sit on white without the rectangle moving', async () => {
    const before = await settledRectangle(p)
    await selectCells(p, [[0, 0], [8, 8]])
    await read(() => ['31', '41', 'b1', 'c1'].forEach((arg) => Framework.app.act({ type: 'pen', arg })))
    try {
      await deselect(p)
      assert.deepEqual(await settledRectangle(p), before, 'the rectangle after the marks')
      await expectBoardKept()
    } finally {
      await selectCells(p, [[0, 0], [8, 8]])
      await read(() => Framework.app.act({ type: 'pen', arg: '0' }))
      await deselect(p)
    }
  })

  it('the rectangle keeps at least a pen mark\'s reach around the cells', async () => {
    const gap = await read(() => {
      const cells = [...document.querySelectorAll('.cells .cell')].map((e) => e.getBoundingClientRect())
      const svg = document.querySelector('#svgrenderer').getBoundingClientRect()
      return { left: Math.min(...cells.map((c) => c.left)), top: Math.min(...cells.map((c) => c.top)), svgLeft: svg.left, svgTop: svg.top }
    })
    const rect = await settledRectangle(p)
    // The rectangle is clamped to the puzzle's own svg box, which a mark cannot draw past, so the reach is kept up to that edge.
    const keeps = (cells, svg, edge) => edge <= Math.max(Math.floor(svg), Math.ceil(cells - SOLVER_REACH))
    assert.equal(keeps(gap.left, gap.svgLeft, rect.x) && keeps(gap.top, gap.svgTop, rect.y), true, JSON.stringify({ gap, rect }))
  })

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

  it('with SudokuPad\'s own dark mode on, the page is black and the puzzle is kept', async () => {
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
          await loadBoard(data)
          if (selected) await selectCells(p, [[0, 0], [data.size - 1, data.size - 1]])
          await expectBoardKept()
          await deselect(p)
        })
      }
    }
  }

  // On a board whose four sides all carry text, the drawing defines every edge of the rectangle,
  // so a rectangle that counted the transparent '88' or the whole svg box leaves more white.
  it('a 6x6 board with outside text: the rectangle is tight to the text on every side, and ignores text that is transparent', async () => {
    await p.setViewportSize({ width: 1200, height: 900 })
    await loadBoard(OTHER_BOARDS['a 6x6 board with outside text'])
    const on = await boardShot(p)
    await setScript(false)
    const off = await boardShot(p)
    await setScript(true)
    const { slack } = await compareBoards(p, off, on)
    for (const [side, white] of Object.entries(slack)) assert.equal(white >= 0 && white <= TIGHT_SLACK_PX, true, `${side}: ${white}px of white past the drawing, ${JSON.stringify(slack)}`)
  })

  it('the settings entry is a button named Dark Page in the Experimental group, and it opens a dialog with the version as small text', async () => {
    const group = await openSettings(p)
    const entry = settingsEntry(group)
    assert.equal(await entry.count(), 1)
    await entry.click()
    const dialog = p.locator('.dialog')
    await dialog.locator(PICKER).waitFor({ state: 'visible' })
    assert.equal((await dialog.locator('b').first().textContent()).trim(), 'Dark Page')
    assert.equal((await dialog.locator('small').textContent()).trim(), `v${headerVersion(script)}`)
    assert.equal(await dialog.locator(PICKER).inputValue(), '#000000')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

// The options dialog changes the page color and keeps it. One context, so localStorage carries over
// a reload; the script is injected at DOMContentLoaded, as `@run-at document-idle` approximates it.
describe('the page color dialog', { concurrency: false }, () => {
  let context, p, errors
  const bodyColor = () => p.evaluate(() => window.getComputedStyle(document.body).backgroundColor)
  const footerColor = () => p.evaluate(() => window.getComputedStyle(document.querySelector('.controls-footer')).color)
  const saved = () => p.evaluate((key) => Framework.getData(key), DATA_KEY)
  const undoBackground = () => p.evaluate(() => window.getComputedStyle(document.querySelector('#control-undo')).backgroundColor)
  const openDialog = async () => {
    await settingsEntry(await openSettings(p)).click()
    await p.locator(`.dialog ${PICKER}`).waitFor({ state: 'visible' })
  }
  const dialogButton = (name) => p.locator('.dialog').getByRole('button', { name, exact: true })
  const started = async () => {
    await startPuzzle(p)
    await p.locator(STYLE).waitFor({ state: 'attached' })
  }
  const load = async () => {
    await gotoPuzzle(p)
    await started()
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, {
      // Records the script's CSS the moment its style first exists, before any frame paints with it.
      // The style stays disabled until a board is on the page, so only its text says which color the
      // first paint will use.
      seed: (page) => page.addInitScript(([src, styleId]) => {
        document.addEventListener('DOMContentLoaded', () => {
          const s = document.createElement('script')
          s.textContent = src
          document.documentElement.appendChild(s)
          window.__firstCss = document.getElementById(styleId).textContent
        })
      }, [script, STYLE_ID])
    }))
    await started()
  })
  after(async () => { await context.close() })

  it('Save applies a light color without a reload, with dark text on it, and saves it', async () => {
    await openDialog()
    await p.locator(`.dialog ${PICKER}`).fill('#ffcc00')
    await dialogButton('Save').click()
    assert.equal(await bodyColor(), 'rgb(255, 204, 0)')
    assert.equal(await footerColor(), DARK_TEXT)
    assert.equal(await readoutColor(p), DARK_TEXT)
    assert.equal(await undoBackground(), OWN_BUTTON_BG)
    assert.equal(await saved(), '#ffcc00')
  })

  it('the stylesheet the script first writes after a reload already holds the saved color, never black', async () => {
    await load()
    const firstCss = await p.evaluate(() => window.__firstCss)
    assert.match(firstCss, /body \{ background-color: #ffcc00 !important \}/)
    assert.doesNotMatch(firstCss, /#000000/)
    assert.equal(await bodyColor(), 'rgb(255, 204, 0)')
    await openDialog()
    assert.equal(await p.locator(`.dialog ${PICKER}`).inputValue(), '#ffcc00')
    await dialogButton('Cancel').click()
  })

  it('Save of a dark color switches the buttons dark without a reload', async () => {
    await openDialog()
    await p.locator(`.dialog ${PICKER}`).fill('#112233')
    await dialogButton('Save').click()
    assert.equal(await undoBackground(), BUTTON_BG)
    await openDialog()
    await p.locator(`.dialog ${PICKER}`).fill('#ffcc00')
    await dialogButton('Save').click()
    assert.equal(await undoBackground(), OWN_BUTTON_BG)
  })

  it('Cancel after a pick changes nothing', async () => {
    await openDialog()
    await p.locator(`.dialog ${PICKER}`).fill('#00ff00')
    await dialogButton('Cancel').click()
    assert.equal(await bodyColor(), 'rgb(255, 204, 0)')
    assert.equal(await saved(), '#ffcc00')
  })

  it('Black then Save returns to the default black with light text, and saves nothing', async () => {
    await openDialog()
    await dialogButton('Black').click()
    assert.equal(await p.locator(`.dialog ${PICKER}`).inputValue(), '#000000')
    await dialogButton('Save').click()
    assert.equal(await bodyColor(), BLACK)
    assert.equal(await footerColor(), CREDIT_TEXT)
    assert.equal(await readoutColor(p), CREDIT_TEXT)
    assert.equal(await undoBackground(), BUTTON_BG)
    assert.equal(await saved(), null)
    await load()
    assert.equal(await bodyColor(), BLACK)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

// A page with no puzzle in it, such as another page of a site the script matches, is left alone.
describe('a page with no puzzle', () => {
  it('stays as it was: white background, no rectangle shown', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<!doctype html><body style="background:#fff"><p>not a puzzle</p></body>')
      await page.addScriptTag({ content: script })
      await page.locator(STYLE).waitFor({ state: 'attached' })
      assert.equal(await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)')
      assert.equal(await page.evaluate((selector) => window.getComputedStyle(document.querySelector(selector)).display, RECT), 'none')
    } finally {
      await page.close()
    }
  })
})
