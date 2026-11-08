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
import { captureConsoleErrors, gotoPuzzle, openPage, START, startPuzzle } from '../page.mjs'
import { headerVersion, openSettings } from '../settings.mjs'
import { readUntil, SETTLE_MS, settle, stable } from '../settle.mjs'

const script = readFileSync(new URL('../../dark-page.user.js', import.meta.url), 'utf8')
const { BOARD, BOARD_ID, STYLE_ID, LOCAL_DATA_KEY } = createRequire(import.meta.url)('../../dark-page.user.js')
const { contrastRatio } = createRequire(import.meta.url)('../../test/contrast.js')
const DATA_KEY = 'DarkPage_color'

const settingsEntry = (group) => group.locator('button, [role=button]').filter({ hasText: /^\s*Dark Page\s*$/ })
const BOARD_BOX = `#${BOARD_ID}`
const STYLE = `#${STYLE_ID}`
const BLACK = 'rgb(0, 0, 0)'
const CREDIT_TEXT = 'rgb(255, 255, 255)'
const DARK_TEXT = 'rgb(0, 0, 0)'
const BUTTON_HOVER_BG = 'rgb(55, 52, 58)'
const BUTTON_PRESS_BG = 'rgb(59, 55, 62)'
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
const SIX = { size: 6, boxHeight: 2, boxWidth: 3, overlays: outsideText(6) }
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

// The board's `#svgrenderer` box in whole pixels, as `{ x, y, width, height }`: `inner` is the pixels the box covers
// entirely and `outer` the pixels it touches. Chrome snaps a box's background to one or the other edge, by a rule
// that differs with the box's fractional position and size, so a check reads the inner region for what the script
// must paint and the pixels outside the outer one for what it must not. The svg clips everything the puzzle
// draws, so no drawn pixel lies outside it. The mascot that peeks over the grid and the top bar, which a narrow
// window slides the board under, are hidden on every page: they belong to SudokuPad, not to the puzzle.
const HIDE_PAGE_UI = '#svenpeek { display: none !important } .topbar { visibility: hidden !important }'
const boxRegions = (p) => p.evaluate(() => {
  const b = document.querySelector('#svgrenderer').getBoundingClientRect()
  const region = (left, top, right, bottom) => ({ x: left, y: top, width: right - left, height: bottom - top })
  return {
    inner: region(Math.ceil(b.left), Math.ceil(b.top), Math.floor(b.right), Math.floor(b.bottom)),
    outer: region(Math.floor(b.left), Math.floor(b.top), Math.ceil(b.right), Math.ceil(b.bottom))
  }
})
const regionOf = async (p) => (await boxRegions(p)).inner

// A PNG of `clip`, taken until its bytes have held still, so a fade or a late repaint is waited on by
// its condition and not by a sleep.
const settledShot = (p, clip) => stable(() => p.screenshot({ clip, animations: 'disabled' }), SETTLE_MS, (a, b) => a.equals(b))

