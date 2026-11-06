// Mockup (2026-11-06), not the build: the pen panel's sliders in a box styled like a pen button, and the line mode icon's grid at
// stroke-opacity 0.55, on the light page and Dark Page, with the mode button hovered. Chris ruled it as shown.
// Run from the repo root with Playwright Chromium: node docs/research/pen-tool-extras-slider-box-mockup-screenshot.mjs docs/research/pen-tool-extras-slider-box-mockup.png
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const out = process.argv[2]
const url = readFileSync('live/puzzle-url.txt', 'utf8').trim()
const pen = readFileSync('pen-tool-extras.user.js', 'utf8')
const dark = readFileSync('dark-page.user.js', 'utf8')
const b = await chromium.launch()
const shots = []
const BOX = `
  .pen-tool-extras-sliders { box-sizing: border-box; padding: 0 .6rem; top: 13rem !important; height: 4rem !important;
    background: var(--mock-bg) !important; border: var(--mock-border) !important; border-radius: var(--mock-radius) !important; box-shadow: var(--mock-shadow) !important; }`
for (const theme of ['light', 'Dark Page']) {
  const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })
  await p.route(/cookiebot|googletagmanager|plausible/, r => r.abort())
  await p.goto(url, { waitUntil: 'load' })
  await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
  await p.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
  await p.locator('#control-undo').waitFor()
  if (theme === 'SudokuPad dark mode') await p.evaluate(() => Framework.setSetting('darkmode', true))
  if (theme === 'Dark Page') await p.addScriptTag({ content: dark })
  await p.addScriptTag({ content: pen })
  await p.evaluate(() => Framework.setSetting('toolpen', true))
  await p.locator('#control-pen').waitFor()
  for (let i = 0; i < 20 && !(await p.locator('.tool-pen button[data-key="1"]').isVisible()); i++) { await p.click('#control-pen'); await p.waitForTimeout(300) }
  await p.locator('.pen-tool-extras-page').waitFor()
  await p.locator('.tool-pen button[data-key="3"]').click()
  const panel = async (label) => {
    await p.mouse.move(5, 5); await p.waitForTimeout(300)
    void 0
    const r = await p.evaluate(() => { const e = document.querySelector('.tool-pen .controls-input').getBoundingClientRect(); return { x: e.x - 6, y: e.y - 6, width: e.width + 12, height: e.height + 12 } })
    shots.push([label, (await p.screenshot({ clip: r })).toString('base64')])
  }
  await panel(`${theme}: now`)
  const style = await p.evaluate((css) => {
    const s = getComputedStyle(document.querySelector('.tool-pen button[data-key="9"]'))
    const root = document.documentElement.style
    root.setProperty('--mock-bg', s.backgroundColor)
    root.setProperty('--mock-border', `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`)
    root.setProperty('--mock-radius', s.borderTopLeftRadius)
    root.setProperty('--mock-shadow', s.boxShadow)
    document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`)
    return { bg: s.backgroundColor, border: s.borderTopColor, radius: s.borderTopLeftRadius, body: getComputedStyle(document.body).backgroundColor }
  }, BOX)
  console.log(theme, JSON.stringify(style))
  await p.evaluate(() => document.querySelectorAll('.pen-tool-extras-mode path[data-grid]').forEach(e => e.setAttribute('stroke-opacity', '0.55')))
  await panel(`${theme}: box, grid 0.55`)
  await p.hover('.pen-tool-extras-mode'); await p.waitForTimeout(400)
  console.log(theme, 'hover', await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.pen-tool-extras-mode')); return [s.backgroundColor, s.color, s.opacity, s.filter] }))
  const r = await p.evaluate(() => { const e = document.querySelector('.pen-tool-extras-mode').getBoundingClientRect(); return { x: e.x - 4, y: e.y - 4, width: e.width + 8, height: e.height + 8 } })
  shots.push([`${theme}: grid 0.55, hovered`, (await p.screenshot({ clip: r })).toString('base64')])
  await p.close()
}
const sheet = await b.newPage({ viewport: { width: 1600, height: 900 } })
await sheet.setContent(`<body style="margin:0;background:#888;font:20px sans-serif;display:grid;grid-template-columns:repeat(3,auto);gap:16px;padding:16px;justify-content:start">${shots.map(([l, d]) => `<figure style="margin:0"><img src="data:image/png;base64,${d}" style="height:480px"><figcaption style="color:#fff">${l}</figcaption></figure>`).join('')}</body>`)
await sheet.screenshot({ path: out, fullPage: true })
await b.close()
