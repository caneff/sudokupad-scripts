// Live check of draw-tool.user.js's panel on sudokupad.app: the nine colors copied from the pen colors on first use, the nine "Aa" color buttons,
// the controls row (Clear all, Background and the gear) and the Size and Transparency sliders inside the keypad's height at the two desktop sizes, the digit keys,
// a hold that opens the color pickers and a recolor of notes already made, the choices kept over a reload, and SudokuPad's
// own keypad back under another tool.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as draw from './draw-tool-fixtures.mjs'
import { plantUnchecked } from '../pen.mjs'
import { clickUntil, settle, SETTLE_MS } from '../settle.mjs'
import { useBrowser } from '../session.mjs'
import { gridPoint, typeText } from '../board.mjs'

const { BACKGROUND_BUTTON, BACKGROUND_KEY, CLEAR_BUTTON, COLOR_KEY, COLORS_KEY, DIGIT_BUTTON, NEAR_PX, NINE, PICKER, SETTINGS_BUTTON, SIZE_SLIDER, OPACITY_SLIDER, SLIDERS, TEXTS, WIDTH_KEY, slideTo, valueOf } = draw
// r1c3 of the recorded puzzle, empty.
const EMPTY_CELL = [0, 2]
// #rrggbb as the browser computes it.
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

const browser = useBrowser()

// The keypad's rectangle, and the lowest and highest edge of anything shown in it.
const keypadBox = (p) => p.evaluate(() => {
  const panel = document.querySelector('.controls-input')
  const box = panel.getBoundingClientRect()
  const parts = [...panel.querySelectorAll('*')].map((e) => e.getBoundingClientRect()).filter((r) => r.width * r.height > 0)
  return { top: box.top, bottom: box.bottom, height: box.height, partsTop: Math.min(...parts.map((r) => r.top)), partsBottom: Math.max(...parts.map((r) => r.bottom)) }
})

for (const viewport of [{ width: 1200, height: 900 }, { width: 1280, height: 720 }]) {
  describe(`Text Anywhere's panel at ${viewport.width} px`, { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ;({ context, p, errors } = await draw.open(browser(), { contextOptions: { viewport } }))
    })
    after(async () => { await context.close() })

    it('keeps the height SudokuPad gives the keypad, and its buttons, the controls row and the sliders all fit inside it', async () => {
      await draw.pickDraw(p)
      await p.locator(SLIDERS).waitFor({ state: 'visible' })
      // SudokuPad's own keypad for this tool: the script's stylesheet off and the parts it adds hidden, for one reading.
      const own = await p.evaluate(([styleId, parts]) => {
        const style = document.getElementById(styleId)
        const added = [...document.querySelectorAll(parts)]
        style.disabled = true
        added.forEach((e) => { e.style.display = 'none' })
        const height = document.querySelector('.controls-input').getBoundingClientRect().height
        style.disabled = false
        added.forEach((e) => { e.style.display = '' })
        return height
      }, ['draw-tool-style', '.draw-tool-tray, .draw-tool-clear, .draw-tool-background, .draw-tool-settings, .draw-tool-sliders'])
      const panel = await keypadBox(p)
      assert.equal(Math.abs(panel.height - own) <= NEAR_PX, true, `the panel is ${panel.height} px tall, SudokuPad's keypad ${own} px`)
      assert.equal(panel.partsTop >= panel.top - NEAR_PX, true, `the top part ${panel.partsTop} starts inside the panel's top ${panel.top}`)
      assert.equal(panel.partsBottom <= panel.bottom + NEAR_PX, true, `the bottom part ${panel.partsBottom} ends inside the panel's bottom ${panel.bottom}`)
    })

    it('the color buttons are short, three to a row, and Clear all, Background and the gear sit full height in the row under them, with the sliders under that', async () => {
      const rect = (selector) => p.locator(selector).evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom } })
      const keys = await Promise.all(NINE.map((n) => rect(`.controls-input button[data-key="${n}"]`)))
      const [clear, background, gear, sliders] = await Promise.all([CLEAR_BUTTON, BACKGROUND_BUTTON, SETTINGS_BUTTON, SLIDERS].map(rect))
      for (const [i, k] of keys.entries()) assert.equal(Math.abs(k.height / k.width - 2.5 / 4) < 0.01, true, `key ${i + 1} is 2.5 by 4: ${JSON.stringify(k)}`)
      assert.deepEqual([keys[1].y, keys[2].y], [keys[0].y, keys[0].y], 'keys 1 to 3 share a row')
      assert.equal(keys[3].y > keys[0].y && keys[6].y > keys[3].y, true, 'keys 4 and 7 start the next rows')
      for (const control of [clear, background, gear]) {
        assert.equal(Math.abs(control.width - keys[0].width) <= NEAR_PX && Math.abs(control.height - keys[0].width) <= NEAR_PX, true, `a full-size square: ${JSON.stringify(control)}`)
        assert.equal(control.y > keys[8].bottom, true, 'under the colors')
      }
      assert.equal(Math.abs(clear.x - keys[6].x) <= NEAR_PX, true, 'Clear all is under key 7')
      assert.equal(Math.abs(background.x - keys[7].x) <= NEAR_PX, true, 'Background is under key 8')
      assert.equal(Math.abs(gear.x - keys[8].x) <= NEAR_PX, true, 'the gear is under key 9')
      assert.equal(sliders.y >= clear.bottom, true, 'the sliders are under the controls')
    })

    it('the panel is nine Aa color buttons, Clear all, Background and the gear, and the Size and Transparency sliders, with no Shape button', async () => {
      assert.equal(await p.locator('.controls-input button.digit:not([data-key="0"])').count(), 9)
      const labels = await p.evaluate(() => [...document.querySelectorAll('.controls-input button.digit:not([data-key="0"])')].map((b) => window.getComputedStyle(b, '::after').content))
      assert.deepEqual(labels, Array(9).fill('"Aa"'))
      assert.deepEqual(await Promise.all([CLEAR_BUTTON, BACKGROUND_BUTTON, SETTINGS_BUTTON].map((s) => p.locator(s).count())), [1, 1, 1])
      assert.equal(await p.locator(`${SLIDERS} input[type=range]`).count(), 2)
      assert.deepEqual([await valueOf(p, SIZE_SLIDER), await valueOf(p, OPACITY_SLIDER)], [6, 100])
      assert.equal(await p.locator('.draw-tool-shape-mode').count(), 0, 'no Shape button')
    })

    // Last, so the checks above run with one copy of the script on the page.
    it('a second start adds no second panel style', async () => {
      await p.addScriptTag({ content: draw.script })
      assert.equal(await p.locator('style#draw-tool-style').count(), 1)
    })

    it('the page raised no error', () => { assert.deepEqual(errors, []) })
  })
}

