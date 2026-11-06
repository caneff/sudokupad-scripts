// Mockup (2026-11-06), not the build: the pen panel now, then with a 4rem line-mode button and two ways to label the sliders. Chris ruled variant A (the track is the label).
// Writes docs/research/pen-tool-extras-mode-button-mockup.png. Run from the repo root with Playwright Chromium. Not part of any test.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const url = readFileSync('live/puzzle-url.txt', 'utf8').trim()
const script = readFileSync('pen-tool-extras.user.js', 'utf8')
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })
await p.route(/cookiebot|googletagmanager|plausible/, r => r.abort())
await p.goto(url, { waitUntil: 'load' })
await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await p.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await p.locator('#control-undo').waitFor()
await p.addScriptTag({ content: script })
await p.evaluate(() => Framework.setSetting('toolpen', true))
await p.locator('#control-pen').waitFor()
for (let i = 0; i < 20 && !(await p.locator('.tool-pen button[data-key="1"]').isVisible()); i++) { await p.click('#control-pen'); await p.waitForTimeout(300) }
await p.locator('.pen-tool-extras-page').waitFor()
await p.locator('.tool-pen button[data-key="3"]').click()
const shots = []
const panel = async (label) => {
  await p.mouse.move(5, 5)
  await p.waitForTimeout(300)
  const r = await p.evaluate(() => { const e = document.querySelector('.tool-pen .controls-input').getBoundingClientRect(); return { x: e.x, y: e.y, width: e.width, height: e.height } })
  shots.push([label, (await p.screenshot({ clip: r })).toString('base64')])
}
await panel('now')
const C = '#6a1b9a'
const grid = `<path d="M3 3h18v18H3zM12 3v18M3 12h18" stroke="${C}" stroke-opacity=".3" stroke-width="1"/>`
const center = `<path d="M7.5 7.5H16.5V16.5" stroke="${C}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
const edge = `<path d="M3 12H12V21" stroke="${C}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
const icon = grid + center + edge
const wedge = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpolygon points='0,4 100,0 100,10 0,6' fill='%236a1b9a'/%3E%3C/svg%3E\") center / 100% 100% no-repeat"
const base = `
  .mock-mode path { fill: none !important; }
  .tool-pen .controls-input button.mock-mode { position: absolute; right: 4.3rem; top: 13rem; width: 4rem; height: 4rem; padding: 0; background-color: var(--body-bg); color: ${C}; }
  .mock-mode svg { width: 2.6rem; height: 2.6rem; }
  .pen-tool-extras-sliders { right: 8.6rem !important; }`
const variants = [
  ['A: the track is the label', `
  .pen-tool-extras-slider svg { display: none !important; }
  .pen-tool-extras-slider input { -webkit-appearance: none; appearance: none; background: transparent; height: 1.4rem; }
  .pen-tool-extras-slider input::-webkit-slider-runnable-track { height: .8rem; border-radius: .4rem; }
  #pen-tool-extras-thickness::-webkit-slider-runnable-track { background: ${wedge}; }
  #pen-tool-extras-opacity::-webkit-slider-runnable-track { background: linear-gradient(to right, rgb(106 27 154 / .08), rgb(106 27 154 / 1)); }
  .pen-tool-extras-slider input::-webkit-slider-thumb { -webkit-appearance: none; width: 1.1rem; height: 1.1rem; margin-top: -.15rem; border-radius: 50%; background: #fff; border: .2rem solid ${C}; box-sizing: border-box; }`],
  ['B: small marks', `
  .pen-tool-extras-slider { gap: .2rem !important; }
  .pen-tool-extras-slider svg { width: .7rem !important; }`]
]
for (const [label, css] of variants) {
  await p.evaluate(([html, css]) => {
    document.querySelectorAll('.mock-mode, style[data-mock]').forEach(e => e.remove())
    document.head.insertAdjacentHTML('beforeend', `<style data-mock>${css}</style>`)
    document.querySelector('.pen-tool-extras-page').insertAdjacentHTML('beforebegin',
      `<button class="mock-mode" title="Center &amp; Edge"><svg viewBox="0 0 24 24" fill="none">${html}</svg></button>`)
  }, [icon, base + css])
  await panel(`mockup ${label}`)
}
const sheet = await b.newPage({ viewport: { width: 1500, height: 900 } })
await sheet.setContent(`<body style="margin:0;background:#fff;font:22px sans-serif;display:flex;gap:20px;padding:16px;align-items:flex-start">${shots.map(([label, data]) => `<figure style="margin:0"><img src="data:image/png;base64,${data}" style="max-height:700px"><figcaption>${label}</figcaption></figure>`).join('')}</body>`)
await sheet.waitForLoadState('load')
await sheet.screenshot({ path: 'docs/research/pen-tool-extras-mode-button-mockup.png', fullPage: true })
await b.close()
