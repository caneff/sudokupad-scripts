// Live check of pen-tool-extras.user.js's feedback before a gesture lands, on sudokupad.app in headless Chromium: the right-click erase's preview and its Escape (#546 rows 1 and 7),
// the faint mark a left click would place (row 4), and the drag highlight in the pen's style (row 5). Every press, move and key is real input; each check reads the page's computed
// style and what is stored (`cell.pen`).
/* global Framework, getComputedStyle */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { captureConsoleErrors, openPage, restartPuzzle, startPuzzle } from '../page.mjs'
import { drag, gridPoint, openPenTool, padValues, penEntries } from '../pen.mjs'
import { settle } from '../settle.mjs'

const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')

const KEYS = ['PenColor_pen', 'PenColor_colors', 'PenColor_thickness', 'PenColor_opacity', 'ToolPen_color', 'PenColor_middleerase']
const PAGE_BUTTON = '.pen-tool-extras-page'
const PAGES = { 1: '123456789', 2: 'abcdefghi', 3: 'jlnprtvxz' }
const FADED = '0.3'
const GHOST = '.pen-tool-extras-ghost'
const HEADS = '.pen-tool-extras-hint-arrows'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const undoAll = async () => { while ((await read(() => Framework.app.puzzle.undoStack.length)) > 0) await p.click('#control-undo') }
  const moveTo = async (point) => { await p.mouse.move(...await gridPoint(p, point)) }
  // Moves onto `point` from a hair beside it, so a puzzle that was still redrawing under the first move sees the second.
  const hover = async (point) => {
    await moveTo([point[0], point[1] + 0.02])
    await moveTo(point)
  }
  // The computed opacity of every pen stroke (the layer's own opacity not counted), as `row,col:value` to its opacity.
  const strokeOpacities = () => read(() => Object.fromEntries([...document.querySelectorAll('#cell-pen .cell-pen, #pen-tool-extras-marks .cell-pen')]
    .filter((el) => el.tagName === 'path' && !el.parentNode.classList.contains('cell-pen'))
    .map((el) => [`${el.getAttribute('row')},${el.getAttribute('col')}:${el.getAttribute('value')}`, getComputedStyle(el).opacity])))
  const fadedStrokes = async () => Object.entries(await strokeOpacities()).filter(([, opacity]) => opacity === FADED).map(([key]) => key).sort()

  const selectPenOnPage = async (page, key) => {
    await openPenTool(p)
    await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
    for (let i = 0; i < 3 && (await padValues(p)) !== PAGES[page]; i++) await p.locator(PAGE_BUTTON).click()
    assert.equal(await settle(() => padValues(p), PAGES[page]), PAGES[page])
    await p.locator(`.tool-pen button[data-key="${key}"]`).click()
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { seed: captureConsoleErrors }))
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
    await read(() => { Framework.setSetting('toolpen', true) })
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await openPenTool(p)
    await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), KEYS)
  })
  after(async () => {
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), KEYS)
    await context.close()
  })

  describe('row 1: the right-click erase shows what it will erase while the button is held', () => {
    it('the whole line the press hit fades to 0.3, a line it will not erase stays whole, and the release erases the faded line', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(1, 3)
      await drag(p, [[2.5, 2.5], [2.5, 4.5]])
      const line = await penEntries(p)
      await selectPenOnPage(1, 6)
      await drag(p, [[6.5, 2.5], [6.5, 3.5]])
      const other = (await penEntries(p)).filter((v) => !line.includes(v))
      assert.deepEqual(await fadedStrokes(), [], 'nothing is faded before the press')
      await moveTo([2.5, 3.0])
      await p.mouse.down({ button: 'right' })
      assert.deepEqual(await settle(fadedStrokes, ['2,2:1', '2,3:1']), ['2,2:1', '2,3:1'], 'both segments of the pressed line fade, nothing else does')
      await p.mouse.up({ button: 'right' })
      assert.deepEqual(await settle(() => penEntries(p), other), other, 'the release erases the line')
      assert.deepEqual(await fadedStrokes(), [], 'no stroke stays faded')
      await undoAll()
    })

    it('a mark under the press fades while it is held, and a line the pointer is dragged onto fades as it is crossed', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(1, 3)
      await p.mouse.click(...await gridPoint(p, [3.5, 4.0]))
      await drag(p, [[6.5, 2.5], [6.5, 4.5]])
      const marked = await penEntries(p)
      assert.equal(marked.filter((v) => v.startsWith('3,3:')).length, 1, 'the edge mark is stored')
      await moveTo([3.5, 4.0])
      await p.mouse.down({ button: 'right' })
      assert.equal((await settle(fadedStrokes, ['3,3:3'])).length, 1, 'the mark fades')
      await p.mouse.move(...await gridPoint(p, [6.5, 3.0]), { steps: 8 })
      assert.deepEqual(await settle(fadedStrokes, ['3,3:3', '6,2:1', '6,3:1']), ['3,3:3', '6,2:1', '6,3:1'], 'the crossed line joins it')
      await p.mouse.up({ button: 'right' })
      assert.deepEqual(await settle(() => penEntries(p), []), [], 'the release erases both')
      await undoAll()
    })
  })

  describe('row 7: Escape while the right button is held cancels the erase', () => {
    it('nothing is erased, the fade goes, and a later release or move does nothing', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(1, 3)
      await drag(p, [[2.5, 2.5], [2.5, 4.5]])
      await drag(p, [[5.5, 2.5], [5.5, 4.5]])
      const lines = await penEntries(p)
      const depth = await read(() => Framework.app.puzzle.undoStack.length)
      await moveTo([2.5, 3.0])
      await p.mouse.down({ button: 'right' })
      assert.equal((await settle(fadedStrokes, ['2,2:1', '2,3:1'])).length, 2)
      await p.keyboard.press('Escape')
      assert.deepEqual(await settle(fadedStrokes, []), [], 'Escape clears the fade')
      await p.mouse.move(...await gridPoint(p, [5.5, 3.0]), { steps: 8 })
      assert.deepEqual(await fadedStrokes(), [], 'the drag after Escape fades nothing')
      await p.mouse.up({ button: 'right' })
      await sleep(200) // "nothing happened in 200 ms" check
      assert.deepEqual(await penEntries(p), lines, 'nothing was erased')
      assert.equal(await read(() => Framework.app.puzzle.undoStack.length), depth, 'no undo step')
      await p.mouse.click(5, 5)
      await undoAll()
    })
  })

  describe('row 4: a faint mark shows what a left click would place', () => {
    const ghostOf = () => read((selector) => {
      const ghosts = [...document.querySelectorAll(selector)]
      if (ghosts.length > 1) return { count: ghosts.length }
      const el = ghosts[0]
      if (!el) return null
      return { count: 1, value: el.getAttribute('value'), classValue: /\bpen-(\S+)/.exec(el.getAttribute('class'))[1], pen: /\bpencolor-(\S+)/.exec(el.getAttribute('class'))[1], opacity: getComputedStyle(el).opacity, layer: el.parentNode.id, d: el.getAttribute('d') }
    }, GHOST)
    const marksOf = (row, col) => penEntries(p).then((all) => all.filter((v) => v.startsWith(`${row},${col}:`)).map((v) => v[v.indexOf(':') + 1]))
    const NEXT_MS = 2000

    // Hovers once, then clicks in place until the cycle ends, never moving: the ghost before each click must be the mark the click stores, and after the click it must show the next step.
    const cycleAt = async (point, [row, col], label) => {
      const seen = []
      await hover(point)
      // The ghost of the spot the pointer left may still show for one throttle tick, so the first reading waits for the ghost to hold still.
      let ghost = await settle(async () => JSON.stringify(await ghostOf()), undefined, NEXT_MS).then(ghostOf)
      for (let step = 0; step < 8; step++) {
        if (ghost === null) {
          // The next step empties the spot: the mark that is there is faded instead.
          assert.ok((await marksOf(row, col)).length > 0, `${label}: no ghost and no mark to clear`)
          assert.ok((await fadedStrokes()).length > 0, `${label}: the mark the click clears is faded`)
          await p.mouse.click(...await gridPoint(p, point))
          assert.deepEqual(await settle(() => marksOf(row, col), []), [], `${label}: the click clears it`)
          return seen
        }
        assert.equal(ghost.count, 1, `${label}: one ghost`)
        assert.equal(ghost.opacity, FADED, `${label}: drawn at 0.3`)
        assert.equal(ghost.layer, 'pen-tool-extras-hint', `${label}: in the hint layer`)
        assert.notEqual(ghost.d, null, `${label}: it has a shape`)
        seen.push(ghost.value)
        assert.equal(ghost.classValue, ghost.value, `${label}: the ghost is classed as the mark it draws`)
        await p.mouse.click(...await gridPoint(p, point))
        const stored = await settle(async () => (await marksOf(row, col)).includes(ghost.value), true)
        assert.equal(stored, true, `${label}: the click stores the ghost's mark ${ghost.value}; the cell holds ${await marksOf(row, col)} after ${seen}`)
        // The mark the click stored is drawn as the ghost was.
        const drawn = await read((value) => [...document.querySelectorAll('.cell-pen:not(.pen-tool-extras-ghost)')].filter((el) => el.getAttribute('value') === value).map((el) => el.getAttribute('d')), ghost.value)
        assert.deepEqual(drawn, [ghost.d], `${label}: the stored ${ghost.value} has the ghost's shape`)
        const shown = ghost.value
        // The pointer has not moved: the ghost shows the step after the click made, with no move to ask for it.
        ghost = await settle(async () => JSON.stringify(await ghostOf()), undefined, NEXT_MS).then(ghostOf)
        assert.notEqual(ghost && ghost.value, shown, `${label}: after the click the ghost still shows ${shown}`)
      }
      throw new Error(`${label}: the cycle did not end in 8 clicks: ${seen}`)
    }

    it('on an edge, in a cell middle and on a grid corner the ghost is the mark the next click stores, through the whole cycle, then the mark to be cleared fades', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(1, 3)
      const edge = await cycleAt([3.5, 4.0], [3, 3], 'edge')
      assert.ok(edge.length >= 2, `the edge cycle showed ${edge}`)
      const cell = await cycleAt([5.5, 5.5], [5, 5], 'cell middle')
      assert.ok(cell.length >= 2, `the cell cycle showed ${cell}`)
      const corner = await cycleAt([7.0, 7.0], [6, 6], 'corner')
      assert.ok(corner.length >= 1, `the corner cycle showed ${corner}`)
      await undoAll()
    })

    it('the ghost is in the pen\'s color, and goes on a press, off the grid, on a key and in another tool', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(1, 6)
      await hover([3.5, 4.0])
      const ghost = await settle(async () => (await ghostOf()) !== null, true).then(ghostOf)
      assert.equal(ghost.pen, '6', 'pen color 6')
      // a press in the same task as a move whose preview is still waiting for its turn: the pointer events are dispatched together, so no timer can run between them
      const [x, y] = await gridPoint(p, [3.5, 3.0])
      await read(([px, py]) => {
        const grid = document.querySelector('#svgrenderer')
        const init = { clientX: px, clientY: py, bubbles: true, cancelable: true }
        grid.dispatchEvent(new PointerEvent('pointermove', { ...init, buttons: 0 }))
        grid.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1, button: 0 }))
      }, [x, y])
      await sleep(150) // "nothing happened in 150 ms" check: the waiting preview must not show under the press
      assert.equal(await ghostOf(), null, 'a press hides it, and the move just before it does not bring it back')
      await p.mouse.up()
      await undoAll()
      await hover([3.5, 4.0])
      assert.equal(await settle(async () => (await ghostOf()) !== null, true), true, 'it is back after the release and a move')
      // off the grid
      await p.mouse.move(5, 5)
      assert.equal(await settle(ghostOf, null), null, 'off the grid hides it')
      // a key (the digit changes the pen, which the ghost would still show)
      await hover([3.5, 4.0])
      await settle(async () => (await ghostOf()) !== null, true)
      await p.keyboard.press('2')
      assert.equal(await settle(ghostOf, null), null, 'a key hides it')
      // another tool
      await p.click('#control-normal')
      await hover([3.5, 4.0])
      await sleep(200) // "nothing happened in 200 ms" check
      assert.equal(await ghostOf(), null, 'no ghost in another tool')
      await openPenTool(p)
    })

    it('a pointer that leaves the grid in the task of a release leaves no ghost and no faded mark behind', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(1, 3)
      // four clicks in, the next one would clear the mark: the state a stale refresh would leave faded
      for (let click = 0; click < 4; click++) {
        await p.mouse.click(...await gridPoint(p, [3.5, 4.0]))
        await p.mouse.click(5, 5) // a click off the grid, or the next press draws nothing
      }
      assert.equal(await settle(() => penEntries(p).then((all) => all.length), 1), 1, 'one mark after four clicks')
      const [x, y] = await gridPoint(p, [3.5, 4.0])
      // The release and the move off the grid arrive in one task, so the release's refresh runs after the move is queued.
      await read(([px, py]) => {
        const grid = document.querySelector('#svgrenderer')
        grid.dispatchEvent(new MouseEvent('mouseup', { clientX: px, clientY: py, bubbles: true }))
        document.body.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5, bubbles: true, buttons: 0 }))
      }, [x, y])
      await sleep(200) // "nothing happened in 200 ms" check: the release's refresh and the move's have both had their turn
      assert.equal(await ghostOf(), null, 'no ghost')
      assert.deepEqual(await fadedStrokes(), [], 'no faded mark')
      await undoAll()
    })

    it('a ghost is drawn at most once per 32 ms of moves: a burst of moves leaves the one ghost of the last point', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(1, 3)
      await hover([1.5, 2.0])
      for (let i = 0; i < 12; i++) await p.mouse.move(...await gridPoint(p, [1.5 + i * 0.3, 2.0]))
      await moveTo([5.5, 6.0])
      const last = await settle(async () => { const g = await ghostOf(); return g && g.count }, 1)
      assert.equal(last, 1, 'one ghost')
    })
  })

  describe('row 5: the drag highlight shows the pen\'s style', () => {
    const hint = () => read((heads) => {
      const el = document.querySelector('.penhint')
      if (!el) return null
      const arrows = document.querySelector(heads)
      return { dash: getComputedStyle(el).strokeDasharray, width: getComputedStyle(el).strokeWidth, headsD: arrows ? arrows.getAttribute('d') : null, headsLayer: arrows ? arrows.parentNode.id : null, headsFill: arrows ? getComputedStyle(arrows).fill : null, linePen: /pencolor-(\S+)/.exec(el.getAttribute('class'))[1] }
    }, HEADS)
    // Presses at the first point and drags through the rest, moving on in small steps until SudokuPad has drawn its hint (a puzzle still redrawing misses the first moves).
    const holdDrag = async (points) => {
      await p.mouse.click(5, 5) // a click off the grid, or a drag started right after a release or a button press draws nothing
      await moveTo(points[0])
      await p.mouse.down()
      for (const point of points.slice(1)) await p.mouse.move(...await gridPoint(p, point), { steps: 8 })
      const [last, before] = [points[points.length - 1], points[points.length - 2]]
      for (let i = 0; i < 20 && (await hint()) === null; i++) {
        await p.mouse.move(...await gridPoint(p, before), { steps: 4 })
        await p.mouse.move(...await gridPoint(p, last), { steps: 4 })
      }
    }
    const headsOf = (d) => [...d.matchAll(/M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)Z/g)].map(([, wx, , tx]) => ({ wing: Number(wx), tip: Number(tx) }))

    it('page 1: a plain pen\'s hint is solid with no arrowheads', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(1, 3)
      await holdDrag([[2.5, 2.5], [2.5, 4.5]])
      const h = await hint()
      assert.equal(h.dash, 'none')
      assert.equal(h.headsD, null)
      await p.mouse.up()
      await undoAll()
    })

    it('page 2: a dashed pen\'s hint is dashed, and an erasing drag\'s hint stays solid', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(2, 3)
      await holdDrag([[2.5, 2.5], [2.5, 4.5]])
      const h = await hint()
      assert.notEqual(h.dash, 'none', 'dashes')
      assert.equal(h.headsD, null)
      await p.mouse.up()
      assert.equal((await settle(() => penEntries(p).then((all) => all.length > 0), true)), true, 'the dashed line is stored')
      // a second drag over the same cells erases: the red hint
      await holdDrag([[2.5, 2.5], [2.5, 4.5]])
      assert.equal((await hint()).linePen, 'erase')
      assert.equal((await hint()).dash, 'none', 'the erase hint is solid')
      await p.mouse.up()
      await undoAll()
    })

    it('page 3: an arrow pen\'s hint has arrowheads that point the way of the drag, and none are left when the drag ends', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(3, 3)
      await holdDrag([[2.5, 2.5], [2.5, 4.5]])
      await settle(async () => (await hint()) !== null && (await hint()).headsD !== null, true)
      const right = await hint()
      assert.equal(right.headsLayer, 'pen-tool-extras-hint', 'the arrowheads are in the hint layer')
      const rightHeads = headsOf(right.headsD)
      assert.ok(rightHeads.length >= 2, `an arrow in each of two cells: ${right.headsD}`)
      assert.ok(rightHeads.every(({ wing, tip }) => tip > wing), 'a drag to the right points right')
      await p.mouse.up()
      assert.equal(await settle(() => read((heads) => document.querySelectorAll(heads).length, HEADS), 0), 0, 'the heads go with the hint')
      await undoAll()
      await holdDrag([[2.5, 4.5], [2.5, 2.5]])
      await settle(async () => (await hint()) !== null && (await hint()).headsD !== null, true)
      const left = headsOf((await hint()).headsD)
      assert.ok(left.length >= 2 && left.every(({ wing, tip }) => tip < wing), 'a drag to the left points left')
      await p.mouse.up()
      await undoAll()
    })
  })

  it('no page error was raised in the whole group', () => {
    assert.deepEqual(errors, [])
  })
})
