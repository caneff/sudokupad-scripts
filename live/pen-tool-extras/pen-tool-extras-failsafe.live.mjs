// Live check that pen-tool-extras.user.js loses one install step, not the whole pen tool, when SudokuPad changes under it, on
// sudokupad.app in headless Chromium.
//
// A case either takes away an internal a step needs before the script's startup check reads it (a snippet run on `Framework.getApp()`,
// ahead of the script's own), makes a call the script makes fail while SudokuPad's own use of it goes on, or plants a throw in the
// script's own code inside a wrapper. Each then checks the console warning that names the step, the dialog's line, that SudokuPad's own
// action still works on the event that failed and after it, and that the other steps still work. A removed internal also goes from
// SudokuPad's own code, so a case that removes one draws only with what it does not serve.
/* global Framework */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { captureConsoleErrors, openPage, startPuzzle } from '../page.mjs'
import { closeExtrasEditorWith, openExtrasEditor } from '../settings.mjs'
import { drag, gridPoint, openPenTool, padValues, penEntries } from '../pen.mjs'
import { settle } from '../settle.mjs'

const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')

const KEYS = ['PenColor_pen', 'PenColor_colors', 'PenColor_thickness', 'PenColor_opacity', 'ToolPen_color', 'EdgeMarks_marks']
const PAGE_BUTTON = '.pen-tool-extras-page'
const SLIDERS = '#pen-tool-extras-thickness'
const NOTHING_OFF = ''
const missing = (steps, internal) => new RegExp(`^pen-tool-extras: ${steps} skipped because SudokuPad has no ${internal.replace('.', '\\.')}$`)
const changed = (step) => new RegExp(`^pen-tool-extras: ${step} skipped because SudokuPad changed: `)

// The script with `line` put in after `anchor`, which it must hold exactly once, so a moved anchor fails here and not as a quiet pass.
function planted (anchor, line) {
  assert.equal(script.split(anchor).length, 2, `the script holds ${JSON.stringify(anchor)} once`)
  return script.replace(anchor, anchor + line)
}

// What each case leaves different: `noPageButton` and `noSettings` for a panel without those buttons, `noSliders` for a panel without the
// sliders, `pulldown` for SudokuPad's line mode pulldown ('hidden' unless the pen panel step is skipped), `edgeAgain` null when a second
// click on an edge is SudokuPad's own toggle off rather than this script's arrow 'm', `noDrag` for a case that removes what a drag needs.
const CASES = [
  { name: 'pen pages missing', off: 'pen pages', warns: missing('pen pages', 'handleToolExit'), noPageButton: true, breaks: 'ToolPen.tool.handleToolExit = undefined' },
  { name: 'drag highlight missing', off: 'drag highlight', warns: missing('drag highlight', 'drawLineHint'), noDrag: true, breaks: 'ToolPen.tool.drawLineHint = undefined' },
  { name: 'marks missing', off: 'marks, line erase', warns: missing('marks, line erase', 'grid.rows'), edgeAgain: null, breaks: 'Framework.app.grid.rows = String(Framework.app.grid.rows)' },
  // Cell color page 1 cannot be read when the install save darkens it.
  {
    name: 'colors',
    off: 'colors',
    warns: changed('colors'),
    breaks: `const pages = Framework.app.tools.colour.palette.pages
      pages[0] = new Proxy(pages[0], { get (page, key) { if (key === 'length') throw new TypeError('no length'); return page[key] } })`
  },
  // SudokuPad builds the pen tool's panel without the element the sliders and the buttons sit beside.
  {
    name: 'panel row',
    off: 'pen panel',
    warns: /^pen-tool-extras: pen panel skipped because SudokuPad changed: the pen tool panel has no \.penlinemode$/,
    noPageButton: true,
    noSettings: true,
    noSliders: true,
    pulldown: 'absent',
    breaks: `new MutationObserver(() => document.querySelectorAll('.penlinemode').forEach((el) => el.classList.replace('penlinemode', 'renamed')))
      .observe(document.documentElement, { childList: true, subtree: true })`
  },
  // The arrows' own group is the only thing the script asks the renderer for that SudokuPad's pen does not.
  {
    name: 'arrow lines',
    off: 'arrow lines',
    warns: changed('arrow lines'),
    breaks: `const renderPart = Framework.app.svgRenderer.renderPart
      Framework.app.svgRenderer.renderPart = function (opts) { if (opts && opts.type === 'g') throw new TypeError('renderPart has no group'); return renderPart.apply(this, arguments) }`
  },
  // The same call, failing only while the right press is handled: the erase is skipped, and the press, the click and the menu are SudokuPad's own.
  {
    name: 'right click',
    off: 'line erase',
    warns: changed('line erase'),
    breaks: `const xyToRCExact = Framework.app.xyToRCExact
      window.addEventListener('pointerdown', (e) => { window.right = e.button === 2 && !window.rightFailed; setTimeout(() => { window.right = false }) }, true)
      Framework.app.xyToRCExact = function () { if (window.right) { window.right = false; window.rightFailed = true; throw new TypeError('xyToRCExact is gone') } return xyToRCExact.apply(this, arguments) }`
  },
  // A throw in the click wrapper's own code, after SudokuPad's click has queued its actions and before they are sent.
  {
    name: 'click wrapper throws',
    off: 'marks',
    warns: changed('marks'),
    edgeAgain: null,
    source: planted('      if (isEdgeActs(queued)) {\n', "        throw new Error('planted in the click wrapper')\n")
  },
  // A throw in the render wrapper's own code, after SudokuPad's renderPen has drawn the mark.
  {
    name: 'render wrapper throws',
    off: 'marks',
    warns: changed('marks'),
    edgeAgain: null,
    source: planted('  function keepMarksAbove (part, isMark) {\n', "    if (isMark) throw new Error('planted in the render wrapper')\n")
  },
  // The color tool never holds a palette, so the install save waits with no time limit, warning nothing and skipping no step.
  {
    name: 'color tool never ready',
    off: NOTHING_OFF,
    breaks: 'Framework.app.tools.colour.palette = null'
  },
  { name: 'nothing broken', off: NOTHING_OFF }
]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

