// Live check that pen-tool-extras.user.js loses one feature, not the whole pen tool, when an internal of SudokuPad it relies on is gone, on
// sudokupad.app in headless Chromium.
//
// Each case breaks one SudokuPad internal before the script's startup check reads it (a snippet run on `Framework.getApp()`, ahead of the
// script's own), then checks that the settings dialog names the features that are off, that the other features and SudokuPad's own pen
// drawing still work, and that the failure was logged once.
// A case breaks an internal by taking it away (undefined), or by making the call the script makes fail while SudokuPad's own use of it goes on (a
// snippet that throws only during the script's moment of need). A removed internal also goes from SudokuPad's own code, so a case that removes
// one draws only with what it does not serve: a click on a cell edge, which SudokuPad turns into its own X, and a dragged line unless the case
// removes the drag highlight. Dashes follow pen pages, and the outline shares the drag highlight with the sliders, so neither has a case of its own.
/* global Framework */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { captureConsoleErrors, openPage, startPuzzle } from './page.mjs'
import { closeExtrasEditorWith, openExtrasEditor } from './settings.mjs'
import { drag, gridPoint, openPenTool, padValues, penEntries } from './pen.mjs'
import { settle } from './settle.mjs'

const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')
const { COLOR_TOOL_WAIT_MS } = createRequire(import.meta.url)('../pen-tool-extras.user.js')

const KEYS = ['PenColor_pen', 'PenColor_colors', 'PenColor_thickness', 'PenColor_opacity', 'ToolPen_color', 'EdgeMarks_marks']
const PAGE_BUTTON = '.pen-tool-extras-page'
const SLIDERS = '#pen-tool-extras-thickness'
const NOTHING_OFF = ''

// The internal each case breaks, as the snippet that breaks it, and what the dialog must then say is off. What the case leaves different:
// `noPageButton`, `noSliders` and `noGear` for a panel or button without them, `pulldown` for SudokuPad's line mode pulldown
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
    name: 'arrowLines',
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
  // The gear is put into the pen tool button with insertAdjacentHTML; here that call fails only for the gear's markup.
  {
    name: 'settings gear',
    off: 'settings gear',
    noGear: true,
    breaks: `const insert = Element.prototype.insertAdjacentHTML
      Element.prototype.insertAdjacentHTML = function (where, html) { if (String(html).includes('pen-tool-extras-gear')) throw new TypeError('no gear'); return insert.apply(this, arguments) }`
  },
  // The color tool never holds a palette, so the wait for it ends at its limit with a warning, not a turned-off feature (nothing in the script fails).
  {
    name: 'color tool never ready',
    off: NOTHING_OFF,
    warns: new RegExp(`^pen-tool-extras: the color tool was not ready after ${COLOR_TOOL_WAIT_MS / 1000} s, so the pen keeps SudokuPad's own colors$`),
    breaks: 'Framework.app.tools.colour.palette = null'
  },
  { name: 'nothing broken', off: NOTHING_OFF, breaks: '' }
]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// The snippet runs on `Framework.getApp()` before the script's own, so the script's startup check sees the internal already broken.
const withBreak = (breaks) => `;Framework.getApp().then(() => { ${breaks} });\n${script}`

