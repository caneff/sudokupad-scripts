// Live check of draw-tool.user.js's saved drawing on sudokupad.app: kept over a reload, per puzzle, and wiped by Restart.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { gotoPuzzle, injectAtIdle, newPage, openPage, startPuzzle } from './page.mjs'
import { mouseDrag } from './pen.mjs'
import { clickUntil, settle, SETTLE_MS } from './settle.mjs'

const script = readFileSync(new URL('../draw-tool.user.js', import.meta.url), 'utf8')

const DRAW_BUTTON = '#control-draw'
const STROKES = '#draw-tool-layer path'
const DRAWING_PREFIX = 'DrawTool_drawing_'
const INDEX_KEY = 'DrawTool_index'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Draw Tool\'s saved drawing', { concurrency: false }, () => {
  let context, p, errors
  const warnings = []

  const read = (fn, arg) => p.evaluate(fn, arg)
  const strokeCount = () => p.locator(STROKES).count()
  const strokePaths = () => read((selector) => [...document.querySelectorAll(selector)].map((e) => e.getAttribute('d')), STROKES)
  // The puzzle's key: its id, or the page URL when it has none, as this recorded puzzle does.
  const puzzleKey = () => read(() => String(Framework.app.puzzle.puzzleId || window.location.href))
  const saved = async () => read((key) => Framework.getData(key), DRAWING_PREFIX + await puzzleKey())
  const pickDraw = () => clickUntil(() => p.click(DRAW_BUTTON), () => read(() => Framework.app.tool), 'draw', SETTLE_MS)

  const boot = async () => {
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator(DRAW_BUTTON).waitFor({ state: 'visible' })
  }
  const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }
  const restartFromDialog = async () => {
    await p.click('#control-restart')
    await p.locator('.dialog button').filter({ hasText: /Restart/ }).filter({ hasNotText: /Keep Time/ }).first().click()
    await p.locator('.dialog').waitFor({ state: 'detached' })
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, {
      seed: (page) => page.on('console', (m) => { if (m.type() === 'warning' && /draw-tool/.test(m.text())) warnings.push(m.text()) })
    }))
    await boot()
    await read(([prefix, index]) => {
      Object.keys(window.localStorage).filter((k) => k.includes(prefix)).forEach((k) => window.localStorage.removeItem(k))
      Framework.removeData(index)
    }, [DRAWING_PREFIX, INDEX_KEY])
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

  it('the drawing is saved under the puzzle\'s key, as a list of stroke items in pen color 1', async () => {
    const items = await saved()
    assert.deepEqual(items.map(({ kind, color, width }) => [kind, color, width]), [['stroke', 1, 6], ['stroke', 1, 6]])
    assert.deepEqual(await read((key) => Framework.getData(key), INDEX_KEY), [await puzzleKey()])
  })

  it('another puzzle\'s drawing never loads on this one', async () => {
    await read((key) => Framework.setData(key, [{ kind: 'stroke', color: 1, width: 6, points: [[10, 10], [500, 500]] }]), DRAWING_PREFIX + 'some-other-puzzle')
    const mine = await strokePaths()
    await reload()
    assert.deepEqual(await settle(strokePaths, mine), mine)
    await read((key) => Framework.removeData(key), DRAWING_PREFIX + 'some-other-puzzle')
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

  it('saved data that cannot be read shows no drawing, warns, and is never written over', async () => {
    const key = DRAWING_PREFIX + await puzzleKey()
    await read((k) => Framework.setData(k, 'not a drawing {'), key)
    await reload()
    assert.equal(await strokeCount(), 0)
    assert.equal(warnings.some((w) => /saved drawing/.test(w)), true, warnings.join('\n'))
    await pickDraw()
    await mouseDrag(p, [[2.5, 2.5], [3.5, 4.5]])
    assert.equal(await strokeCount(), 1)
    assert.equal(await read((k) => Framework.getData(k), key), 'not a drawing {')
    await read((k) => Framework.removeData(k), key)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
