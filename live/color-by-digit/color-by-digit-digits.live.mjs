// Live check of Color by Digit's digit colors (the Digit and Both modes) on sudokupad.app, in headless Chromium.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { allFillsOn, ARROW, chipLookOn, coloredCountOn, DEFAULT_FILL, GIVENS, givensColoredOn, labelOn, MENU, MODE_STORAGE_KEY, ODD_EVEN, group, openSession, paletteColorOn, pressTo, savedProfiles, shadeReaders, startInjected, styleOn, watch } from './color-by-digit-fixtures.mjs'
import { gotoPuzzle, PUZZLE_URL } from '../page.mjs'
import { settle } from '../settle.mjs'

const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')
const { shadeOf, shadeOn } = shadeReaders(createRequire(import.meta.url)('../../color-by-digit.user.js'))

// SudokuPad's own color for a given, read off the page with no script installed.
const GIVEN_FILL = 'rgb(0, 0, 0)'
// SudokuPad's red for a mark in the conflict state.
const CONFLICT_RED = 'rgb(179, 58, 58)'
// The active profile: 1 to 5 on palette key 4, 8 and 9 on key 6; 0, 6 and 7 in no group, so they keep SudokuPad's color.
const SPLIT = [group('4', ['1', '2', '3', '4', '5']), group('6', ['8', '9'])]
// The givens Split colors: those of a digit in one of its groups.
const GROUPED_GIVENS = [...GIVENS].filter((d) => SPLIT.some((g) => g.digits.includes(d))).length
const SEEDED_DIGIT = { ...savedProfiles({ profiles: [{ name: 'Split', groups: SPLIT }, { name: 'Odd/Even', groups: ODD_EVEN }], active: 0 }), [MODE_STORAGE_KEY]: 'digit' }
// How far from a mark's box, in screen pixels, a circle may sit and still be that mark's circle. This
// tells which circle belongs to which mark; INK_TOLERANCE is what judges the centring.
const NEAR = 6
// How far, in screen pixels, a circle's centre may be from the centre of its digit's ink.
const INK_TOLERANCE = 1
// The screenshot clip around a mark's box: this many pixels more on the top and left, and on the
// bottom and right, so antialiasing at the digit's edge is inside it.
const CLIP_BEFORE = 3
const CLIP_AFTER = 5
// A pixel is ink when it differs between the two screenshots by at least this fraction of the largest difference.
const INK_FRACTION = 0.5
const CIRCLES = '#color-by-digit-circles'
const INK_PROBE_CSS = `#cell-pencilmarks text, #cell-candidates text, #cell-candidates tspan { visibility: hidden !important } ${CIRCLES} { display: none !important } #cell-pencilmarks [data-ink-probe], #cell-candidates [data-ink-probe] { visibility: visible !important }`
// Per digit, a row with that digit given and two empty cells in it that no other check here fills with a digit, so a mark of the digit
// in either cell is in SudokuPad's conflict state: [row, corner mark's column, centre mark's column].
const CONFLICT_CELLS = {
  1: [1, 1, 2], 2: [5, 1, 2], 3: [4, 6, 7], 4: [4, 1, 2], 5: [7, 0, 1], 6: [2, 0, 3], 7: [8, 5, 6], 8: [3, 1, 2], 9: [1, 7, 8]
}
const CONFLICTING = { corner: '#cell-pencilmarks text.cell-pencilmark.conflict', centre: '#cell-candidates tspan.conflict' }
const STYLE = '#color-by-digit-digits'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('digit colors, saved in Digit, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, decoder, errors
  // The shades of palette keys 4 and 6 (Split's groups) and 1 and 2 (Odd/Even's), read once the page is up.
  const SHADE = {}

  const read = (fn, arg) => p.evaluate(fn, arg)
  const fills = (place, digit, conflict) => styleOn(p, 'fill', place, digit, conflict)
  const allFills = (place, digit, conflict) => allFillsOn(p, place, digit, conflict)
  const coloredCount = () => coloredCountOn(p)
  const givensColored = () => givensColoredOn(p)
  const undoSteps = () => read(() => Framework.app.puzzle.undoStack.length)
  const label = () => labelOn(p)

  // Every circle in the group, as it is drawn: its centre in screen pixels and radius, and whether it paints at all.
  const circles = () => read((sel) => [...document.querySelectorAll(sel + ' circle')].map((c) => {
    const centre = new window.DOMPoint(Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))).matrixTransform(c.getScreenCTM())
    return { cx: centre.x, cy: centre.y, r: Number(c.getAttribute('r')), shown: window.getComputedStyle(c.parentNode).display !== 'none' }
  }), CIRCLES)
  const shownCircles = async () => (await circles()).filter((c) => c.shown).length
  // Circles drawn beyond one per conflicting mark on the board: zero when each mark has its own and no other stands.
  const extraCircles = () => read(([circles, conflicting]) => document.querySelectorAll(circles + ' circle').length - document.querySelectorAll(conflicting).length, [CIRCLES, Object.values(CONFLICTING).join(',')])
  // The middle of each conflicting mark of `digit` in `place` and the middle of every circle, both
  // in screen pixels so the board's own transforms are the page's to apply. A mark's middle here is
  // the middle of the box the browser reports for it: close enough to tell which circle is whose,
  // not to judge the centring, which `inkCentring` does from pixels.
  const middles = (place, digit) => read(([sel, digit]) => {
    return [...document.querySelectorAll(sel)].filter((e) => e.dataset.val === digit).map((e) => {
      const box = e.getBoundingClientRect()
      return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 }
    })
  }, [CONFLICTING[place], digit])
  // How many conflicting marks of `digit` in `place` there are, how many of them have a shown circle
  // beside them, and how many circles are drawn beyond one per conflicting mark on the board.
  const circleState = (place, digit) => async () => {
    const marks = await middles(place, digit)
    const drawn = await circles()
    const withCircle = marks.filter((m) => drawn.some((c) => c.shown && Math.hypot(c.cx - m.cx, c.cy - m.cy) <= NEAR))
    return { marks: marks.length, withCircle: withCircle.length, extra: await extraCircles() }
  }
  const circled = (marks) => ({ marks, withCircle: marks, extra: 0 })

  // The centre, in screen pixels, of the ink of the conflicting `digit` mark in `place`, and of the
  // circle nearest it. The ink is the box of pixels that differ between two screenshots at real size
  // taken with every mark and circle hidden, one with this mark shown: grid lines and neighbouring
  // marks cancel out. A pixel counts as ink when it differs by at least half the largest difference.
  const inkCentring = async (place, digit, index) => {
    const box = await read(([sel, digit, index]) => {
      const mark = [...document.querySelectorAll(sel)].filter((e) => e.dataset.val === digit)[index]
      mark.setAttribute('data-ink-probe', '')
      const { x, y, width, height } = mark.getBoundingClientRect()
      return { x, y, width, height }
    }, [CONFLICTING[place], digit, index])
    const clip = { x: Math.floor(box.x) - CLIP_BEFORE, y: Math.floor(box.y) - CLIP_BEFORE, width: Math.ceil(box.width) + CLIP_BEFORE + CLIP_AFTER, height: Math.ceil(box.height) + CLIP_BEFORE + CLIP_AFTER }
    const drawn = (await circles()).filter((c) => c.shown)
    const probeStyle = await p.addStyleTag({ content: INK_PROBE_CSS })
    let shown, hidden
    try {
      shown = (await p.screenshot({ clip })).toString('base64')
      await read(() => document.querySelector('[data-ink-probe]').removeAttribute('data-ink-probe'))
      hidden = (await p.screenshot({ clip })).toString('base64')
    } finally {
      await read(() => document.querySelectorAll('[data-ink-probe]').forEach((e) => e.removeAttribute('data-ink-probe')))
      await probeStyle.evaluate((e) => e.remove())
    }
    const ink = await decoder.evaluate(async ([a, b, fraction]) => {
      const pixels = async (base64) => {
        const bitmap = await window.createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob())
        const ctx = new window.OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')
        ctx.drawImage(bitmap, 0, 0)
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      }
      const [one, two] = [await pixels(a), await pixels(b)]
      const diff = []
      for (let i = 0; i < one.data.length; i += 4) diff.push(Math.max(...[0, 1, 2].map((k) => Math.abs(one.data[i + k] - two.data[i + k]))))
      const top = Math.max(...diff)
      const inked = diff.map((d, i) => [d, i]).filter(([d]) => d >= fraction * top).map(([, i]) => [i % one.width, Math.floor(i / one.width)])
      const xs = inked.map(([x]) => x)
      const ys = inked.map(([, y]) => y)
      return { top, left: Math.min(...xs), right: Math.max(...xs) + 1, up: Math.min(...ys), down: Math.max(...ys) + 1 }
    }, [shown, hidden, INK_FRACTION])
    assert.ok(ink.top > 0, `${place} ${digit}: the screenshots with and without the mark are identical`)
    const cx = clip.x + (ink.left + ink.right) / 2
    const cy = clip.y + (ink.up + ink.down) / 2
    return drawn.map((c) => ({ dx: c.cx - cx, dy: c.cy - cy })).sort((m, n) => Math.hypot(m.dx, m.dy) - Math.hypot(n.dx, n.dy))[0]
  }

  const select = (r, c) => read(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [r, c])
  const enter = async (r, c, digit) => { await select(r, c); await p.keyboard.press(digit) }
  const markMode = async (id, fn) => { await p.click(id); try { await fn() } finally { await p.click('#control-normal') } }
  const undo = () => p.click('#control-undo')
  const redo = () => p.click('#control-redo')
  const pickProfile = async (index) => {
    await p.click(ARROW)
    await p.locator(`${MENU} [data-act=pick][data-index="${index}"]`).click()
    await p.locator(MENU).waitFor({ state: 'detached' })
  }

  before(async () => {
    ;({ context, p, errors } = await openSession(browser, script, { saved: SEEDED_DIGIT }))
    // A blank page decodes the screenshots: the board's page may refuse a `data:` fetch.
    decoder = await context.newPage()
    await p.locator(STYLE).waitFor({ state: 'attached' })
    for (const key of ['1', '2', '4', '6']) SHADE[key] = await shadeOn(p, key)
  })
  after(async () => { await context.close() })

  it('the button names Digit and draws Split\'s chips white, each digit in its group\'s shade, with a black outline', async () => {
    assert.equal(await label(), 'Digit')
    const want = { cells: [['rgb(255, 255, 255)', await shadeOn(p, '4')], ['rgb(255, 255, 255)', await shadeOn(p, '6')]], outline: 'rgb(0, 0, 0)' }
    assert.deepEqual(await chipLookOn(p), want)
  })

  it('the shades differ from SudokuPad\'s own color and from each other', async () => {
    assert.equal(new Set([DEFAULT_FILL, ...Object.values(SHADE)]).size, 5)
  })

  it('an entered digit of a group shows its group\'s shade, and in Digit no cell is colored', async () => {
    await enter(0, 2, '4')
    assert.deepEqual(await settle(allFills('entered', '4'), [SHADE[4]]), [SHADE[4]])
    assert.deepEqual(await watch(coloredCount), [0])
  })

  it('an entered digit in no group keeps SudokuPad\'s color', async () => {
    await enter(0, 3, '6')
    assert.deepEqual(await settle(allFills('entered', '6'), [DEFAULT_FILL]), [DEFAULT_FILL])
    await undo()
  })

  it('givens keep their color, with a shade set for the same digit', async () => {
    for (const digit of ['5', '4', '8']) assert.deepEqual(await allFills('given', digit)(), [GIVEN_FILL], digit)
  })

  it('corner marks and centre marks take their group\'s shade; a digit in no group keeps SudokuPad\'s color', async () => {
    // Cells chosen so none of these marks conflicts with a given: (0,5) takes 8 and 6, (1,6) takes 8 and 7.
    await markMode('#control-corner', async () => { await enter(0, 5, '8'); await enter(0, 5, '6') })
    await markMode('#control-centre', async () => { await enter(1, 6, '8'); await enter(1, 6, '7') })
    assert.deepEqual(await settle(allFills('corner', '8'), [SHADE[6]]), [SHADE[6]])
    assert.deepEqual(await settle(allFills('centre', '8'), [SHADE[6]]), [SHADE[6]])
    assert.deepEqual(await settle(allFills('corner', '6'), [DEFAULT_FILL]), [DEFAULT_FILL])
    assert.deepEqual(await settle(allFills('centre', '7'), [DEFAULT_FILL]), [DEFAULT_FILL])
  })

  it('conflicting marks keep their shade and get a red circle beside them', async () => {
    await markMode('#control-corner', async () => { await enter(0, 5, '5') })
    await markMode('#control-centre', async () => { await enter(1, 6, '5') })
    // 5 conflicts with the given 5 in row 1, so both marks are in the conflict state.
    for (const place of ['corner', 'centre']) {
      assert.deepEqual(await settle(allFills(place, '5', true), [SHADE[4]]), [SHADE[4]], place)
      assert.deepEqual(await settle(circleState(place, '5'), circled(1)), circled(1), place)
    }
  })

  // Rebuilding every circle on each change cost 2k - 1 nodes for k circles (docs/research/color-by-digit/color-by-digit-redraw-cost.md).
  it('a new conflicting mark adds its own circle; the circles already drawn stay the same nodes and have no attribute rewritten', async () => {
    const tagDrawn = () => read(([circles]) => {
      const drawn = [...document.querySelectorAll(circles + ' circle')]
      drawn.forEach((circle) => circle.setAttribute('data-kept', ''))
      return drawn.length
    }, [CIRCLES])
    const state = () => read(([circles]) => ({ all: document.querySelectorAll(circles + ' circle').length, untagged: document.querySelectorAll(circles + ' circle:not([data-kept])').length }), [CIRCLES])
    // Attribute writes on the tagged circles from now on (a write of the value already there counts).
    const watchWrites = () => read(([circles]) => {
      window.__keptWrites = 0
      const watcher = new window.MutationObserver((records) => { window.__keptWrites += records.filter((r) => r.target.hasAttribute('data-kept')).length })
      watcher.observe(document.querySelector(circles), { subtree: true, attributes: true })
      window.__keptWatcher = watcher
    }, [CIRCLES])
    const writes = () => read(() => { window.__keptWrites += window.__keptWatcher.takeRecords().filter((r) => r.target.hasAttribute('data-kept')).length; return window.__keptWrites })
    const base = await tagDrawn()
    let entered = 0
    try {
      // 5 and 3 each conflict with the same digit given in row 1.
      await markMode('#control-corner', async () => { await enter(0, 7, '5'); entered++ })
      assert.deepEqual(await settle(state, { all: base + 1, untagged: 1 }), { all: base + 1, untagged: 1 })
      await tagDrawn()
      await watchWrites()
      await markMode('#control-corner', async () => { await enter(0, 8, '3'); entered++ })
      assert.deepEqual(await settle(state, { all: base + 2, untagged: 1 }), { all: base + 2, untagged: 1 })
      assert.equal(await writes(), 0, 'a circle already drawn had an attribute written')
    } finally {
      for (; entered > 0; entered--) await undo()
    }
    assert.deepEqual(await settle(state, { all: base, untagged: 0 }), { all: base, untagged: 0 })
  })

  it('every digit 1-9, as a corner mark and a centre mark, has its circle centred on the ink of the digit', async () => {
    const marksOnBoard = () => read(() => document.querySelectorAll('#cell-pencilmarks .cell-pencilmark, #cell-candidates tspan').length)
    const before = await marksOnBoard()
    let entries = 0
    try {
      for (const [digit, [row, cornerColumn, centreColumn]] of Object.entries(CONFLICT_CELLS)) {
        await markMode('#control-corner', async () => { await enter(row, cornerColumn, digit); entries++ })
        await markMode('#control-centre', async () => { await enter(row, centreColumn, digit); entries++ })
      }
      // No deselect here: it is an undo step of its own, so the undos below would stop one short.
      for (const place of ['corner', 'centre']) {
        for (const digit of Object.keys(CONFLICT_CELLS)) {
          // Earlier checks leave their own conflicting marks of some digits, which count too.
          const marks = (await middles(place, digit)).length
          assert.equal(marks >= 1, true, `${place} ${digit}: a conflicting mark was entered`)
          assert.deepEqual(await settle(circleState(place, digit), circled(marks)), circled(marks), `${place} ${digit}`)
          for (let index = 0; index < marks; index++) {
            const { dx, dy } = await inkCentring(place, digit, index)
            const distance = Math.hypot(dx, dy)
            assert.equal(distance <= INK_TOLERANCE, true, `${place} ${digit} #${index}: the circle's centre is (${dx.toFixed(2)}, ${dy.toFixed(2)}) px, ${distance.toFixed(2)} px, from the ink's`)
          }
        }
      }
    } finally {
      // Each undo waits for its mark to go, so a click is never lost to the one before it.
      for (let i = entries - 1; i >= 0; i--) {
        await undo()
        assert.equal(await settle(marksOnBoard, before + i), before + i, 'undo removes the mark')
      }
    }
  })

  // SudokuPad's own layers already pass `pointer-events: none` down, so this cannot go red if the
  // script's rule is removed; the unit test reads that rule. It does fail if a rule gave a circle events.
  it('a circle takes no pointer events: a click at its edge reaches the board', async () => {
    // The circle's right edge, where no digit sits on top of it.
    const hit = await read(([circles]) => {
      const circle = document.querySelector(circles + ' circle')
      const edge = new window.DOMPoint(Number(circle.getAttribute('cx')) + 0.9 * Number(circle.getAttribute('r')), Number(circle.getAttribute('cy')))
      const pt = edge.matrixTransform(circle.getScreenCTM())
      const el = document.elementFromPoint(pt.x, pt.y)
      return { pointerEvents: window.getComputedStyle(circle).pointerEvents, hit: el && el.closest(circles) ? 'circle' : 'board' }
    }, [CIRCLES])
    assert.deepEqual(hit, { pointerEvents: 'none', hit: 'board' })
  })

  // The page's clock changes text every second and redraws the circles anyway, so this reads the
  // circles two frames after the class change, before a tick is likely.
  it('a mark entering or leaving the conflict state with no other change on the page gets or loses its circle at once', async () => {
    // Circles drawn beyond one per conflicting mark, read two frames after each class change.
    const extraAfterToggle = await read(async ([circles, conflicting]) => {
      const extra = () => document.querySelectorAll(circles + ' circle').length - document.querySelectorAll(conflicting).length
      const twoFrames = () => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
      const mark = document.querySelector('#cell-pencilmarks .cell-pencilmark:not(.conflict)')
      mark.classList.add('conflict')
      await twoFrames()
      const entered = extra()
      mark.classList.remove('conflict')
      await twoFrames()
      return [entered, extra()]
    }, [CIRCLES, Object.values(CONFLICTING).join(',')])
    assert.deepEqual(extraAfterToggle, [0, 0])
  })

  it('no circle shows while SudokuPad\'s check pencil marks setting is off, and the marks keep their shade', async () => {
    await read(() => Framework.setSetting('checkpencilmarks', false))
    try {
      for (const place of ['corner', 'centre']) {
        assert.deepEqual(await settle(shownCircles, 0), 0, place)
        assert.deepEqual(await allFills(place, '5', true)(), [SHADE[4]], place)
      }
    } finally {
      await read(() => Framework.setSetting('checkpencilmarks', true))
    }
    assert.deepEqual(await settle(circleState('corner', '5'), circled(1)), circled(1))
  })

  it('a mark that does not conflict has no circle, and a corner mark entering and leaving the conflict state, through undo and redo, gets and loses its circle', async () => {
    assert.deepEqual(await circleState('corner', '8')(), { marks: 0, withCircle: 0, extra: 0 })
    // (0,6) is in row 1 with the given 5.
    await markMode('#control-corner', async () => { await enter(0, 6, '5') })
    assert.deepEqual(await settle(circleState('corner', '5'), circled(2)), circled(2))
    await undo()
    assert.deepEqual(await settle(circleState('corner', '5'), circled(1)), circled(1))
    await redo()
    assert.deepEqual(await settle(circleState('corner', '5'), circled(2)), circled(2))
    await undo()
    assert.deepEqual(await settle(circleState('corner', '5'), circled(1)), circled(1))
  })

  // The circles' own redraw must not queue another redraw. Drawing is counted as childList records
  // on the group over 20 frames; the page clock may cause one honest redraw (two records) in that
  // window, and a loop would cause one every frame.
  it('drawing the circles does not retrigger the drawing', async () => {
    const records = await read(async ([circles]) => {
      let count = 0
      const observer = new window.MutationObserver((list) => { count += list.length })
      observer.observe(document.querySelector(circles), { childList: true })
      for (let i = 0; i < 20; i++) await new Promise((resolve) => window.requestAnimationFrame(resolve))
      observer.disconnect()
      return count
    }, [CIRCLES])
    assert.ok(records <= 6, `${records} childList records on the circles in 20 frames`)
  })

  // (8,2) takes a 1 mark with no conflict; a 1 entered at (8,0), in the same row, puts it in conflict.
  it('a circle goes when SudokuPad clears a conflict and the mark stays, and returns with it', async () => {
    await markMode('#control-corner', async () => { await enter(8, 2, '1') })
    assert.deepEqual(await settle(circleState('corner', '1'), circled(0)), circled(0))
    await enter(8, 0, '1')
    assert.deepEqual(await settle(circleState('corner', '1'), circled(1)), circled(1))
    await p.keyboard.press('Delete')
    assert.deepEqual(await settle(circleState('corner', '1'), circled(0)), circled(0))
    assert.equal(await read(() => document.querySelectorAll('#cell-pencilmarks .cell-pencilmark[data-val="1"]').length), 1)
    await undo()
    assert.deepEqual(await settle(circleState('corner', '1'), circled(1)), circled(1))
    await undo()
    await undo()
    assert.deepEqual(await settle(circleState('corner', '1'), circled(0)), circled(0))
  })

  // (0,5) holds corner 8, 6 and 5; a corner 7 there conflicts with the given 7 in row 1, and 7 is in no group.
  it('a conflicting mark of a digit in no group keeps SudokuPad\'s red fill and still gets the circle', async () => {
    await markMode('#control-corner', async () => { await enter(0, 5, '7') })
    assert.deepEqual(await settle(circleState('corner', '7'), circled(1)), circled(1))
    assert.deepEqual(await allFills('corner', '7', true)(), [CONFLICT_RED])
    await undo()
    assert.deepEqual(await settle(circleState('corner', '7'), circled(0)), circled(0))
  })

  // SudokuPad's replay encodes its undo stack, so the string is not the same after an undo and a
  // redo; this checks that it still encodes the moves. Playback is live/replay-playback.live.mjs's.
  it('SudokuPad\'s own undo and replay are unaffected: the replay still encodes the moves and tracks undo', async () => {
    const replay = () => read(() => Framework.app.getReplay())
    await markMode('#control-corner', async () => { await enter(0, 6, '5') })
    try {
      const recorded = await replay()
      assert.match(recorded, /^\{"type":"clzw"/)
      await undo()
      const undone = await replay()
      assert.match(undone, /^\{"type":"clzw"/)
      assert.notEqual(undone, recorded)
      assert.deepEqual(await settle(circleState('corner', '5'), circled(1)), circled(1))
      await redo()
      assert.deepEqual(await settle(circleState('corner', '5'), circled(2)), circled(2))
    } finally {
      await undo()
    }
  })

  it('undo, redo and a changed digit keep the shades right', async () => {
    const count = (digit) => async () => (await fills('entered', digit)).length
    await enter(0, 8, '4')
    assert.deepEqual(await settle(allFills('entered', '4'), [SHADE[4]]), [SHADE[4]])
    assert.equal(await settle(count('4'), 2), 2)
    await undo()
    assert.equal(await settle(count('4'), 1), 1)
    await redo()
    assert.equal(await settle(count('4'), 2), 2)
    assert.deepEqual(await settle(allFills('entered', '4'), [SHADE[4]]), [SHADE[4]])
    await enter(0, 8, '9')
    assert.deepEqual(await settle(allFills('entered', '9'), [SHADE[6]]), [SHADE[6]])
    assert.equal(await settle(count('4'), 1), 1)
  })

  const expectShadesAfterEntry = async () => {
    assert.deepEqual(await settle(allFills('entered', '4'), [SHADE[4]]), [SHADE[4]])
    assert.deepEqual(await allFills('entered', '9')(), [SHADE[6]])
    assert.deepEqual(await allFills('corner', '8')(), [SHADE[6]])
    assert.deepEqual(await allFills('centre', '8')(), [SHADE[6]])
    assert.deepEqual(await allFills('corner', '6')(), [DEFAULT_FILL])
    assert.deepEqual(await allFills('centre', '7')(), [DEFAULT_FILL])
    for (const place of ['corner', 'centre']) {
      assert.deepEqual(await allFills(place, '5', true)(), [SHADE[4]], place)
      assert.deepEqual(await settle(circleState(place, '5'), circled(1)), circled(1), place)
    }
    assert.deepEqual(await allFills('given', '5')(), [GIVEN_FILL])
  }

  it('the shades survive a reload', async () => {
    await gotoPuzzle(p)
    await startInjected(p, script)
    await expectShadesAfterEntry()
  })

  describe('cases beyond the plain board', { concurrency: false }, () => {
    it('outlines on digits: the shades still apply', async () => {
      await read(() => Framework.setSetting('outlinesondigits', true))
      try {
        await expectShadesAfterEntry()
      } finally {
        await read(() => Framework.setSetting('outlinesondigits', false))
      }
    })

    it('dark mode (prefers-color-scheme: dark): the shades still apply', async () => {
      await p.emulateMedia({ colorScheme: 'dark' })
      try {
        await expectShadesAfterEntry()
      } finally {
        await p.emulateMedia({ colorScheme: 'light' })
      }
    })

    it('a digit on a colored cell keeps its shade', async () => {
      const toggle = () => read(() => {
        const a = Framework.app
        a.deselect(); a.select(a.grid.getCell(0, 2)); a.act({ type: 'colour', arg: '3' }); a.deselect()
      })
      await toggle()
      assert.equal(await settle(() => read(() => Framework.app.grid.getCell(0, 2).colours.length), 1), 1)
      assert.deepEqual(await allFills('entered', '4')(), [SHADE[4]])
      await toggle()
      assert.equal(await settle(coloredCount, 0), 0)
    })

    // Loads through the page's own loader (fetchPuzzle, parsePuzzleData, loadCTCPuzzle), which
    // rebuilds the board in place. The repo holds one puzzle URL, so it is the same puzzle again.
    it('the board rebuilt in the page without a reload still gets the shades', async () => {
      // PuzzleLoader is a top-level binding of the page's script, not a window property.
      await p.addScriptTag({ content: 'window.pageLoader = PuzzleLoader' })
      await read(() => document.querySelectorAll('#cell-givens text').forEach((e) => e.setAttribute('data-old-board', '')))
      await read(async (id) => {
        const { parsePuzzleData, fetchPuzzle } = window.pageLoader
        await Framework.app.loadCTCPuzzle(await parsePuzzleData(await fetchPuzzle(id)))
      }, PUZZLE_URL.replace(/^https?:\/\/[^/]+\//, ''))
      // The old givens are gone once the new board is drawn.
      await p.waitForFunction(() => document.querySelectorAll('#cell-givens text:not([data-old-board])').length > 0)
      await enter(0, 3, '4')
      assert.deepEqual(await settle(allFills('entered', '4'), [SHADE[4]]), [SHADE[4]])
      assert.equal(await p.locator(STYLE).count(), 1)
      // The rebuilt board gets one circle group, and a conflicting mark on it gets its circle.
      await markMode('#control-corner', async () => { await enter(0, 7, '5') })
      // The corner 5 at (0,5) survived the rebuild, so two conflicting corner 5s each have a circle.
      assert.deepEqual(await settle(circleState('corner', '5'), circled(2)), circled(2))
      assert.equal(await p.locator(CIRCLES).count(), 1)
      await undo()
      await undo()
    })
  })

  it('switching profiles recolors the digits at once, adds no undo step and colors no cell', async () => {
    // A click off the board is SudokuPad's own deselect step, so the steps are counted after one.
    await p.click(ARROW)
    await p.keyboard.press('Escape')
    await p.locator(MENU).waitFor({ state: 'detached' })
    const steps = await undoSteps()
    await pickProfile(1)
    // Odd/Even: 4 is even (key 2), 9 and 5 odd (key 1); 6 and 7, in no group of Split, now take a shade too.
    assert.deepEqual(await settle(allFills('entered', '4'), [SHADE[2]]), [SHADE[2]])
    assert.deepEqual(await allFills('entered', '9')(), [SHADE[1]])
    assert.deepEqual(await allFills('corner', '6')(), [SHADE[2]])
    assert.deepEqual(await allFills('centre', '7')(), [SHADE[1]])
    assert.deepEqual(await allFills('corner', '5', true)(), [SHADE[1]])
    assert.equal(await undoSteps(), steps)
    assert.deepEqual(await watch(coloredCount), [0])
    await pickProfile(0)
    assert.deepEqual(await settle(allFills('entered', '4'), [SHADE[4]]), [SHADE[4]])
  })

  it('a press steps Digit to Both: cells take their group colors and the digits keep their shades and circles', async () => {
    await pressTo(p, 'Both')
    assert.equal(await settle(givensColored, GROUPED_GIVENS), GROUPED_GIVENS)
    await expectShadesAfterEntry()
  })

  it('a press steps Both to Off: the cells\' group colors come off, the digits take SudokuPad\'s color, and no circle shows', async () => {
    await pressTo(p, 'Off')
    assert.equal(await settle(coloredCount, 0), 0)
    assert.deepEqual(await settle(allFills('entered', '4'), [DEFAULT_FILL]), [DEFAULT_FILL])
    assert.deepEqual(await allFills('corner', '8')(), [DEFAULT_FILL])
    assert.deepEqual(await allFills('corner', '5', true)(), [CONFLICT_RED])
    assert.equal(await settle(shownCircles, 0), 0)
  })

  it('in Cell, cells are colored, the digits keep SudokuPad\'s color, and a conflict shows as SudokuPad draws it', async () => {
    await pressTo(p, 'Cell')
    assert.equal(await settle(givensColored, GROUPED_GIVENS), GROUPED_GIVENS)
    assert.deepEqual(await watch(allFills('entered', '4')), [[DEFAULT_FILL]])
    assert.deepEqual(await allFills('centre', '8')(), [DEFAULT_FILL])
    assert.deepEqual(await allFills('centre', '5', true)(), [CONFLICT_RED])
    assert.deepEqual(await watch(shownCircles), [0])
  })

  it('a press steps Cell to Digit: the group colors come off the cells and the shades and circles come back', async () => {
    await pressTo(p, 'Digit')
    assert.equal(await settle(coloredCount, 0), 0)
    await expectShadesAfterEntry()
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

// A palette saved on the page (as a puzzle's own palette or SudokuPad's Import Color Palette leaves it): key 4 is a pink.
describe('digit colors from the palette the page shows, injected after Start Puzzle', { concurrency: false }, () => {
  const PINK = 'rgb(232, 124, 241)'
  let context, p, errors

  before(async () => {
    ;({ context, p, errors } = await openSession(browser, script, { saved: SEEDED_DIGIT }))
    await p.evaluate((pink) => {
      const palette = JSON.parse(JSON.stringify(Framework.app.tools.colour.palette))
      palette.colors['4'] = pink
      Framework.app.tools.colour.savePalette(palette)
    }, PINK)
    await gotoPuzzle(p)
    await startInjected(p, script)
  })
  after(async () => { await context.close() })

  it('a digit takes the shade of its group\'s color as the page shows it', async () => {
    assert.equal(await paletteColorOn(p, '4'), PINK)
    await p.evaluate(() => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(0, 2)) })
    await p.keyboard.press('4')
    const shade = shadeOf(PINK)
    assert.deepEqual(await settle(allFillsOn(p, 'entered', '4'), [shade]), [shade])
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})
