// Live check of draw-tool.user.js's panel on sudokupad.app: Draw's nine colors copied from the pen colors on first use, the
// short color buttons, the controls row (Clear all, Shape and the gear) and the sliders inside the keypad's height at 1200 px and 390 px, the digit keys,
// a hold that opens the color pickers and a recolor of items already drawn, the choices kept over a reload, and SudokuPad's
// own keypad back under another tool.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from './page.mjs'
import { gridPoint, mouseDrag, plantUnchecked } from './pen.mjs'
import { clickUntil, settle, SETTLE_MS } from './settle.mjs'

const { CLEAR_BUTTON, COLOR_KEY, COLORS_KEY, DIGIT_BUTTON, OPACITY_KEY, OPACITY_SLIDER, PICKER, SETTINGS_BUTTON, SHAPE_BUTTON, SIZE_SLIDER, SLIDERS, STROKES, WIDTH_KEY } = draw
const { HOLD_TO_EDIT_MS } = createRequire(import.meta.url)('../draw-tool.user.js')
// The pickers appear only when the hold timer fires.
const HOLD_WAIT_MS = HOLD_TO_EDIT_MS + 5000
// r1c3 of the recorded puzzle, empty.
const EMPTY_CELL = [0, 2]
const NEAR_PX = 0.5
const NINE = [1, 2, 3, 4, 5, 6, 7, 8, 9]
// #rrggbb as the browser computes it.
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// The keypad's rectangle, and the lowest and highest edge of anything shown in it.
const keypadBox = (p) => p.evaluate(() => {
  const panel = document.querySelector('.controls-input')
  const box = panel.getBoundingClientRect()
  const parts = [...panel.querySelectorAll('*')].map((e) => e.getBoundingClientRect()).filter((r) => r.width * r.height > 0)
  return { top: box.top, bottom: box.bottom, height: box.height, partsTop: Math.min(...parts.map((r) => r.top)), partsBottom: Math.max(...parts.map((r) => r.bottom)) }
})

for (const viewport of [{ width: 1200, height: 900 }, { width: 390, height: 844 }]) {
  describe(`Draw Tool's panel at ${viewport.width} px`, { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport } }))
      await draw.boot(p)
    })
    after(async () => { await context.close() })

    it('keeps the height SudokuPad gives Draw\'s keypad, and its buttons, the controls row and the sliders all fit inside it', async () => {
      await draw.pickDraw(p)
      await p.locator(SLIDERS).waitFor({ state: 'visible' })
      // SudokuPad's own keypad for Draw: the script's stylesheet off and the parts it adds hidden, for one reading.
      const own = await p.evaluate(([styleId, parts]) => {
        const style = document.getElementById(styleId)
        const added = [...document.querySelectorAll(parts)]
        style.disabled = true
        added.forEach((e) => { e.style.display = 'none' })
        const height = document.querySelector('.controls-input').getBoundingClientRect().height
        style.disabled = false
        added.forEach((e) => { e.style.display = '' })
        return height
      }, ['draw-tool-style', '.draw-tool-tray, .draw-tool-clear, .draw-tool-shape-mode, .draw-tool-settings, .draw-tool-sliders'])
      const panel = await keypadBox(p)
      assert.equal(Math.abs(panel.height - own) <= NEAR_PX, true, `the panel is ${panel.height} px tall, SudokuPad's keypad ${own} px`)
      assert.equal(panel.partsTop >= panel.top - NEAR_PX, true, `the top part ${panel.partsTop} starts inside the panel's top ${panel.top}`)
      assert.equal(panel.partsBottom <= panel.bottom + NEAR_PX, true, `the bottom part ${panel.partsBottom} ends inside the panel's bottom ${panel.bottom}`)
    })

    it('the color buttons are short, three to a row, and Clear all, Shape and the gear sit full height in the row under them, with the sliders under that', async () => {
      const rect = (selector) => p.locator(selector).evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom } })
      const keys = await Promise.all(NINE.map((n) => rect(`.controls-input button[data-key="${n}"]`)))
      const [clear, shape, gear, sliders] = await Promise.all([CLEAR_BUTTON, SHAPE_BUTTON, SETTINGS_BUTTON, SLIDERS].map(rect))
      for (const [i, k] of keys.entries()) assert.equal(Math.abs(k.height / k.width - 2.5 / 4) < 0.01, true, `key ${i + 1} is 2.5 by 4: ${JSON.stringify(k)}`)
      assert.deepEqual([keys[1].y, keys[2].y], [keys[0].y, keys[0].y], 'keys 1 to 3 share a row')
      assert.equal(keys[3].y > keys[0].y && keys[6].y > keys[3].y, true, 'keys 4 and 7 start the next rows')
      for (const control of [clear, shape, gear]) {
        assert.equal(Math.abs(control.width - keys[0].width) <= NEAR_PX && Math.abs(control.height - keys[0].width) <= NEAR_PX, true, `a full-size square: ${JSON.stringify(control)}`)
        assert.equal(control.y > keys[8].bottom, true, 'under the colors')
      }
      assert.equal(Math.abs(clear.x - keys[6].x) <= NEAR_PX, true, 'Clear all is under key 7')
      assert.equal(Math.abs(shape.x - keys[7].x) <= NEAR_PX, true, 'Shape is under key 8')
      assert.equal(Math.abs(gear.x - keys[8].x) <= NEAR_PX, true, 'the gear is under key 9')
      assert.equal(sliders.y >= clear.bottom, true, 'the sliders are under the controls')
    })

    it('the page raised no error', () => { assert.deepEqual(errors, []) })
  })
}

