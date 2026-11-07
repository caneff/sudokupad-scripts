// Takes the one annotated picture of the pen panel on site/pen-tool-extras.html ("The pen panel"), from the current
// pen-tool-extras.user.js on sudokupad.app: the panel cropped close at 3x, with each part labelled beside it by a short
// line from the label to the part. The labels carry what the page's bullets used to say:
//   pen-tool-extras-panel-annotated.png
// The panel is the real one, so the picture changes when the panel does. Labels are laid out from the parts' own boxes:
// the pen color buttons, line mode button and sliders on the left, the line type and settings buttons on the right. The line type
// button's line runs in the gap above the buttons row. The script fails when a part is missing, and writes the file only when
// the picture is taken. The mascot is hidden.
// Run from the repo root with Playwright's Chromium installed: node docs/research/pen-tool-extras-panel-annotated-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const out = new URL('./pen-tool-extras-panel-annotated.png', import.meta.url).pathname

// Page pixels of space around the panel for the labels, and of padding around the whole picture.
const LABEL_WIDTH = 260
const SIDE_GAP = 36
const PAD = 10
const FONT = '15px system-ui, sans-serif'
const LINE_COLOR = '#6a1b9a'

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 3 })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.addScriptTag({ content: script })
await page.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
await page.evaluate(() => Framework.setSetting('toolpen', true))
await page.locator('#control-pen').waitFor({ state: 'visible' })
const shown = () => page.locator('.tool-pen button[data-key="1"]').isVisible()
for (let i = 0; i < 20 && !(await shown()); i++) { await page.click('#control-pen'); await page.waitForTimeout(300) }
if (!(await shown())) throw new Error('the pen panel did not open')
await page.mouse.move(5, 5)
await page.waitForTimeout(400)

const box = async (selector) => {
  const b = await page.locator(selector).first().boundingBox()
  if (!b) throw new Error(`${selector} is not on the page`)
  return b
}
const panel = await box('.tool-pen .controls-input')
const colors = await Promise.all([1, 4, 7].map((k) => box(`.tool-pen button[data-key="${k}"]`)))
const modeButton = await box('.tool-pen button.pen-tool-extras-mode')
const typeButton = await box('.tool-pen button.pen-tool-extras-page')
const gearButton = await box('.tool-pen button.pen-tool-extras-settings')
const sliders = await box('.pen-tool-extras-sliders')
const panelPng = (await page.screenshot({ clip: panel })).toString('base64')

// Positions inside the panel picture, whose top left is (0, 0).
const rel = (b) => ({ x: b.x - panel.x, y: b.y - panel.y, w: b.width, h: b.height, cx: b.x - panel.x + b.width / 2, cy: b.y - panel.y + b.height / 2 })
const colorBlock = { x: Math.min(...colors.map((b) => b.x)), y: colors[0].y, width: colors[0].width, height: colors[2].y + colors[2].height - colors[0].y }
const part = { colors: rel(colorBlock), mode: rel(modeButton), type: rel(typeButton), gear: rel(gearButton), sliders: rel(sliders) }
// The gap above the buttons row, where the line type button's line runs in from the right.
const gapY = (rel(colors[2]).y + rel(colors[2]).h + part.type.y) / 2

// Each label: its text, the side it sits on, the y of its middle, and the line from the label to the part as points.
// Lines on the left run from the panel's left edge into the part, on the right from the right edge.
const labels = [
  { text: '<b>Pen color buttons</b><br>Hold one to change its color', side: 'left', y: part.colors.cy, to: [[part.colors.x + 6, part.colors.cy]] },
  { text: '<b>Line mode button</b><br>Steps Center &amp; Edge, Center only, Edge only', side: 'left', y: part.mode.cy, to: [[part.mode.x + 8, part.mode.cy]] },
  { text: '<b>Line type button</b><br>Switches the solid, dashed and arrow pens', side: 'right', y: gapY - 10, to: [[part.type.cx, gapY - 10], [part.type.cx, part.type.y + 8]] },
  { text: '<b>Settings button</b><br>Opens the settings', side: 'right', y: part.gear.cy + 14, to: [[part.gear.x + part.gear.w - 8, part.gear.cy + 14]] },
  { text: '<b>Thickness and Opacity sliders</b><br>Make lines thicker or fainter', side: 'left', y: part.sliders.cy, to: [[part.sliders.x + 10, part.sliders.cy]] }
]

const width = PAD * 2 + LABEL_WIDTH + SIDE_GAP + panel.width + SIDE_GAP + LABEL_WIDTH
const panelLeft = PAD + LABEL_WIDTH + SIDE_GAP
const height = panel.height + 2 * PAD
const mid = { left: panelLeft, right: panelLeft + panel.width }
const html = labels.map((l) => {
  const left = l.side === 'left' ? PAD : panelLeft + panel.width + SIDE_GAP
  return `<div class="l ${l.side}" style="left:${left}px;top:${PAD + l.y}px">${l.text}</div>`
}).join('')
const lines = labels.map((l) => {
  const start = l.side === 'left' ? [PAD + LABEL_WIDTH, l.y] : [mid.right + SIDE_GAP, l.y]
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
await browser.close()
