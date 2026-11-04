// Live check that pen-tool-extras.user.js loses one feature, not the whole pen tool, when an internal of SudokuPad it relies on is gone, on
// sudokupad.app in headless Chromium. Run with `npm run test:live`. The first run of a day needs the network (live/cache.mjs records SudokuPad, later runs replay it) and a Playwright Chromium, so it is not part of `npm test`.
//
// Each case breaks one SudokuPad internal before the script's startup check reads it (a snippet run on `Framework.getApp()`, ahead of the
// script's own), then checks that the settings dialog names the features that are off, that the other features and SudokuPad's own pen
// drawing still work, and that the failure was logged once. Each injection time runs every case:
//   document-idle: at DOMContentLoaded, as `@run-at document-idle` approximates it
//   before-start:  after the page loads, before Start Puzzle
//   after-start:   after Start Puzzle, when the controls already exist
// A case breaks an internal by taking it away (undefined), or by making the call the script makes fail while SudokuPad's own use of it goes on (a
// snippet that throws only during the script's moment of need). A removed internal also goes from SudokuPad's own code, so a case that removes
// one draws only with what it does not serve: a click on a cell edge, which SudokuPad turns into its own X, and a dragged line unless the case
// removes the drag highlight. Dashes follow pen pages, and the outline shares the drag highlight with the sliders, so neither has a case of its own.
// Not covered: a real Tampermonkey install and crackingthecryptic.com.
/* global Framework */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { routeSudokuPad } from './cache.mjs'
import { openSettings } from './settings.mjs'

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')

const KEYS = ['PenColor_pen', 'PenColor_colors', 'PenColor_thickness', 'PenColor_opacity', 'ToolPen_color', 'EdgeMarks_marks']
const POLL_MS = 50
const SETTLE_MS = 10000
const START = /Start Puzzle|Continue|Resume/i
const PAGE_BUTTON = '.pen-tool-extras-page'
const SLIDERS = '#pen-tool-extras-thickness'
const NOTHING_OFF = ''