async function dialogLineOf (p) {
  await openExtrasEditor(p)
  const text = await p.locator('#pen-tool-extras-editor').innerText()
  const line = /Off because SudokuPad changed: (.*)/.exec(text)
  await closeExtrasEditorWith(p, 'Cancel')
  return line ? line[1].trim() : NOTHING_OFF
}

// The snippet runs on `Framework.getApp()` before the script's own, so the script's startup check sees the internal already broken.
const withBreak = (kase) => `;Framework.getApp().then(() => { ${kase.breaks || ''} });\n${kase.source || script}`

describe('injected after Start Puzzle', { concurrency: false }, () => {
  for (const kase of CASES) {
    describe(kase.name, { concurrency: false }, () => {
      let context, p, errors, warned

      const read = (fn, arg) => p.evaluate(fn, arg)
      // A click 2 px inside the top edge of cell (2, 2): an edge click, which SudokuPad stores as its X.
      const clickEdge = async (button = 'left') => {
        const [x, y] = await gridPoint(p, [2, 2.5])
        await p.mouse.click(x, y + 2, { button })
      }
      // The pen value of each stored entry, without its color character.
      const edgeValues = async () => (await penEntries(p)).map((v) => v.split(':')[1][0])
      const undoAll = async () => { while ((await penEntries(p)).length) await p.click('#control-undo') }
      const dialogLine = () => dialogLineOf(p)

      before(async () => {
        warned = []
        ;({ context, p, errors } = await openPage(browser, {
          seed: (page, errs) => {
            page.on('console', (m) => {
              if (m.type() === 'warning' && /^pen-tool-extras: /.test(m.text())) warned.push(m.text())
            })
            captureConsoleErrors(page, errs)
          }
        }))
        await startPuzzle(p)
        await p.addScriptTag({ content: withBreak(kase) })
        await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
        await read((keys) => { keys.forEach((k) => Framework.removeData(k)); Framework.setSetting('toolpen', true) }, KEYS)
        await p.locator('#control-pen').waitFor({ state: 'visible' })
        await openPenTool(p)
      })
      after(async () => {
        await context.close()
      })

      // Some failures show only when the step is used: a page 3 line is drawn, a context menu, an edge click. The panel check
      // and the color tool wait are the script's own timers (1 s and 10 s), so an infinite quiet window waits them out.
      const triggerFailure = async () => {
        if (kase.name === 'arrow lines') {
          await p.locator(PAGE_BUTTON).click()
          await p.locator(PAGE_BUTTON).click()
          await p.locator('.tool-pen button[data-key="3"]').click()
          await drag(p, [[2.5, 2.5], [2.5, 4.5]])
          assert.equal(await read(() => document.querySelectorAll('#cell-pen [data-arrow-line-part]').length), 0, 'no arrow group')
          assert.ok(await read(() => document.querySelectorAll('#cell-pen path.cell-pen').length) > 0, 'SudokuPad\'s plain line is drawn on the drag that failed')
          await p.locator(PAGE_BUTTON).click()
          await undoAll()
        }
        if (kase.name === 'right click') {
          const prevented = () => read(() => new Promise((resolve) => {
            document.addEventListener('contextmenu', (e) => setTimeout(() => resolve(e.defaultPrevented)), { once: true })
          }))
          // SudokuPad's own right click acts as a left click: its X on the first, its toggle off on the second
          for (const want of [['4'], []]) {
            const answer = prevented()
            await clickEdge('right')
            assert.equal(await answer, false, 'the menu is not suppressed on the right click that failed or after it')
            assert.deepEqual(await settle(edgeValues, want), want, 'the press that failed is left to SudokuPad')
          }
          await undoAll()
        }
        if (kase.name === 'click wrapper throws') {
          await clickEdge()
          assert.deepEqual(await settle(edgeValues, ['4']), ['4'], 'SudokuPad\'s own X on the click that failed')
          await undoAll()
        }
        if (kase.name === 'render wrapper throws') {
          await clickEdge()
          assert.deepEqual(await settle(edgeValues, ['4']), ['4'])
          assert.equal(await read(() => document.querySelectorAll('#cell-pen .pen-4').length), 1, 'the X is drawn once on the render that failed')
          await undoAll()
        }
        if (kase.warns) assert.equal(await settle(async () => warned.length, 1, 20000, Infinity), 1, 'the warning came')
      }

      it('one console warning names the step, or none comes when nothing broke', async () => {
        await triggerFailure()
        if (kase.warns) {
          assert.equal(warned.length, 1, warned.join('\n'))
          assert.match(warned[0], kase.warns)
        } else assert.deepEqual(warned, [])
      })

      it('the dialog names the skipped step in one line, or says nothing when none is', async () => {
        assert.equal(await dialogLine(), kase.off)
      })

      it('SudokuPad\'s own edge X still draws, and the next click is this script\'s arrow, or SudokuPad\'s own toggle off when marks are off', async () => {
        await undoAll()
        await clickEdge()
        assert.deepEqual(await settle(edgeValues, ['4']), ['4'], 'the X on the bottom edge of the cell above')
        await clickEdge()
        const second = kase.edgeAgain === null ? [] : ['m']
        assert.deepEqual(await settle(edgeValues, second), second)
        await undoAll()
      })

      it('the steps that are not skipped still work', async () => {
        const pageButtons = await p.locator(PAGE_BUTTON).count()
        assert.equal(pageButtons, kase.noPageButton ? 0 : 1, 'the page button')
        assert.equal(await p.locator('.pen-tool-extras-settings').count(), kase.noSettings ? 0 : 1, 'the settings button')
        assert.equal(await p.locator(SLIDERS).count(), kase.noSliders ? 0 : 1, 'the thickness slider')
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
          await undoAll()
          await drag(p, [[4.5, 2.5], [4.5, 4.5]])
          await undoAll()
        })
      }

      it('nothing throws, and no further warning came', () => {
        assert.deepEqual(errors, [])
        assert.equal(warned.length, kase.warns ? 1 : 0, warned.join('\n'))
      })
    })
  }
})

