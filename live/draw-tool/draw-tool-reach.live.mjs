// Live check of draw-tool.user.js's fixed notes on sudokupad.app: a note put right of the panel at 1200x900 is drawn clear of the panel when the window
// widens to 1600x900 and wholly inside the window when it narrows to 1000x900, and can then be clicked and dragged. Drawing it there never saves: its stored
// point changes only when the solver moves it, so with the window restored it is back at its own place.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { settle, stable } from '../settle.mjs'

const { TEXT_BOX, TEXTS } = draw
const WIDE = { width: 1600, height: 900 }
const NARROW = { width: 1000, height: 900 }
const HOME = { width: 1200, height: 900 }
// The recorded puzzle at 1200x900: right of the panel, as Chris's evidence has it.
const RIGHT_OF_PANEL = [1143, 541]
const NOTE = { kind: 'text', color: 1, size: 20, opacity: 100, text: 'fixed', fixed: RIGHT_OF_PANEL }

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s fixed note after the window changes', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const saved = () => draw.saved(p)
  const resizeTo = async (size) => {
    await p.setViewportSize(size)
  }
  // The note's box and the panel's, on the screen.
  const boxes = () => read((selector) => {
    const note = [...document.querySelectorAll(selector)].find((e) => e.textContent === 'fixed').getBoundingClientRect()
    return { note: note.toJSON(), panel: document.querySelector('#controls').getBoundingClientRect().toJSON(), window: [window.innerWidth, window.innerHeight] }
  }, TEXTS)
  const clearOfPanel = ({ note, panel }) => note.right <= panel.left || note.left >= panel.right || note.bottom <= panel.top || note.top >= panel.bottom
  const insideWindow = ({ note, window: [w, h] }) => note.left >= 0 && note.top >= 0 && note.right <= w && note.bottom <= h
  const reload = async () => {
    await draw.reload(p)
    await draw.pickDraw(p)
  }
  const start = async () => {
    await resizeTo(HOME)
    await draw.plantDrawing(p, [NOTE])
    await reload()
    assert.deepEqual(await settle(draw.texts.bind(null, p), ['fixed']), ['fixed'])
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
  })
  after(async () => { await context.close() })

  // The note's middle is back on its own point, and its stored point is that point.
  const atHome = async () => {
    const middle = await settle(async () => draw.middleOf((await boxes()).note).map(Math.round), RIGHT_OF_PANEL)
    assert.deepEqual(middle, RIGHT_OF_PANEL, 'drawn at its own point')
    assert.deepEqual((await saved())[0].fixed, RIGHT_OF_PANEL, 'stored at its own point')
  }
  // Drags the note from its middle to `offset` screen pixels away; the stored point is the drop point.
  const dragBy = async (offset) => {
    const middle = draw.middleOf((await boxes()).note)
    const dropAt = [middle[0] + offset[0], middle[1] + offset[1]]
    await p.mouse.move(...middle)
    await p.mouse.down()
    await p.mouse.move(...dropAt, { steps: 8 })
    await p.mouse.up()
    const dropped = (await saved())[0].fixed
    assert.equal(Math.abs(dropped[0] - dropAt[0]) <= 1.5 && Math.abs(dropped[1] - dropAt[1]) <= 1.5, true, `dragged to ${dropAt}, stored at ${dropped}`)
    return dropped
  }

  it('widened until the panel covers its point, the note is drawn clear of the panel and opens on a double-click without moving for good, and is back at its own point when the window is restored', async () => {
    await start()
    await resizeTo(WIDE)
    const moved = await settle(async () => clearOfPanel(await boxes()), true)
    assert.equal(moved, true, 'clear of the panel')
    await stable(async () => (await boxes()).note.x)
    await p.mouse.dblclick(...draw.middleOf((await boxes()).note))
    assert.equal(await p.locator(TEXT_BOX).textContent(), 'fixed', 'a double-click opens the note itself')
    await p.keyboard.press('Escape')
    assert.deepEqual((await saved())[0].fixed, RIGHT_OF_PANEL, 'drawing it clear of the panel saves nothing')
    await reload()
    assert.equal(clearOfPanel(await boxes()), true, 'still clear of the panel over a reload')
    assert.deepEqual((await saved())[0].fixed, RIGHT_OF_PANEL, 'still stored at its own point over a reload')
    await resizeTo(HOME)
    await atHome()
  })

  it('narrowed until its point is past the edge, the note is drawn wholly inside the window and stays stored at its own point, and is back there when the window grows again', async () => {
    await start()
    await resizeTo(NARROW)
    const inside = await settle(async () => insideWindow(await boxes()), true)
    assert.equal(inside, true, 'wholly inside the window')
    await stable(async () => (await boxes()).note.x)
    assert.deepEqual((await saved())[0].fixed, RIGHT_OF_PANEL, 'drawing it inside the window saves nothing')
    await resizeTo(HOME)
    await atHome()
  })

  it('narrowed, the note drawn inside the window drags from where it is drawn, keeps the drop point over a reload and a restored window, and erases', async () => {
    await start()
    await resizeTo(NARROW)
    assert.equal(await settle(async () => insideWindow(await boxes()), true), true, 'wholly inside the window')
    await stable(async () => (await boxes()).note.x)
    const dropped = await dragBy([0, 80])
    assert.notDeepEqual(dropped, RIGHT_OF_PANEL, 'the new point is saved')
    await reload()
    assert.deepEqual((await saved())[0].fixed, dropped, 'the same point over a reload')
    assert.deepEqual(draw.middleOf((await boxes()).note).map(Math.round), dropped.map(Math.round), 'drawn at the drop point')
    await resizeTo(HOME)
    await reload()
    assert.deepEqual((await saved())[0].fixed, dropped, 'the drop point, with the window restored')
    const there = draw.middleOf((await boxes()).note)
    await p.mouse.move(...there)
    await p.mouse.down({ button: 'right' })
    await p.mouse.move(there[0] + 2, there[1] + 2, { steps: 3 })
    await p.mouse.up({ button: 'right' })
    assert.deepEqual(await settle(() => draw.texts(p), []), [], 'a right-button erase removes it')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
