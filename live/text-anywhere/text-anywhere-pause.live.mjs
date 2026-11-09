// Live check of text-anywhere.user.js while SudokuPad is paused: the pause dialog blurs the grid (`body.overlay-visible`), and the notes, pinned and fixed, blur
// with it and take no pointer, so a note cannot give the solve away. The selection and an open note stay as they are underneath and come back sharp on resume.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { closePauseDialog, dialogAtRest, dialogWith, pauseGame, PAUSED } from '../puzzles.mjs'
import { settle } from '../settle.mjs'
import { useBrowser } from '../session.mjs'
import { finishNote, gridPoint, typeText } from '../board.mjs'

const { SELECTED, TEXTS, TEXT_BOX } = textAnywhere
const ON_BOARD = [2.5, 4.5]
const LAYER = '#text-anywhere-layer'

const browser = useBrowser()

describe('Text Anywhere\'s notes while SudokuPad is paused', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  // The notes' layer is blurred as much as SudokuPad blurs the board's own layers.
  const layerBlurred = () => read((s) => {
    const filterOf = (selector) => window.getComputedStyle(document.querySelector(selector)).filter
    return filterOf(s) !== 'none' && filterOf(s) === filterOf('.boardsvg > *')
  }, LAYER)
  const pointerTakers = () => read((s) => [...document.querySelectorAll(`${s} *`)].filter((e) => window.getComputedStyle(e).pointerEvents !== 'none').length, LAYER)
  const places = () => read((s) => [...document.querySelectorAll(s)].map((e) => [e.textContent, ...Object.values(e.getBoundingClientRect().toJSON())]), TEXTS)
  // The timer button's press would take the caret and finish an open note, so the pause dialog is raised from the page, as SudokuPad does itself at the start.
  const pauseFromPage = async () => {
    await read(() => { Framework.app.timer.stop(); Framework.app.timer.showPauseDialog() })
    await dialogWith(p, PAUSED).waitFor({ state: 'visible' })
    await dialogAtRest(p)
  }

  before(async () => {
    ;({ context, p, errors } = await textAnywhere.open(browser()))
    await textAnywhere.forgetNotes(p)
    await textAnywhere.reloadOnTextAnywhere(p)
    await typeText(p, ON_BOARD, 'r3c4 = 7')
    const right = await read(() => {
      const controls = document.querySelector('#controls').getBoundingClientRect()
      return [Math.round((controls.right + window.innerWidth) / 2), Math.round(controls.top + controls.height / 2)]
    })
    await p.mouse.click(...right)
    await p.keyboard.type('fixed')
    await finishNote(p)
  })
  after(async () => { await context.close() })

  it('pausing blurs the pinned and the fixed note and they take no pointer; resuming brings them back sharp, clickable and in place', async () => {
    assert.deepEqual(await textAnywhere.texts(p), ['r3c4 = 7', 'fixed'])
    assert.equal(await layerBlurred(), false, 'sharp while the timer runs')
    assert.notEqual(await pointerTakers(), 0, 'the notes take a press under Text Anywhere')
    const before = await places()
    await pauseGame(p)
    assert.equal(await layerBlurred(), true, 'the notes are blurred under the pause dialog')
    assert.equal(await pointerTakers(), 0, 'no note or handle takes a press while paused')
    assert.deepEqual(await places(), before, 'the blur moved no note')
    await closePauseDialog(p, 'Stay Paused')
    assert.equal(await settle(layerBlurred, false), false, 'sharp again once the dialog is gone')
    assert.equal(await read(() => Framework.app.timer.running), false, 'still paused')
    await p.click('.timer-control')
    assert.equal(await settle(() => read(() => Framework.app.timer.running), true), true, 'the timer runs again')
    assert.equal(await layerBlurred(), false, 'sharp after the resume')
    assert.notEqual(await pointerTakers(), 0, 'the notes take a press again')
    assert.deepEqual(await places(), before, 'the notes are where they were')
    await p.mouse.click(...(await textAnywhere.middleAt(p, await gridPoint(p, ON_BOARD))))
    assert.equal(await p.locator(SELECTED).count(), 1, 'a click on the pinned note selects it')
    await finishNote(p)
  })

  it('a selected note stays selected under the pause dialog', async () => {
    await p.mouse.click(...(await textAnywhere.middleAt(p, await gridPoint(p, ON_BOARD))))
    assert.equal(await p.locator(SELECTED).count(), 1, 'the note is selected')
    await pauseFromPage()
    assert.equal(await layerBlurred(), true, 'blurred')
    assert.equal(await p.locator(SELECTED).count(), 1, 'still selected under the dialog')
    await closePauseDialog(p, 'Resume')
    assert.equal(await settle(layerBlurred, false), false, 'sharp after Resume')
    await finishNote(p)
  })

  it('an open note stays open and blurred under the pause dialog, and its text is kept after Resume', async () => {
    await textAnywhere.reopen(p, await gridPoint(p, ON_BOARD))
    await p.keyboard.type('!')
    assert.equal(await p.locator(TEXT_BOX).count(), 1, 'the note is open')
    await pauseFromPage()
    assert.equal(await p.locator(TEXT_BOX).count(), 1, 'the note stays open under the pause dialog')
    assert.equal(await layerBlurred(), true, 'the open note is blurred too')
    assert.equal(await pointerTakers(), 0, 'the open note takes no press while paused')
    await closePauseDialog(p, 'Resume')
    assert.equal(await settle(layerBlurred, false), false, 'sharp after Resume')
    // The click on the dialog's button takes the caret, which finishes the note as any press elsewhere does; the text is kept.
    assert.deepEqual(await textAnywhere.texts(p), ['r3c4 = 7!', 'fixed'])
    assert.deepEqual((await textAnywhere.saved(p)).map((n) => n.text), ['r3c4 = 7!', 'fixed'])
    assert.deepEqual(errors, [])
  })
})