describe('Text Anywhere\'s colors and size', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const tool = () => draw.tool(p)
  const pickDraw = () => draw.pickDraw(p)
  const pickDigit = () => clickUntil(() => p.click(DIGIT_BUTTON), tool, 'normal', SETTLE_MS)
  const reload = () => draw.reload(p)
  // The keypad's digit buttons, 1 to 9: the Aa label each shows and its color, and whether it is marked current.
  const keypad = () => read(() => [...document.querySelectorAll('.controls-input button.digit')]
    .filter((b) => b.dataset.key !== '0')
    .map((b) => {
      const after = window.getComputedStyle(b, '::after')
      return { key: b.dataset.key, current: b.classList.contains('current'), label: after.content, swatch: after.color, text: window.getComputedStyle(b).color }
    }))
  const penColor = (n) => read((i) => window.getComputedStyle(document.documentElement).getPropertyValue(`--puzzle-pencolor-${i}`).trim(), n)
  const currentKey = async () => (await keypad()).filter((b) => b.current).map((b) => b.key)
  // The text size the Size slider's width gives.
  const sizeShown = async () => 2 * await valueOf(p, SIZE_SLIDER) + 8
  const savedColors = () => read((key) => Framework.getData(key) ?? null, COLORS_KEY)
  // The computed color and the size in board units of the last and the first note on the board.
  const look = ({ color, size }) => ({ color, size })
  const lastNote = async () => look((await draw.noteLooks(p)).pop())
  const firstNote = async () => look((await draw.noteLooks(p))[0])
  const noteColors = async () => (await draw.noteLooks(p)).map((note) => note.color)
  // Each note takes its own spot: a click on an earlier note would reopen it.
  const makeNote = async () => {
    const before = await p.locator(TEXTS).count()
    await typeText(p, [0.5 + (before % 9), 1.5 + 3 * Math.floor(before / 9)], String(before + 1))
    assert.equal(await p.locator(TEXTS).count(), before + 1, 'the click made a note')
  }
  const selectEmptyCell = async () => {
    await pickDigit()
    await p.evaluate(() => Framework.app.deselect())
    await p.mouse.click(...await gridPoint(p, EMPTY_CELL.map((v) => v + 0.5)))
    assert.equal(await read(() => Framework.app.puzzle.selectedCells.length), 1)
  }
  const emptyCellValue = () => read(([r, c]) => Framework.app.grid.getCell(r, c).propGet('normal') ?? null, EMPTY_CELL)
  const hold = (selector, button, state) => draw.holdForPickers(p, selector, button, state)

  before(async () => {
    ;({ context, p, errors } = await draw.open(browser()))
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), [COLOR_KEY, WIDTH_KEY, COLORS_KEY, BACKGROUND_KEY])
    await draw.forgetDrawings(p)
    await reload()
  })
  after(async () => { await context.close() })

  it('nothing is saved for the colors until Text Anywhere is first made current, which copies the nine pen colors and saves them', async () => {
    assert.equal(await savedColors(), null)
    const pens = await Promise.all(NINE.map(penColor))
    await pickDraw()
    const colors = await savedColors()
    assert.deepEqual(NINE.map((n) => rgb(colors[n])), pens.map((c) => c.replace(/^rgb\(-\d+, -\d+, -\d+\)$/, 'rgb(0, 0, 0)')))
  })

  it('with Text Anywhere current the keypad shows Aa in each color, digits hidden, with color 1 marked, the default size, Clear all, Background off and the gear', async () => {
    const colors = await savedColors()
    const buttons = await keypad()
    assert.deepEqual(buttons.map((b) => b.swatch), NINE.map((n) => rgb(colors[n])))
    assert.deepEqual(buttons.map((b) => b.label), Array(9).fill('"Aa"'))
    assert.deepEqual(buttons.map((b) => b.text), Array(9).fill('rgba(0, 0, 0, 0)'), 'the digits are not shown')
    assert.deepEqual(await currentKey(), ['1'])
    assert.equal(await sizeShown(), 20)
    assert.equal(await p.locator(CLEAR_BUTTON).isVisible(), true)
    assert.equal(await p.locator(CLEAR_BUTTON).getAttribute('title'), 'Clear all')
    assert.equal(await p.locator(CLEAR_BUTTON).getAttribute('aria-label'), 'Clear all')
    assert.equal(await p.locator(`${CLEAR_BUTTON} svg`).count(), 1, 'Clear all is an icon')
    assert.equal(await p.locator(CLEAR_BUTTON).innerText(), '', 'Clear all shows no text')
    assert.equal(await p.locator(BACKGROUND_BUTTON).getAttribute('aria-pressed'), 'false')
    const [clearColor, gearColor] = await Promise.all([CLEAR_BUTTON, SETTINGS_BUTTON].map((s) => p.locator(s).evaluate((e) => window.getComputedStyle(e).color)))
    assert.equal(clearColor, gearColor, 'Clear all is the same purple as the gear')
    const iconLook = (button) => p.locator(`${button} svg`).evaluate((svg) => ({ size: [svg.getBoundingClientRect().width, svg.getBoundingClientRect().height], fills: [...svg.querySelectorAll('path')].map((e) => window.getComputedStyle(e).fill) }))
    const [clearIcon, gearIcon] = await Promise.all([CLEAR_BUTTON, SETTINGS_BUTTON].map(iconLook))
    assert.equal(clearIcon.size.every((side, i) => Math.abs(side - gearIcon.size[i]) <= NEAR_PX), true, `Clear all's icon is the gear's size: ${clearIcon.size} against ${gearIcon.size}`)
    assert.deepEqual([...new Set(clearIcon.fills)], ['none'], 'Clear all\'s lines are not filled')
    assert.equal(await p.locator(SETTINGS_BUTTON).getAttribute('title'), 'Text Anywhere settings')
    assert.equal(await p.locator(SETTINGS_BUTTON).getAttribute('aria-label'), 'Text Anywhere settings')
    assert.equal(await p.locator('.controls-input button[data-key="0"]').isVisible(), false)
    assert.equal(await p.locator('.controls-input button[data-control="delete"]').isVisible(), false)
  })

  it('clicking a color button marks it, and the next note is in it', async () => {
    await p.click('.controls-input button[data-key="4"]')
    assert.deepEqual(await settle(currentKey, ['4']), ['4'])
    await makeNote()
    assert.equal((await lastNote()).color, rgb((await savedColors())[4]))
  })

  it('a digit key picks its color and enters nothing in the selected cell', async () => {
    await selectEmptyCell()
    await pickDraw()
    const replay = await read(() => Framework.app.getReplay())
    await p.keyboard.press('6')
    assert.deepEqual(await settle(currentKey, ['6']), ['6'])
    assert.equal(await emptyCellValue(), null, 'no digit in r1c3')
    assert.equal(await read(() => Framework.app.getReplay()), replay)
    await makeNote()
    assert.equal((await lastNote()).color, rgb((await savedColors())[6]))
  })

  it('the Size slider sets the next note\'s size only: earlier notes keep theirs', async () => {
    assert.equal((await firstNote()).size, 20)
    await slideTo(p, SIZE_SLIDER, 9)
    await makeNote()
    assert.equal((await lastNote()).size, 26)
    assert.equal((await firstNote()).size, 20, 'the earlier note did not change')
  })

  it('a note made with another size picked is saved with its size and the default opacity', async () => {
    const items = await draw.saved(p)
    const last = items[items.length - 1]
    assert.deepEqual([last.size, last.opacity], [26, 100])
  })

  it('a later change of a pen color leaves the color, its button and its notes as they were', async () => {
    const color2 = rgb((await savedColors())[2])
    await read(() => document.documentElement.style.setProperty('--puzzle-pencolor-2', 'rgb(1, 2, 3)'))
    try {
      assert.equal((await keypad())[1].swatch, color2)
      await p.keyboard.press('2')
      await makeNote()
      assert.equal((await lastNote()).color, color2)
    } finally {
      await read(() => document.documentElement.style.removeProperty('--puzzle-pencolor-2'))
    }
  })

  it('a hold of a second on a color button puts a color picker over each, holding each one\'s color', async () => {
    assert.equal(await p.locator(PICKER).count(), 0)
    await hold('.controls-input button[data-key="4"]', 'left', 'visible')
    const colors = await savedColors()
    assert.deepEqual(await p.locator(PICKER).evaluateAll((inputs) => inputs.map((i) => [Number(i.dataset.key), i.value])), NINE.map((n) => [n, colors[n]]))
  })

  it('a picked color applies at once to the button and to every note already made in that color, and is saved', async () => {
    const before = await noteColors()
    const old4 = rgb((await savedColors())[4])
    assert.equal(before.includes(old4), true, 'a note in color 4 is on the board')
    await p.locator(`${PICKER}[data-key="4"]`).fill('#123456')
    assert.deepEqual(await settle(noteColors, before.map((c) => c === old4 ? 'rgb(18, 52, 86)' : c)), before.map((c) => c === old4 ? 'rgb(18, 52, 86)' : c))
    assert.equal((await keypad())[3].swatch, 'rgb(18, 52, 86)')
    assert.equal((await savedColors())[4], '#123456')
  })

  it('a right-button hold on a picker takes the pickers away', async () => {
    await hold(`${PICKER}[data-key="1"]`, 'right', 'detached')
    assert.equal(await p.locator(PICKER).count(), 0)
  })

  it('the colors, the color picked and the size come back after a reload', async () => {
    const fills = await noteColors()
    await p.keyboard.press('7')
    await slideTo(p, SIZE_SLIDER, 12)
    await reload()
    assert.deepEqual(await noteColors(), fills, 'the notes keep the recolor before Text Anywhere is made current')
    await pickDraw()
    assert.deepEqual(await currentKey(), ['7'])
    assert.equal((await keypad())[3].swatch, 'rgb(18, 52, 86)')
    assert.equal(await sizeShown(), 32)
    await makeNote()
    assert.deepEqual(await lastNote(), { color: rgb((await savedColors())[7]), size: 32 })
  })

  it('bad saved values read as color 1 and the default size', async () => {
    await plantUnchecked(p, COLOR_KEY, '"purple"')
    await plantUnchecked(p, WIDTH_KEY, '7.25')
    await reload()
    await pickDraw()
    assert.deepEqual(await currentKey(), ['1'])
    assert.equal(await sizeShown(), 20)
    await makeNote()
    assert.deepEqual(await lastNote(), { color: rgb((await savedColors())[1]), size: 20 })
  })

  it('another tool gets SudokuPad\'s own keypad back, and its digit keys enter digits again', async () => {
    await selectEmptyCell()
    assert.equal(await p.locator(SLIDERS).count(), 0, 'no sliders')
    assert.equal(await p.locator(`${CLEAR_BUTTON}, ${BACKGROUND_BUTTON}, ${SETTINGS_BUTTON}`).count(), 0, 'no Clear all, Background or gear')
    const buttons = await keypad()
    assert.deepEqual(buttons.map((b) => b.label).filter((l) => l === '"Aa"'), [], 'no Aa labels')
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
