// Live check of draw-tool.user.js's fixed notes on sudokupad.app: a note put right of the panel at 1200x900 is moved clear of the panel when the window
// widens to 1600x900 and wholly inside the window when it narrows to 1000x900, can then be clicked, and keeps its new point over a restored window and a reload.
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

describe('Text Annotation\'s fixed note after the window changes', { concurrency: false }, () => {
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

  it('widened until the panel covers its point, the note is drawn clear of the panel, opens on a double-click and erases, and keeps the new point over a restore and a reload', async () => {
    await start()
    await resizeTo(WIDE)
    const moved = await settle(async () => clearOfPanel(await boxes()), true)
    assert.equal(moved, true, 'clear of the panel')
    await stable(async () => (await boxes()).note.x)
    const middle = draw.middleOf((await boxes()).note)
    await p.mouse.dblclick(...middle)
    assert.equal(await p.locator(TEXT_BOX).textContent(), 'fixed', 'a double-click opens the note itself')
    await p.keyboard.press('Escape')
    const dropAt = [middle[0] + 60, middle[1] + 80]
    await p.mouse.move(...middle)
    await p.mouse.down()
    await p.mouse.move(...dropAt, { steps: 8 })
    await p.mouse.up()
    const dropped = (await saved())[0].fixed
    assert.equal(Math.abs(dropped[0] - dropAt[0]) <= 1.5 && Math.abs(dropped[1] - dropAt[1]) <= 1.5, true, `dragged to ${dropAt}, stored at ${dropped}`)
    const [stored] = await saved()
    assert.notDeepEqual(stored.fixed, RIGHT_OF_PANEL, 'the new point is saved')
    await reload()
    assert.deepEqual((await saved())[0].fixed, stored.fixed, 'the same point over a reload')
    await resizeTo(HOME)
    await reload()
    const [restored] = await saved()
    assert.notDeepEqual(restored.fixed, RIGHT_OF_PANEL, 'not the old point, with the window restored')
    const homeNote = await boxes()
    assert.equal(clearOfPanel(homeNote) && insideWindow(homeNote), true, 'reachable with the window restored')
    const there = draw.middleOf(homeNote.note)
    await p.mouse.move(...there)
    await p.mouse.down({ button: 'right' })
    await p.mouse.move(there[0] + 2, there[1] + 2, { steps: 3 })
    await p.mouse.up({ button: 'right' })
    assert.deepEqual(await settle(() => draw.texts(p), []), [], 'a right-button erase removes it')
  })

  it('narrowed until its point is past the edge, the note is drawn wholly inside the window and is saved there', async () => {
    await start()
    await resizeTo(NARROW)
    const inside = await settle(async () => insideWindow(await boxes()), true)
    assert.equal(inside, true, 'wholly inside the window')
    const [stored] = await saved()
    assert.notDeepEqual(stored.fixed, RIGHT_OF_PANEL)
    await reload()
    assert.deepEqual((await saved())[0].fixed, stored.fixed, 'the same point over a reload')
    await resizeTo(HOME)
    await reload()
    assert.notDeepEqual((await saved())[0].fixed, RIGHT_OF_PANEL, 'not the old point, with the window restored')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
