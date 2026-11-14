// Live attacks on SudokuPad itself with all the scripts loaded (#590, attacks 49-56): each test tries to break the scripts
// with something a player does to SudokuPad, and checks the crash signals (a skip line, a page error, a console error, a
// notice bar) plus what the player expects to see.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assertNoCrash, attack, cellsState, emptyCells, flushSave, loadScripts, noteCount, NOTES, NOTICE_BAR, openWithAllScripts, reloadWithScripts, rowCol, rulesScroll, rulesWidth, setLongRules, typeDigits } from './attacks.mjs'
import { BUTTON as CBD_BUTTON, labelOn } from './color-by-digit/color-by-digit-fixtures.mjs'
import { captureConsoleErrors } from './page.mjs'
import { BLACK } from './scripts.mjs'
import { colorCell, gridPoint, placeNote, restart, undoDepth } from './board.mjs'
import { draw, openPenTool, penEntries } from './pen.mjs'
import { setInputValue } from './input.mjs'
import { settle, stable } from './settle.mjs'
import { TOOL_BUTTON } from './text-anywhere/text-anywhere-fixtures.mjs'
import { addPage, useBrowser } from './session.mjs'

const browser = useBrowser()

// Something of every kind the scripts and SudokuPad keep: a digit, a pen line, a colored cell and a note.
async function fillBoard (p, start) {
  await typeDigits(p, rowCol(emptyCells(start)[0]), '5')
  await draw(p, 6)
  await colorCell(p, [2, 0], 3)
  await placeNote(p, [2.5, 2.5], '15')
  return cellsState(p)
}

