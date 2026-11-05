// Live check of pen-tool-extras.user.js's second page of pens (color characters a to i, drawn dashed)
// on sudokupad.app in headless Chromium. Run with `npm run test:live`. The first run of a day needs the network (live/cache.mjs records SudokuPad, later runs replay it) and a
// Playwright Chromium, so it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so Tampermonkey's real
// injection time and crackingthecryptic.com stay untested, and so does a touch screen. The script goes in after Start Puzzle, when the controls already exist; startup.live.mjs checks the other injection times.
// Every press, wheel turn and line is real input. A last group runs with No Tab Letters installed too.
/* global Framework, ToolPen */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { gotoPuzzle, newPage, openPage, startPuzzle } from './page.mjs'
import { closeExtrasEditorWith, openExtrasEditor } from './settings.mjs'
import { settle, SETTLE_MS } from './settle.mjs'

const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')
const noTabLetters = readFileSync(new URL('../no-tab-letters.user.js', import.meta.url), 'utf8')

const PEN_KEY = 'PenColor_pen'
const COLORS_KEY = 'PenColor_colors'
const DASH_KEY = 'PenColor_dash'
const THICKNESS_KEY = 'PenColor_thickness'
const LINE_STYLES_KEY = 'PenColor_linestyles'
const PAGE_BUTTON = '.pen-tool-extras-page'
const PAGE_ONE = '123456789'
const PAGE_TWO = 'abcdefghi'
const PAGE_THREE = 'jlnprtvxz'