describe('injected after Start Puzzle', { concurrency: false }, () => {
  for (const kase of CASES) {
    describe(kase.name, { concurrency: false }, () => {
      let context, p, logged, errors, warned

      const read = (fn, arg) => p.evaluate(fn, arg)
      // A click 2 px inside the top edge of cell (2, 2): an edge click, which SudokuPad stores as its X.
      const clickEdge = async (button = 'left') => {
        const [x, y] = await gridPoint(p, [2, 2.5])
        await p.mouse.click(x, y + 2, { button })
      }
      // The pen value of each stored entry, without its color character.
      const edgeValues = async () => (await penEntries(p)).map((v) => v.split(':')[1][0])
      const dialogLine = async () => {
        await openExtrasEditor(p)
        const text = await p.locator('#pen-tool-extras-editor').innerText()
        const line = /Off because SudokuPad changed: (.*)/.exec(text)
        const editor = await p.locator('#pen-tool-extras-editor').innerHTML()
        await closeExtrasEditorWith(p, 'Cancel')
        return { line: line ? line[1].trim() : NOTHING_OFF, editor }
      }

      before(async () => {
        logged = []
        warned = []
        ;({ context, p, errors } = await openPage(browser, {
          seed: (page, errs) => {
            page.on('console', (m) => {
              if (m.type() === 'warning' && /^pen-tool-extras: /.test(m.text())) warned.push(m.text())
            })
            captureConsoleErrors(page, errs, (text) => {
              if (/^pen-tool-extras: .* turned off because SudokuPad changed:/.test(text)) {
                logged.push(text)
                return true
              }
            })
          }
        }))
        const source = withBreak(kase.breaks)
        await startPuzzle(p)
        await p.addScriptTag({ content: source })
        await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
        await read((keys) => { keys.forEach((k) => Framework.removeData(k)); Framework.setSetting('toolpen', true) }, KEYS)
        await p.locator('#control-pen').waitFor({ state: 'visible' })
        await openPenTool(p)
      })
      after(async () => {
        await context.close()
      })

      // The failure of some shows only when the feature is used: a page 3 line is drawn, a context menu is asked for, the color tool is waited on.
      // The panel check and the color tool wait are the script's own timers (1 s and 10 s), so the log stays empty until they fire: an infinite quiet window waits them out.
      const triggerFailure = async () => {
        if (kase.name === 'panel row') assert.equal(await settle(async () => logged.length, 1, 5000, Infinity), 1, 'the panel check ended')
        if (kase.name === 'colors') assert.equal(await settle(async () => logged.length, 1, 20000, Infinity), 1, 'the wait for the color tool ended')
        if (kase.warns) assert.equal(await settle(async () => warned.length, 1, 20000, Infinity), 1, 'the wait for the color tool ended')
        if (kase.name === 'arrowLines') {
          await p.locator(PAGE_BUTTON).click()
          await p.locator(PAGE_BUTTON).click()
          await p.locator('.tool-pen button[data-key="3"]').click()
          await drag(p, [[2.5, 2.5], [2.5, 4.5]])
          assert.equal(await read(() => document.querySelectorAll('#cell-pen [data-arrow-line-part]').length), 0, 'no arrow group')
          assert.ok(await read(() => document.querySelectorAll('#cell-pen path.cell-pen').length) > 0, 'SudokuPad\'s plain line is drawn')
          await p.locator(PAGE_BUTTON).click()
        }
        if (kase.name === 'line erase') {
          const [x, y] = await gridPoint(p, [2.5, 2.5])
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
          while ((await penEntries(p)).length) await p.click('#control-undo')
        }
      }

      it('the dialog names the features that are off in one line, or says nothing when none is', async () => {
        await triggerFailure()
        const { line, editor } = await dialogLine()
        assert.equal(line, kase.off)
        if (kase.off === NOTHING_OFF) assert.doesNotMatch(editor, /Off because/)
      })

      it('SudokuPad\'s own edge X still draws, and the next click is this script\'s arrow, or SudokuPad\'s own toggle off when marks are off', async () => {
        while ((await penEntries(p)).length) await p.click('#control-undo')
        await clickEdge()
        assert.deepEqual(await settle(edgeValues, ['4']), ['4'], 'the X on the bottom edge of the cell above')
        await clickEdge()
        const second = kase.edgeAgain === null ? [] : ['m']
        assert.deepEqual(await settle(edgeValues, second), second)
        while ((await penEntries(p)).length) await p.click('#control-undo')
      })

      it('the features that are not off still work', async () => {
        const pageButtons = await p.locator(PAGE_BUTTON).count()
        assert.equal(pageButtons, kase.noPageButton ? 0 : 1, 'the page button')
        assert.equal(await p.locator('#control-pen .pen-tool-extras-gear').count(), kase.noGear ? 0 : 1, 'the settings gear')
        const sliders = await p.locator(SLIDERS).count()
        assert.equal(sliders, kase.noSliders ? 0 : 1, 'the thickness slider')
        assert.equal(await padValues(p), '123456789')
        if (pageButtons) {
          await p.locator(PAGE_BUTTON).click()
          assert.equal(await settle(() => padValues(p), 'abcdefghi'), 'abcdefghi')
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
          while ((await penEntries(p)).length) await p.click('#control-undo')
          await drag(p, [[4.5, 2.5], [4.5, 4.5]])
          while ((await penEntries(p)).length) await p.click('#control-undo')
        })
      }

      it('the failure is logged once with the script\'s name, and nothing else throws', async () => {
        assert.equal(logged.length, kase.off === NOTHING_OFF ? 0 : 1, logged.join('\n'))
        assert.deepEqual(errors, [])
      })

      it('the script\'s own warning is logged once when the case calls for one, and not otherwise', () => {
        if (kase.warns) {
          assert.equal(warned.length, 1, warned.join('\n'))
          assert.match(warned[0], kase.warns)
        } else assert.deepEqual(warned, [])
      })
    })
  }
})