describe('SudokuPad-level attacks', { concurrency: 4 }, () => {
  it('49 Restart with notes, pen lines and colors present clears them all', () => attack(browser(), async (p) => {
    const start = await cellsState(p)
    assert.notDeepEqual(await fillBoard(p, start), start)
    await flushSave(p)
    await restart(p)
    assert.deepEqual(await settle(() => cellsState(p), start), start, 'Restart put the board back to its start')
    assert.deepEqual(await penEntries(p), [], 'no pen line is left')
    assert.equal(await settle(() => noteCount(p), 0), 0, 'no note is left')
    assert.equal(await labelOn(p), 'Cell', 'Color by Digit stayed in its mode')
  }))

  it('49 Undo after Restart brings the note back', () => attack(browser(), async (p) => {
    await fillBoard(p, await cellsState(p))
    await flushSave(p)
    await restart(p)
    assert.equal(await settle(() => noteCount(p), 0), 0, 'Restart cleared the note')
    await p.click('#control-undo')
    assert.equal(await settle(() => noteCount(p), 1), 1, 'Undo brought the note back')
  }))

  it('49 Undo after Restart leaves Color by Digit in its mode', () => attack(browser(), async (p) => {
    const start = await cellsState(p)
    await fillBoard(p, start)
    await flushSave(p)
    await restart(p)
    await p.click('#control-undo')
    assert.equal(await settle(() => labelOn(p), 'Cell'), 'Cell', 'Color by Digit was switched by the Undo')
  }))

  it('50 Undo past the start 100 times, then redo 100 times', () => attack(browser(), async (p) => {
    const filled = await fillBoard(p, await cellsState(p))
    const penBefore = await penEntries(p)
    const filledDepth = await undoDepth(p)
    for (let i = 0; i < 100; i++) await p.keyboard.press('Control+z')
    assert.equal(await settle(() => undoDepth(p), 0), 0, 'every action was undone')
    assert.deepEqual(await penEntries(p), [], 'no pen line')
    assert.equal(await noteCount(p), 1, 'the note stays: Undo does not touch notes')
    for (let i = 0; i < 100; i++) await p.keyboard.press('Control+y')
    assert.equal(await settle(() => undoDepth(p), filledDepth), filledDepth, 'every action was redone')
    assert.deepEqual(await settle(() => cellsState(p), filled), filled, 'redo brought everything back')
    assert.deepEqual(await penEntries(p), penBefore)
    assert.equal(await noteCount(p), 1, 'the note is still there')
    assert.equal(await labelOn(p), 'Cell', 'Color by Digit kept its mode')
  }))

  // #590's rule: after undoing back to the start, the puzzle state equals the starting state. Color by Digit's Cell colors are
  // part of the history, so the givens are left uncolored while the button still reads Cell.
  it('50 Undo back to the start gives the starting state', { todo: '#606' }, () => attack(browser(), async (p) => {
    const start = await cellsState(p)
    await fillBoard(p, start)
    for (let i = 0; i < 100; i++) await p.keyboard.press('Control+z')
    assert.deepEqual(await settle(() => cellsState(p), start), start)
  }))

  it('51 Switching every tool with the toolbar and with the hotkeys, 3 rounds, fast', () => attack(browser(), async (p) => {
    const toolbar = [['normal', '#control-normal'], ['corner', '#control-corner'], ['centre', '#control-centre'], ['colour', '#control-colour'], ['textanywhere', TOOL_BUTTON], ['pen', '#control-pen']]
    const hotkeys = [['normal', 'z'], ['corner', 'x'], ['centre', 'c'], ['colour', 'v']]
    const tool = () => p.evaluate(() => Framework.app.tool)
    for (let round = 0; round < 3; round++) {
      for (const [name, button] of toolbar) {
        await p.click(button)
        assert.equal(await settle(tool, name), name, `toolbar ${name}, round ${round}`)
      }
      for (const [name, key] of hotkeys) {
        await p.keyboard.press(key)
        assert.equal(await settle(tool, name), name, `hotkey ${key}, round ${round}`)
      }
    }
    // The scripts still work after the churn: a pen line, then a note.
    await draw(p, 7)
    assert.equal((await penEntries(p)).length > 0, true, 'a pen line was drawn')
    await placeNote(p, [2.5, 2.5], '7')
    assert.equal(await noteCount(p), 1)
  }))

  it('52 Toggling the SudokuPad settings the scripts depend on, then reload', () => attack(browser(), async (p) => {
    const read = ['flipkeypad', 'checkpencilmarks', 'toolpen', 'toolletter']
    const values = () => p.evaluate((keys) => keys.map((k) => !!Framework.getSetting(k)), read)
    const flip = () => p.evaluate((keys) => keys.forEach((k) => Framework.setSetting(k, !Framework.getSetting(k))), read)
    const before = await values()
    await flip()
    assert.deepEqual(await values(), before.map((v) => !v), 'the settings flipped')
    await p.evaluate(() => Framework.saveSettings())
    await reloadWithScripts(p)
    assert.deepEqual(await values(), before.map((v) => !v), 'the flipped settings survived the reload')
    assert.equal(await p.locator('#control-pen').count(), 0, 'with the pen tool off, its button is gone')
    assert.equal(await p.evaluate(() => document.body.classList.contains('setting-flipkeypad')), true, 'Keypad Flipped shows')
    // Flipped back, as they were: the tools show and work.
    await flip()
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await draw(p, 7)
    assert.equal((await penEntries(p)).length > 0, true, 'a pen line was drawn')
  }))

  it('53 Window resized to the minimum desktop size and back, with each script\'s panel open', () => attack(browser(), async (p) => {
    await setLongRules(p)
    const boxes = (selectors) => p.evaluate((list) => list.map((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect()
      return [Math.round(r.width), Math.round(r.height)]
    }), selectors)
    const PANELS = [
      ['Pen Tool Extras', '#control-pen', ['.pen-tool-extras-page', '.pen-tool-extras-sliders']],
      ['Text Anywhere', TOOL_BUTTON, ['.text-anywhere-sliders', '.text-anywhere-settings']]
    ]
    for (const [name, button, selectors] of PANELS) {
      await p.click(button)
      for (const sel of selectors) await p.locator(sel).waitFor({ state: 'visible' })
      // The reference sizes are read once the layout holds: the rules refit lands a moment after the panel opens, and a size read before it is not the one to come back to.
      const roomy = await stable(() => boxes([...selectors, CBD_BUTTON]))
      assert.equal(await settle(() => rulesScroll(p), false), false, `${name}: the rules do not scroll at 1200x900`)
      const roomyWidth = await stable(() => rulesWidth(p))
      await p.setViewportSize({ width: 1024, height: 600 })
      for (const sel of selectors) await p.locator(sel).waitFor({ state: 'visible' })
      assert.equal(await settle(() => rulesScroll(p), false), false, `${name}: the rules do not scroll at 1024x600`)
      assert.equal(await settle(async () => (await rulesWidth(p)) < roomyWidth, true), true, `${name}: the rules pane is narrower in the smaller window`)
      assert.equal(await p.locator(CBD_BUTTON).isVisible(), true, `${name}: Color by Digit's button shows at 1024x600`)
      await p.setViewportSize({ width: 1200, height: 900 })
      // A box may differ by a pixel after the rules refit: layout rounds a fractional height.
      const near = async () => (await boxes([...selectors, CBD_BUTTON])).every((box, i) => box.every((side, j) => Math.abs(side - roomy[i][j]) <= 1))
      assert.equal(await settle(near, true), true, `${name}: the panel is the size it was`)
      assert.equal(await settle(() => rulesScroll(p), false), false, `${name}: the rules do not scroll again`)
      assert.equal(await settle(async () => Math.abs((await rulesWidth(p)) - roomyWidth) <= 2, true), true, `${name}: the rules pane is as wide as it was`)
    }
  }))

  it('54 Page zoomed in and out, then pen lines drawn and notes placed', () => attack(browser(), async (p) => {
    // Headless Chromium has no zoom keys: Ctrl+= and Ctrl+- change the page's CSS size and its pixel ratio, which the emulation sets.
    const cdp = await p.context().newCDPSession(p)
    for (const [cssWidth, cssHeight, ratio] of [[800, 600, 1.5], [1600, 1200, 0.75]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: cssWidth, height: cssHeight, deviceScaleFactor: ratio, mobile: false })
      await p.waitForFunction((w) => window.innerWidth === w, cssWidth)
      const before = await penEntries(p)
      await draw(p, ratio > 1 ? 2 : 5)
      assert.equal((await penEntries(p)).length > before.length, true, `a pen line was drawn at ${ratio}`)
      // A cell of its own each time, so the second note is not on the first.
      const at = ratio > 1 ? [4.5, 4.5] : [7.5, 7.5]
      const point = await gridPoint(p, at)
      await placeNote(p, at, '9')
      const box = await p.locator(NOTES).last().boundingBox()
      assert.equal(Math.abs(box.x - point[0]) < 40 && Math.abs(box.y - point[1]) < 40, true, `the note sits where it was clicked at ${ratio}: ${JSON.stringify(box)} vs ${point}`)
    }
    assert.equal(await noteCount(p), 2, 'a note at each zoom')
    await cdp.send('Emulation.clearDeviceMetricsOverride')
  }))

  it('55 Two tabs of the same puzzle: change settings in one, reload the other', async () => {
    const { context, p: tabA, errors: errorsA } = await openWithAllScripts(browser())
    try {
      const { p: tabB, errors: errorsB } = await addPage(context, [], { seed: captureConsoleErrors })
      await loadScripts(tabB)
      await tabA.bringToFront()
      // Color by Digit's mode and Pen Tool Extras' Thickness, saved by tab A.
      await tabA.click(CBD_BUTTON)
      assert.equal(await settle(() => labelOn(tabA), 'Digit'), 'Digit', 'tab A is in Digit mode')
      await openPenTool(tabA)
      await setInputValue(tabA.locator('#pen-tool-extras-thickness'), 7)
      const thickness = await tabA.locator('#pen-tool-extras-thickness').inputValue()
      assert.equal(thickness, '7')
      // Tab B reads the settings tab A saved, among them the pen tool being on.
      await tabA.evaluate(() => Framework.saveSettings())
      await reloadWithScripts(tabB)
      assert.equal(await labelOn(tabB), 'Digit', 'tab B read the mode tab A saved')
      await openPenTool(tabB)
      assert.equal(await tabB.locator('#pen-tool-extras-thickness').inputValue(), thickness, 'tab B read the Thickness tab A saved')
      await draw(tabB, 6)
      await assertNoCrash(tabB, errorsB)
      await assertNoCrash(tabA, errorsA)
    } finally {
      await context.close()
    }
  })

  // SudokuPad's own saves throw an uncaught error on a page whose whole localStorage is blocked, with no script loaded, and its
  // settings save does too, which the harness's `ready` needs. So the keys the scripts save under throw, and SudokuPad's own
  // (including `PenColor_pen` and `PenColor_colors`, which Pen Tool Extras only reads) do not.
  it('56 Blocked storage: every script loads, says what it could not save, and keeps working', async () => {
    const SAVED = [
      ['color-by-digit', 'saved settings'], ['dark-page', 'saved color'], ['auto-rules-resizer', 'max size settings'], ['auto-rules-resizer', 'saved sizing'],
      ['pen-tool-extras', 'saved settings'], ['text-anywhere', 'saved notes and settings'], ['ui-tweaks', 'saved options']
    ]
    const said = []
    const { context, p, errors } = await openWithAllScripts(browser(), {
      expectedSkips: SAVED.map(([script, feature]) => new RegExp(`^${script}: ${feature} skipped because SudokuPad changed: SecurityError: denied$`)),
      seed: (page) => page.on('console', (m) => { if (/ skipped because SudokuPad changed: SecurityError: denied$/.test(m.text())) said.push(m.text().split(' skipped')[0]) }),
      afterStart: (p) => p.evaluate(() => {
        const scripts = new RegExp(`^${Framework.LocalDataPrefix}_([a-z-]+-notice$|ColorByDigit_|DarkPage_|AutoRulesResizer_|TextAnywhere_|DrawTool_|UiTweaks_|EdgeMarks_|PenColor_(?!pen$|colors$))`)
        for (const method of ['getItem', 'setItem', 'removeItem']) {
          const original = window.Storage.prototype[method]
          window.Storage.prototype[method] = function (key, ...rest) {
            if (scripts.test(String(key))) throw new DOMException('denied', 'SecurityError')
            return original.call(this, key, ...rest)
          }
        }
      })
    })
    try {
      // Each feature that saves says so once, and each of the six scripts puts up its own bar.
      const scripts = [...new Set(SAVED.map(([script]) => script))].sort()
      assert.deepEqual(await settle(() => p.locator(NOTICE_BAR).evaluateAll((bars) => bars.map((b) => b.dataset.script).sort()), scripts), scripts)
      assert.deepEqual(said.sort(), SAVED.map(([script, feature]) => `${script}: ${feature}`).sort(), 'one declared skip line per feature')
      assert.deepEqual(errors, [], 'no other skip line, page error or console error')
      assert.equal(await p.evaluate(() => window.getComputedStyle(document.body).backgroundColor), BLACK, 'Dark Page paints its default')
      assert.equal(await p.evaluate(() => { const r = document.querySelector('.puzzle-rules'); return r.scrollHeight > r.clientHeight }), false, 'the rules still fit')
      // The bars sit over the keypad until they are dismissed.
      while (await p.locator(NOTICE_BAR).count() > 0) await p.locator(`${NOTICE_BAR} button[aria-label="Dismiss"]`).first().click()
      await draw(p, 6)
      assert.equal((await penEntries(p)).length > 0, true, 'a pen line was drawn')
      await placeNote(p, [2.5, 2.5], '4')
      assert.equal(await noteCount(p), 1, 'a note was placed')
      await p.click(CBD_BUTTON)
      assert.equal(await settle(() => labelOn(p), 'Digit'), 'Digit', 'Color by Digit changed mode')
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })
})
