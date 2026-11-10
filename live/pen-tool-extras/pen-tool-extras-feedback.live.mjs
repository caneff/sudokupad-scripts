// Live check of pen-tool-extras.user.js's feedback before a gesture lands, on sudokupad.app in headless Chromium: the right-click erase's lack of a preview and its Escape (#546 rows 1 and 7),
// and the drag highlight in the pen's style (row 5). Every press, move and key is real input; each check reads the page's computed
// style and what is stored (`cell.pen`).
/* global Framework, getComputedStyle */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import * as extras from './pen-tool-extras-fixtures.mjs'
import { captureConsoleErrors, restartPuzzle } from '../page.mjs'
import { gridPoint, undoAll } from '../board.mjs'
import { drag, goToPenPage, openPenTool, penEntries } from '../pen.mjs'
import { settle } from '../settle.mjs'
import { useBrowser } from '../session.mjs'

const KEYS = ['PenColor_pen', 'PenColor_colors', 'PenColor_thickness', 'PenColor_opacity', 'ToolPen_color', 'PenColor_middleerase']
const HEADS = '.pen-tool-extras-hint-arrows'

const browser = useBrowser()

describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors, reader

  const read = (fn, arg) => p.evaluate(fn, arg)
  const moveTo = async (point) => { await p.mouse.move(...await gridPoint(p, point)) }
  // What dims a stroke while a press is held, whatever it is named: a pen stroke element outside the pen, marks and hint layers (a copy drawn beside them), or a stroke in them under 1 of its own opacity.
  const dimming = () => read(() => {
    const own = [...document.querySelectorAll('#cell-pen .cell-pen, #pen-tool-extras-marks .cell-pen')]
    return {
      copies: document.querySelectorAll('.cell-pen').length - document.querySelectorAll('#cell-pen .cell-pen, #pen-tool-extras-marks .cell-pen, #pen-tool-extras-hint .cell-pen').length,
      under1: own.filter((el) => getComputedStyle(el).opacity !== '1').length
    }
  })
  const NOT_DIMMED = { copies: 0, under1: 0 }
  const pixelAt = async (x, y) => {
    const png = await p.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 } })
    const color = await reader.evaluate(async (b64) => {
      const img = new window.Image()
      img.src = 'data:image/png;base64,' + b64
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
    }, png.toString('base64'))
    await p.bringToFront() // the second page took the focus, and a drag on this one then draws nothing
    return color
  }
  // A white rectangle under the pen layer: the page behind the board is transparent in the screenshot, so a stroke drawn under 1 opacity would read black over it.
  const back = () => read(() => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.id = 'live-backing'
    for (const [name, value] of [['x', -100], ['y', -100], ['width', 1000], ['height', 1000], ['fill', '#fff']]) rect.setAttribute(name, value)
    document.querySelector('#cell-pen').before(rect)
  })
  const unback = () => read(() => document.getElementById('live-backing')?.remove())
  const sameColor = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 2)

  const selectPenOnPage = async (page, key) => {
    await openPenTool(p)
    await goToPenPage(p, extras.PAGES[page])
    await p.locator(`.tool-pen button[data-key="${key}"]`).click()
  }

  before(async () => {
    ;({ context, p, errors } = await extras.open(browser(), { seed: captureConsoleErrors }))
    reader = await context.newPage()
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), KEYS)
  })
  after(async () => {
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), KEYS)
    await context.close()
  })

  describe('row 1: the right-click erase dims nothing while the button is held', () => {
    it('a press on a line leaves every stroke at full opacity with no copy, and the release erases the whole line', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(1, 3)
      await drag(p, [[2.5, 2.5], [2.5, 4.5]])
      const line = await penEntries(p)
      await selectPenOnPage(1, 6)
      await drag(p, [[6.5, 2.5], [6.5, 3.5]])
      const other = (await penEntries(p)).filter((v) => !line.includes(v))
      await moveTo([2.5, 3.0])
      await p.mouse.down({ button: 'right' })
      await sleep(200) // "nothing happened in 200 ms" check: a preview would have drawn by now
      assert.deepEqual(await dimming(), NOT_DIMMED, 'the pressed line is not dimmed')
      assert.deepEqual(await penEntries(p), [...line, ...other].sort(), 'nothing is erased before the release')
      await p.mouse.up({ button: 'right' })
      assert.deepEqual(await settle(() => penEntries(p), other), other, 'the release erases the line')
      await undoAll(p)
    })

    it('a mark under the press and a line the pointer is dragged across stay at full opacity until the release erases both', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(1, 3)
      await p.mouse.click(...await gridPoint(p, [3.5, 4.0]))
      await drag(p, [[6.5, 2.5], [6.5, 4.5]])
      const marked = await penEntries(p)
      assert.equal(marked.filter((v) => v.startsWith('3,3:')).length, 1, 'the edge mark is stored')
      await moveTo([3.5, 4.0])
      await p.mouse.down({ button: 'right' })
      await p.mouse.move(...await gridPoint(p, [6.5, 3.0]), { steps: 8 })
      await sleep(200) // "nothing happened in 200 ms" check
      assert.deepEqual(await dimming(), NOT_DIMMED, 'neither the mark nor the crossed line is dimmed')
      assert.deepEqual(await penEntries(p), marked, 'nothing is erased before the release')
      await p.mouse.up({ button: 'right' })
      assert.deepEqual(await settle(() => penEntries(p), []), [], 'the release erases both')
      await undoAll(p)
    })
  })

  describe('row 7: Escape while the right button is held cancels the erase', () => {
    it('nothing is erased, nothing dims, and a later release or move does nothing', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(1, 3)
      await drag(p, [[2.5, 2.5], [2.5, 4.5]])
      await drag(p, [[5.5, 2.5], [5.5, 4.5]])
      const lines = await penEntries(p)
      const depth = await read(() => Framework.app.puzzle.undoStack.length)
      await moveTo([2.5, 3.0])
      await p.mouse.down({ button: 'right' })
      await p.keyboard.press('Escape')
      await p.mouse.move(...await gridPoint(p, [5.5, 3.0]), { steps: 8 })
      assert.deepEqual(await dimming(), NOT_DIMMED, 'the drag after Escape dims nothing')
      await p.mouse.up({ button: 'right' })
      await sleep(200) // "nothing happened in 200 ms" check
      assert.deepEqual(await penEntries(p), lines, 'nothing was erased')
      assert.equal(await read(() => Framework.app.puzzle.undoStack.length), depth, 'no undo step')
      await p.mouse.click(5, 5)
      await undoAll(p)
    })
  })

  describe('hovering draws nothing until the click', () => {
    it('over an edge, a grid corner and a cell middle, with the pen tool on, no stroke is added or dimmed, then the click places its mark', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(1, 3)
      const strokes = () => read(() => document.querySelectorAll('#cell-pen .cell-pen, #pen-tool-extras-hint .cell-pen, #pen-tool-extras-marks .cell-pen').length)
      const before = await strokes()
      for (const point of [[3.5, 4.0], [7.0, 7.0], [5.5, 5.5]]) {
        await moveTo([point[0], point[1] + 0.02])
        await moveTo(point)
        await sleep(200) // "nothing happened in 200 ms" check
        assert.equal(await strokes(), before, `no stroke drawn while hovering ${point}`)
        assert.deepEqual(await dimming(), NOT_DIMMED, `nothing dimmed while hovering ${point}`)
      }
      await p.mouse.click(...await gridPoint(p, [3.5, 4.0]))
      assert.equal(await settle(() => penEntries(p).then((all) => all.length), 1), 1, 'the click still places its mark')
      await undoAll(p)
    })
  })

  describe('row 5: the drag highlight shows the pen\'s style', () => {
    const hint = () => read((heads) => {
      const el = document.querySelector('.penhint')
      if (!el) return null
      const arrows = document.querySelector(heads)
      return { dash: getComputedStyle(el).strokeDasharray, width: getComputedStyle(el).strokeWidth, headsD: arrows ? arrows.getAttribute('d') : null, headsLayer: arrows ? arrows.parentNode.id : null, headsFill: arrows ? getComputedStyle(arrows).fill : null, linePen: /pencolor-(\S+)/.exec(el.getAttribute('class'))[1] }
    }, HEADS)
    // Presses at the first point and drags through the rest, moving on in small steps until SudokuPad has drawn its hint (a puzzle still being redrawn misses the first moves).
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
      assert.equal(await settle(() => penEntries(p).then((all) => all.length), 2), 2, 'the drag still draws its two segments')
      await undoAll(p)
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
      await undoAll(p)
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
      await undoAll(p)
      await holdDrag([[2.5, 4.5], [2.5, 2.5]])
      await settle(async () => (await hint()) !== null && (await hint()).headsD !== null, true)
      const left = headsOf((await hint()).headsD)
      assert.ok(left.length >= 2 && left.every(({ wing, tip }) => tip < wing), 'a drag to the left points left')
      await p.mouse.up()
      await undoAll(p)
    })

    it('an arrow pen\'s drag hint shows the same color where an arrowhead overlaps the line as the line alone', async () => {
      await restartPuzzle(p)
      await selectPenOnPage(3, 3)
      await holdDrag([[2.5, 2.5], [2.5, 4.5]])
      await settle(async () => (await hint()) !== null && (await hint()).headsD !== null, true)
      await back()
      // The first arrowhead's middle, in screen pixels.
      const [x, y] = await read((heads) => {
        const el = document.querySelector(heads)
        const nums = el.getAttribute('d').match(/M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)Z/).slice(1).map(Number)
        const point = el.ownerSVGElement.createSVGPoint()
        point.x = (nums[0] + nums[2] + nums[4]) / 3
        point.y = (nums[1] + nums[3] + nums[5]) / 3
        const at = point.matrixTransform(el.getScreenCTM())
        return [at.x, at.y]
      }, HEADS)
      const withHeads = await pixelAt(x, y)
      await read((heads) => { document.querySelector(heads).style.visibility = 'hidden' }, HEADS)
      const lineOnly = await pixelAt(x, y)
      assert.ok(sameColor(withHeads, lineOnly), `an arrowhead over the line ${withHeads} matches the line alone ${lineOnly}`)
      await p.mouse.up()
      await unback()
      await undoAll(p)
      await p.mouse.click(5, 5) // as above
    })
  })

  it('page 3: an arrow pen\'s erasing drag has the red solid hint and no arrowheads', async () => {
    await restartPuzzle(p)
    await selectPenOnPage(3, 3)
    await drag(p, [[2.5, 2.5], [2.5, 4.5]])
    await p.mouse.click(5, 5) // a click off the grid, or a drag started right after a release draws nothing
    await p.mouse.move(...await gridPoint(p, [2.5, 2.5]))
    await p.mouse.down()
    for (let i = 0; i < 20 && (await read(() => document.querySelector('.penhint'))) === null; i++) await p.mouse.move(...await gridPoint(p, [2.5, 4.5]), { steps: 10 })
    const erasing = await read(() => ({ red: document.querySelector('.penhint').classList.contains('pencolor-erase'), heads: document.querySelectorAll('.pen-tool-extras-hint-arrows').length }))
    assert.deepEqual(erasing, { red: true, heads: 0 })
    await p.mouse.up()
    await undoAll(p)
  })

  it('no page error was raised in the whole group', () => {
    assert.deepEqual(errors, [])
  })
})
