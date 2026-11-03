// Live check of edge-marks.user.js on sudokupad.app, in headless Chromium.
// Run with `npm run test:live`. It needs the network and a Playwright Chromium, so
// it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so
// Tampermonkey's real injection time and crackingthecryptic.com stay untested, and so
// does replay playback on a puzzle page. Each injection time runs the same checks:
//   document-idle: at DOMContentLoaded, as `@run-at document-idle` approximates it
//   before-start:  after the page loads, before Start Puzzle
//   after-start:   after Start Puzzle, when the controls already exist
// Every click is a real mouse click on the page at an edge's pixel position.
/* global Replay, Framework */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../edge-marks.user.js', import.meta.url), 'utf8')

const DATA_KEY = 'EdgeMarks_enabled'
const POLL_MS = 50
const SETTLE_MS = 10000
const SIZE = 9
// SudokuPad's own pen color 4, with no Pen Color script installed.
const RED = 'rgb(245, 58, 55)'

// Each edge a click can reach: the cell a click lands in, the side of it, and the cell and
// pen values that store it. The cycle on an edge is its X, two directions, a dot, then empty.
const EDGES = {
  'interior right (4,4)|(4,5)': { row: 3, col: 3, side: 'right', stored: [3, 3], cycle: ['3', 'h', 'i', 'j', null] },
  'interior bottom (4,4)|(5,4)': { row: 3, col: 3, side: 'bottom', stored: [3, 3], cycle: ['4', 'k', 'l', 'm', null] },
  'outer left of column 1': { row: 3, col: 0, side: 'left', stored: [3, 0], cycle: ['b', 'n', 'o', 'p', null] },
  'outer top of row 1': { row: 0, col: 3, side: 'top', stored: [0, 3], cycle: ['c', 'q', 'r', 's', null] },
  'outer right of the last column': { row: 3, col: SIZE - 1, side: 'right', stored: [3, SIZE - 1], cycle: ['3', 'h', 'i', 'j', null] },
  'outer bottom of the last row': { row: SIZE - 1, col: 3, side: 'bottom', stored: [SIZE - 1, 3], cycle: ['4', 'k', 'l', 'm', null] }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Reads until it equals `expected` (compared as JSON) or `timeoutMs` passes, and
// returns the last reading, so the caller's assert.deepEqual names what it got.
async function settle (read, expected, timeoutMs = SETTLE_MS) {
  const want = JSON.stringify(expected)
  const deadline = Date.now() + timeoutMs
  let value = await read()
  while (JSON.stringify(value) !== want && Date.now() < deadline) {
    await sleep(POLL_MS)
    value = await read()
  }
  return value
}

const START = /Start Puzzle|Continue|Resume/i

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

async function newPage (context, errors) {
  const p = await context.newPage()
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
  return p
}

async function startPuzzle (p) {
  await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
  const start = p.getByRole('button', { name: START }).first()
  await start.waitFor({ state: 'visible' })
  await start.click()
  await start.waitFor({ state: 'hidden' })
  await p.locator('#control-undo').waitFor({ state: 'visible' })
}

for (const mode of ['document-idle', 'before-start', 'after-start']) {
  describe(`injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors
    const read = (fn, arg) => p.evaluate(fn, arg)
    const saved = () => read((k) => Framework.getData(k), DATA_KEY)
    const dialogButton = (text) => p.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()
    const editor = () => p.locator('#edge-marks-editor')

    // The pen values on the cell at [row, col], without their colors.
    const penValues = (row, col) => read(([r, c]) => Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).pen.map((v) => v[0]).sort(), [row, col])
    const penCount = () => read(() => document.querySelectorAll('.cell-pen').length)

    // The pen button toggles the tool, and SudokuPad binds its handler a moment after the
    // button appears, so it is clicked again until the tool's buttons show.
    const selectPen = async () => {
      const shown = () => p.locator('.tool-pen button[data-key="1"]').isVisible()
      const deadline = Date.now() + SETTLE_MS
      while (!(await shown()) && Date.now() < deadline) {
        await p.click('#control-pen')
        await settle(shown, true, 500)
      }
    }

    // A point 2 px inside the cell, next to the given side: a real click there is an edge click.
    const edgePoint = (row, col, side) => read(([r, c, s]) => {
      const e = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).elem.getBoundingClientRect()
      const pad = 2
      return {
        right: [e.x + e.width - pad, e.y + e.height / 2],
        left: [e.x + pad, e.y + e.height / 2],
        bottom: [e.x + e.width / 2, e.y + e.height - pad],
        top: [e.x + e.width / 2, e.y + pad]
      }[s]
    }, [row, col, side])
    const clickEdge = async (row, col, side) => {
      const [x, y] = await edgePoint(row, col, side)
      await p.mouse.click(x, y)
    }
    const clickCellCentre = async (row, col) => {
      const [x, y] = await read(([r, c]) => {
        const e = Framework.app.puzzle.cells.find((v) => v.row === r && v.col === c).elem.getBoundingClientRect()
        return [e.x + e.width / 2, e.y + e.height / 2]
      }, [row, col])
      await p.mouse.click(x, y)
    }
    const pickColor = async (n) => p.locator(`.tool-pen button[data-key="${n}"]`).click()
    const clearMarks = async () => {
      for (const [row, col] of [[3, 3], [3, 0], [0, 3], [3, SIZE - 1], [SIZE - 1, 3], [5, 5]]) {
        // pen value 0 clears the cell, through an act so that the page redraws it
        await read(([r, c]) => {
          const cell = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c)
          Framework.app.act({ type: 'select', arg: [cell] })
          Framework.app.act({ type: 'pen', arg: '0' })
          Framework.app.act({ type: 'deselect' })
        }, [row, col])
      }
    }

    const openEditor = async () => {
      await p.click('#control-settings')
      await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Edge marks' }).first().click()
      await editor().waitFor({ state: 'visible' })
    }
    const closeWith = async (text) => {
      await dialogButton(text).click()
      await editor().waitFor({ state: 'detached' })
    }
    const box = (mark) => editor().locator(`input[data-mark="${mark}"]`)

    const boot = async () => {
      await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
      const start = p.getByRole('button', { name: START }).first()
      await start.waitFor({ state: 'visible' })
      if (mode === 'before-start') await p.addScriptTag({ content: script })
      await start.click()
      await start.waitFor({ state: 'hidden' })
      await p.locator('#control-undo').waitFor({ state: 'visible' })
      if (mode === 'after-start') await p.addScriptTag({ content: script })
      // The pen tool is off until its own setting turns it on.
      await read(() => Framework.setSetting('toolpen', true))
      await p.locator('#control-pen').waitFor({ state: 'visible' })
      await p.locator('style#edge-marks-style').waitFor({ state: 'attached' })
      await selectPen()
    }
    const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }

    before(async () => {
      context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
      errors = []
      p = await newPage(context, errors)
      if (mode === 'document-idle') {
        await p.addInitScript((src) => {
          document.addEventListener('DOMContentLoaded', () => {
            const s = document.createElement('script')
            s.textContent = src
            document.documentElement.appendChild(s)
          })
        }, script)
      }
      await p.goto(url, { waitUntil: 'load', timeout: 60000 })
      await boot()
    })
    after(async () => { await context.close() })

    for (const [name, edge] of Object.entries(EDGES)) {
      it(`${name}: clicks cycle X, direction, other direction, dot, empty, and draw each`, async () => {
        const [sr, sc] = edge.stored
        for (const value of [...edge.cycle, edge.cycle[0]]) {
          await clickEdge(edge.row, edge.col, edge.side)
          assert.deepEqual(await settle(() => penValues(sr, sc), value === null ? [] : [value]), value === null ? [] : [value], `${name} after a click`)
          // every drawn mark has a path with data: a mark with no `d` shows nothing
          const drawn = await read(() => [...document.querySelectorAll('.cell-pen')].map((e) => e.getAttribute('d')))
          assert.deepEqual(drawn.filter((d) => !d), [], 'a mark was drawn with no path data')
          assert.equal(drawn.length, value === null ? 0 : 1)
        }
        await clearMarks()
      })
    }

    it('the other side of an interior edge reaches the same mark', async () => {
      await clickEdge(3, 4, 'left')
      assert.deepEqual(await settle(() => penValues(3, 3), ['3']), ['3'])
      assert.deepEqual(await penValues(3, 4), [])
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), ['h']), ['h'])
      await clearMarks()
    })

    it('one undo reverses one click and redo restores it', async () => {
      await clickEdge(3, 3, 'right')
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), ['h']), ['h'])
      await p.click('#control-undo')
      assert.deepEqual(await settle(() => penValues(3, 3), ['3']), ['3'])
      await p.click('#control-redo')
      assert.deepEqual(await settle(() => penValues(3, 3), ['h']), ['h'])
      await p.click('#control-undo')
      await p.click('#control-undo')
      assert.deepEqual(await settle(() => penValues(3, 3), []), [])
      await clearMarks()
    })

    it('a mark takes the selected pen color and keeps it through undo and redo', async () => {
      await pickColor(4)
      await clickEdge(3, 3, 'right')
      await clickEdge(3, 3, 'right')
      const stroke = () => read(() => [...document.querySelectorAll('.cell-pen.pen-h')].map((e) => ({ cls: e.getAttribute('class'), stroke: window.getComputedStyle(e).stroke })))
      assert.deepEqual(await settle(stroke, [{ cls: 'cell-pen pen-h pencolor-4', stroke: RED }]), [{ cls: 'cell-pen pen-h pencolor-4', stroke: RED }])
      await p.click('#control-undo')
      await p.click('#control-redo')
      assert.deepEqual(await settle(stroke, [{ cls: 'cell-pen pen-h pencolor-4', stroke: RED }]), [{ cls: 'cell-pen pen-h pencolor-4', stroke: RED }])
      await clearMarks()
      await pickColor(1)
    })

    it('the dot has a visible stroke: round cap, a width, and a zero-length segment', async () => {
      for (let i = 0; i < 4; i++) await clickEdge(3, 3, 'right')
      const dot = () => read(() => {
        const e = document.querySelector('.cell-pen.pen-j')
        if (!e) return null
        const s = window.getComputedStyle(e)
        return { cap: s.strokeLinecap, width: s.strokeWidth, fill: s.fill, d: e.getAttribute('d').replace(/^M[\d. ]+ /, '') }
      })
      assert.deepEqual(await settle(dot, { cap: 'round', width: '7px', fill: 'none', d: 'l0 0' }), { cap: 'round', width: '7px', fill: 'none', d: 'l0 0' })
      await clearMarks()
    })

    it('cell marks and drawn lines still work', async () => {
      await clickCellCentre(5, 5)
      assert.deepEqual(await settle(() => penValues(5, 5), ['5']), ['5'])
      await clickCellCentre(5, 5)
      assert.deepEqual(await settle(() => penValues(5, 5), ['6']), ['6'])
      await clickCellCentre(5, 5)
      assert.deepEqual(await settle(() => penValues(5, 5), []), [])
      // a drag draws a line, not an edge mark
      const before = await penCount()
      const [x, y] = await read(() => {
        const e = Framework.app.puzzle.cells.find((c) => c.row === 6 && c.col === 1).elem.getBoundingClientRect()
        return [e.x + e.width / 2, e.y + e.height / 2]
      })
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.move(x + 70, y + 5, { steps: 8 })
      await p.mouse.up()
      assert.equal(await settle(async () => (await penCount()) > before, true), true)
      const values = await read(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => v[0])))
      assert.deepEqual(values.filter((v) => !'12789adefg'.includes(v)), [], 'a drag draws line values only')
      await p.click('#control-undo')
      assert.equal(await settle(penCount, before), before)
    })

    it('getReplay() encodes the moves', async () => {
      await clickEdge(3, 3, 'right')
      await clickEdge(3, 3, 'right')
      const actions = () => read(() => Replay.decode(Framework.app.getReplay()).actions)
      assert.equal((await settle(async () => (await actions()).includes('pe:h/0'), true)), true)
      assert.equal((await actions()).includes('pe:3/0'), true)
      await clearMarks()
    })

    it('Edge marks in settings has three boxes, all ticked on a fresh install', async () => {
      assert.equal(await saved(), null)
      await openEditor()
      for (const mark of ['x', 'directions', 'dot']) assert.equal(await box(mark).isChecked(), true, mark)
      await closeWith('Cancel')
    })

    it('Cancel saves nothing and changes nothing', async () => {
      await openEditor()
      await box('directions').uncheck()
      await closeWith('Cancel')
      assert.equal(await saved(), null)
      await clickEdge(3, 3, 'right')
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), ['h']), ['h'])
      await clearMarks()
    })

    it('unticking Directions skips both directions and the boxes survive a reload', async () => {
      await openEditor()
      await box('directions').uncheck()
      await closeWith('Save')
      assert.deepEqual(await saved(), { x: true, directions: false, dot: true })
      await reload()
      assert.deepEqual(await saved(), { x: true, directions: false, dot: true })
      await openEditor()
      assert.equal(await box('x').isChecked(), true)
      assert.equal(await box('directions').isChecked(), false)
      assert.equal(await box('dot').isChecked(), true)
      await closeWith('Cancel')
      for (const value of ['3', 'j', null]) {
        await clickEdge(3, 3, 'right')
        assert.deepEqual(await settle(() => penValues(3, 3), value === null ? [] : [value]), value === null ? [] : [value])
      }
    })

    it('a mark whose type is unticked stays until clicked, then moves on', async () => {
      await openEditor()
      await box('directions').check()
      await closeWith('Save')
      await clickEdge(3, 3, 'right')
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), ['h']), ['h'])
      await openEditor()
      await box('directions').uncheck()
      await closeWith('Save')
      assert.deepEqual(await penValues(3, 3), ['h'])
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), ['j']), ['j'])
      await clearMarks()
    })

    it('with nothing ticked an edge click does nothing, and cell marks and existing marks are unaffected', async () => {
      await openEditor()
      await box('directions').check()
      await closeWith('Save')
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), ['3']), ['3'])
      await openEditor()
      for (const mark of ['x', 'directions', 'dot']) await box(mark).uncheck()
      await closeWith('Save')
      const undoable = await read(() => Framework.app.puzzle.undoStack.length)
      await clickEdge(3, 3, 'right')
      await clickEdge(3, 3, 'bottom')
      // "nothing happened in 500 ms" check
      await sleep(500)
      assert.deepEqual(await penValues(3, 3), ['3'])
      assert.equal(await read(() => Framework.app.puzzle.undoStack.length), undoable)
      await clickCellCentre(5, 5)
      assert.deepEqual(await settle(() => penValues(5, 5), ['5']), ['5'])
      await openEditor()
      for (const mark of ['x', 'directions', 'dot']) await box(mark).check()
      await closeWith('Save')
      await clearMarks()
    })

    it('corrupt saved settings fall back to every mark ticked with no thrown error', async () => {
      const errorsBefore = errors.length
      for (const bad of ['{not json', '"red"', '[1,2]', '{"x":"no"}']) {
        await read(([k, raw]) => {
          const key = Object.keys(window.localStorage).find((n) => n.endsWith(k))
          if (!key) throw new Error('no stored key for ' + k)
          window.localStorage.setItem(key, raw)
        }, [DATA_KEY, bad])
        await reload()
        await clickEdge(3, 3, 'right')
        await clickEdge(3, 3, 'right')
        assert.deepEqual(await settle(() => penValues(3, 3), ['h']), ['h'], bad)
        await clearMarks()
      }
      assert.deepEqual(errors.slice(errorsBefore), [])
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })
}

describe('without the script', { concurrency: false }, () => {
  it('a replay and a saved state holding these values load with no page error, and the page does not crash', async () => {
    // First page: the script, to record a replay with every kind of added mark.
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    const errors = []
    try {
      const withScript = await newPage(context, [])
      await withScript.goto(url, { waitUntil: 'load', timeout: 60000 })
      await withScript.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
      await withScript.addScriptTag({ content: script })
      await startPuzzle(withScript)
      const replay = await withScript.evaluate(() => {
        const { app } = Framework
        const cell = app.puzzle.cells.find((c) => c.row === 3 && c.col === 3)
        for (const arg of ['h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's']) {
          app.act({ type: 'select', arg: [cell] })
          app.act({ type: 'pen', arg })
          app.act({ type: 'deselect' })
        }
        return app.getReplay()
      })
      await withScript.close()

      // Second page: no script. Load the replay and a saved state with those values.
      const bare = await newPage(context, errors)
      await bare.goto(url, { waitUntil: 'load', timeout: 60000 })
      await startPuzzle(bare)
      await bare.evaluate((r) => Framework.app.loadReplay(r), replay)
      await bare.waitForFunction(() => Framework.app.puzzle.cells.find((c) => c.row === 3 && c.col === 3).pen.length === 12, null, { timeout: 15000 })
      const pen = await bare.evaluate(() => {
        const cell = Framework.app.puzzle.cells.find((c) => c.row === 3 && c.col === 3)
        cell.renderContent(true)
        return { held: cell.pen.map((v) => v[0]).join(''), drawn: document.querySelectorAll('.cell-pen').length }
      })
      assert.equal(pen.held, 'hijklmnopqrs')
      // the unknown values draw as paths with no data, so nothing is visible
      assert.equal(await bare.evaluate(() => [...document.querySelectorAll('.cell-pen')].filter((e) => e.getAttribute('d')).length), 0)
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })
})
