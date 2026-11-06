// Mockup (2026-11-06), not the build: the pen panel redesign Chris ruled over rounds 1 to 14 (.scratch/pen-panel): color buttons 2.5rem tall, a full-size
// row of mode, line type and settings buttons on a tray with the sliders, icons all 34px and centred. The script reshapes the live panel with injected CSS;
// the icon corrections (scale, shift) were measured from rendered pixels and are written in below.
// Run from the repo root with Playwright Chromium: node docs/research/pen-tool-extras-panel-redesign-mockup-screenshot.mjs docs/research/pen-tool-extras-panel-redesign-mockup.png
// Mockup (2026-11-06): the pen panel now, and with smaller color buttons, a fourth column of mode, page and settings buttons, and the sliders across a full row.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const out = process.argv[2]
const url = readFileSync('live/puzzle-url.txt', 'utf8').trim()
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })
await p.route(/cookiebot|googletagmanager|plausible/, r => r.abort())
await p.goto(url, { waitUntil: 'load' })
await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app?.puzzle?.cells?.length)
await p.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await p.locator('#control-undo').waitFor()
await p.addScriptTag({ content: readFileSync('pen-tool-extras.user.js', 'utf8') })
await p.evaluate(() => Framework.setSetting('toolpen', true))
for (let i = 0; i < 20 && !(await p.locator('.tool-pen button[data-key="1"]').isVisible()); i++) { await p.click('#control-pen'); await p.waitForTimeout(300) }
await p.locator('.pen-tool-extras-page').waitFor()
await p.locator('.tool-pen button[data-key="3"]').click()
const shots = []
const shoot = async (label) => {
  await p.mouse.move(5, 5); await p.waitForTimeout(300)
  const r = await p.evaluate(() => { const e = document.querySelector('.tool-pen .controls-input').getBoundingClientRect(); return { x: e.x - 8, y: e.y - 8, width: e.width + 16, height: e.height + 16 } })
  shots.push([label, (await p.screenshot({ clip: r })).toString('base64')])
}

const CSS = `
  .tool-pen .controls-input { display: grid !important; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, calc(2.5rem + 4.8px)) calc(4rem + 4.8px + 0.5rem) 1fr; position: relative; height: 284px !important; padding: 0 !important; box-sizing: border-box; justify-items: center; align-items: center; }
  .tool-pen .controls-input button[data-control="delete"], .tool-pen .controls-input button[data-key="0"] { display: none !important; }
  .tool-pen .controls-input > .button-row { display: contents !important; }
  .tool-pen .controls-input button { position: relative !important; width: 66px !important; height: 2.5rem !important; min-width: 0 !important; margin: 2.4px !important; }
  .tool-pen .controls-input button.pen-tool-extras-mode, .tool-pen .controls-input button.pen-tool-extras-page { display: flex !important; align-items: center; justify-content: center; padding: 0 !important; top: auto !important; right: auto !important; left: auto !important; bottom: auto !important; }
  .tool-pen .controls-input button.pen-tool-extras-mode { grid-area: 4 / 1; }
  .tool-pen .controls-input button.pen-tool-extras-mode, .tool-pen .controls-input button.pen-tool-extras-page, .tool-pen .controls-input button.mock-gear { height: 4rem !important; align-self: end; }
  .tool-pen .controls-input button.pen-tool-extras-page { grid-area: 4 / 2; }
  .tool-pen .controls-input button.mock-gear { grid-area: 4 / 3; background-color: var(--body-bg); color: #6a1b9a; padding: 0; display: flex; align-items: center; justify-content: center; }
  .tool-pen .controls-input .pen-tool-extras-mode svg, .tool-pen .controls-input .pen-tool-extras-page svg { width: 2.6rem !important; height: 2.6rem !important; }
  .mock-gear svg { width: 2.2rem; height: 2.2rem; }
  .mock-gear svg path { fill: #6a1b9a !important; }
  .tool-pen .controls-input .pen-tool-extras-sliders { grid-area: 5 / 1 / 6 / 4; justify-self: stretch; align-self: stretch; position: relative !important; margin: 2.4px !important; height: auto !important; top: auto !important; right: auto !important; left: auto !important; justify-content: space-evenly !important; padding: 0 .8rem !important; }
  .tool-pen .controls-input .pen-tool-extras-sliders > * { height: 1.4rem !important; }
  .tool-pen .controls-input .pen-tool-extras-sliders > .pen-tool-extras-sliders-box { position: absolute !important; inset: 0 !important; width: auto !important; height: auto !important; margin: 0 !important; }`
