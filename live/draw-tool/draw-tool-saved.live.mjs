// Live check of draw-tool.user.js's saved notes on sudokupad.app: kept over a reload, per puzzle, and wiped by Restart; the strokes and shapes an earlier version
// saved are never drawn and stay in storage as they were.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { gotoPuzzle, injectAtIdle, newPage, openPage, startPuzzle } from '../page.mjs'
import { gridPoint, mouseDrag } from '../pen.mjs'
import { settle } from '../settle.mjs'

const { DIALOG, DRAWING_PREFIX, INDEX_KEY, NOT_NOTES, script, TEXTS } = draw

// What an earlier version saved, planted as it wrote it.
const OLD_STROKE = { kind: 'stroke', color: 2, width: 6, opacity: 100, points: [[100, 100], [300, 200], [500, 100]] }
const OLD_SHAPE = { kind: 'shape', shape: 'rect', color: 3, width: 4, opacity: 60, box: [64, 320, 256, 448] }
const B_ID = 'puzzle-b-490'
const NOTE = { kind: 'text', color: 1, size: 20, opacity: 100, text: '15', at: [160, 160] }

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s saved notes', { concurrency: false }, () => {
  let context, p, errors
  const warnings = []

  const read = (fn, arg) => p.evaluate(fn, arg)
  const texts = () => draw.texts(p)
  const typeText = async (at, content) => {
    await p.mouse.click(...await gridPoint(p, at))
    await p.keyboard.type(content)
    await p.keyboard.press('Escape')
  }
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

  it('getReplay() is the same with a note on the board as without one', async () => {
    const replay = await read(() => Framework.app.getReplay())
    await pickDraw()
    await typeText([2.5, 2.5], '15')
    assert.deepEqual(await texts(), ['15'])
    assert.equal(await read(() => Framework.app.getReplay()), replay)
  })

  it('the notes survive a page reload, note for note', async () => {
    await typeText([5.5, 4.5], '20')
    const before = await texts()
    assert.deepEqual(before, ['15', '20'])
    await reload()
    assert.deepEqual(await settle(texts, before), before)
  })

  it('the notes are saved under the puzzle\'s key, as a list of text items in color 1 with opacity 100 and no background', async () => {
    const items = await saved()
    assert.deepEqual(items.map(({ kind, color, size, opacity, bg }) => [kind, color, size, opacity, bg]), [['text', 1, 20, 100, undefined], ['text', 1, 20, 100, undefined]])
    assert.deepEqual(await read((key) => Framework.getData(key), INDEX_KEY), [await puzzleKey()])
  })

  // The recorded puzzle has no id, so its key is the page URL. A drawing is planted under each key a keying mistake
  // would read instead: the missing id as text, no key, the URL's path with and without its slash, and another puzzle's id.
  it('another puzzle\'s drawing never loads on this one', async () => {
    const wrongKeys = await read(() => ['undefined', '', window.location.pathname, window.location.pathname.slice(1), 'scl123abc'])
    const others = wrongKeys.map((key) => DRAWING_PREFIX + key)
    await read((keys) => keys.forEach((key) => Framework.setData(key, [{ kind: 'text', color: 1, size: 20, opacity: 100, text: 'WRONG', at: [10, 10] }])), others)
    const mine = await texts()
    await reload()
    assert.deepEqual(await settle(texts, mine), mine)
    await read((keys) => keys.forEach((key) => Framework.removeData(key)), others)
  })

  it('the notes show again when the script starts at DOMContentLoaded, before the puzzle has loaded', async () => {
    const mine = await texts()
    const { p: early, errors: earlyErrors } = await newPage(context)
    await injectAtIdle(early, script)
    await gotoPuzzle(early)
    await startPuzzle(early)
    const earlyTexts = () => early.evaluate((selector) => [...document.querySelectorAll(selector)].map((e) => e.textContent), TEXTS)
    assert.deepEqual(await settle(earlyTexts, mine), mine)
    assert.deepEqual(earlyErrors, [])
    await early.close()
  })

  it('Restart empties the notes, and a reload after it shows none', async () => {
    assert.equal((await texts()).length, 2)
    await restartFromDialog()
    assert.deepEqual(await settle(texts, []), [])
    assert.equal(await saved(), null)
    await reload()
    assert.deepEqual(await texts(), [])
  })

  it('a puzzle saved with a stroke, a shape and a note shows only the note: nothing but the note is in the layer', async () => {
    await draw.plantDrawing(p, [OLD_STROKE, NOTE, OLD_SHAPE])
    await reload()
    assert.deepEqual(await settle(texts, ['15']), ['15'])
    assert.equal(await p.locator(NOT_NOTES).count(), 0, 'the stroke and the shape are not drawn')
    assert.equal(await p.locator(draw.IN_LAYER).count(), 1, 'the layer holds the note alone')
  })

  it('typing, moving and erasing a note leave the stored stroke and shape as they were', async () => {
    const old = async () => (await saved()).filter((item) => item.kind !== 'text')
    await pickDraw()
    await typeText([6.5, 6.5], '20')
    assert.deepEqual(await texts(), ['15', '20'])
    assert.deepEqual(await old(), [OLD_STROKE, OLD_SHAPE], 'after typing')
    await mouseDrag(p, [[2.5, 2.5], [2.5, 4.5]])
    const [first] = (await saved()).filter((item) => item.kind === 'text')
    assert.equal(first.at[0] > 200, true, `the note moved to x ${first.at[0]}`)
    assert.deepEqual(await old(), [OLD_STROKE, OLD_SHAPE], 'after moving')
    await mouseDrag(p, [[6.5, 6], [6.5, 7]], { button: 'right' })
    assert.deepEqual(await texts(), ['15'])
    assert.deepEqual(await old(), [OLD_STROKE, OLD_SHAPE], 'after erasing')
    // Right-drags along the stroke's peak and the shape's bottom edge, clear of every note.
    await mouseDrag(p, [[3.125, 4], [3.125, 5.3]], { button: 'right' })
    await mouseDrag(p, [[7, 1.5], [7, 3]], { button: 'right' })
    assert.deepEqual(await texts(), ['15'], 'those drags crossed no note')
    assert.deepEqual(await old(), [OLD_STROKE, OLD_SHAPE], 'after erasing across them')
    assert.equal(await p.locator(NOT_NOTES).count(), 0, 'still not drawn')
    await reload()
    assert.deepEqual(await settle(texts, ['15']), ['15'])
    assert.deepEqual(await old(), [OLD_STROKE, OLD_SHAPE], 'after a reload')
  })

  it('Clear all removes the notes and leaves the stored stroke and shape as they were', async () => {
    await draw.plantDrawing(p, [OLD_STROKE, NOTE, OLD_SHAPE])
    await reload()
    assert.deepEqual(await settle(texts, ['15']), ['15'])
    await pickDraw()
    await p.click('.draw-tool-clear')
    await p.locator(`${DIALOG} button`).filter({ hasText: 'OK' }).click()
    assert.deepEqual(await settle(texts, []), [])
    assert.deepEqual(await saved(), [OLD_STROKE, OLD_SHAPE])
  })

  it('Restart removes the notes and leaves the stored stroke and shape as they were', async () => {
    await draw.plantDrawing(p, [OLD_STROKE, NOTE, OLD_SHAPE])
    await reload()
    assert.deepEqual(await settle(texts, ['15']), ['15'])
    await restartFromDialog()
    assert.deepEqual(await settle(texts, []), [])
    assert.deepEqual(await saved(), [OLD_STROKE, OLD_SHAPE])
  })

  it('saved data that cannot be read shows no notes, warns, and is never written over by a note, a move or an erase', async () => {
    const key = DRAWING_PREFIX + await puzzleKey()
    const planted = () => read((k) => Framework.getData(k), key)
    await read((k) => Framework.setData(k, 'not a drawing {'), key)
    await reload()
    assert.deepEqual(await texts(), [])
    assert.equal(warnings.some((w) => /saved drawing/.test(w)), true, warnings.join('\n'))
    await pickDraw()
    await typeText([2.5, 2.5], '15')
    assert.deepEqual(await texts(), ['15'])
    assert.match(await dialogText(), /saved notes cannot be read/, 'the solver is told the notes are not saved')
    await closeDialog()
    assert.equal(await planted(), 'not a drawing {', 'after a note')
    await mouseDrag(p, [[2.5, 2.5], [2.5, 4.5]])
    assert.equal(await planted(), 'not a drawing {', 'after a move')
    await mouseDrag(p, [[2.2, 4.5], [2.8, 4.5]], { button: 'right' })
    assert.deepEqual(await texts(), [])
    assert.equal(await planted(), 'not a drawing {', 'after an erase')
    assert.equal(await p.locator(DIALOG).count(), 0, 'the dialog is shown once a page')
    await read((k) => Framework.removeData(k), key)
  })

  it('an index that cannot be read leaves every saved drawing as it is, and the solver is told these notes were not saved', async () => {
    await reload()
    await read((k) => Framework.setData(k, 'not an index {'), INDEX_KEY)
    await pickDraw()
    await typeText([2.5, 2.5], '15')
    assert.deepEqual(await texts(), ['15'])
    assert.match(await dialogText(), /could not save this puzzle's notes: .*saved index/)
    await closeDialog()
    assert.equal(await saved(), null)
    assert.equal(await read((k) => Framework.getData(k), INDEX_KEY), 'not an index {')
    await read((k) => Framework.removeData(k), INDEX_KEY)
  })

  // Loads the puzzle on the page again through the page's own loader, as a puzzle with `id`, in place and with no reload.
  const openPuzzleAs = async (id) => {
    await p.addScriptTag({ content: 'window.pageLoader = PuzzleLoader' })
    await read(async ([key, as]) => {
      const { parsePuzzleData, fetchPuzzle } = window.pageLoader
      const data = await parsePuzzleData(await fetchPuzzle(key))
      data.id = as
      await Framework.app.loadCTCPuzzle(data)
    }, [new URL(await p.url()).pathname.slice(1), id])
    await p.waitForFunction((as) => Framework.app.puzzle.puzzleId === as, id)
  }

  // The page's id for the puzzle changes before it triggers 'loaded'. A key released in that gap is made to arrive there:
  // the nudge of A's selected note saves when its arrow key goes up, and the save must land under A.
  it('A\'s notes are never saved under B when a save lands while B is loading', async () => {
    await draw.forgetDrawings(p)
    await reload()
    const a = await puzzleKey()
    await pickDraw()
    await typeText([2.5, 2.5], '15')
    await p.mouse.click(...await gridPoint(p, [2.5, 2.5]))
    await p.keyboard.down('ArrowRight')
    // The puzzle's id is watched: the moment it becomes B's, the key goes up, before the puzzle triggers 'loaded'.
    await read((bId) => {
      const puzzle = Framework.app.puzzle
      let id = puzzle.puzzleId
      Object.defineProperty(puzzle, 'puzzleId', {
        configurable: true,
        get: () => id,
        set: (value) => {
          id = value
          if (value === bId) {
            window.keyupInGap = true
            window.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'ArrowRight', code: 'ArrowRight' }))
          }
        }
      })
    }, B_ID)
    await openPuzzleAs(B_ID)
    await p.keyboard.up('ArrowRight')
    assert.equal(await read(() => window.keyupInGap), true, 'the key went up between B\'s id and its load')
    assert.deepEqual(await settle(texts, []), [], 'puzzle B shows no notes')
    assert.equal(await read((k) => Framework.getData(k), DRAWING_PREFIX + B_ID), null, 'nothing is saved under B')
    assert.deepEqual((await read((k) => Framework.getData(k), DRAWING_PREFIX + a)).map((item) => item.text), ['15'], 'A keeps its note')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
