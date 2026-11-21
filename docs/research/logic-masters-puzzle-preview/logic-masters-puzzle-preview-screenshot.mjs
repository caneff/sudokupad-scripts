// Takes docs/research/logic-masters-puzzle-preview/logic-masters-puzzle-preview.png, the homepage's picture of Logic Masters Puzzle Preview: the
// script running on a puzzle list, each link with its picture beside it. Every request is answered by this file's own routes or
// aborted, so nothing reaches logic-masters.de (AGENTS.md): the list, its titles and authors, and the puzzle pictures are all made up
// here, the pictures drawn as SVG grids. 760 px wide, cut off below the third puzzle to fit the homepage's picture frame. Run from the repo root:
// node docs/research/logic-masters-puzzle-preview/logic-masters-puzzle-preview-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const SCRIPT = readFileSync(new URL('../../../logic-masters-puzzle-preview.user.js', import.meta.url), 'utf8')
const HOST = 'logic-masters.de'
const PORTAL = `https://${HOST}/Raetselportal/`
const out = new URL('./logic-masters-puzzle-preview.png', import.meta.url).pathname

// Made-up puzzles: a title, an author and the colour of the one constraint each picture draws.
const PUZZLES = [
  ['Thermo Garden', 'Example Setter', '#b8b8b8'],
  ['Arrow Sums', 'Puzzle Person', '#f2a541'],
  ['German Whispers', 'Sample Author', '#5cb85c'],
  ['Renban Lines', 'Test Constructor', '#d96fb0']
]

// A seeded generator, so the pictures are the same on every run.
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

// One puzzle's picture: a 9x9 grid with a few given digits and one line or cage of the puzzle's colour.
function picture (id) {
  const [, , colour] = PUZZLES[id - 1]
  const r = rng(id * 7919)
  const cell = 20
  const at = (n) => 2 + n * cell
  const lines = Array.from({ length: 10 }, (_, i) => `<line x1="${at(i)}" y1="2" x2="${at(i)}" y2="${at(9)}" stroke="#000" stroke-width="${i % 3 ? 0.6 : 2}"/><line x1="2" y1="${at(i)}" x2="${at(9)}" y2="${at(i)}" stroke="#000" stroke-width="${i % 3 ? 0.6 : 2}"/>`).join('')
  // A line of 6 cells, each next to the one before it (sideways, up, down or diagonal), never back on itself.
  const path = [[2 + Math.floor(r() * 5), 2 + Math.floor(r() * 5)]]
  while (path.length < 6) {
    const [c, row] = path[path.length - 1]
    const next = [c + Math.floor(r() * 3) - 1, row + Math.floor(r() * 3) - 1]
    if (next.every((n) => n >= 0 && n < 9) && !path.some(([pc, pr]) => pc === next[0] && pr === next[1])) path.push(next)
  }
  const points = path.map(([c, row]) => `${at(c) + cell / 2},${at(row) + cell / 2}`).join(' ')
  const givens = Array.from({ length: 12 }, () => [Math.floor(r() * 9), Math.floor(r() * 9), 1 + Math.floor(r() * 9)])
    .map(([c, row, d]) => `<text x="${at(c) + cell / 2}" y="${at(row) + 15}" font-family="sans-serif" font-size="14" text-anchor="middle">${d}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="184" height="184" viewBox="0 0 184 184"><rect width="184" height="184" fill="#fff"/><polyline points="${points}" fill="none" stroke="${colour}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>${lines}${givens}</svg>`
}

const portalHtml = () => `<!doctype html><meta charset="utf-8"><title>Puzzles</title>
<body style="margin:0;padding:16px 24px;font:15px/1.4 Verdana,sans-serif;background:#fafafa">
<h3 style="margin:0 0 12px">Newest puzzles</h3>
<table style="border-collapse:collapse;width:100%;background:#fff">${PUZZLES.map(([title, author], i) => `
<tr style="border-bottom:1px solid #ddd"><td style="padding:8px"><a href="Raetsel/zeigen.php?id=${i + 1}">${title}</a><br><small style="color:#666">by ${author}</small></td><td style="padding:8px;color:#666;width:90px">${i + 2} days ago</td></tr>`).join('')}
</table></body>`

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 760, height: 600 } })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  if (url.hostname !== HOST) return route.abort()
  if (url.pathname === '/Raetselportal/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: portalHtml() })
  if (url.pathname.endsWith('/zeigen.php')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><body><img src="bild.php?data=made-up-${url.searchParams.get('id')}"></body>` })
  if (url.pathname.endsWith('/bild.php')) return route.fulfill({ contentType: 'image/svg+xml', body: picture(Number(url.searchParams.get('data').split('-').pop())) })
  return route.fulfill({ status: 404, body: '' })
})
await context.addInitScript({ content: `document.addEventListener('DOMContentLoaded', () => { ${SCRIPT} })` })
const page = await context.newPage()
await page.goto(PORTAL, { waitUntil: 'domcontentloaded' })
// The script asks for one thing at a time, 500 ms apart: two requests per puzzle.
await page.waitForFunction((n) => [...document.querySelectorAll('.puzzle-preview img')].filter((i) => i.complete && i.naturalWidth > 0).length === n, PUZZLES.length, { timeout: 30000 })
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 760, height: await page.evaluate(() => Math.ceil(document.querySelectorAll('tr')[2].getBoundingClientRect().bottom) + 2) } })
await browser.close()
console.log(`wrote ${out}`)
