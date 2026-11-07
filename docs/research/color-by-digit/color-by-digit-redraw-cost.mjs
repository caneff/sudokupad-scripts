// Measures what Color by Digit's handlers cost per event on a 9x9 on sudokupad.app (#432), and prints one JSON object.
// Run: node docs/research/color-by-digit/color-by-digit-redraw-cost.mjs  (needs Playwright's Chromium; see live/README.md)
// Per scenario: a fresh page, the script injected after Start Puzzle (`off` injects nothing, for SudokuPad's own cost),
// one event per empty cell with two frames between events, the handlers' time and the nodes added or removed.
/* global Framework */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { buttonPoint, GIVENS, SEED, savedProfiles, startInjected, MODE_STORAGE_KEY } from '../../../live/color-by-digit/color-by-digit-fixtures.mjs'
import { openPage, startPuzzle } from '../../../live/page.mjs'
import { combine, PROBE_INIT, PROBE_TAG, round, startProbe, stopProbe, sum, summarize, tagged, worstEventMs } from '../../../live/redraw-probe.mjs'

const script = readFileSync(new URL('../../../color-by-digit.user.js', import.meta.url), 'utf8')
const EMPTY = [...GIVENS].flatMap((d, i) => (d === '0' ? [[Math.floor(i / 9), i % 9]] : []))

async function session (browser, mode) {
  const saved = { ...savedProfiles(SEED), [MODE_STORAGE_KEY]: mode }
  const { p } = await openPage(browser, {
    seed: async (page) => {
      await page.addInitScript(PROBE_INIT, PROBE_TAG)
      await page.addInitScript((list) => list.forEach(([k, v]) => window.localStorage.setItem(k, v)), Object.entries(saved).map(([k, v]) => [k, JSON.stringify(v)]))
    }
  })
  if (mode === 'baseline') await startPuzzle(p)
  else await startInjected(p, tagged(script))
  return p
}

// One entry of `digit` in the cell (row, col), as a click on the number pad does; returns the act's own milliseconds.
const enter = (p, [row, col], digit) => p.evaluate(([r, c, d]) => {
  const a = Framework.app
  a.deselect(); a.select(a.grid.getCell(r, c))
  const start = performance.now()
  a.act({ type: 'value', arg: d })
  return performance.now() - start
}, [row, col, digit])

async function entries (browser, mode) {
  const p = await session(browser, mode)
  const actMs = []
  const rows = []
  for (const [i, cell] of EMPTY.entries()) {
    await startProbe(p)
    actMs.push(await enter(p, cell, String((i % 9) + 1)))
    rows.push(await stopProbe(p))
  }
  await p.context().close()
  return { mode, ...summarize(combine(rows), EMPTY.length), worstEventHandlerMs: worstEventMs(rows), actMeanMs: round(sum(actMs) / actMs.length), actMaxMs: round(Math.max(...actMs)) }
}

// One corner mark per empty cell, each of a digit its row already holds as a given, so every mark is in the conflict state and
// gets a circle: the circles on the board grow from 0 to 51 and the number each event leaves is recorded.
async function conflictingMarks (browser, mode) {
  const p = await session(browser, mode)
  await p.click('#control-corner')
  const rows = []
  const circles = []
  for (const [row, col] of EMPTY) {
    const digit = GIVENS.slice(row * 9, row * 9 + 9).replace(/0/g, '')[0]
    await p.evaluate(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [row, col])
    await startProbe(p)
    await p.keyboard.press(digit)
    rows.push(await stopProbe(p))
    circles.push(await p.evaluate(() => document.querySelectorAll('#color-by-digit-circles circle').length))
  }
  const circleNodes = rows.map((r) => r.mutations.filter((m) => m.where.endsWith('#color-by-digit-circles')).reduce((a, m) => a + m.added + m.removed, 0))
  await p.context().close()
  return { scenario: 'conflicting corner marks', mode, ...summarize(combine(rows), EMPTY.length), worstEventHandlerMs: worstEventMs(rows), circlesAfterEachEvent: circles, circleNodesChangedPerEvent: circleNodes }
}

// The fill: every entry on a full board is colored at once by one press on the button, which steps Digit to Both.
async function fill (browser) {
  const p = await session(browser, 'digit')
  for (const [i, cell] of EMPTY.entries()) await enter(p, cell, String((i % 9) + 1))
  await startProbe(p)
  const { x, y } = await buttonPoint(p)
  await p.mouse.click(x, y)
  const recorded = await stopProbe(p)
  const colored = await p.evaluate(() => Framework.app.puzzle.cells.filter((c) => (c.colours || []).length).length)
  await p.context().close()
  return { scenario: 'one press, Digit to Both, on a board with 51 entries', cellsColored: colored, ...summarize(recorded, 1) }
}

const browser = await chromium.launch()
try {
  const result = { baseline: await entries(browser, 'baseline'), off: await entries(browser, 'off'), cell: await entries(browser, 'cell'), digit: await entries(browser, 'digit'), both: await entries(browser, 'both'), marksBaseline: await conflictingMarks(browser, 'baseline'), marksDigit: await conflictingMarks(browser, 'digit'), fill: await fill(browser) }
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
