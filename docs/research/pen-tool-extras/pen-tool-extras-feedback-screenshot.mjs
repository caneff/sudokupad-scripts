// Takes the before and after pictures of #546's feedback (docs/research/pen-tool-extras/pen-tool-extras-feedback-<what>-<before|after>.png):
//   erase           a right press held on a line: the line fades (after) or stays whole (before)
//   preview         the pointer on a cell edge with a mark already there: the faint next mark (after) or nothing (before)
//   hint-dashed     a drag held with a page 2 pen: dashes (after) or the solid stroke (before)
//   hint-arrow      a drag held with a page 3 pen: arrowheads (after) or the solid stroke (before)
// Every press, move and drag is real input. A red ring marks where the pointer is in the erase picture, since a screenshot draws none; the preview picture has none, so it does not cover the faint mark.
// "before" is main's script, read from `git show origin/main:pen-tool-extras.user.js`.
// Run from the repo root, after `git fetch origin`: node docs/research/pen-tool-extras/pen-tool-extras-feedback-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { openPage, startPuzzle } from '../../../live/page.mjs'
import { cellCentre, gridPoint, mouseDrag } from '../../../live/board.mjs'
import { goToPenPage, openPenTool, PAGE_BUTTON, PAGE_THREE, PAGE_TWO } from '../../../live/pen.mjs'

const target = (what, which) => new URL(`./pen-tool-extras-feedback-${what}-${which}.png`, import.meta.url).pathname
const VERSIONS = {
  before: execFileSync('git', ['show', 'origin/main:pen-tool-extras.user.js'], { encoding: 'utf8', maxBuffer: 1 << 24 }),
  after: readFileSync(new URL('../../../pen-tool-extras.user.js', import.meta.url), 'utf8')
}
const VIEWPORT = { width: 900, height: 700 }
const [COLS, ROWS, MARGIN] = [4, 4, 8]
const RING = 'feedback-ring'
const SETTLE_MS = 400

const browser = await chromium.launch()
for (const [which, source] of Object.entries(VERSIONS)) {
  const { p } = await openPage(browser, { contextOptions: { deviceScaleFactor: 2 } })
  await p.setViewportSize(VIEWPORT)
  await startPuzzle(p)
  await p.evaluate(() => Framework.app.loadCompactClassicSudoku('0'.repeat(81)))
  await p.waitForFunction(() => Framework.app.puzzle.cells.every((c) => !c.given))
  await p.addStyleTag({ content: '#svenpeek { display: none !important }' })
  await p.addScriptTag({ content: source })
  await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
  await p.evaluate(() => Framework.setSetting('toolpen', true))
  await p.locator('#control-pen').waitFor({ state: 'visible' })
  await openPenTool(p)
  await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
  await p.evaluate(() => { ToolPen.tool.lineMode = 'both' })
  const [, , cell] = await cellCentre(p, 0, 0)
  const [x0, y0] = await gridPoint(p, [0, 0])
  const clip = { x: x0 - MARGIN, y: y0 - MARGIN, width: COLS * cell + 2 * MARGIN, height: ROWS * cell + 2 * MARGIN }
  const ring = (x, y) => p.evaluate(([x, y, id]) => {
    const el = document.getElementById(id) || document.body.appendChild(Object.assign(document.createElement('div'), { id }))
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:26px;height:26px;border:3px solid #e53935;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:99999`
  }, [x, y, RING])
  const unring = () => p.evaluate((id) => document.getElementById(id)?.remove(), RING)
  const shot = async (what) => {
    await p.waitForTimeout(SETTLE_MS)
    await p.screenshot({ path: target(what, which), clip })
    console.log(`wrote ${target(what, which)}`)
  }
  const pick = (key) => p.locator(`.tool-pen button[data-key="${key}"]`).click()
  const clean = async () => {
    await p.mouse.up({ button: 'right' }).catch(() => {}) // best effort: no right button is down after most shots, and `up` then throws
    await unring()
    await p.mouse.click(5, 5)
    for (let n = await p.evaluate(() => Framework.app.puzzle.undoStack.length); n > 0; n--) await p.click('#control-undo')
  }

  // erase: a line, and a right press held on it
  await pick(3)
  await mouseDrag(p, [[0.5, 0.5], [0.5, 2.5]])
  await mouseDrag(p, [[2.5, 0.5], [2.5, 3.5]])
  await p.mouse.click(5, 5)
  const [ex, ey] = await gridPoint(p, [0.5, 1.5])
  await p.mouse.move(ex, ey)
  await p.mouse.down({ button: 'right' })
  await ring(ex, ey)
  await shot('erase')
  await p.mouse.up({ button: 'right' })
  await clean()

  // preview: a cell edge with an X, the pointer on it
  await pick(3)
  const [mx, my] = await gridPoint(p, [1.5, 2.0])
  await p.mouse.click(mx, my)
  await p.mouse.move(mx + 1, my)
  await p.mouse.move(mx, my)
  await shot('preview')
  await clean()

  for (const [what, pageValues] of [['hint-dashed', PAGE_TWO], ['hint-arrow', PAGE_THREE]]) {
    await goToPenPage(p, pageValues)
    await pick(3)
    await p.mouse.click(5, 5)
    await p.mouse.move(...await gridPoint(p, [1.5, 0.5]))
    await p.mouse.down()
    await p.mouse.move(...await gridPoint(p, [1.5, 2.5]), { steps: 10 })
    await p.mouse.move(...await gridPoint(p, [2.5, 2.5]), { steps: 10 })
    await shot(what)
    await p.mouse.up()
    await clean()
  }
  await p.context().close()
}
await browser.close()