const keys = await p.evaluate((css) => {
  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`)
  const ci = document.querySelector('.tool-pen .controls-input')
  const gear = document.querySelector('.pen-tool-extras-gear svg')
  const btn = document.createElement('button'); btn.className = 'mock-gear'; btn.title = 'Pen Tool Extras settings'; btn.innerHTML = gear.outerHTML
  btn.firstElementChild.classList.add('mock-solid')
  btn.insertAdjacentHTML('beforeend', '<svg class="mock-outline" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>')
  ci.append(btn)
  const rule = document.createElement('div'); rule.className = 'mock-rule'; ci.append(rule)
  const tray = document.createElement('div'); tray.className = 'mock-tray'; ci.prepend(tray)
  for (let k = 1; k <= 9; k++) { const e = document.querySelector(`.tool-pen button[data-key="${k}"]`); e.style.gridArea = `${Math.ceil(k / 3)} / ${(k - 1) % 3 + 1}` }
  return [...ci.querySelectorAll('button, .pen-tool-extras-sliders')].filter(e => getComputedStyle(e).display !== 'none').map(e => [e.className || e.dataset.key, Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)])
}, CSS)
console.log(JSON.stringify(keys.filter(k => k[0] !== 'digit'))); console.log(JSON.stringify(await p.evaluate(() => { const r = document.querySelector('.tool-pen .controls-input').getBoundingClientRect(), s = document.querySelector('.pen-tool-extras-sliders').getBoundingClientRect(); const b9 = document.querySelector('.tool-pen button[data-key="9"]').getBoundingClientRect(), m = document.querySelector('.pen-tool-extras-mode').getBoundingClientRect(), b6 = document.querySelector('.tool-pen button[data-key="6"]').getBoundingClientRect(); return { panel: [r.top, r.bottom], sliders: [s.top, s.bottom], colorGap: Math.round(b9.top - b6.bottom), gap34: Math.round(m.top - b9.bottom), sliderH: Math.round(s.height) } })))
await p.evaluate(() => document.head.insertAdjacentHTML('beforeend', '<style id="mock-variant"></style>'))
const VARIANTS = [
  ['C: B2 mode and type, outline gear, all 34px and centred', `
    .tool-pen .controls-input { grid-template-rows: repeat(3, calc(2.5rem + 4.8px)) calc(4rem + 4.8px + 0.75rem) 1fr !important; }
    .mock-rule { display: none; }
    .mock-tray { grid-area: 4 / 1 / 6 / 4; justify-self: stretch; align-self: stretch; margin: 0.5rem -4px 0 -4px; background: #efeaf4; border-radius: 14px; }
    .tool-pen .controls-input .pen-tool-extras-sliders { margin-bottom: 6.5px !important; }
    .tool-pen .controls-input button, .tool-pen .controls-input .pen-tool-extras-sliders { z-index: 1; }
    .mock-gear .mock-solid { display: none !important; }
    .mock-gear .mock-outline { display: block !important; }
    .mock-gear .mock-outline path, .mock-gear .mock-outline circle { fill: none !important; stroke: #6a1b9a; }
`]
]
for (const [label, css] of VARIANTS) {
  await p.evaluate((css) => { document.getElementById('mock-variant').textContent = css }, css)
  const fix = [{"k": 0.9714, "dx": 0.49, "dy": 1.46}, {"k": 1.0303, "dx": 0.52, "dy": 5.87}, {"k": 0.8608, "dx": 0.43, "dy": 1.89}]
  await p.evaluate((fix) => {
    ['.pen-tool-extras-mode', '.pen-tool-extras-page', '.mock-gear'].forEach((q, n) => {
      const svg = [...document.querySelectorAll(q + ' svg')].find(e => getComputedStyle(e).display !== 'none')
      svg.style.setProperty('width', '2.6rem', 'important'); svg.style.setProperty('height', '2.6rem', 'important'); svg.style.overflow = 'visible'
      if (fix) svg.style.transform = `translate(${fix[n].dx}px, ${fix[n].dy}px) scale(${fix[n].k})`
    })
  }, fix)
  console.log(label, JSON.stringify(await p.evaluate(() => { const r = document.querySelector('.tool-pen .controls-input').getBoundingClientRect(), s = document.querySelector('.pen-tool-extras-sliders').getBoundingClientRect(), b9 = document.querySelector('.tool-pen button[data-key="9"]').getBoundingClientRect(), m = document.querySelector('.pen-tool-extras-mode').getBoundingClientRect(); return { gap34: Math.round(m.top - b9.bottom), sliderH: Math.round(s.height), overflow: Math.round((s.bottom - r.bottom) * 10) / 10 } })))
  console.log('INK', JSON.stringify(await p.evaluate(() => ['.pen-tool-extras-mode', '.pen-tool-extras-page', '.mock-gear'].map(q => { const svg = [...document.querySelectorAll(q + ' svg')].find(e => getComputedStyle(e).display !== 'none'), b = document.querySelector(q).getBoundingClientRect(), r = svg.getBoundingClientRect(), bb = svg.getBBox(), vb = svg.viewBox.baseVal, k = r.width / (vb && vb.width ? vb.width : r.width); return [q, 'box ' + Math.round(r.width) + 'x' + Math.round(r.height), 'ink ' + Math.round(bb.width * k) + 'x' + Math.round(bb.height * k), 'button ' + Math.round(b.width) + 'x' + Math.round(b.height)] }))))
  console.log('PAD', JSON.stringify(await p.evaluate(() => { const t = document.querySelector('.mock-tray').getBoundingClientRect(), m = document.querySelector('.pen-tool-extras-mode').getBoundingClientRect(), g = document.querySelector('.mock-gear').getBoundingClientRect(), s = document.querySelector('.pen-tool-extras-sliders').getBoundingClientRect(); return { top: +(m.top - t.top).toFixed(1), left: +(m.left - t.left).toFixed(1), right: +(t.right - g.right).toFixed(1), bottom: +(t.bottom - s.bottom).toFixed(1) } })))
  await shoot(label)
  if (process.env.ROW4) await p.screenshot({ path: process.env.ROW4, clip: await p.evaluate(() => { const a = document.querySelector('.pen-tool-extras-mode').getBoundingClientRect(), g = document.querySelector('.mock-gear').getBoundingClientRect(); return { x: a.left, y: a.top, width: g.right - a.left, height: a.height } }) })
  console.log('BTNS', JSON.stringify(await p.evaluate(() => ['.pen-tool-extras-mode', '.pen-tool-extras-page', '.mock-gear'].map(q => { const r = document.querySelector(q).getBoundingClientRect(), a = document.querySelector('.pen-tool-extras-mode').getBoundingClientRect(); return [r.left - a.left, r.width, r.height] }))))
}
const sheet = await b.newPage({ viewport: { width: 500, height: 640 } })
await sheet.setContent(`<body style="margin:0;background:#888;font:18px sans-serif;display:flex;gap:24px;padding:16px;align-items:flex-start">${shots.map(([l, d]) => `<figure style="margin:0;width:460px"><img src="data:image/png;base64,${d}" style="width:460px"><figcaption style="color:#fff">${l}</figcaption></figure>`).join('')}</body>`)
await sheet.screenshot({ path: out, fullPage: true })
await b.close()
