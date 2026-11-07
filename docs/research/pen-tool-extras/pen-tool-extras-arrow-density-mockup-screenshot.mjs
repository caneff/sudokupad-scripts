// Mockup (2026-11-06), not the build: page 3 arrow lines at thickness 1 to 16, now and under two size/spacing rules, drawn from the script's ARROW_LINE shape.
// Chris ruled option B with heads at 80 %. Writes docs/research/pen-tool-extras/pen-tool-extras-arrow-density-mockup.png; run from the repo root. Not part of any test.
import { writeFileSync } from 'node:fs'
const HL = 1.4375, HW = 2.125, CELL = 64, SET = 5, TRIM = 0.8 // options A and B draw heads at 80 % of today's shape
const tri = (x, y, half, wide) => `M${x - half} ${y - wide}L${x + half} ${y}L${x - half} ${y + wide}Z`
function run (len, head, gap, trim = 1) {
  head *= trim
  const count = Math.max(1, Math.round(len / gap)); let d = ''
  for (let i = 0; i < count; i++) d += tri((i + 0.5) * len / count, 0, HL * head, HW * head)
  return d
}
const rules = {
  now: (t) => { const s = Math.max(t, 5); return { head: s, gap: SET * s } },
  // A: heads in proportion to thickness; arrows a fixed distance apart (1.6 a cell at the default setting), spread only so thick heads keep a gap.
  A: (t) => { const head = Math.max(t, 1); return { head, gap: Math.max(SET * 8, 3 * 2 * HL * TRIM * head) } },
  // B: heads shrink a little less than the line; spacing grows mildly with thickness (about 2.2 a cell at 1, 1.3 at 16).
  B: (t) => { const head = 5 * Math.pow(t / 5, 0.8); return { head, gap: SET * 8 * Math.pow(t / 5, 0.2) } }
}
const T = [1, 2, 3, 5, 8, 12, 16], LEN = 3 * CELL, ROW = 70, COLW = LEN + 60
let body = ''
Object.entries(rules).forEach(([name, rule], c) => {
  const x0 = 70 + c * COLW
  body += `<text x="${x0 + LEN / 2}" y="22" font-size="18" text-anchor="middle" font-family="sans-serif">${name === 'now' ? 'now' : 'option ' + name}</text>`
  T.forEach((t, r) => {
    const y = 60 + r * ROW, { head, gap } = rule(t), trim = name === 'now' ? 1 : TRIM
    body += `<g transform="translate(${x0} ${y})"><path d="M0 ${-CELL / 2 + 10}V${CELL / 2 - 10}M${CELL} ${-CELL / 2 + 10}V${CELL / 2 - 10}M${2 * CELL} ${-CELL / 2 + 10}V${CELL / 2 - 10}M${LEN} ${-CELL / 2 + 10}V${CELL / 2 - 10}" stroke="#ccc"/>` +
      `<path d="M0 0H${LEN}" stroke="#6a1b9a" stroke-width="${t}" opacity=".8"/><path d="${run(LEN, head, gap, trim)}" fill="#6a1b9a" opacity=".8"/></g>`
  })
})
T.forEach((t, r) => { body += `<text x="10" y="${66 + r * ROW}" font-size="16" font-family="sans-serif">t=${t}</text>` })
const W = 70 + 3 * COLW, H = 60 + T.length * ROW
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${body}</svg>`

import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
await p.setContent(`<body style="margin:0">${svg}</body>`)
await p.screenshot({ path: 'docs/research/pen-tool-extras/pen-tool-extras-arrow-density-mockup.png' })
await b.close()