// The internal each case breaks, as the snippet that breaks it, and what the dialog must then say is off. What the case leaves different:
// `noPageButton` and `noSliders` for a panel without them, `pulldown` for SudokuPad's line mode pulldown
// ('hidden' unless the line mode feature is off), `edgeAgain` for the mark a second click on an edge makes (this script's arrow 'k', or nothing when
// marks are off and SudokuPad's own click takes the X away), `noDrag` for a case that removes what a drag needs.
const CASES = [
  // The color tool's page cannot be read when the colors are derived.
  {
    name: 'colors',
    off: 'colors',
    breaks: `const tool = Framework.app.tools.colour
      tool.palette.pages[tool.currentPage] = new Proxy(tool.palette.pages[tool.currentPage], { get (page, key) { if (key === 'length') throw new TypeError('no length'); return page[key] } })`
  },
  { name: 'pages', off: 'pen pages, dashes, arrow lines', noPageButton: true, breaks: 'ToolPen.tool.handleToolExit = undefined' },
  { name: 'sliders', off: 'sliders, outline', noSliders: true, noDrag: true, breaks: 'ToolPen.tool.drawLineHint = undefined' },
  { name: 'marks', off: 'marks, right click', edgeAgain: null, breaks: 'Framework.app.grid.rows = String(Framework.app.grid.rows)' },
  // Here too the call fails only while the middle press is handled, so SudokuPad's own pointer reading, which uses it, goes on.
  {
    name: 'line erase',
    off: 'line erase',
    breaks: `const xyToRCExact = Framework.app.xyToRCExact
      window.addEventListener('pointerdown', (e) => { window.middle = e.button === 1; setTimeout(() => { window.middle = false }) }, true)
      Framework.app.xyToRCExact = function () { if (window.middle) throw new TypeError('xyToRCExact is gone'); return xyToRCExact.apply(this, arguments) }`
  },
  // SudokuPad builds the pen tool's panel without the element the sliders and the page button sit beside.
  {
    name: 'panel row',
    off: 'line mode',
    noPageButton: true,
    noSliders: true,
    pulldown: 'absent',
    breaks: `new MutationObserver(() => document.querySelectorAll('.penlinemode').forEach((el) => el.classList.replace('penlinemode', 'renamed')))
      .observe(document.documentElement, { childList: true, subtree: true })`
  },
  // The arrows' own group is the only thing the script asks the renderer for that SudokuPad's pen does not.
  {
    name: 'chevrons',
    off: 'arrow lines',
    breaks: `const renderPart = Framework.app.svgRenderer.renderPart
      Framework.app.svgRenderer.renderPart = function (opts) { if (opts && opts.type === 'g') throw new TypeError('renderPart has no group'); return renderPart.apply(this, arguments) }`
  },
  // The right click handler asks the pen tool where the pointer is; here that call fails only while a context menu is being asked for.
  {
    name: 'right click',
    off: 'right click',
    breaks: `const getInputRc = ToolPen.tool.getInputRc
      window.addEventListener('contextmenu', () => { window.asking = true }, true)
      window.addEventListener('contextmenu', () => { window.asking = false })
      ToolPen.tool.getInputRc = function () { if (window.asking) throw new TypeError('getInputRc is gone'); return getInputRc.apply(this, arguments) }`
  },
  { name: 'nothing broken', off: NOTHING_OFF, breaks: '' }
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

async function startPuzzle (page, beforeStart = async () => {}) {
  await page.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
  const start = page.getByRole('button', { name: START }).first()
  await start.waitFor({ state: 'visible' })
  await beforeStart()
  await start.click()
  await start.waitFor({ state: 'hidden' })
  await page.locator('#control-undo').waitFor({ state: 'visible' })
}

// The pen button toggles the tool, and SudokuPad binds its handler a moment after the button appears, so it is clicked again until the tool's buttons show.
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

// The snippet runs on `Framework.getApp()` before the script's own, so the script's startup check sees the internal already broken.
const withBreak = (breaks) => `;Framework.getApp().then(() => { ${breaks} });\n${script}`

function group (title, mode) {
  describe(title, { concurrency: false }, () => {
    for (const kase of CASES) {
      describe(kase.name, { concurrency: false }, () => {
        let context, p, logged, errors

        const read = (fn, arg) => p.evaluate(fn, arg)
        const penValues = () => read(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => `${c.row},${c.col}:${v}`)).sort())
        const cellBox = (row, col) => read(([r, c]) => {
          const box = Framework.app.puzzle.cells.find((cell) => cell.row === r && cell.col === c).elem.getBoundingClientRect()
          return [box.x, box.y, box.width]
        }, [row, col])
        // A point [row, col] in cells from the grid's top left, as page pixels.
        const pixel = async ([r, c]) => {
          const [x0, y0, size] = await cellBox(0, 0)
          return [x0 + c * size, y0 + r * size]
        }
        // A click 2 px inside the top edge of cell (2, 2): an edge click, which SudokuPad stores as its X.
        const clickEdge = async (button = 'left') => {
          const [x, y] = await pixel([2, 2.5])
          await p.mouse.click(x, y + 2, { button })
        }
        // The pen value of each stored entry, without its color character.
        const edgeValues = async () => (await penValues()).map((v) => v.split(':')[1][0])
        const dialogLine = async () => {
          await openSettings(p)
          await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Pen tool extras' }).first().click()
          await p.locator('#pen-tool-extras-editor').waitFor({ state: 'visible' })
          const text = await p.locator('#pen-tool-extras-editor').innerText()
          const line = /Off because SudokuPad changed: (.*)/.exec(text)
          const editor = await p.locator('#pen-tool-extras-editor').innerHTML()
          await p.locator('.dialog button').filter({ hasText: 'Cancel' }).click()
          await p.locator('#pen-tool-extras-editor').waitFor({ state: 'detached' })
          return { line: line ? line[1].trim() : NOTHING_OFF, editor }
        }

        before(async () => {
          context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
          errors = []
          logged = []
          p = await context.newPage()
          p.on('pageerror', (e) => errors.push(String(e)))
          p.on('console', (m) => {
            if (m.type() !== 'error' || /Failed to load resource/.test(m.text())) return
            if (/^pen-tool-extras: .* turned off because SudokuPad changed:/.test(m.text())) logged.push(m.text())
            else errors.push(`console.error: ${m.text()}`)
          })
          await routeSudokuPad(p)
          const source = withBreak(kase.breaks)
          if (mode === 'document-idle') {
            await p.addInitScript((code) => {
              document.addEventListener('DOMContentLoaded', () => {
                const s = document.createElement('script')
                s.textContent = code
                document.documentElement.appendChild(s)
              })
            }, source)
          }
          await p.goto(url, { waitUntil: 'load', timeout: 60000 })
          await startPuzzle(p, async () => { if (mode === 'before-start') await p.addScriptTag({ content: source }) })
          if (mode === 'after-start') await p.addScriptTag({ content: source })
          await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
          await read((keys) => { keys.forEach((k) => Framework.removeData(k)); Framework.setSetting('toolpen', true) }, KEYS)
          await p.locator('#control-pen').waitFor({ state: 'visible' })
          await openPenTool(p)
        })
        after(async () => {
          await read((keys) => keys.forEach((k) => Framework.removeData(k)), KEYS).catch(() => {})
          await context.close()
        })

        // The failure of some shows only when the feature is used: a page 3 line is drawn, a context menu is asked for, the color tool is waited on.
        const triggerFailure = async () => {
          if (kase.name === 'panel row') assert.equal(await settle(async () => logged.length, 1, 5000), 1, 'the panel check ended')
          if (kase.name === 'colors') assert.equal(await settle(async () => logged.length, 1, 20000), 1, 'the wait for the color tool ended')
          if (kase.name === 'chevrons') {
            await p.locator(PAGE_BUTTON).click()
            await p.locator(PAGE_BUTTON).click()
            await p.locator('.tool-pen button[data-key="3"]').click()
            const [x0, y0] = await pixel([2.5, 2.5])
            const [x1] = await pixel([2.5, 4.5])
            await p.mouse.move(x0, y0)
            await p.mouse.down()
            await p.mouse.move(x1, y0, { steps: 8 })
            await p.mouse.up()
            assert.equal(await settle(async () => (await penValues()).length > 0, true), true, 'the drag stored a line')
            assert.equal(await read(() => document.querySelectorAll('#cell-pen [data-chevron-part]').length), 0, 'no arrow group')
            assert.ok(await read(() => document.querySelectorAll('#cell-pen path.cell-pen').length) > 0, 'SudokuPad\'s plain line is drawn')
            await p.locator(PAGE_BUTTON).click()
          }
          if (kase.name === 'line erase') {
            const [x, y] = await pixel([2.5, 2.5])
            await p.mouse.click(x, y, { button: 'middle' })
          }
          if (kase.name === 'right click') {
            const prevented = () => read(() => new Promise((resolve) => {
              document.addEventListener('contextmenu', (e) => setTimeout(() => resolve(e.defaultPrevented)), { once: true })
            }))
            for (let i = 0; i < 2; i++) {
              const answer = prevented()
              await clickEdge('right')
              assert.equal(await answer, false, 'the menu is not suppressed once the feature is off')
            }
            while ((await penValues()).length) await p.click('#control-undo')
          }
        }

        it('the dialog names the features that are off in one line, or says nothing when none is', async () => {
          await triggerFailure()
          const { line, editor } = await dialogLine()
          assert.equal(line, kase.off)
          if (kase.off === NOTHING_OFF) assert.doesNotMatch(editor, /Off because/)
        })

        it('SudokuPad\'s own edge X still draws, and the next click is this script\'s arrow, or SudokuPad\'s own toggle off when marks are off', async () => {
          while ((await penValues()).length) await p.click('#control-undo')
          await clickEdge()
          assert.deepEqual(await settle(edgeValues, ['4']), ['4'], 'the X on the bottom edge of the cell above')
          await clickEdge()
          const second = kase.edgeAgain === null ? [] : ['k']
          assert.deepEqual(await settle(edgeValues, second), second)
          while ((await penValues()).length) await p.click('#control-undo')
        })

        it('the features that are not off still work', async () => {
          const pageButtons = await p.locator(PAGE_BUTTON).count()
          assert.equal(pageButtons, kase.noPageButton ? 0 : 1, 'the page button')
          const sliders = await p.locator(SLIDERS).count()
          assert.equal(sliders, kase.noSliders ? 0 : 1, 'the thickness slider')
          const pad = () => read(() => [...document.querySelectorAll('.controls-input button[data-key]')].filter((b) => b.dataset.key !== '0').map((b) => b.dataset.value).join(''))
          assert.equal(await pad(), '123456789')
          if (pageButtons) {
            await p.locator(PAGE_BUTTON).click()
            assert.equal(await settle(pad, 'abcdefghi'), 'abcdefghi')
            await p.locator(PAGE_BUTTON).click()
            await p.locator(PAGE_BUTTON).click()
          }
          const pulldown = await read(() => {
            const box = document.querySelector('.tool-pen .penlinemode')
            return !box ? 'absent' : window.getComputedStyle(box).display === 'none' ? 'hidden' : 'visible'
          })
          assert.equal(pulldown, kase.pulldown || 'hidden', 'SudokuPad\'s line mode pulldown')
        })

        // A dragged line is SudokuPad's own drawing; it needs the drag highlight, which one case removes.
        if (!kase.noDrag) {
          it('SudokuPad\'s own dragged line still draws', async () => {
            while ((await penValues()).length) await p.click('#control-undo')
            const [x0, y0] = await pixel([4.5, 2.5])
            const [x1] = await pixel([4.5, 4.5])
            await p.mouse.move(x0, y0)
            await p.mouse.down()
            await p.mouse.move(x1, y0, { steps: 8 })
            await p.mouse.up()
            assert.equal(await settle(async () => (await penValues()).length > 0, true), true, 'the drag stored a line')
            while ((await penValues()).length) await p.click('#control-undo')
          })
        }

        it('the failure is logged once with the script\'s name, and nothing else throws', async () => {
          assert.equal(logged.length, kase.off === NOTHING_OFF ? 0 : 1, logged.join('\n'))
          assert.deepEqual(errors, [])
        })
      })
    }
  })
}

group('document-idle', 'document-idle')
group('before-start', 'before-start')
group('after-start', 'after-start')
