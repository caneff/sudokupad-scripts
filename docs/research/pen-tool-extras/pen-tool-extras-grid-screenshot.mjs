// Takes the Pen Tool Extras pictures of the color grid, slider options, dash length and mark growth, in docs/research/pen-tool-extras/,
// at 1200x900, the mascot hidden:
//   pen-tool-extras-grid-dialog.png   the settings dialog: the 3x3 color grid, the slider boxes and the three sliders
//   pen-tool-extras-grid-panel.png    the pen panel with both sliders, without the thickness one, without the opacity one, with neither
//   pen-tool-extras-grid-dashes.png   page 2 lines at dash length 0 (the dots of today), 3 and 8, the longest, at thickness 5
//   pen-tool-extras-grid-marks.png    the edge and corner marks at thickness 5, 10 and 16, with a line for comparison
// Run from the repo root: node docs/research/pen-tool-extras/pen-tool-extras-grid-screenshot.mjs [dialog|panel|dashes|marks]
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const out = (name) => new URL(`./${name}`, import.meta.url).pathname
const only = process.argv[2]
const wants = (part) => !only || only === part

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.addScriptTag({ content: script })
await page.evaluate(() => Framework.setSetting('toolpen', true))
await page.locator('#control-pen').waitFor({ state: 'visible' })
const shown = () => page.locator('.tool-pen button[data-key="1"]').isVisible()
for (let i = 0; i < 20 && !(await shown()); i++) { await page.click('#control-pen'); await page.waitForTimeout(300) }

const openEditor = async () => {
  await page.click('#control-settings')
  const group = page.locator('.dialog .setting-group').filter({ has: page.locator('label', { hasText: 'Experimental' }) })
  await group.waitFor({ state: 'visible' })
  if (await page.locator('.dialog .setting-group:not(.closed)').filter({ has: page.locator('label', { hasText: 'Experimental' }) }).count() === 0) await group.locator('label').first().click()
  await page.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Pen Tool Extras' }).first().click()
  await page.locator('#pen-tool-extras-editor').waitFor({ state: 'visible' })
}
const dialogButton = (text) => page.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()
const panelClip = () => page.locator('.controls-buttons').boundingBox()
const boardClip = () => page.locator('#svgrenderer').boundingBox()

// Puts the shots side by side in one picture, each under its caption.
const stitch = async (name, shots) => {
  const sheet = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  const figures = shots.map(({ caption, buffer }) => `<figure style="margin:8px;text-align:center;font:14px sans-serif"><img src="data:image/png;base64,${buffer.toString('base64')}"><figcaption>${caption}</figcaption></figure>`)
  await sheet.setContent(`<body style="margin:0;background:white"><div style="display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:center">${figures.join('')}</div></body>`)
  await sheet.screenshot({ path: out(name), fullPage: true })
  await sheet.close()
}

const setDialog = async (fn) => {
  await openEditor()
  await fn()
  await dialogButton('Save').click()
  await page.locator('#pen-tool-extras-editor').waitFor({ state: 'detached' })
  await page.waitForTimeout(300)
}
const setThickness = (value) => page.locator('#pen-tool-extras-thickness').evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })) }, value)

if (wants('dialog')) {
  await openEditor()
  await page.locator('.dialog').screenshot({ path: out('pen-tool-extras-grid-dialog.png') })
  await dialogButton('Cancel').click()
}

if (wants('panel')) {
  const shots = []
  for (const [caption, thickness, opacity] of [['both sliders', true, true], ['thickness hidden', false, true], ['opacity hidden', true, false], ['both hidden', false, false]]) {
    await setDialog(async () => {
      await page.locator('input[data-box="show.thickness"]').setChecked(thickness)
      await page.locator('input[data-box="show.opacity"]').setChecked(opacity)
    })
    shots.push({ caption, buffer: await page.screenshot({ clip: await panelClip() }) })
  }
  await setDialog(async () => {
    await page.locator('input[data-box="show.thickness"]').setChecked(true)
    await page.locator('input[data-box="show.opacity"]').setChecked(true)
  })
  await stitch('pen-tool-extras-grid-panel.png', shots)
}

const cellBox = (row, col) => page.evaluate(([r, c]) => {
  const box = Framework.app.puzzle.cells.find((cell) => cell.row === r && cell.col === c).elem.getBoundingClientRect()
  return { x: box.x, y: box.y, width: box.width, height: box.height }
}, [row, col])
const drag = async (from, to) => {
  const a = await cellBox(...from)
  const b = await cellBox(...to)
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
  await page.mouse.up()
}
const clear = () => page.evaluate(() => {
  for (const cell of Framework.app.puzzle.cells.filter((x) => x.pen.length)) {
    Framework.app.act({ type: 'select', arg: [cell] })
    Framework.app.act({ type: 'pen', arg: '0' })
    Framework.app.act({ type: 'deselect' })
  }
})

if (wants('dashes')) {
  await clear()
  // Page 2, pen 4, lines along and across the grid and a diagonal.
  await page.locator('.pen-tool-extras-page').click()
  await page.locator('.tool-pen button[data-key="4"]').click()
  await drag([1, 1], [1, 6])
  await drag([3, 1], [7, 1])
  await drag([3, 3], [6, 6])
  await drag([8, 2], [8, 7])
  const shots = []
  for (const dash of [0, 3, 8]) {
    await setDialog(async () => { await page.locator('input[data-setting="dash"]').fill(String(dash)) })
    shots.push({ caption: `dash length ${dash}${dash === 0 ? ' (dots)' : ''}, thickness 5`, buffer: await page.screenshot({ clip: await boardClip() }) })
  }
  await setDialog(async () => { await page.locator('input[data-setting="dash"]').fill('0') })
  await stitch('pen-tool-extras-grid-dashes.png', shots)
  await clear()
}

if (wants('marks')) {
  await clear()
  // A page 1 pen. Marks on distinct cells: the edge X, an arrow and the edge circle on right edges, the corner X and
  // the corner circle, and one free line under them.
  await page.evaluate(() => ToolPen.tool.setSelectedColor('4'))
  const place = (row, col, value) => page.evaluate(([r, c, v]) => {
    const cell = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c)
    Framework.app.act({ type: 'select', arg: [cell] })
    Framework.app.act({ type: 'pen', arg: v })
    Framework.app.act({ type: 'deselect' })
  }, [row, col, value])
  await place(1, 1, '3')
  await place(1, 3, 'h')
  await place(1, 5, 'j')
  await place(1, 7, 'k')
  await place(3, 1, 'u')
  await place(3, 3, 'x')
  await place(3, 5, 'c')
  await place(3, 7, 'n')
  await drag([6, 1], [6, 7])
  const shots = []
  for (const thickness of [5, 10, 16]) {
    await setThickness(thickness)
    await page.waitForTimeout(200)
    const board = await boardClip()
    shots.push({ caption: `thickness ${thickness}`, buffer: await page.screenshot({ clip: { x: board.x, y: board.y, width: board.width, height: board.height * 0.84 } }) })
  }
  await setThickness(5)
  await stitch('pen-tool-extras-grid-marks.png', shots)
  await clear()
}

await browser.close()