// The pen button toggles the tool, and SudokuPad binds its handler a moment after the button appears, so it is
// clicked again until the tool's buttons show.
async function openPenTool (page) {
  const shown = () => page.locator('.tool-pen button[data-key="1"]').isVisible()
  const deadline = Date.now() + SETTLE_MS
  while (!(await shown()) && Date.now() < deadline) {
    await page.click('#control-pen')
    await settle(shown, true, 500)
  }
}

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// One browser context per group: its page, its page errors, and the checks. `extra` is the scripts
// injected besides pen-tool-extras, for the group that has No Tab Letters installed.
function group (title, extra = []) {
  describe(title, { concurrency: false }, () => {
    let context, p, errors

    const read = (fn, arg) => p.evaluate(fn, arg)
    const saved = (key) => read((k) => Framework.getData(k), key)
    const selected = () => read(() => ToolPen.tool.selectedColor)
    const padValues = () => read(() => [...document.querySelectorAll('.controls-input button[data-key]')].filter((b) => b.dataset.key !== '0').map((b) => b.dataset.value).join(''))
    const currentButtonKey = () => read(() => { const b = document.querySelector('.tool-pen button.current'); return b && b.dataset.key })
    const penValues = () => read(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => String(v))).sort())
    const strokeCount = () => read(() => document.querySelectorAll('.cell-pen').length)
    const undoDepth = () => read(() => Framework.app.puzzle.undoStack.length)
    const styleOf = (selector) => read((s) => { const st = window.getComputedStyle(document.querySelector(s)); return { dash: st.strokeDasharray, stroke: st.stroke, width: st.strokeWidth } }, selector)
    const pageErrors = () => errors.slice()

    const selectPen = async () => {
      await openPenTool(p)
      await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
    }

    const cellCentre = (row, col) => read(([r, c]) => {
      const box = Framework.app.puzzle.cells.find((cell) => cell.row === r && cell.col === c).elem.getBoundingClientRect()
      return [box.x + box.width / 2, box.y + box.height / 2]
    }, [row, col])

    // One free line across the middle of grid row `row`, a real drag; a second line takes another row.
    const draw = async (row) => {
      const before = await strokeCount()
      const [x, y] = await cellCentre(row, 2)
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.move(x + 110, y + 4, { steps: 6 })
      await p.mouse.up()
      assert.equal(await settle(async () => (await strokeCount()) > before, true), true, 'a stroke appeared')
    }

    // The page button turns one page forward, so a page two turns away takes two presses.
    const goToPage = async (values) => {
      for (let i = 0; i < 3 && (await padValues()) !== values; i++) {
        await p.locator(PAGE_BUTTON).click()
        await settle(padValues, values, 500)
      }
      assert.equal(await settle(padValues, values), values)
    }
    // The settings dialog's editor: open it from SudokuPad's settings, press one of its buttons, and wait for it to go.
    const editor = () => p.locator('#pen-tool-extras-editor')
    const dialogButton = (text) => p.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()
    const openEditor = () => openExtrasEditor(p)
    const press = (key) => p.locator(`.tool-pen button[data-key="${key}"]`).click()
    const turnPageWithWheel = async (deltaY) => {
      const box = await p.locator(PAGE_BUTTON).boundingBox()
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await p.mouse.wheel(0, deltaY)
    }

    const boot = async () => {
      await startPuzzle(p)
      for (const src of [script, ...extra]) await p.addScriptTag({ content: src })
      await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
      await read(() => { Framework.setSetting('toolpen', true); Framework.setSetting('toolletter', true) })
      await p.locator('#control-pen').waitFor({ state: 'visible' })
      await selectPen()
    }
    const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }

    before(async () => {
      ;({ context, p, errors } = await openPage(browser))
      await boot()
      await read((keys) => keys.forEach((k) => Framework.removeData(k)), [PEN_KEY, COLORS_KEY, LINE_STYLES_KEY, 'ToolPen_color', 'ToolLetter_letterMode'])
      await press(1)
    })
    after(async () => {
      await read((keys) => keys.forEach((k) => Framework.removeData(k)), [PEN_KEY, COLORS_KEY, LINE_STYLES_KEY, 'ToolPen_color', 'ToolLetter_letterMode'])
      await context.close()
    })

    it('the pen tool starts on page 1: SudokuPad\'s own 1 to 9, pen 1 selected, a page button at the right end of the last row', async () => {
      assert.equal(await padValues(), PAGE_ONE)
      assert.equal(await selected(), '1')
      assert.equal(await currentButtonKey(), '1')
      assert.equal(await p.locator(`${PAGE_BUTTON} svg circle[data-page-dot="filled"]`).count(), 1)
      const [page, nine] = await Promise.all([PAGE_BUTTON, '.tool-pen button[data-key="9"]'].map((sel) => p.locator(sel).boundingBox()))
      assert.equal(page.y >= nine.y + nine.height, true, 'the page button is below the digit rows')
    })

    it('the page button turns to page 2: the same buttons carry a to i in data-value, and the same color number stays selected', async () => {
      await press(3)
      await p.locator(PAGE_BUTTON).click()
      assert.equal(await settle(padValues, PAGE_TWO), PAGE_TWO)
      assert.equal(await selected(), 'c')
      assert.equal(await currentButtonKey(), '3')
    })

    it('ToolPen_color keeps the color number, never a letter, and the pen is saved under the script\'s own key', async () => {
      assert.equal(await saved('ToolPen_color'), 3)
      assert.equal(await saved(PEN_KEY), 'c')
    })

    it('a page 2 swatch is a dashed line cut out of the button\'s square, and a page 1 swatch is not', async () => {
      const swatch = () => read(() => window.getComputedStyle(document.querySelector('.tool-pen button[data-key="2"]'), ':after').maskImage)
      const decoded = decodeURIComponent(/data:image\/svg\+xml,([^"]*)"/.exec(await swatch())[1])
      assert.match(decoded, /stroke-dasharray='(?!0 )[\d.]+ [\d.]+'/)
      assert.equal((decoded.match(/<path/g) || []).length, 1, 'one line')
      await goToPage(PAGE_ONE)
      assert.equal(await swatch(), 'none')
      await goToPage(PAGE_TWO)
    })

    it('a line drawn with a page 2 pen is dashed in its partner\'s color; a line with its page 1 partner stays solid', async () => {
      const colorOf3 = await read(() => window.getComputedStyle(document.documentElement).getPropertyValue('--puzzle-pencolor-3').trim())
      await draw(8)
      assert.deepEqual((await penValues()).filter((v) => v.endsWith('c')), ['1c'])
      const dashed = await styleOf('.cell-pen.pencolor-c')
      assert.notEqual(dashed.dash, 'none')
      // 3 line widths of 5 is a dash of 15 on a cell of 64, which holds whole periods.
      assert.match(dashed.dash, /^15(px)?[ ,]+\d/)
      assert.equal(await read((c) => { const probe = document.createElement('span'); probe.style.color = c; document.body.appendChild(probe); const v = window.getComputedStyle(probe).color; probe.remove(); return v }, colorOf3), dashed.stroke)
      await goToPage(PAGE_ONE)
      assert.equal(await settle(selected, '3'), '3')
      await draw(7)
      assert.equal((await styleOf('.cell-pen.pencolor-3')).dash, 'none')
    })

    it('a cell mark drawn with a page 2 pen stays solid', async () => {
      await goToPage(PAGE_TWO)
      assert.equal(await settle(selected, 'c'), 'c')
      const [x, y] = await cellCentre(2, 2)
      await p.mouse.click(x, y)
      assert.equal(await settle(async () => (await penValues()).includes('5c'), true), true)
      assert.equal((await read(() => window.getComputedStyle(document.querySelector('.cell-pen.pen-5.pencolor-c')).strokeDasharray)), 'none')
    })

    it('undo removes the page 2 marks, and the replay draws them again, dashed', async () => {
      const replay = await read(() => Framework.app.getReplay())
      const total = await strokeCount()
      for (let i = await undoDepth(); i > 0; i--) await p.click('#control-undo')
      assert.equal(await settle(strokeCount, 0), 0)
      await read((r) => Framework.app.loadReplay(r), replay)
      assert.equal(await settle(strokeCount, total), total)
      assert.deepEqual((await penValues()).filter((v) => v.endsWith('c')), ['1c', '5c'])
      assert.notEqual((await styleOf('.cell-pen.pencolor-c')).dash, 'none')
    })

    const dashOn = () => read(() => parseFloat(window.getComputedStyle(document.querySelector('.cell-pen.pen-1.pencolor-c')).strokeDasharray))
    const sample = () => p.locator(`${PAGE_BUTTON} [data-page-sample]`).getAttribute('data-page-sample')
    const range = () => editor().locator('input[data-setting="dash"]')

    it('the dialog\'s dash length starts at 3, which draws dashes; 0 draws dots, and a saved 0 stays; Cancel leaves it, Restore defaults and Save bring the dashes back, and each segment starts half a dash in', async () => {
      const solidOn = () => read(() => window.getComputedStyle(document.querySelector('.cell-pen.pen-1.pencolor-3')).strokeDasharray)
      await read(([k]) => Framework.removeData(k), [DASH_KEY])
      await read(([k]) => Framework.removeData(k), [THICKNESS_KEY])
      // 3 dashes of a line width of 5
      assert.equal(await settle(dashOn, 15), 15, 'dashes to start with')
      await openEditor()
      assert.deepEqual(await range().evaluate((el) => [el.min, el.max, el.step, el.value]), ['0', '8', '1', '3'])
      await range().fill('0')
      await closeExtrasEditorWith(p, 'Cancel')
      assert.equal(await dashOn(), 15, 'Cancel leaves the dashes')
      assert.equal(await saved(DASH_KEY), null)
      await openEditor()
      await range().fill('0')
      await closeExtrasEditorWith(p, 'Save')
      assert.equal(await settle(dashOn, 0), 0, 'a line already drawn takes the dots')
      assert.equal(await saved(DASH_KEY), 0, 'a 0 is saved, not cleared as the default')
      assert.equal(await solidOn(), 'none', 'page 1 lines stay solid')
      assert.equal(await read(() => window.getComputedStyle(document.querySelector('.cell-pen.pen-5.pencolor-c')).strokeDasharray), 'none', 'a cell mark stays solid')
      await reload()
      assert.equal(await settle(dashOn, 0), 0, 'a saved 0 stays after a reload')
      await selectPen()
      await goToPage(PAGE_ONE)
      assert.equal(await settle(sample, 'dots'), 'dots', 'the page button shows dots at 0')
      await goToPage(PAGE_TWO)
      assert.equal(await settle(selected, 'c'), 'c')
      await openEditor()
      assert.equal(await range().inputValue(), '0')
      await dialogButton('Restore defaults').click()
      assert.equal(await range().inputValue(), '3')
      await closeExtrasEditorWith(p, 'Save')
      assert.equal(await settle(dashOn, 15), 15, 'the dashes are back')
      assert.equal(await saved(DASH_KEY), null)
      // Each segment starts half a dash in, so it is inked at both ends and the halves at a cell boundary make one whole dash.
      const pattern = await read(() => { const st = window.getComputedStyle(document.querySelector('.cell-pen.pen-1.pencolor-c')); return { array: st.strokeDasharray.split(/[ ,]+/).map(parseFloat), offset: parseFloat(st.strokeDashoffset) } })
      assert.equal(Math.abs(pattern.offset - pattern.array[0] / 2) < 1e-6, true, JSON.stringify(pattern))
    })

    it('the page button shows the line of the page it turns to: chevrons from page 2, solid from page 3, dashes from page 1', async () => {
      await selectPen()
      // The button shows the line of the page it turns to: from page 2 the chevrons of page 3, from page 3 page 1's solid line,
      // from page 1 the dashes.
      assert.equal(await settle(sample, 'chevrons'), 'chevrons')
      await goToPage(PAGE_THREE)
      assert.equal(await settle(sample, 'solid'), 'solid')
      await goToPage(PAGE_ONE)
      assert.equal(await settle(sample, 'dashed'), 'dashed', 'the page button shows dashes')
      await goToPage(PAGE_TWO)
      assert.equal(await settle(selected, 'c'), 'c')
    })

    it('the dash scales with the thickness slider', async () => {
      await p.locator('#pen-tool-extras-thickness').evaluate((el) => { el.value = '4'; el.dispatchEvent(new Event('input', { bubbles: true })) })
      assert.equal(await settle(dashOn, 12), 12)
      await p.locator('#pen-tool-extras-thickness').evaluate((el) => { el.value = '5'; el.dispatchEvent(new Event('input', { bubbles: true })) })
      assert.equal(await settle(dashOn, 15), 15)
      await read(([k]) => Framework.removeData(k), [THICKNESS_KEY])
    })

    it('the SudokuPad colors button sets the nine pickers to SudokuPad\'s own pen colors: Cancel leaves the colors, Save stores them for all three pages, and the click marks no cell', async () => {
      const colorOf3 = () => read(() => window.getComputedStyle(document.documentElement).getPropertyValue('--puzzle-pencolor-3').trim())
      const pickers = () => editor().locator('input[type="color"]').evaluateAll((els) => els.map((el) => el.value))
      // SudokuPad's own pen colors, typed out here from tool-pen.css as the independent source.
      const own = ['#1f8020', '#e87cf1', '#e49632', '#f53a37', '#d2be32', '#3d99f5', '#d6d6d6', '#7c7c7c', '#000000']
      const rgbOf = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
      // The colors in force start as the cell color page's, which are not SudokuPad's own.
      await read((k) => Framework.removeData(k), COLORS_KEY)
      const before = await colorOf3()
      assert.notEqual(before, own[2], 'the colors in force are not SudokuPad\'s own')
      const marks = await penValues()
      const depth = await undoDepth()
      await openEditor()
      assert.notDeepEqual(await pickers(), own)
      await editor().locator('button[data-sudokupad-colors]').click()
      assert.deepEqual(await pickers(), own)
      assert.equal(await editor().locator('button[data-sudokupad-colors]').count(), 1, 'the dialog is still open, with the button in it')
      assert.deepEqual(await penValues(), marks, 'the click left no pen mark')
      assert.equal(await undoDepth(), depth, 'the click is no undo step')
      await closeExtrasEditorWith(p, 'Cancel')
      assert.equal(await colorOf3(), before, 'Cancel leaves the colors as they were')
      assert.equal(await saved(COLORS_KEY), null)
      await openEditor()
      await editor().locator('button[data-sudokupad-colors]').click()
      await closeExtrasEditorWith(p, 'Save')
      assert.equal(await settle(colorOf3, own[2]), own[2])
      assert.deepEqual(await saved(COLORS_KEY), Object.fromEntries(own.map((c, i) => [i + 1, c])), 'all nine are saved as the user\'s colors')
      assert.deepEqual(await penValues(), marks, 'closing the dialog left no pen mark either')
      // Pen 3 on page 1 is 3, on page 2 c, on page 3 n and its reverse o: every page follows the color.
      assert.equal((await styleOf('.cell-pen.pencolor-c')).stroke, rgbOf(own[2]))
      assert.equal((await styleOf('.cell-pen.pencolor-3')).stroke, rgbOf(own[2]))
      await reload()
      assert.equal(await settle(colorOf3, own[2]), own[2], 'the saved colors are kept after a reload')
      await read((k) => Framework.removeData(k), COLORS_KEY)
      // Restore defaults and then the button: the button's colors are picked by hand, so Save stores them and does not clear the saved set.
      await openEditor()
      await dialogButton('Restore defaults').click()
      await editor().locator('button[data-sudokupad-colors]').click()
      assert.deepEqual(await pickers(), own)
      await closeExtrasEditorWith(p, 'Save')
      assert.deepEqual(await saved(COLORS_KEY), Object.fromEntries(own.map((c, i) => [i + 1, c])), 'Save after Restore defaults and the button stores the colors')
      assert.equal(await settle(colorOf3, own[2]), own[2])
      await reload()
      assert.equal(await settle(colorOf3, own[2]), own[2], 'and they are still there after a reload')
      await read((k) => Framework.removeData(k), COLORS_KEY)
    })

    it('Tab turns the page forward through all three and round, keeping the color number, and ToolPen_color stays a digit', async () => {
      await p.keyboard.press('Tab')
      assert.equal(await settle(selected, 'n'), 'n')
      await p.keyboard.press('Tab')
      assert.equal(await settle(selected, '3'), '3')
      await p.keyboard.press('Tab')
      assert.equal(await settle(selected, 'c'), 'c')
      assert.equal(await saved('ToolPen_color'), 3)
    })

    it('the mouse wheel over the page button turns the page: down forward, up back; over a slider or elsewhere in the panel it does not', async () => {
      await turnPageWithWheel(100)
      assert.equal(await settle(selected, 'n'), 'n')
      await turnPageWithWheel(-100)
      assert.equal(await settle(selected, 'c'), 'c')
      const box = await p.locator('#pen-tool-extras-thickness').boundingBox()
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await p.mouse.wheel(0, 100)
      // The color buttons and the panel's margin are the panel but not the page button.
      const colour = await p.locator('.tool-pen button[data-key="5"]').boundingBox()
      await p.mouse.move(colour.x + colour.width / 2, colour.y + colour.height / 2)
      // One turn forward only: the old anywhere-in-the-panel wheel moved the pen to page 3 and this leaves it on page 2.
      await p.mouse.wheel(0, 100)
      await sleep(500) // "nothing happened in 500 ms" check
      assert.equal(await selected(), 'c')
    })

    // Opens the dialog, sets the two Enable boxes and saves.
    const setStyles = async ({ dashed, arrows }) => {
      await openEditor()
      for (const [key, on] of [['dashed', dashed], ['arrows', arrows]]) await editor().locator(`input[data-style="${key}"]`).setChecked(on)
      await closeExtrasEditorWith(p, 'Save')
    }
    // The page the pad shows and the pen selected: the page 1 / 2 / 3 values of the buttons.
    const toPage = async (values, key) => { await goToPage(values); await press(key) }

    // Runs a check that changes the line styles, and whatever way it ends, closes its dialog, puts both styles back on and returns to page 2 pen 3, which the checks after it expect.
    const withStyles = async (body) => {
      try {
        await body()
      } finally {
        if (await editor().count()) await read(() => Framework.closeDialog())
        if ((await saved(LINE_STYLES_KEY)) !== null) {
          await read((k) => Framework.removeData(k), LINE_STYLES_KEY)
          await reload()
        }
        await toPage(PAGE_TWO, 3)
      }
    }

    it('Dashed lines unticked: Save moves a page 2 pen to page 1, the button, Tab and the wheel skip page 2, lines already drawn in it still draw, and it survives a reload', () => withStyles(async () => {
      await toPage(PAGE_TWO, 3)
      // The page 2 line the checks before this one left on the grid.
      const before = await styleOf('.cell-pen.pencolor-c')
      assert.notEqual(before.dash, 'none', 'a page 2 line is dashed')
      await openEditor()
      const dashRow = editor().locator('[data-row="dash"]')
      assert.equal(await dashRow.isVisible(), true)
      await editor().locator('input[data-style="dashed"]').uncheck()
      assert.equal(await dashRow.isVisible(), false, 'the Dash length row is hidden at once')
      await closeExtrasEditorWith(p, 'Cancel')
      assert.equal(await saved(LINE_STYLES_KEY), null, 'Cancel saves nothing')
      assert.equal(await selected(), 'c')
      await setStyles({ dashed: false, arrows: true })
      assert.deepEqual(await saved(LINE_STYLES_KEY), { dashed: false, arrows: true })
      assert.equal(await settle(selected, '3'), '3', 'the page 2 pen became the same number on page 1')
      assert.equal(await padValues(), PAGE_ONE)
      assert.deepEqual(await styleOf('.cell-pen.pencolor-c'), before, 'the line drawn in page 2 still draws, dashed')
      await p.locator(PAGE_BUTTON).click()
      assert.equal(await settle(padValues, PAGE_THREE), PAGE_THREE, 'the button skips page 2')
      await p.locator(PAGE_BUTTON).click()
      assert.equal(await settle(padValues, PAGE_ONE), PAGE_ONE)
      await p.keyboard.press('Tab')
      assert.equal(await settle(padValues, PAGE_THREE), PAGE_THREE, 'Tab skips page 2')
      await p.keyboard.press('Tab')
      assert.equal(await settle(padValues, PAGE_ONE), PAGE_ONE)
      await turnPageWithWheel(-100)
      assert.equal(await settle(padValues, PAGE_THREE), PAGE_THREE, 'the wheel back from page 1 skips page 2')
      await turnPageWithWheel(100)
      assert.equal(await settle(padValues, PAGE_ONE), PAGE_ONE)
      assert.equal(await p.locator(`${PAGE_BUTTON} svg circle`).count(), 2, 'a dot for each page in the rotation')
      await reload()
      assert.deepEqual(await saved(LINE_STYLES_KEY), { dashed: false, arrows: true })
      await p.locator(PAGE_BUTTON).click()
      assert.equal(await settle(padValues, PAGE_THREE), PAGE_THREE)
      await setStyles({ dashed: true, arrows: true })
      assert.equal(await saved(LINE_STYLES_KEY), null, 'both enabled is the default and is not kept')
      await toPage(PAGE_ONE, 3)
      await p.locator(PAGE_BUTTON).click()
      assert.equal(await settle(padValues, PAGE_TWO), PAGE_TWO, 'page 2 is back in the rotation')
      await press(3)
    }))

    it('Directional arrow lines unticked while on page 3: Save moves the pen to the same number on page 1, and page 3 is skipped', () => withStyles(async () => {
      await toPage(PAGE_THREE, 3)
      assert.equal(await selected(), 'n')
      await setStyles({ dashed: true, arrows: false })
      assert.equal(await settle(selected, '3'), '3')
      assert.equal(await padValues(), PAGE_ONE)
      await p.locator(PAGE_BUTTON).click()
      await p.locator(PAGE_BUTTON).click()
      assert.equal(await settle(padValues, PAGE_ONE), PAGE_ONE, 'page 1, page 2, then back to page 1')
      await setStyles({ dashed: true, arrows: true })
      await toPage(PAGE_TWO, 3)
    }))

    it('with both line styles unticked the page button is gone, Tab and the wheel are left alone, and ticking one brings the button back', () => withStyles(async () => {
      await toPage(PAGE_ONE, 3)
      await setStyles({ dashed: false, arrows: false })
      assert.equal(await p.locator(PAGE_BUTTON).count(), 0, 'no page button')
      assert.equal(await selected(), '3')
      // The script's Tab turn selects a pen through the tool's setSelectedColor, even on the one page there is; counting those calls sees a Tab it took.
      await read(() => {
        window.__selectCalls = 0
        const select = ToolPen.tool.setSelectedColor
        ToolPen.tool.setSelectedColor = function (...args) { window.__selectCalls++; return select.apply(this, args) }
        window.__stockSelect = select
      })
      await p.keyboard.press('Tab')
      await p.keyboard.press('Tab')
      await sleep(300) // "nothing happened in 300 ms" check
      assert.equal(await read(() => window.__selectCalls), 0, 'the script took no Tab')
      assert.equal(await padValues(), PAGE_ONE, 'the script turned no page on Tab')
      await read(() => { ToolPen.tool.setSelectedColor = window.__stockSelect })
      const colour = await p.locator('.tool-pen button[data-key="5"]').boundingBox()
      await p.mouse.move(colour.x + colour.width / 2, colour.y + colour.height / 2)
      await p.mouse.wheel(0, 100)
      await sleep(300) // "nothing happened in 300 ms" check
      assert.equal(await padValues(), PAGE_ONE)
      assert.equal(await selected(), '3')
      assert.deepEqual(await saved(LINE_STYLES_KEY), { dashed: false, arrows: false })
      await setStyles({ dashed: true, arrows: false })
      await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
      await setStyles({ dashed: true, arrows: true })
      await toPage(PAGE_TWO, 3)
    }))

    it('holding a page 2 button opens the pickers; recoloring pen 3 there recolors page 1\'s pen 3 and the dashed line too', async () => {
      const box = await p.locator('.tool-pen button[data-key="3"]').boundingBox()
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await p.mouse.down()
      const picker = p.locator('.pen-tool-extras-picker input[data-pen="3"]')
      await picker.waitFor({ state: 'attached', timeout: 5000 })
      await p.mouse.up()
      await picker.fill('#123456')
      assert.deepEqual(await saved(COLORS_KEY).then((c) => c && c[3]), '#123456')
      assert.equal((await styleOf('.cell-pen.pencolor-c')).stroke, 'rgb(18, 52, 86)')
      await goToPage(PAGE_ONE)
      assert.equal(await settle(selected, '3'), '3')
      assert.equal((await styleOf('.cell-pen.pencolor-3')).stroke, 'rgb(18, 52, 86)')
      await goToPage(PAGE_TWO)
      assert.equal(await settle(selected, 'c'), 'c')
      await read((k) => Framework.removeData(k), COLORS_KEY)
    })

    it('leaving the pen tool puts the buttons back on 1 to 9, and returning shows page 2 with pen c selected', async () => {
      await read(() => Framework.app.changeTool('normal'))
      assert.equal(await settle(padValues, PAGE_ONE), PAGE_ONE)
      assert.equal(await p.locator(PAGE_BUTTON).count(), 0)
      await selectPen()
      assert.equal(await settle(padValues, PAGE_TWO), PAGE_TWO)
      assert.equal(await selected(), 'c')
      assert.equal(await currentButtonKey(), '3')
    })

    it('after a page reload the pen tool opens on page 2 with the same pen, and ToolPen_color is still a digit', async () => {
      assert.equal(await saved('ToolPen_color'), 3)
      await reload()
      assert.equal(await settle(selected, 'c'), 'c')
      assert.equal(await padValues(), PAGE_TWO)
      assert.equal(await currentButtonKey(), '3')
      assert.equal(await saved('ToolPen_color'), 3)
      assert.equal(await saved(PEN_KEY), 'c')
    })

    it('with the script gone, stock SudokuPad opens the pen tool on the saved digit with no error', async () => {
      const { p: bare, errors: bareErrors } = await newPage(context)
      await gotoPuzzle(bare)
      await startPuzzle(bare)
      await bare.evaluate(() => Framework.setSetting('toolpen', true))
      await bare.locator('#control-pen').waitFor({ state: 'visible' })
      await openPenTool(bare)
      assert.equal(await bare.evaluate(() => ToolPen.tool.selectedColor), 3)
      assert.deepEqual(bareErrors, [])
      await bare.close()
    })

    it('a saved pen that is no pen is ignored: the pen tool opens on page 1 with SudokuPad\'s own selection', async () => {
      await read((k) => Framework.setData(k, 'zz'), PEN_KEY)
      await reload()
      assert.equal(await settle(padValues, PAGE_ONE), PAGE_ONE)
      // SudokuPad's own selection is the number 3 when its pen tool was already open as the script installed.
      assert.equal(String(await selected()), '3')
      assert.equal(await currentButtonKey(), '3')
    })

    it('no page error was raised in the whole group', () => {
      assert.deepEqual(pageErrors(), [])
    })
  })
}

