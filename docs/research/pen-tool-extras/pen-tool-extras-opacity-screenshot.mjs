// Takes the Pen Tool Extras opacity pictures in docs/research/pen-tool-extras/, the mascot hidden, at 30% opacity:
//   pen-tool-extras-opacity-grid.png    free lines, cell circles and crosses, edge marks and grid-corner
//                                       marks, with digits under them
//   pen-tool-extras-opacity-dialog.png  the settings dialog with its Opacity slider
// It also prints how overlap behaves: a darker pixel where two strokes cross, at the default and at 30%.
// Every mark is made with a real mouse click or drag.
// Run from the repo root: node docs/research/pen-tool-extras/pen-tool-extras-opacity-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const out = (name) => new URL(`./${name}`, import.meta.url).pathname

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
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

const rect = (row, col) => page.evaluate(([r, c]) => {
  const e = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).elem.getBoundingClientRect()
  return { x: e.x, y: e.y, width: e.width, height: e.height }
}, [row, col])
const pick = (key) => page.locator(`.tool-pen button[data-key="${key}"]`).click()
const centre = async (row, col) => { const e = await rect(row, col); return [e.x + e.width / 2, e.y + e.height / 2] }
// A drag through the page points `points`, one stroke.
const drag = async (points) => {
  await page.mouse.move(...points[0])
  await page.mouse.down()
  for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}

// Overlap: two separate strokes crossing, and one stroke crossing itself, far from the other marks.
await pick(4)
const [ax, ay] = await centre(6, 1)
const cell = (await rect(6, 1)).width
await drag([[ax, ay], [ax + 2 * cell, ay + 2 * cell]])
await drag([[ax + 2 * cell, ay], [ax, ay + 2 * cell]])
const [bx, by] = await centre(6, 5)
await drag([[bx, by], [bx + 2 * cell, by + 2 * cell], [bx + 2 * cell, by], [bx, by + 2 * cell]])
console.log('strokes:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.cell-pen')].map((e) => [e.tagName, e.getAttribute('class'), (e.getAttribute('d') || '').length, e.parentNode.tagName]))))

// The color of the page point (x, y) in a screenshot of the whole page taken now, as device pixels.
const pixel = async (x, y) => {
  const png = await page.screenshot()
  return page.evaluate(async ([b64, px, py]) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    return [...ctx.getImageData(Math.round(px), Math.round(py), 1, 1).data].slice(0, 3)
  }, [png.toString('base64'), x, y])
}
// A point inside a cell on one stroke away from any crossing, the two-stroke crossing (the middle of a
// cell, where the segments of both strokes meet), the self-crossing and a point on the self-crossing
// stroke away from its crossing.
const crossings = async (label) => {
  // A selected cell is highlighted over the strokes, so none is selected while sampling.
  await page.evaluate(() => Framework.app.act({ type: 'deselect' }))
  await page.waitForTimeout(200)
  const single = await pixel(ax + cell * 0.25, ay + cell * 0.25)
  const two = await pixel(ax + cell, ay + cell)
  const self = await pixel(bx + cell, by + cell)
  const selfLone = await pixel(bx + cell * 0.25, by + cell * 0.25)
  console.log(`${label}: one stroke ${single}, two strokes crossing ${two}; self-crossing ${self}, same stroke elsewhere ${selfLone}`)
}
const setOpacity = async (value) => {
  await page.click('#control-settings')
  const group = page.locator('.dialog .setting-group').filter({ has: page.locator('label', { hasText: 'Experimental' }) })
  await group.waitFor({ state: 'visible' })
  if (await page.locator('.dialog .setting-group:not(.closed)').filter({ has: page.locator('label', { hasText: 'Experimental' }) }).count() === 0) await group.locator('label').first().click()
  await page.locator('.dialog button').filter({ hasText: 'Pen Tool Extras' }).first().click()
  await page.locator('#pen-tool-extras-editor').waitFor({ state: 'visible' })
  await page.locator('#pen-tool-extras-opacity').evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })) }, value)
}
const save = async () => {
  await page.locator('.dialog button').filter({ hasText: /^\s*Save\s*$/ }).first().click()
  await page.locator('#pen-tool-extras-editor').waitFor({ state: 'detached' })
}
await crossings('80% (SudokuPad\'s own)')
await setOpacity(100); await save(); await page.waitForTimeout(200)
await crossings('100%')
await setOpacity(30); await save(); await page.waitForTimeout(200)
await crossings('30%')

// The other marks, for the picture: a cell circle and cross, an edge mark, corner marks.
await pick(6)
const cellClicks = [[1, 1, 1], [1, 3, 2]]
for (const [row, col, clicks] of cellClicks) {
  const [x, y] = await centre(row, col)
  for (let i = 0; i < clicks; i++) { await page.mouse.click(x, y); await page.waitForTimeout(150) }
}
await pick(9)
const edge = await rect(1, 6)
await page.mouse.click(edge.x + edge.width - 2, edge.y + edge.height / 2)
await page.mouse.click(edge.x + edge.width - 2, edge.y + edge.height / 2)
await page.waitForTimeout(150)
const corner = await rect(3, 3)
for (const clicks of [1, 2]) {
  await page.mouse.click(corner.x + (clicks - 1) * 2 * corner.width, corner.y + corner.height)
  for (let i = 1; i < clicks; i++) { await page.mouse.click(corner.x + (clicks - 1) * 2 * corner.width, corner.y + corner.height); await page.waitForTimeout(150) }
}
await page.waitForTimeout(500)
const first = await rect(0, 0)
const last = await rect(8, 8)
const margin = 16
await page.screenshot({
  path: out('pen-tool-extras-opacity-grid.png'),
  clip: { x: first.x - margin, y: first.y - margin, width: last.x + last.width - first.x + 2 * margin, height: last.y + last.height - first.y + 2 * margin }
})
await setOpacity(30)
await page.locator('.dialog').screenshot({ path: out('pen-tool-extras-opacity-dialog.png') })
await browser.close()