// SudokuPad's own `actSend` throws once, after it has sent a click's actions (a render that fails, say). That throw is SudokuPad's: no
// step is skipped, and the click is not sent a second time, which would step the mark on again.
describe('SudokuPad throws after sending a click', { concurrency: false }, () => {
  let context, p, errors, warned
  const read = (fn, arg) => p.evaluate(fn, arg)
  const clickEdge = async () => {
    const [x, y] = await gridPoint(p, [2, 2.5])
    await p.mouse.click(x, y + 2)
  }
  const edgeValues = async () => (await penEntries(p)).map((v) => v.split(':')[1][0])
  const breaks = `const send = ToolPen.tool.actSend
    window.failOnce = false
    ToolPen.tool.actSend = function () {
      const sent = send.apply(this, arguments)
      if (window.failOnce) { window.failOnce = false; throw new TypeError('planted after the send') }
      return sent
    }`

  before(async () => {
    warned = []
    ;({ context, p, errors } = await openPage(browser, {
      seed: (page, errs) => {
        page.on('console', (m) => {
          if (m.type() === 'warning' && /^pen-tool-extras: /.test(m.text())) warned.push(m.text())
        })
        captureConsoleErrors(page, errs)
      }
    }))
    await startPuzzle(p)
    await p.addScriptTag({ content: withBreak({ breaks }) })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
    await read((keys) => { keys.forEach((k) => Framework.removeData(k)); Framework.setSetting('toolpen', true) }, KEYS)
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await openPenTool(p)
  })
  after(async () => { await context.close() })

  // Undo is not used across the throw: SudokuPad's own release handler stops at it with its input state unreset, as it would with no script.
  it('the click is sent once, nothing is skipped and the next click is this script\'s arrow', async () => {
    await read(() => { window.failOnce = true })
    await clickEdge()
    assert.deepEqual(await settle(edgeValues, ['4']), ['4'], 'one X on the click that threw, not stepped on by a second send')
    await clickEdge()
    assert.deepEqual(await settle(edgeValues, ['m']), ['m'], 'marks are still on')
    assert.deepEqual(warned, [])
    assert.equal(await dialogLineOf(p), NOTHING_OFF)
    assert.deepEqual(errors.filter((e) => !/planted after the send/.test(e)), [])
  })
})
