// Takes the one annotated picture of the Draw panel on site/draw-tool.html ("The Draw panel"), from the real
// draw-tool.user.js on the recorded puzzle: the panel (nine pen color buttons, the Size and Opacity sliders and
// Clear all) cropped close at 3x, with each part labelled beside it by a short line from the label to the part:
//   draw-tool-panel-annotated.png
// Labels are laid out from the parts' own boxes. The script fails when a part is missing, and writes the file only when
// the picture is taken. The mascot is hidden.
// Run from the repo root with Playwright's Chromium installed: node docs/research/draw-tool-panel-annotated-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { openDrawPage } from './draw-tool-screenshot-page.mjs'

const out = new URL('./draw-tool-panel-annotated.png', import.meta.url).pathname

// Page pixels of space around the panel for the labels, and of padding around the whole picture.
const LABEL_WIDTH = 230
const SIDE_GAP = 36
const PAD = 10
const FONT = '15px system-ui, sans-serif'
// Pixels the Size and Opacity labels sit above and below their sliders' middles, so two-line labels do not touch.
const ROW_SPREAD = 24
// Pixels under the panel for the Opacity label, which sits below the panel's last row.
const BOTTOM_ROOM = 6
const LINE_COLOR = '#6a1b9a'

const browser = await chromium.launch()
const page = await openDrawPage(browser, 3)
await page.locator('.draw-tool-panel-box').waitFor({ state: 'visible' })
await page.mouse.move(5, 5)

const box = async (selector) => {
  const b = await page.locator(selector).first().boundingBox()
  if (!b) throw new Error(`${selector} is not on the page`)
  return b
}
const panel = await box('.controls-input')
const colors = await Promise.all([1, 4, 7].map((k) => box(`.controls-input button[data-key="${k}"]`)))
const sizeSlider = await box('#draw-tool-size')
const opacitySlider = await box('#draw-tool-opacity')
const clearButton = await box('.draw-tool-clear')
const panelPng = (await page.screenshot({ clip: panel })).toString('base64')

// Positions inside the panel picture, whose top left is (0, 0).
const rel = (b) => ({ x: b.x - panel.x, y: b.y - panel.y, w: b.width, h: b.height, cx: b.x - panel.x + b.width / 2, cy: b.y - panel.y + b.height / 2 })
const colorBlock = { x: Math.min(...colors.map((b) => b.x)), y: colors[0].y, width: colors[0].width, height: colors[2].y + colors[2].height - colors[0].y }
const part = { colors: rel(colorBlock), sizeSlider: rel(sizeSlider), opacitySlider: rel(opacitySlider), clear: rel(clearButton) }

// Each label: its text, the side it sits on, the y of its middle, and the line from the label to the part.
const labels = [
  { text: '<b>Pen color buttons</b><br>A click or the digit keys 1 to 9 pick one', side: 'left', y: part.colors.cy, to: [[part.colors.x + 6, part.colors.cy]] },
  { text: '<b>Size slider</b><br>Line width, and text size', side: 'left', y: part.sizeSlider.cy - ROW_SPREAD, to: [[part.sizeSlider.x - 12, part.sizeSlider.cy - ROW_SPREAD], [part.sizeSlider.x + 8, part.sizeSlider.cy]] },
  { text: '<b>Opacity slider</b><br>Faint to solid', side: 'left', y: part.opacitySlider.cy + ROW_SPREAD, to: [[part.opacitySlider.x - 12, part.opacitySlider.cy + ROW_SPREAD], [part.opacitySlider.x + 8, part.opacitySlider.cy]] },
  { text: '<b>Clear all</b><br>Erases the whole drawing, after asking', side: 'right', y: part.clear.cy, to: [[part.clear.x + part.clear.w - 6, part.clear.cy]] }
]

const width = PAD * 2 + LABEL_WIDTH + SIDE_GAP + panel.width + SIDE_GAP + LABEL_WIDTH
const panelLeft = PAD + LABEL_WIDTH + SIDE_GAP
const height = panel.height + 2 * PAD + ROW_SPREAD + BOTTOM_ROOM
const html = labels.map((l) => {
  const left = l.side === 'left' ? PAD : panelLeft + panel.width + SIDE_GAP
  return `<div class="l ${l.side}" style="left:${left}px;top:${PAD + l.y}px">${l.text}</div>`
}).join('')
const lines = labels.map((l) => {
  const start = l.side === 'left' ? [PAD + LABEL_WIDTH, l.y] : [panelLeft + panel.width + SIDE_GAP, l.y]
  const points = [start, ...l.to.map(([x, y]) => [panelLeft + x, y])].map(([x, y]) => `${x},${y + PAD}`).join(' ')
  const end = l.to[l.to.length - 1]
  return `<polyline points="${points}" fill="none" stroke="${LINE_COLOR}" stroke-width="1.5"/><circle cx="${panelLeft + end[0]}" cy="${end[1] + PAD}" r="3.5" fill="${LINE_COLOR}"/>`
}).join('')
const p = await (await browser.newContext({ viewport: { width: Math.ceil(width), height: Math.ceil(height) }, deviceScaleFactor: 3 })).newPage()
await p.setContent(`<body style="margin:0;background:#fff"><div id="c" style="position:relative;width:${width}px;height:${height}px;font:${FONT};color:#222">
<style>.l{position:absolute;width:${LABEL_WIDTH}px;transform:translateY(-50%);line-height:1.25}.l.left{text-align:right}</style>
<img id="panel" src="data:image/png;base64,${panelPng}" style="position:absolute;left:${panelLeft}px;top:${PAD}px;width:${panel.width}px;height:${panel.height}px">
<svg width="${width}" height="${height}" style="position:absolute;left:0;top:0">${lines}</svg>${html}</div></body>`)
await p.locator('#panel').evaluate((i) => i.decode())
writeFileSync(out, await p.locator('#c').screenshot())
console.log(`wrote ${out}`)
await browser.close()
