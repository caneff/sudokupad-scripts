// Live check of draw-tool.user.js while SudokuPad is paused: the pause dialog blurs the grid (`body.overlay-visible`), and the notes, pinned and fixed, blur
// with it and take no pointer, so a note cannot give the solve away. The selection and an open note stay as they are underneath and come back sharp on resume.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'
import { dialogAtRest, dialogWith } from '../puzzles.mjs'
import { settle } from '../settle.mjs'

const { SELECTED, TEXTS, TEXT_BOX } = draw
const PAUSED = 'Game paused'
const ON_BOARD = [2.5, 4.5]
const LAYER = '#draw-tool-layer'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s notes while SudokuPad is paused', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const layerBlurred = () => read((s) => /blur\(8px\)/.test(window.getComputedStyle(document.querySelector(s)).filter), LAYER)
  // Every note and handle in the layer that could take a press.
  const pointerTakers = () => read((s) => [...document.querySelectorAll(`${s} *`)].filter((e) => window.getComputedStyle(e).pointerEvents !== 'none').length, LAYER)
  const places = () => read((s) => [...document.querySelectorAll(s)].map((e) => [e.textContent, ...Object.values(e.getBoundingClientRect().toJSON())]), TEXTS)
  const pause = async () => {
    await p.click('.timer-control')
    await dialogWith(p, PAUSED).waitFor({ state: 'visible' })
    await dialogAtRest(p)
  }
  const stayPaused = async () => {
    await dialogWith(p, PAUSED).locator('button', { hasText: 'Stay Paused' }).click()
    await p.locator('.dialog').waitFor({ state: 'detached' })
  }
  const resume = () => p.click('.timer-control')

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.reload(p)
    await draw.pickDraw(p)
    await p.mouse.click(...await gridPoint(p, ON_BOARD))
    await p.keyboard.type('r3c4 = 7')
    await draw.finishNote(p)
    const right = await read(() => {
      const controls = document.querySelector('#controls').getBoundingClientRect()
      return [Math.round((controls.right + window.innerWidth) / 2), Math.round(controls.top + controls.height / 2)]
    })
    await p.mouse.click(...right)
    await p.keyboard.type('fixed')
    await draw.finishNote(p)
  })
  after(async () => { await context.close() })

  it('pausing blurs the pinned and the fixed note and they take no pointer; staying paused and resuming bring them back sharp, clickable and in place', async () => {
    assert.deepEqual(await draw.texts(p), ['r3c4 = 7', 'fixed'])
    assert.equal(await layerBlurred(), false, 'sharp while the timer runs')
    assert.notEqual(await pointerTakers(), 0, 'the notes take a press under Text Anywhere')
    const before = await places()
    await pause()
    assert.equal(await layerBlurred(), true, 'the notes are blurred under the pause dialog')
    assert.equal(await pointerTakers(), 0, 'no note or handle takes a press while paused')
    assert.deepEqual(await places(), before, 'the blur moved no note')
    await stayPaused()
    assert.equal(await settle(layerBlurred, false), false, 'sharp again once the dialog is gone')
    assert.deepEqual(await places(), before, 'the notes are where they were')
    await p.mouse.click(...(await draw.middleAt(p, await gridPoint(p, ON_BOARD))))
    assert.equal(await p.locator(SELECTED).count(), 1, 'a click on the pinned note selects it again')
    await draw.finishNote(p)
    await resume()
    assert.equal(await settle(() => read(() => Framework.app.timer.running), true), true, 'the timer runs again')
  })

  it('an open note stays open and blurred under the pause dialog, and its text is kept after Resume', async () => {
    await draw.reopen(p, await gridPoint(p, ON_BOARD))
    await p.keyboard.type('!')
    assert.equal(await p.locator(TEXT_BOX).count(), 1, 'the note is open')
    // The timer button's press would take the caret and finish the note, so the pause dialog is raised from the page, as SudokuPad does itself at the start.
    await read(() => { Framework.app.timer.stop(); Framework.app.timer.showPauseDialog() })
    await dialogWith(p, PAUSED).waitFor({ state: 'visible' })
    await dialogAtRest(p)
    assert.equal(await p.locator(TEXT_BOX).count(), 1, 'the note stays open under the pause dialog')
    assert.equal(await layerBlurred(), true, 'the open note is blurred too')
    assert.equal(await pointerTakers(), 0, 'the open note takes no press while paused')
    await dialogWith(p, PAUSED).locator('button', { hasText: 'Resume' }).click()
    await p.locator('.dialog').waitFor({ state: 'detached' })
    assert.equal(await settle(layerBlurred, false), false, 'sharp after Resume')
    // The click on the dialog's button takes the caret, which finishes the note as any press elsewhere does; the text is kept.
    assert.deepEqual(await draw.texts(p), ['r3c4 = 7!', 'fixed'])
    assert.deepEqual((await draw.saved(p)).map((n) => n.text), ['r3c4 = 7!', 'fixed'])
    assert.deepEqual(errors, [])
  })
})
