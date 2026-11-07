// Takes the one annotated picture of the Color by Digit settings dialog on site/color-by-digit.html ("The settings dialog"), from
// the real color-by-digit.user.js on the recorded puzzle, with the five preloaded profiles and Low/5/High selected:
//   color-by-digit-dialog-annotated.png
// Each part is labelled by one short phrase, all on the left of the dialog, with a short line from the label to the part, in the
// style of pen-tool-extras-panel-annotated-screenshot.mjs: the settings icons, the three pulldowns, the profile list, the selected
// profile's name, the palette with the digit keys, and the bottom row. Labels are laid out from the parts' own boxes. The script fails
// when a part is missing, and writes the file only when the picture is taken.
// Run from the repo root with Playwright's Chromium installed: node docs/research/color-by-digit/color-by-digit-dialog-annotated-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { openSettings } from '../../../live/settings.mjs'

const url = readFileSync(new URL('../../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../../color-by-digit.user.js', import.meta.url), 'utf8')
const out = new URL('./color-by-digit-dialog-annotated.png', import.meta.url).pathname

// Page pixels of space beside the dialog for the labels, and of padding around the whole picture.
const LABEL_WIDTH = 270
const SIDE_GAP = 36
const PAD = 10
const FONT = '15px system-ui, sans-serif'
const LINE_COLOR = '#6a1b9a'

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 2 })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.addScriptTag({ content: script })
await page.locator('#control-colorbydigit').waitFor({ state: 'attached' })
const group = await openSettings(page)
await group.locator('button').filter({ hasText: 'Color by Digit' }).click()
await page.locator('#color-by-digit-editor').waitFor({ state: 'visible' })
await page.locator('#color-by-digit-editor [data-role=paint]').waitFor({ state: 'visible' })
// Hovering waits for the dialog's opening animation to end, so every box below is where the dialog rests.
await page.locator('.dialog').hover()
await page.mouse.move(5, 5)

const box = async (selector) => {
  const b = await page.locator(selector).first().boundingBox()
  if (!b) throw new Error(`${selector} is not on the page`)
  return b
}
const union = (boxes) => {
  const x = Math.min(...boxes.map((b) => b.x)); const y = Math.min(...boxes.map((b) => b.y))
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y }
}
const E = '#color-by-digit-editor'
const dialog = await box('.dialog')
const parts = {
  icons: union(await Promise.all(['copy-settings', 'paste-settings'].map((a) => box(`.dialog button[data-act=${a}]`)))),
  modeSelect: await box(`${E} select[data-role=mode-draft]`),
  cellSelect: await box(`${E} select[data-role=cell-profile]`),
  profiles: await box(`${E} .cbd-profile:nth-child(2)`),
  newProfile: await box(`${E} button[data-act=new-profile]`),
  name: await box(`${E} input[type=text]`),
  palette: union(await page.locator(`${E} button[data-act=color]`).evaluateAll((es) => es.map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } }))),
  digits: union(await page.locator(`${E} button[data-act=digit]`).evaluateAll((es) => es.map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } }))),
  bottom: union(await Promise.all(['Cancel', 'Save'].map((t) => box(`.dialog-options button:text-is("${t}")`))))
}
const dialogPng = (await page.screenshot({ clip: dialog })).toString('base64')
const rel = (b) => ({ x: b.x - dialog.x, y: b.y - dialog.y, w: b.width, h: b.height, cx: b.x - dialog.x + b.width / 2, cy: b.y - dialog.y + b.height / 2 })
const r = Object.fromEntries(Object.entries(parts).map(([k, b]) => [k, rel(b)]))

// Each label: its text, the y of its middle, and the line from the label to the part as points. Every label is on the left.
// A line that would cross text runs in a gap instead: above the title row for the icons, above the selected row for its name,
// and under the profile list for the palette and the digit keys.
const iconGap = r.icons.y - 6
const nameGap = r.name.y - 6
// The pulldowns' line runs in the gap between the Mode and Cell rows, so it crosses no label.
const pulldownGap = (r.modeSelect.y + r.modeSelect.h + r.cellSelect.y) / 2
const paletteY = r.newProfile.y + r.newProfile.h + 24
const labels = [
  { text: 'Copy or paste all settings', y: iconGap, to: [[r.icons.cx, iconGap], [r.icons.cx, r.icons.y + 4]] },
  { text: 'Mode, cell and digit profiles', y: pulldownGap, to: [[r.modeSelect.x - 6, pulldownGap]] },
  { text: 'Rename the selected profile', y: nameGap, to: [[r.name.cx, nameGap], [r.name.cx, r.name.y + 6]] },
  { text: 'Click a profile to edit its colors', y: r.profiles.cy, to: [[r.profiles.x + 6, r.profiles.cy]] },
  { text: 'Pick a color, click digits to paint', y: paletteY, to: [[r.palette.cx, paletteY], [r.palette.cx, r.palette.y + r.palette.h - 4]] },
  { text: 'Cancel or save the changes', y: r.bottom.cy, to: [[r.bottom.x + 6, r.bottom.cy]] }
]

const width = PAD * 2 + LABEL_WIDTH + SIDE_GAP + dialog.width
const left = PAD + LABEL_WIDTH + SIDE_GAP
const height = dialog.height + 2 * PAD
const html = labels.map((l) => `<div class="l" style="left:${PAD}px;top:${PAD + l.y}px">${l.text}</div>`).join('')
const lines = labels.map((l) => {
  const end = [left + l.to[l.to.length - 1][0], l.to[l.to.length - 1][1]]
  const points = [[PAD + LABEL_WIDTH + 6, l.y], ...l.to.map(([x, y]) => [left + x, y])].map(([x, y]) => `${x},${y + PAD}`).join(' ')
  return `<polyline points="${points}" fill="none" stroke="${LINE_COLOR}" stroke-width="1.5"/><circle cx="${end[0]}" cy="${end[1] + PAD}" r="3.5" fill="${LINE_COLOR}"/>`
}).join('')
const p = await (await browser.newContext({ viewport: { width: Math.ceil(width), height: Math.ceil(height) }, deviceScaleFactor: 2 })).newPage()
await p.setContent(`<body style="margin:0;background:#fff"><div id="c" style="position:relative;width:${width}px;height:${height}px;font:${FONT};color:#222">
<style>.l{position:absolute;width:${LABEL_WIDTH}px;transform:translateY(-50%);line-height:1.25;text-align:right;white-space:nowrap}</style>
<img id="d" src="data:image/png;base64,${dialogPng}" style="position:absolute;left:${left}px;top:${PAD}px;width:${dialog.width}px;height:${dialog.height}px;box-shadow:0 0 0 1px #ccc">
<svg width="${width}" height="${height}" style="position:absolute;left:0;top:0">${lines}</svg>${html}</div></body>`)
await p.locator('#d').evaluate((i) => i.decode())
writeFileSync(out, await p.locator('#c').screenshot())
console.log(`wrote ${out}`)
await browser.close()