// The board region now with a settled shot of it. The reads repeat until the region is the same before and
// after, so a relayout still under way (a resize, a puzzle just loaded) is waited on by its condition and a shot
// it moved during is not returned. The two regions come first in the read so a timeout's message, cut to its
// first characters, shows them and not the shot's bytes.
const boardShot = (p) => readUntil(async () => {
  const region = await regionOf(p)
  const png = await settledShot(p, region)
  const regionAfter = await regionOf(p)
  return { region, regionAfter, png }
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

// An opaque svg backdrop shifts the antialiasing of glyph and line edges (seen up to 50 levels on the sample 9x9 with
// digits entered, at 1200x900). A pixel of the puzzle left on the black page color flips by about 255 against the
// white it has with the script off, so a shift of up to half the range is the same pixel.
const ANTIALIAS_LEVELS = 127

// Counts the pixels of the board region that differ by more than ANTIALIAS_LEVELS between the script off (`off`)
// and on (`on`): the box is the page's own white with the script off, so none differ unless the script painted
// over the puzzle. Null when the sizes differ.
async function compareBoards (p, off, on) {
  const [a, b] = [await decode(p, off.png), await decode(p, on.png)]
  if (a.width !== b.width || a.height !== b.height) return null
  let changed = 0
  for (let i = 0; i < a.data.length; i += 4) {
    if ([0, 1, 2].some((c) => Math.abs(a.data[i + c] - b.data[i + c]) > ANTIALIAS_LEVELS)) changed++
  }
  return { changed }
}

async function expectKept (p, off, on) {
  const result = await compareBoards(p, off, on)
  assert.notEqual(result, null, 'the board region has the same size with the script on and off')
  assert.deepEqual(result, { changed: 0 }, 'pixels of the board region that differ from the script-off page')
  return result
}

// The white is exactly the `#svgrenderer` box, to the pixel Chrome snaps its edge to: `RING` pixels of the page
// beyond the box's outer region are the page color, and the four corners of its inner region are white.
const RING = 4
async function expectWhiteIsBoardBox (p, color) {
  const { inner, outer } = await boxRegions(p)
  const clip = { x: outer.x - RING, y: outer.y - RING, width: outer.width + 2 * RING, height: outer.height + 2 * RING }
  const image = await decode(p, await settledShot(p, clip))
  const inOuter = (x, y) => x >= RING && x < RING + outer.width && y >= RING && y < RING + outer.height
  const wrong = { ring: 0, corners: 0 }
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (!inOuter(x, y) && !sameColor(image, at(image, x, y), color)) wrong.ring++
    }
  }
  const [left, top] = [inner.x - clip.x, inner.y - clip.y]
  for (const [x, y] of [[left, top], [left + inner.width - 1, top], [left, top + inner.height - 1], [left + inner.width - 1, top + inner.height - 1]]) {
    if (!sameColor(image, at(image, x, y), [255, 255, 255])) wrong.corners++
  }
  assert.deepEqual(wrong, { ring: 0, corners: 0 }, 'pixels in the ring that are not the page color, and board corners that are not white')
}

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const readButton = (selector) => read((selector) => { const c = window.getComputedStyle(document.querySelector(selector)); return { bg: c.backgroundColor, fg: c.color, border: c.borderTopColor } }, selector)
  const computed = (selector, property) => read(([selector, property]) => window.getComputedStyle(document.querySelector(selector))[property], [selector, property])
  // Switches the script's stylesheet off and on in the page the checks already use.
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
    await p.locator(BOARD_BOX).waitFor({ state: 'attached' })
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

  it('the board box is white and the page is black right up to its four edges', async () => {
    await fillBoard(p)
    assert.equal(await computed(BOARD_BOX, 'backgroundColor'), 'rgb(255, 255, 255)')
    await expectWhiteIsBoardBox(p, [0, 0, 0])
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

  it('hover on a dark button lightens its fill, and brightens a digit as it does with the script off', async () => {
    await p.hover('#control-undo')
    assert.deepEqual(await readButton('#control-undo'), { bg: BUTTON_HOVER_BG, fg: BUTTON_ACCENT, border: BUTTON_BORDER })
    const hovered = () => computed('.controls-input button.digit', 'filter')
    await p.hover('.controls-input button.digit')
    const on = await hovered()
    await setScript(false)
    const off = await hovered()
    await setScript(true)
    await p.mouse.move(5, 5)
    assert.notEqual(on, 'none')
    assert.equal(on, off)
    assert.equal((await readButton('#control-undo')).bg, BUTTON_BG)
  })

  it('a pressed dark button takes the press fill', async () => {
    const box = await p.locator('#control-undo').boundingBox()
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await p.mouse.down()
    try {
      assert.equal((await readButton('#control-undo')).bg, BUTTON_PRESS_BG)
    } finally {
      // Moving off before the release keeps the click from undoing anything.
      await p.mouse.move(5, 5)
      await p.mouse.up()
    }
  })

  const outlineOfActive = () => read(() => { const c = window.getComputedStyle(document.activeElement); return { dark: Boolean(document.activeElement.closest('.controls-app, .controls-tool, .controls-aux')), outline: [c.outlineColor, c.outlineWidth, c.outlineStyle] } })

  it('a dark button focused with no keyboard involved shows no outline', async () => {
    // A mouse press on a SudokuPad button leaves no focus on it, so a button the mouse did focus stands in: Chromium matches :focus-visible for a script's focus() only when the element focused before it did.
    await read(() => {
      const button = document.createElement('button')
      button.id = 'dark-page-live-mouse'
      button.style.cssText = 'position: fixed; left: 600px; top: 80px; z-index: 99999'
      document.body.appendChild(button)
    })
    try {
      await p.click('#dark-page-live-mouse')
      await read(() => document.querySelector('#control-redo').focus())
      const { dark, outline } = await outlineOfActive()
      assert.equal(dark, true)
      assert.equal(outline[2], 'none')
    } finally {
      await read(() => { document.activeElement.blur(); document.getElementById('dark-page-live-mouse').remove() })
    }
  })

  it('a dark button the keyboard focuses shows a 2px light purple outline', async () => {
    await read(() => document.querySelector('#control-redo').focus())
    await p.keyboard.press('Tab')
    assert.deepEqual(await outlineOfActive(), { dark: true, outline: [BUTTON_ACCENT, '2px', 'solid'] })
    await read(() => document.activeElement.blur())
  })

  it('the puzzle is kept: no pixel of the board differs with the script off', async () => {
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

  // The edge X is the pen mark that reaches farthest past a cell; the svg's box clips it, so it sits on white.
  it('pen marks on the outermost cells sit on white', async () => {
    await selectCells(p, [[0, 0], [8, 8]])
    await read(() => ['31', '41', 'b1', 'c1'].forEach((arg) => Framework.app.act({ type: 'pen', arg })))
    try {
      await deselect(p)
      await expectBoardKept()
    } finally {
      await selectCells(p, [[0, 0], [8, 8]])
      await read(() => Framework.app.act({ type: 'pen', arg: '0' }))
      await deselect(p)
    }
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
        it(`${name} at ${viewport.width}x${viewport.height}${selected ? ', outermost cells selected' : ''}: the puzzle is kept`, async () => {
          await p.setViewportSize(viewport)
          await loadBoard(data)
          if (selected) await selectCells(p, [[0, 0], [data.size - 1, data.size - 1]])
          await expectBoardKept()
          await expectWhiteIsBoardBox(p, [0, 0, 0])
          await deselect(p)
        })
      }
    }
  }

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

// `@run-at document-start`: the script runs before any of the page's own, so the page is never SudokuPad's white. A frame
// sampler, installed before the script, records the body's color at every frame the board exists in; a white one is the
// flash. (A frame between the body and the board, while the parser waits on SudokuPad's blocking scripts, is outside
// `BOARD` by design and is not sampled: docs/research/dark-page/load-flash.md.) Framework does not exist yet, so the
// saved color is read from localStorage, and `start` corrects it through Framework at DOMContentLoaded.
describe('at document-start', { concurrency: false }, () => {
  // `saved` is put in storage before the script runs; `atLoad` is a color put in, or `null` taking it out (`false`: no change), at
  // DOMContentLoaded just before `start` (the sampler's listener is registered first, so it runs first).
  const samples = async (saved, atLoad = false) => {
    const { context, p, errors } = await openPage(browser, {
      // Two init scripts run in order at document start, before the page's own: the sampler, then the script. At that point
      // `document.documentElement` does not exist yet, as in an injector that runs the script first.
      seed: async (page, errors) => {
        captureConsoleErrors(page, errors)
        await page.addInitScript(([key, color, atLoad, boardId]) => {
          if (color) window.localStorage.setItem(key, color)
          if (atLoad !== false) {
            document.addEventListener('DOMContentLoaded', () => {
              if (atLoad === null) window.localStorage.removeItem(key)
              else window.localStorage.setItem(key, atLoad)
            })
          }
          const frames = (window.__frames = [])
          const tick = () => {
            if (document.getElementById(boardId)) frames.push(window.getComputedStyle(document.body).backgroundColor)
            if (frames.length < 600) window.requestAnimationFrame(tick)
          }
          window.requestAnimationFrame(tick)
        }, [LOCAL_DATA_KEY, saved, atLoad, BOARD_ID])
        await page.addInitScript({ content: script })
      }
    })
    try {
      await p.locator(STYLE).waitFor({ state: 'attached' })
      await startPuzzle(p)
      return {
        errors,
        frames: await p.evaluate(() => window.__frames),
        color: await p.evaluate(() => window.getComputedStyle(document.body).backgroundColor),
        entries: await settingsEntry(await openSettings(p)).count(),
        stored: await p.evaluate((name) => {
          Framework.setData(name, '#123456')
          return [Framework.makeDataKey(name), window.localStorage.getItem(Framework.makeDataKey(name))]
        }, DATA_KEY)
      }
    } finally {
      await context.close()
    }
  }

  it('paints the default black from the first frame with a board, never white, and `start` adds the settings entry', async () => {
    const { frames, errors, color, entries } = await samples(null)
    assert.ok(frames.length > 0, 'the sampler saw a frame with a board')
    assert.deepEqual([...new Set(frames)], [BLACK])
    assert.equal(color, BLACK)
    assert.equal(entries, 1)
    assert.deepEqual(errors, [])
  })

  it('paints the saved color from the first frame with a board, never white or black', async () => {
    const { frames, errors, color } = await samples('#336699')
    assert.ok(frames.length > 0, 'the sampler saw a frame with a board')
    assert.deepEqual([...new Set(frames)], ['rgb(51, 102, 153)'])
    assert.equal(color, 'rgb(51, 102, 153)')
    assert.deepEqual(errors, [])
  })

  it('the key and the format the early read uses are Framework\'s own', async () => {
    const { stored } = await samples(null)
    assert.deepEqual(stored, [LOCAL_DATA_KEY, '#123456'])
  })

  it('Framework\'s saved color wins over the early read', async () => {
    assert.equal((await samples('#336699', '#993366')).color, 'rgb(153, 51, 102)')
  })

  it('Framework\'s "nothing saved" wins over the early read, so the default comes back', async () => {
    assert.equal((await samples('#336699', null)).color, BLACK)
  })
})

// The options dialog changes the page color and keeps it. One context, so localStorage carries over
// a reload; the script is injected at DOMContentLoaded, after the page's own startup.
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
    assert.ok(firstCss.includes(`${BOARD} { background-color: #ffcc00 !important }`), firstCss)
    assert.doesNotMatch(firstCss, /background-color: #000000/)
    assert.equal(await bodyColor(), 'rgb(255, 204, 0)')
    await openDialog()
    assert.equal(await p.locator(`.dialog ${PICKER}`).inputValue(), '#ffcc00')
    await dialogButton('Cancel').click()
  })

  it('the credit line and the readout reach 4.5:1 on #808080 and #767676', async () => {
    const channels = (css) => css.match(/\d+/g).slice(0, 3).map(Number)
    for (const grey of ['#808080', '#767676']) {
      await openDialog()
      await p.locator(`.dialog ${PICKER}`).fill(grey)
      await dialogButton('Save').click()
      const page = channels(await bodyColor())
      for (const text of [await footerColor(), await readoutColor(p)]) {
        assert.ok(contrastRatio(channels(text), page) >= 4.5, `${text} on ${grey}`)
      }
    }
    await openDialog()
    await p.locator(`.dialog ${PICKER}`).fill('#ffcc00')
    await dialogButton('Save').click()
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

  it('moving the picker applies the color to the page at once, and Cancel puts the saved color back', async () => {
    await openDialog()
    await p.locator(`.dialog ${PICKER}`).fill('#00ff00')
    assert.equal(await bodyColor(), 'rgb(0, 255, 0)')
    assert.equal(await footerColor(), DARK_TEXT)
    await dialogButton('Cancel').click()
    await p.locator('.dialog').waitFor({ state: 'detached' })
    assert.equal(await bodyColor(), 'rgb(255, 204, 0)')
    assert.equal(await saved(), '#ffcc00')
  })

  it('Escape closes the dialog and puts the saved color back', async () => {
    await openDialog()
    await p.locator(`.dialog ${PICKER}`).fill('#00ff00')
    assert.equal(await bodyColor(), 'rgb(0, 255, 0)')
    await p.keyboard.press('Escape')
    await p.locator('.dialog').waitFor({ state: 'detached' })
    assert.equal(await bodyColor(), 'rgb(255, 204, 0)')
    assert.equal(await saved(), '#ffcc00')
  })

  it('the Black button previews black, and Cancel puts the saved color back', async () => {
    await openDialog()
    await dialogButton('Black').click()
    assert.equal(await bodyColor(), BLACK)
    await dialogButton('Cancel').click()
    await p.locator('.dialog').waitFor({ state: 'detached' })
    assert.equal(await bodyColor(), 'rgb(255, 204, 0)')
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
  it('stays as it was: white background', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<!doctype html><body style="background:#fff"><p>not a puzzle</p></body>')
      await page.addScriptTag({ content: script })
      await page.locator(STYLE).waitFor({ state: 'attached' })
      assert.equal(await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)')
    } finally {
      await page.close()
    }
  })
})

// A SudokuPad internal missing before the script loads turns off that feature alone: the console names it once, the bar at the bottom of
// the page names it with a Report link, and the page is still dark. Dark Page checks its internals as it loads, so the snippet takes the
// internal away just before the script, and puts it back once the app is ready, after that check.
describe('SudokuPad has no Framework.addSetting', { concurrency: false }, () => {
  let context, p, errors
  const warned = []

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, {
      expectedSkips: [/^dark-page: /],
      seed: (page) => {
        page.on('console', (m) => { if (m.type() === 'warning' && /^dark-page: /.test(m.text())) warned.push(m.text()) })
      }
    }))
    await startPuzzle(p)
    const breaks = 'const original = Framework.addSetting; Framework.addSetting = undefined; Framework.getApp().then(() => { Framework.addSetting = original })'
    await p.addScriptTag({ content: `;{ ${breaks} }\n${script}` })
    await p.locator(STYLE).waitFor({ state: 'attached' })
  })
  after(async () => { await context.close() })

  it('one console warning names the feature', async () => {
    assert.equal(await settle(async () => warned.length, 1), 1, warned.join('\n'))
    assert.equal(warned[0], 'dark-page: settings entry skipped because SudokuPad has no Framework.addSetting')
  })

  it('the bar names the feature with a Report link, and goes when dismissed', async () => {
    const bar = p.locator('#sudokupad-scripts-notices [data-script="dark-page"]')
    assert.match(await bar.textContent(), /^Dark Page: settings entry is off — SudokuPad changed\.Report/)
    assert.match(await bar.locator('a').getAttribute('href'), /^https:\/\/github\.com\/caneff\/sudokupad-scripts\/issues\/new\?title=/)
    await bar.locator('button[aria-label="Dismiss"]').click()
    assert.equal(await bar.count(), 0)
  })

  it('the page is still dark, and there is no Dark Page entry in the settings', async () => {
    assert.equal(await p.evaluate(() => window.getComputedStyle(document.body).backgroundColor), BLACK)
    const group = await openSettings(p)
    assert.equal(await settingsEntry(group).count(), 0)
  })

  it('the page raised no error, and no further warning came', () => {
    assert.deepEqual(errors, [])
    assert.equal(warned.length, 1, warned.join('\n'))
  })
})
