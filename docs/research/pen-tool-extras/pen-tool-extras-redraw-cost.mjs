// Measures what Pen Tool Extras' handlers cost per event during a long pen drag on a 9x9 on sudokupad.app (#432), and prints one JSON object.
// Run: node docs/research/pen-tool-extras/pen-tool-extras-redraw-cost.mjs  (needs Playwright's Chromium; see live/README.md)
// Per scenario: a fresh page with (`extras`) or without (`baseline`) the script, a drag of MOVES real mouse moves, the time its
// handlers spent and the nodes added or removed. `renderPen` is timed from outside, around whatever the script wrapped.
/* global Framework */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from '../../../live/page.mjs'
import { cellCentre, goToPenPage, openPenTool, PAGE_THREE } from '../../../live/pen.mjs'
import { PROBE_INIT, PROBE_TAG, round, startProbe, stopProbe, sum, summarize, tagged } from '../../../live/redraw-probe.mjs'

const script = readFileSync(new URL('../../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const MOVES = 400

async function session (browser, variant) {
  const { p } = await openPage(browser, { seed: (page) => page.addInitScript(PROBE_INIT, PROBE_TAG) })
  await startPuzzle(p, variant === 'extras' ? { injection: { mode: 'after-start', code: tagged(script) } } : {})
  await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app.svgRenderer)
  // The pen tool is off until its own setting turns it on.
  await p.evaluate(() => Framework.setSetting('toolpen', true))
  await p.locator('#control-pen').waitFor({ state: 'visible' })
  if (variant === 'extras') await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
  await p.evaluate(() => {
    const proto = Object.getPrototypeOf(Framework.app.svgRenderer)
    const stock = proto.renderPen
    window.__renderPen = []
    proto.renderPen = function (...args) {
      const start = performance.now()
      try { return stock.apply(this, args) } finally { window.__renderPen.push(performance.now() - start) }
    }
  })
  return p
}

// A snake across the board: MOVES moves in total, one real mouse move each, starting at the top left cell.
async function snake (p) {
  const [x0, y0, size] = await cellCentre(p, 0, 0)
  const [x1, y1] = await cellCentre(p, 8, 8)
  const rows = 8
  const per = Math.floor(MOVES / (rows * 2))
  await p.mouse.move(x0, y0)
  await p.mouse.down()
  for (let r = 0; r < rows; r++) {
    const y = y0 + ((y1 - y0) * r) / (rows - 1)
    const xs = r % 2 === 0 ? [x0, x1] : [x1, x0]
    await p.mouse.move(xs[1], y, { steps: per })
    await p.mouse.move(xs[1], Math.min(y + size / 2, y1), { steps: per })
  }
  await p.mouse.up()
  return rows * per * 2
}

async function drag (browser, variant, page) {
  const p = await session(browser, variant)
  await openPenTool(p)
  if (page === 3) await goToPenPage(p, PAGE_THREE)
  await p.locator('.tool-pen button[data-key="1"]').click()
  await startProbe(p)
  const moves = await snake(p)
  const recorded = await stopProbe(p)
  const render = await p.evaluate(() => window.__renderPen)
  const strokes = await p.evaluate(() => document.querySelectorAll('#cell-pen .cell-pen').length)
  await p.context().close()
  return { variant, page, ...summarize(recorded, moves), strokes, renderPenCalls: render.length, renderPenMsPerCall: round(sum(render) / Math.max(1, render.length)), renderPenMaxMs: round(Math.max(0, ...render)) }
}

const browser = await chromium.launch()
try {
  console.log(JSON.stringify({
    baselinePage1: await drag(browser, 'baseline', 1), extrasPage1: await drag(browser, 'extras', 1),
    extrasPage3: await drag(browser, 'extras', 3)
  }, null, 2))
} finally {
  await browser.close()
}
