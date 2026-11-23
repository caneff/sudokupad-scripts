import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { UI_TWEAKS_DIALOG } from '../scripts.mjs'
import { closeDialogWith, openScriptDialog } from '../settings.mjs'
import { addScripts, openWith, useBrowser } from '../session.mjs'
import { settle } from '../settle.mjs'

const SCRIPT_FILE = 'ui-tweaks.user.js'
const DIALOG = UI_TWEAKS_DIALOG
const OPTION = `${DIALOG} input[data-option="rightDrag"]`
// SudokuPad draws the recorded puzzle at 1.10 of its own size in the first window, so it fits and cannot be zoomed, and at 0.64 in the second, so it is scaled down to fit.
const FITS = { width: 1200, height: 900 }
const SCALED_DOWN = { width: 700, height: 500 }
const DRAG = [60, 30]
// Zoom is capped at 2 less the board's own scale and floored at 1, so this many notches in reach the cap and this many out come back to 1.
const NOTCHES = 8
// A pause after a drag that should do nothing: the feature pans on the next frame, so a board still at rest after this was not moved by it.
const NOTHING_HAPPENS_MS = 100

const browser = useBrowser()

async function open (viewport) {
  const opened = await openWith(browser(), [SCRIPT_FILE], { contextOptions: { viewport } })
  await opened.p.evaluate(() => Framework.setSetting('largepuzzle', true))
  await opened.p.waitForFunction(() => Framework.features.largepuzzle.featureEnabled)
  return opened
}

const state = (p) => p.evaluate(() => {
  const { zoomLevel, panPos } = Framework.features.largepuzzle
  return { zoomLevel, panPos: [...panPos], transform: document.getElementById('board').style.transform }
})
const boardMiddle = async (p) => {
  const box = await p.locator('#board').boundingBox()
  return [box.x + box.width / 2, box.y + box.height / 2]
}
async function rightDrag (p) {
  const [x, y] = await boardMiddle(p)
  await p.mouse.move(x, y)
  await p.mouse.down({ button: 'right' })
  await p.mouse.move(x + DRAG[0], y + DRAG[1], { steps: 8 })
  await p.mouse.up({ button: 'right' })
}
async function wheel (p, deltaY) {
  await p.mouse.move(...await boardMiddle(p))
  for (let i = 0; i < NOTCHES; i++) await p.mouse.wheel(0, deltaY)
}
const zoomedIn = (p) => settle(async () => (await state(p)).zoomLevel > 1, true)

describe('on a puzzle that fits, with Large Puzzle UI on', { concurrency: false }, () => {
  let context, p
  before(async () => { ;({ context, p } = await open(FITS)) })
  after(async () => { await context.close() })

  it('a right-drag leaves the board where it was', async () => {
    const before = await state(p)
    await rightDrag(p)
    await p.waitForTimeout(NOTHING_HAPPENS_MS)
    assert.deepEqual(await state(p), before)
    assert.deepEqual(before.panPos, [0, 0])
  })
})

describe('on a puzzle scaled down to fit, with Large Puzzle UI on', { concurrency: false }, () => {
  let context, p
  before(async () => { ;({ context, p } = await open(SCALED_DOWN)) })
  after(async () => { await context.close() })

  it('at zoom 1 a right-drag leaves the board where it was', async () => {
    const before = await state(p)
    await rightDrag(p)
    await p.waitForTimeout(NOTHING_HAPPENS_MS)
    assert.deepEqual(await state(p), before)
  })

  it('a right click with no movement still reaches the page as a mousedown and a mouseup', async () => {
    await p.evaluate(() => {
      window.__rightPresses = []
      for (const type of ['mousedown', 'mouseup']) window.addEventListener(type, (event) => { if (event.button === 2) window.__rightPresses.push(type) }, true)
    })
    const [x, y] = await boardMiddle(p)
    await p.mouse.click(x, y, { button: 'right' })
    assert.deepEqual(await p.evaluate(() => window.__rightPresses), ['mousedown', 'mouseup'])
  })

  it('zoomed in, a right-drag pans, and zooming back to 1 puts the board at the centre', async () => {
    await wheel(p, -100)
    assert.ok(await zoomedIn(p), 'the wheel zooms in')
    const zoomed = await state(p)
    await rightDrag(p)
    const panned = await settle(async () => (await state(p)).panPos[0] !== zoomed.panPos[0], true)
    assert.ok(panned, `the board moved from ${zoomed.panPos}`)
    assert.ok(Math.abs((await state(p)).panPos[0] - zoomed.panPos[0] + DRAG[0]) < 1, 'by the drag, to the left of the pointer')
    await wheel(p, 100)
    const home = await settle(async () => (await state(p)).zoomLevel === 1, true)
    assert.ok(home, 'the wheel zooms back to 1')
    assert.deepEqual((await state(p)).panPos, [0, 0])
  })
})

describe('turning the option on again', { concurrency: false }, () => {
  let context, p
  before(async () => {
    ;({ context, p } = await open(FITS))
    await openScriptDialog(p, 'UI Tweaks', DIALOG)
    await p.locator(OPTION).setChecked(false)
    await closeDialogWith(p, 'Save', DIALOG)
  })
  after(async () => { await context.close() })

  it('puts a board panned at zoom 1 back at the centre', async () => {
    await rightDrag(p)
    assert.ok((await settle(async () => (await state(p)).panPos[0] === -DRAG[0], true)), 'the board panned with the option off')
    await openScriptDialog(p, 'UI Tweaks', DIALOG)
    await p.locator(OPTION).setChecked(true)
    await closeDialogWith(p, 'Save', DIALOG)
    assert.deepEqual((await state(p)).panPos, [0, 0])
  })
})

describe('with the option off', { concurrency: false }, () => {
  let context, p
  before(async () => {
    ;({ context, p } = await open(SCALED_DOWN))
    await openScriptDialog(p, 'UI Tweaks', DIALOG)
    await p.locator(OPTION).setChecked(false)
    await closeDialogWith(p, 'Save', DIALOG)
  })
  after(async () => { await context.close() })

  it('a right-drag pans at zoom 1 as before', async () => {
    await rightDrag(p)
    const moved = await settle(async () => (await state(p)).panPos[0] === -DRAG[0], true)
    assert.ok(moved, JSON.stringify(await state(p)))
  })
})

describe('on a SudokuPad with no Large Puzzle UI', { concurrency: false }, () => {
  let context, p
  before(async () => {
    ;({ context, p } = await openWith(browser(), []))
    await p.evaluate(() => { delete Framework.features.largepuzzle })
    await addScripts(p, [SCRIPT_FILE])
  })
  after(async () => { await context.close() })

  it('only the right-drag limit is off: the settings entry still opens the dialog', async () => {
    await openScriptDialog(p, 'UI Tweaks', DIALOG)
    assert.equal(await p.locator(OPTION).isChecked(), true)
    await closeDialogWith(p, 'Cancel', DIALOG)
  })
})

describe('the option\'s box', { concurrency: false }, () => {
  let context, p
  before(async () => { ;({ context, p } = await open(FITS)) })
  after(async () => { await context.close() })

  it('is checked at first', async () => {
    await openScriptDialog(p, 'UI Tweaks', DIALOG)
    assert.equal(await p.locator(OPTION).isChecked(), true)
    assert.match(await p.locator(`${DIALOG} label:has(input[data-option="rightDrag"])`).textContent(), /^Right-drag pans only when zoomed in/)
    await closeDialogWith(p, 'Cancel', DIALOG)
  })
})
