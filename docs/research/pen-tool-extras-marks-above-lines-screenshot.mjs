// Draws edge marks, an arrow, a corner mark and a cell circle and cross over solid, dotted and chevron lines (same and different
// colors) on sudokupad.app, once with pen-tool-extras.user.js from `origin/main` (written to .scratch/pen-tool-extras-before.user.js
// here) and once with the working copy, at thickness 10 and 16, and lays the four shots into
// docs/research/pen-tool-extras-marks-above-lines.png (before on top, after below).
// Run from the repo root with Playwright's Chromium installed. Not part of any test.
import { chromium } from 'playwright'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const url = readFileSync('live/puzzle-url.txt', 'utf8').trim()
mkdirSync('.scratch', { recursive: true })
writeFileSync('.scratch/pen-tool-extras-before.user.js', execFileSync('git', ['show', 'origin/main:pen-tool-extras.user.js']))
const b = await chromium.launch()

// Each row: the board row, the color character of its line, and the color character of its marks where they differ from the line.
// The left half of the row has marks in that other color, the right half in the line's own color. Pen 1 is the color of all three
// lines: character 1 on page 1, a on page 2 (dotted), j on page 3 (chevrons).
const ROWS = [[1, '1', '4'], [3, 'a', '4'], [5, 'j', '4']]

// Loads the puzzle, starts it, injects the script and turns the pen tool on.
async function openBoard (p, scriptPath) {
  await p.goto(url, { waitUntil: 'load' })
  await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
  await p.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
  await p.locator('#control-undo').waitFor()
  await p.addScriptTag({ content: readFileSync(scriptPath, 'utf8') })
  await p.evaluate(() => Framework.setSetting('toolpen', true))
  await p.locator('#control-pen').waitFor()
}

async function shoot (scriptPath, thickness) {
  const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })
  await p.route(/cookiebot|googletagmanager|plausible/, r => r.abort())
  // The thickness is saved, then read when the page loads again.
  await openBoard(p, scriptPath)
  await p.evaluate((t) => { Framework.setData('PenColor_thickness', t) }, thickness)
  await openBoard(p, scriptPath)
  await p.waitForTimeout(500)
  await p.evaluate(({ rows }) => {
    const cell = (r, c) => Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c)
    const put = (r, c, vals) => {
      Framework.app.act({ type: 'select', arg: [cell(r, c)] })
      for (const [val, color] of vals) {
        Framework.app.act({ type: 'pen', arg: val + color })
      }
      Framework.app.act({ type: 'deselect' })
    }
    for (const [r, line, other] of rows) {
      // Left: marks in another color. A mark first in its cell, then the line, so the line is drawn over it by cell order.
      // Cell 1 holds an edge X, cell 2 a cell circle and a cross, cell 3 an arrow; the corner mark is the bottom right of cell 3.
      put(r, 1, [['3', other], ['1', line]])
      put(r, 2, [['5', other], ['6', other], ['1', line]])
      put(r, 3, [['h', other], ['u', other], ['1', line]])
      // Right: the same marks in the line's own color.
      put(r, 5, [['3', '1'], ['1', line]])
      put(r, 6, [['5', '1'], ['6', '1'], ['1', line]])
      put(r, 7, [['h', '1'], ['u', '1'], ['1', line]])
    }
  }, { rows: ROWS })
  await p.waitForTimeout(800)
  const box = await p.evaluate(() => { const a = Framework.app.puzzle.cells.find((x) => x.row === 0 && x.col === 0).elem.getBoundingClientRect(); const d = Framework.app.puzzle.cells.find((x) => x.row === 7 && x.col === 8).elem.getBoundingClientRect(); return { x: a.x, y: a.y, width: d.right - a.x, height: d.bottom - a.y } })
  const png = await p.screenshot({ clip: { x: box.x, y: box.y + 30, width: box.width, height: box.height - 150 } })
  await p.close()
  return png
}

const shots = {}
for (const [name, path] of [['before', '.scratch/pen-tool-extras-before.user.js'], ['after', 'pen-tool-extras.user.js']]) {
  for (const t of [10, 16]) shots[`${name}-${t}`] = (await shoot(path, t)).toString('base64')
}
const html = `<body style="margin:0;background:#fff;font:16px sans-serif"><table style="border-collapse:collapse">` +
  ['before', 'after'].map((n) => `<tr>${[10, 16].map((t) => `<td style="padding:4px;text-align:center">${n}, thickness ${t}<br><img style="width:600px" src="data:image/png;base64,${shots[`${n}-${t}`]}"></td>`).join('')}</tr>`).join('') + '</table></body>'
const q = await b.newPage({ viewport: { width: 1230, height: 800 } })
await q.setContent(html)
writeFileSync('docs/research/pen-tool-extras-marks-above-lines.png', await q.screenshot({ fullPage: true }))
await b.close()