group('injected after Start Puzzle')
group('injected after Start Puzzle, with No Tab Letters installed too', [noTabLetters])

// The script installed while the pen tool is already on, with SudokuPad's own selection of pen 3 read from storage
// as the number 3: the first page turn must keep color number 3.
describe('injected after the pen tool is already on', { concurrency: false }, () => {
  let context, p, errors
  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await startPuzzle(p)
    await p.evaluate(() => { Framework.setData('ToolPen_color', '3'); Framework.setSetting('toolpen', true) })
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await openPenTool(p)
  })
  after(async () => {
    await p.evaluate((keys) => keys.forEach((k) => Framework.removeData(k)), [PEN_KEY, 'ToolPen_color'])
    await context.close()
  })

  it('the first Tab selects pen c, the dashed version of the pen already selected, and ToolPen_color stays 3', async () => {
    assert.equal(await p.evaluate(() => ToolPen.tool.selectedColor), 3)
    await p.addScriptTag({ content: script })
    await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
    await p.keyboard.press('Tab')
    assert.equal(await settle(() => p.evaluate(() => ToolPen.tool.selectedColor), 'c'), 'c')
    assert.equal(await p.evaluate(() => Framework.getData('ToolPen_color')), 3)
    assert.deepEqual(errors, [])
  })
})
