// Takes the one annotated picture of the Draw panel on site/draw-tool.html ("The Draw panel"), from the real
// draw-tool.user.js on the recorded puzzle: the panel (nine color buttons, Clear all, the Shape button, the settings gear
// and the Size and Opacity sliders) cropped close at 3x, with each part labelled on its left by a short phrase and a line from the phrase to the part:
//   draw-tool-panel-annotated.png
// Labels are laid out from the parts' own boxes. The script fails when a part is missing, and writes the file only when
// the picture is taken. The mascot is hidden.
// Run from the repo root with Playwright's Chromium installed: node docs/research/draw-tool/draw-tool-panel-annotated-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { openDrawPage } from './draw-tool-screenshot-page.mjs'

const out = new URL('./draw-tool-panel-annotated.png', import.meta.url).pathname

// Page pixels of space around the panel for the labels, and of padding around the whole picture.
const LABEL_WIDTH = 250
const SIDE_GAP = 36
const PAD = 10
const FONT = '15px system-ui, sans-serif'
// Pixels under the panel for the Opacity label, which sits below the panel's last row.
const BOTTOM_ROOM = 6
const LINE_COLOR = '#6a1b9a'

const browser = await chromium.launch()
const page = await openDrawPage(browser, 3)
await page.locator('.draw-tool-shape-mode').waitFor({ state: 'visible' })
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
const shapeButton = await box('.draw-tool-shape-mode')
const gearButton = await box('.draw-tool-settings')
const panelPng = (await page.screenshot({ clip: panel })).toString('base64')

// Positions inside the panel picture, whose top left is (0, 0).
const rel = (b) => ({ x: b.x - panel.x, y: b.y - panel.y, w: b.width, h: b.height, cx: b.x - panel.x + b.width / 2, cy: b.y - panel.y + b.height / 2 })
const colorBlock = { x: Math.min(...colors.map((b) => b.x)), y: colors[0].y, width: colors[0].width, height: colors[2].y + colors[2].height - colors[0].y }
const part = { colors: rel(colorBlock), sizeSlider: rel(sizeSlider), opacitySlider: rel(opacitySlider), clear: rel(clearButton), shape: rel(shapeButton), gear: rel(gearButton) }

// Each label: its text, the y of its middle, and the line from the label to the part as points. Every label is on the
// left, and its line runs from the panel's left edge into the part. The Shape button's line runs in the gap above the
// controls row, and the settings gear's in the gap below it, bent out to the left so its label clears the Size label.
const gapY = (part.colors.y + part.colors.h + part.clear.y) / 2
const lowGapY = part.gear.y + part.gear.h + 5
const labels = [
  { text: 'Click or press 1 to 9; hold to edit', y: part.colors.cy, to: [[part.colors.x + 6, part.colors.cy]] },
  { text: 'Off, rectangle or ellipse', y: gapY, to: [[part.shape.cx, gapY], [part.shape.cx, part.shape.y + 8]] },
  { text: 'Erases the whole drawing', y: part.clear.cy, to: [[part.clear.x + 6, part.clear.cy]] },
  { text: 'Opens the settings', y: lowGapY - 12, to: [[-14, lowGapY - 12], [-14, lowGapY], [part.gear.cx, lowGapY], [part.gear.cx, part.gear.y + part.gear.h - 8]] },
  { text: 'Line width and text size', y: part.sizeSlider.cy, to: [[part.sizeSlider.x + 8, part.sizeSlider.cy]] },
  { text: 'Faint to solid', y: part.opacitySlider.cy, to: [[part.opacitySlider.x + 8, part.opacitySlider.cy]] }
]

const width = PAD * 2 + LABEL_WIDTH + SIDE_GAP + panel.width
const panelLeft = PAD + LABEL_WIDTH + SIDE_GAP
const height = panel.height + 2 * PAD + BOTTOM_ROOM
const html = labels.map((l) => `<div class="l" style="left:${PAD}px;top:${PAD + l.y}px">${l.text}</div>`).join('')
const lines = labels.map((l) => {
  const points = [[PAD + LABEL_WIDTH + 6, l.y], ...l.to.map(([x, y]) => [panelLeft + x, y])].map(([x, y]) => `${x},${y + PAD}`).join(' ')
  const end = l.to[l.to.length - 1]
  return `<polyline points="${points}" fill="none" stroke="${LINE_COLOR}" stroke-width="1.5"/><circle cx="${panelLeft + end[0]}" cy="${end[1] + PAD}" r="3.5" fill="${LINE_COLOR}"/>`
}).join('')
const p = await (await browser.newContext({ viewport: { width: Math.ceil(width), height: Math.ceil(height) }, deviceScaleFactor: 3 })).newPage()
await p.setContent(`<body style="margin:0;background:#fff"><div id="c" style="position:relative;width:${width}px;height:${height}px;font:${FONT};color:#222">
<style>.l{position:absolute;width:${LABEL_WIDTH}px;transform:translateY(-50%);line-height:1.25;text-align:right;white-space:nowrap}</style>
<img id="panel" src="data:image/png;base64,${panelPng}" style="position:absolute;left:${panelLeft}px;top:${PAD}px;width:${panel.width}px;height:${panel.height}px">
<svg width="${width}" height="${height}" style="position:absolute;left:0;top:0">${lines}</svg>${html}</div></body>`)
await p.locator('#panel').evaluate((i) => i.decode())
writeFileSync(out, await p.locator('#c').screenshot())
console.log(`wrote ${out}`)
await browser.close()
