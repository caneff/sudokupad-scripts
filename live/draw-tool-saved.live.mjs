// Live check of draw-tool.user.js's saved drawing on sudokupad.app: kept over a reload, per puzzle, and wiped by Restart.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { gotoPuzzle, injectAtIdle, newPage, openPage, startPuzzle } from './page.mjs'
import { gridPoint, mouseDrag } from './pen.mjs'
import { settle } from './settle.mjs'

const { DIALOG, DRAWING_PREFIX, INDEX_KEY, script, STROKES } = draw

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Draw Tool\'s saved drawing', { concurrency: false }, () => {
  let context, p, errors
  const warnings = []

  const read = (fn, arg) => p.evaluate(fn, arg)
  const strokeCount = () => p.locator(STROKES).count()
  const strokePaths = () => draw.strokePaths(p)
  const puzzleKey = () => draw.puzzleKey(p)
  const saved = () => draw.saved(p)
  const pickDraw = () => draw.pickDraw(p)
  const reload = () => draw.reload(p)
  const dialogText = () => p.locator(DIALOG).textContent()
  const closeDialog = async () => {
    await p.waitForFunction(() => !window.dialogJustShown)
    await p.locator(`${DIALOG} button`).filter({ hasText: 'OK' }).click()
    await p.locator(DIALOG).waitFor({ state: 'detached' })
  }
  const restartFromDialog = async () => {
    await p.click('#control-restart')
    await p.locator('.dialog button').filter({ hasText: /Restart/ }).filter({ hasNotText: /Keep Time/ }).first().click()
    await p.locator('.dialog').waitFor({ state: 'detached' })
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, {
      seed: (page) => page.on('console', (m) => { if (m.type() === 'warning' && /draw-tool/.test(m.text())) warnings.push(m.text()) })
    }))
    await draw.boot(p)
    await draw.forgetDrawings(p)
  })
  after(async () => { await context.close() })

  it('getReplay() is the same with a drawing on the board as without one', async () => {
    const replay = await read(() => Framework.app.getReplay())
    await pickDraw()
    await mouseDrag(p, [[2.5, 2.5], [3.2, 4], [2.4, 5.5], [3.6, 6.5]])
    assert.equal(await strokeCount(), 1)
    assert.equal(await read(() => Framework.app.getReplay()), replay)
  })

  it('a drawing survives a page reload, stroke for stroke', async () => {
    await p.keyboard.down('Shift')
    await mouseDrag(p, [[1.5, 1.5], [4, 2], [5.5, 6.5]])
    await p.keyboard.up('Shift')
    const before = await strokePaths()
    assert.equal(before.length, 2)
    await reload()
    assert.deepEqual(await settle(strokePaths, before), before)
  })

  it('the drawing is saved under the puzzle\'s key, as a list of stroke items in draw color 1', async () => {
    const items = await saved()
    assert.deepEqual(items.map(({ kind, color, width, opacity }) => [kind, color, width, opacity]), [['stroke', 1, 6, 100], ['stroke', 1, 6, 100]])
    assert.deepEqual(await read((key) => Framework.getData(key), INDEX_KEY), [await puzzleKey()])
  })

  // The recorded puzzle has no id, so its key is the page URL. A drawing is planted under each key a keying mistake
  // would read instead: the missing id as text, no key, the URL's path with and without its slash, and another puzzle's id.
  it('another puzzle\'s drawing never loads on this one', async () => {
    const wrongKeys = await read(() => ['undefined', '', window.location.pathname, window.location.pathname.slice(1), 'scl123abc'])
    const others = wrongKeys.map((key) => DRAWING_PREFIX + key)
    await read((keys) => keys.forEach((key) => Framework.setData(key, [{ kind: 'stroke', color: 1, width: 6, points: [[10, 10], [500, 500]] }])), others)
    const mine = await strokePaths()
    await reload()
    assert.deepEqual(await settle(strokePaths, mine), mine)
    await read((keys) => keys.forEach((key) => Framework.removeData(key)), others)
  })

  it('the drawing shows again when the script starts at DOMContentLoaded, before the puzzle has loaded', async () => {
    const mine = await strokePaths()
    const { p: early, errors: earlyErrors } = await newPage(context)
    await injectAtIdle(early, script)
    await gotoPuzzle(early)
    await startPuzzle(early)
    const paths = () => early.evaluate((selector) => [...document.querySelectorAll(selector)].map((e) => e.getAttribute('d')), STROKES)
    assert.deepEqual(await settle(paths, mine), mine)
    assert.deepEqual(earlyErrors, [])
    await early.close()
  })

  it('Restart empties the drawing, and a reload after it shows none', async () => {
    assert.equal(await strokeCount(), 2)
    await restartFromDialog()
    assert.equal(await settle(strokeCount, 0), 0)
    assert.equal(await saved(), null)
    await reload()
    assert.equal(await strokeCount(), 0)
  })

  it('saved data that cannot be read shows no drawing, warns, and is never written over by a stroke, a text or an erase', async () => {
    const key = DRAWING_PREFIX + await puzzleKey()
    const planted = () => read((k) => Framework.getData(k), key)
    await read((k) => Framework.setData(k, 'not a drawing {'), key)
    await reload()
    assert.equal(await strokeCount(), 0)
    assert.equal(warnings.some((w) => /saved drawing/.test(w)), true, warnings.join('\n'))
    await pickDraw()
    await mouseDrag(p, [[2.5, 2.5], [3.5, 4.5]])
    assert.equal(await strokeCount(), 1)
    assert.match(await dialogText(), /saved drawing cannot be read/, 'the solver is told the drawing is not saved')
    await closeDialog()
    assert.equal(await planted(), 'not a drawing {', 'after a stroke')
    await p.mouse.click(...await gridPoint(p, [6.5, 6.5]))
    await p.keyboard.type('15')
    await p.keyboard.press('Enter')
    assert.equal(await p.locator('#draw-tool-layer text').count(), 1)
    assert.equal(await planted(), 'not a drawing {', 'after a text')
    await mouseDrag(p, [[2.5, 3.8], [3.5, 3.2]], { button: 'right' })
    assert.equal(await strokeCount(), 0)
    assert.equal(await planted(), 'not a drawing {', 'after an erase')
    assert.equal(await p.locator(DIALOG).count(), 0, 'the dialog is shown once a page')
    await read((k) => Framework.removeData(k), key)
  })

  it('an index that cannot be read leaves every saved drawing as it is, and the solver is told this drawing was not saved', async () => {
    await reload()
    await read((k) => Framework.setData(k, 'not an index {'), INDEX_KEY)
    await pickDraw()
    await mouseDrag(p, [[2.5, 2.5], [3.5, 4.5]])
    assert.equal(await strokeCount(), 1)
    assert.match(await dialogText(), /could not save this puzzle's drawing: .*saved index/)
    await closeDialog()
    assert.equal(await saved(), null)
    assert.equal(await read((k) => Framework.getData(k), INDEX_KEY), 'not an index {')
    await read((k) => Framework.removeData(k), INDEX_KEY)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