describe('Draw Tool\'s colors and sliders', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const tool = () => draw.tool(p)
  const pickDraw = () => draw.pickDraw(p)
  const pickDigit = () => clickUntil(() => p.click(DIGIT_BUTTON), tool, 'normal', SETTLE_MS)
  const reload = () => draw.reload(p)
  // The keypad's digit buttons, 1 to 9: the color of the line each shows and whether it is marked current.
  const keypad = () => read(() => [...document.querySelectorAll('.controls-input button.digit')]
    .filter((b) => b.dataset.key !== '0')
    .map((b) => {
      const after = window.getComputedStyle(b, '::after')
      return { key: b.dataset.key, current: b.classList.contains('current'), swatch: after.content === 'none' ? null : after.backgroundColor, text: window.getComputedStyle(b).color }
    }))
  const penColor = (n) => read((i) => window.getComputedStyle(document.documentElement).getPropertyValue(`--puzzle-pencolor-${i}`).trim(), n)
  const currentKey = async () => (await keypad()).filter((b) => b.current).map((b) => b.key)
  const sliderValue = (selector) => read((s) => Number(document.querySelector(s).value), selector)
  const saved = () => draw.saved(p)
  const savedColors = () => read((key) => Framework.getData(key) ?? null, COLORS_KEY)
  // The computed stroke color, width and opacity of the last stroke drawn.
  const lastStroke = () => read((selector) => {
    const style = window.getComputedStyle([...document.querySelectorAll(selector)].pop())
    return { stroke: style.stroke, width: style.strokeWidth, opacity: style.strokeOpacity }
  }, STROKES)
  // The width and opacity of the first stroke on the board, drawn before any slider moved.
  const firstLook = () => read((selector) => {
    const style = window.getComputedStyle(document.querySelector(selector))
    return { width: style.strokeWidth, opacity: style.strokeOpacity }
  }, STROKES)
  const strokeColors = () => read((selector) => [...document.querySelectorAll(selector)].map((e) => window.getComputedStyle(e).stroke), STROKES)
  const drawStroke = async () => {
    const before = await p.locator(STROKES).count()
    await mouseDrag(p, [[4.5, 1.5], [5.2, 3], [4.4, 4.5]])
    assert.equal(await p.locator(STROKES).count(), before + 1, 'the drag drew a stroke')
  }
  const selectEmptyCell = async () => {
    await pickDigit()
    await p.evaluate(() => Framework.app.deselect())
    await p.mouse.click(...await gridPoint(p, EMPTY_CELL.map((v) => v + 0.5)))
    assert.equal(await read(() => Framework.app.puzzle.selectedCells.length), 1)
  }
  const emptyCellValue = () => read(([r, c]) => Framework.app.grid.getCell(r, c).propGet('normal') ?? null, EMPTY_CELL)
  // A press held on the middle of `selector` with `button`, until `selector` of the pickers reaches `state`.
  const hold = async (selector, button, state) => {
    const box = await p.locator(selector).boundingBox()
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await p.mouse.down({ button })
    try {
      await p.locator(PICKER).first().waitFor({ state, timeout: HOLD_WAIT_MS })
    } finally {
      await p.mouse.up({ button })
    }
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), [COLOR_KEY, WIDTH_KEY, OPACITY_KEY, COLORS_KEY])
    await reload()
  })
  after(async () => { await context.close() })

  it('nothing is saved for Draw\'s colors until Draw is first made current, which copies the nine pen colors and saves them', async () => {
    assert.equal(await savedColors(), null)
    const pens = await Promise.all(NINE.map(penColor))
    await pickDraw()
    const colors = await savedColors()
    assert.deepEqual(NINE.map((n) => rgb(colors[n])), pens.map((c) => c.replace(/^rgb\(-\d+, -\d+, -\d+\)$/, 'rgb(0, 0, 0)')))
  })

  it('with Draw current the keypad shows a line in each of Draw\'s colors, digits hidden, with color 1 marked, the default Size and Opacity, Clear all and the gear', async () => {
    const colors = await savedColors()
    const buttons = await keypad()
    assert.deepEqual(buttons.map((b) => b.swatch), NINE.map((n) => rgb(colors[n])))
    assert.deepEqual(buttons.map((b) => b.text), Array(9).fill('rgba(0, 0, 0, 0)'), 'the digits are not shown')
    assert.deepEqual(await currentKey(), ['1'])
    assert.equal(await p.locator(`${SLIDERS} input[type=range]`).count(), 2)
    assert.deepEqual([await sliderValue(SIZE_SLIDER), await sliderValue(OPACITY_SLIDER)], [6, 100])
    assert.equal(await p.locator(CLEAR_BUTTON).isVisible(), true)
    assert.equal(await p.locator(CLEAR_BUTTON).getAttribute('title'), 'Clear all')
    assert.equal(await p.locator(CLEAR_BUTTON).getAttribute('aria-label'), 'Clear all')
    assert.equal(await p.locator(`${CLEAR_BUTTON} svg`).count(), 1, 'Clear all is an icon')
    assert.equal(await p.locator(CLEAR_BUTTON).innerText(), '', 'Clear all shows no text')
    const [clearColor, gearColor] = await Promise.all([CLEAR_BUTTON, SETTINGS_BUTTON].map((s) => p.locator(s).evaluate((e) => window.getComputedStyle(e).color)))
    assert.equal(clearColor, gearColor, 'Clear all is the same purple as the gear')
    assert.equal(await p.locator(SETTINGS_BUTTON).getAttribute('title'), 'Draw Tool settings')
    assert.equal(await p.locator('.controls-input button[data-key="0"]').isVisible(), false)
    assert.equal(await p.locator('.controls-input button[data-control="delete"]').isVisible(), false)
  })

  it('clicking a color button marks it, and the next stroke draws in it', async () => {
    await p.click('.controls-input button[data-key="4"]')
    assert.deepEqual(await settle(currentKey, ['4']), ['4'])
    await drawStroke()
    assert.equal((await lastStroke()).stroke, rgb((await savedColors())[4]))
  })

  it('a digit key picks its color and enters nothing in the selected cell', async () => {
    await selectEmptyCell()
    await pickDraw()
    const replay = await read(() => Framework.app.getReplay())
    await p.keyboard.press('6')
    assert.deepEqual(await settle(currentKey, ['6']), ['6'])
    assert.equal(await emptyCellValue(), null, 'no digit in r1c3')
    assert.equal(await read(() => Framework.app.getReplay()), replay)
    await drawStroke()
    assert.equal((await lastStroke()).stroke, rgb((await savedColors())[6]))
  })

  it('a slider sets the next stroke only: earlier strokes keep their width and opacity', async () => {
    assert.deepEqual(await firstLook(), { width: '6px', opacity: '1' })
    await p.locator(SIZE_SLIDER).fill('10.5')
    await p.locator(OPACITY_SLIDER).fill('45')
    await drawStroke()
    const look = await lastStroke()
    assert.deepEqual([look.width, look.opacity], ['10.5px', '0.45'])
    assert.deepEqual(await firstLook(), { width: '6px', opacity: '1' }, 'the earlier stroke did not change')
  })

  it('a stroke drawn with the sliders is saved with its width and opacity', async () => {
    const items = await saved()
    const last = items[items.length - 1]
    assert.deepEqual([last.width, last.opacity], [10.5, 45])
  })

  it('a later change of a pen color leaves Draw\'s color, its button and its strokes as they were', async () => {
    const draw2 = rgb((await savedColors())[2])
    await read(() => document.documentElement.style.setProperty('--puzzle-pencolor-2', 'rgb(1, 2, 3)'))
    try {
      assert.equal((await keypad())[1].swatch, draw2)
      await p.keyboard.press('2')
      await drawStroke()
      assert.equal((await lastStroke()).stroke, draw2)
    } finally {
      await read(() => document.documentElement.style.removeProperty('--puzzle-pencolor-2'))
    }
  })

  it('a hold of a second on a color button puts a color picker over each, holding each one\'s color', async () => {
    assert.equal(await p.locator(PICKER).count(), 0)
    await hold('.controls-input button[data-key="4"]', 'left', 'visible')
    const colors = await savedColors()
    assert.deepEqual(await p.locator(PICKER).evaluateAll((inputs) => inputs.map((i) => [Number(i.dataset.color), i.value])), NINE.map((n) => [n, colors[n]]))
  })

  it('a picked color applies at once to the button and to every stroke already drawn in that color, and is saved', async () => {
    const before = await strokeColors()
    const old4 = rgb((await savedColors())[4])
    assert.equal(before.includes(old4), true, 'a stroke in color 4 is on the board')
    await p.locator(`${PICKER}[data-color="4"]`).fill('#123456')
    assert.deepEqual(await settle(strokeColors, before.map((c) => c === old4 ? 'rgb(18, 52, 86)' : c)), before.map((c) => c === old4 ? 'rgb(18, 52, 86)' : c))
    assert.equal((await keypad())[3].swatch, 'rgb(18, 52, 86)')
    assert.equal((await savedColors())[4], '#123456')
  })

  it('a right-button hold on a picker takes the pickers away', async () => {
    await hold(`${PICKER}[data-color="1"]`, 'right', 'detached')
    assert.equal(await p.locator(PICKER).count(), 0)
  })

  it('the colors, the color picked and the slider values come back after a reload', async () => {
    const strokes = await strokeColors()
    await p.keyboard.press('7')
    await p.locator(SIZE_SLIDER).fill('14')
    await p.locator(OPACITY_SLIDER).fill('60')
    await reload()
    assert.deepEqual(await strokeColors(), strokes, 'the strokes keep the recolor before Draw is made current')
    await pickDraw()
    assert.deepEqual(await currentKey(), ['7'])
    assert.equal((await keypad())[3].swatch, 'rgb(18, 52, 86)')
    assert.deepEqual([await sliderValue(SIZE_SLIDER), await sliderValue(OPACITY_SLIDER)], [14, 60])
    await drawStroke()
    assert.deepEqual(await lastStroke(), { stroke: rgb((await savedColors())[7]), width: '14px', opacity: '0.6' })
  })

  it('bad saved values read as color 1 and the default Size and Opacity', async () => {
    await plantUnchecked(p, COLOR_KEY, '"purple"')
    await plantUnchecked(p, WIDTH_KEY, '7.25')
    await plantUnchecked(p, OPACITY_KEY, '3')
    await reload()
    await pickDraw()
    assert.deepEqual(await currentKey(), ['1'])
    assert.deepEqual([await sliderValue(SIZE_SLIDER), await sliderValue(OPACITY_SLIDER)], [6, 100])
    await drawStroke()
    assert.deepEqual(await lastStroke(), { stroke: rgb((await savedColors())[1]), width: '6px', opacity: '1' })
  })

  it('another tool gets SudokuPad\'s own keypad back, and its digit keys enter digits again', async () => {
    await selectEmptyCell()
    assert.equal(await p.locator(SIZE_SLIDER).count(), 0, 'no Size slider')
    assert.equal(await p.locator(`${CLEAR_BUTTON}, ${SHAPE_BUTTON}, ${SETTINGS_BUTTON}`).count(), 0, 'no Clear all, Shape or gear')
    const buttons = await keypad()
    assert.deepEqual(buttons.map((b) => b.swatch), Array(9).fill(null), 'no color lines')
    assert.deepEqual(buttons.map((b) => b.current), Array(9).fill(false), 'no color marked')
    assert.equal(await p.locator('.controls-input button[data-key="0"]').isVisible(), true)
    assert.equal(await p.locator('.controls-input button[data-control="delete"]').isVisible(), true)
    await p.keyboard.press('5')
    assert.equal(await settle(emptyCellValue, '5'), '5')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
