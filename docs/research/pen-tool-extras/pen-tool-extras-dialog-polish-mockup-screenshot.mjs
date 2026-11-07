// Mockup (2026-11-06), not the build: Pen Tool Extras' settings dialog as Chris ruled it over rounds 1 to 44 (.scratch/dialog): two columns with lines
// that meet, square pen colors, In panel sub-lines, a compact marks table, copy and paste as title-row icons, sentence-case labels.
// The script reshapes the live dialog with injected CSS and DOM moves; the build writes the markup itself.
// Run from the repo root with Playwright Chromium: node docs/research/pen-tool-extras/pen-tool-extras-dialog-polish-mockup-screenshot.mjs docs/research/pen-tool-extras/pen-tool-extras-dialog-polish-mockup.png
// Mockup (2026-11-06): Pen Tool Extras' settings dialog now, then with square pen colors and two takes on the marks table.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const out = process.argv[2]
const url = readFileSync('live/puzzle-url.txt', 'utf8').trim()
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 1100 }, deviceScaleFactor: 2 })
p.on('console', m => { if (m.text().startsWith('under')) console.log(m.text()) })
await p.route(/cookiebot|googletagmanager|plausible/, r => r.abort())
await p.goto(url, { waitUntil: 'load' })
await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app?.puzzle?.cells?.length)
await p.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await p.locator('#control-undo').waitFor()
await p.addScriptTag({ content: readFileSync('pen-tool-extras.user.js', 'utf8') })
await p.evaluate(() => Framework.setSetting('toolpen', true))
await p.click('#control-settings')
const group = p.locator('.dialog .setting-group').filter({ has: p.locator('label', { hasText: 'Experimental' }) })
await group.waitFor({ state: 'visible' })
if (await p.locator('.dialog .setting-group:not(.closed)').filter({ has: p.locator('label', { hasText: 'Experimental' }) }).count() === 0) await group.locator('label').first().click()
await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Pen tool extras' }).first().click()
await p.locator('#pen-tool-extras-editor').waitFor({ state: 'visible' })
const original = await p.evaluate(() => document.querySelector('#pen-tool-extras-editor').innerHTML)
const E = '#pen-tool-extras-editor'
const C = '#6a1b9a'
const SQUARES = `
  ${E} .pen-tool-extras-pen b { display: none; }
  ${E} .pen-tool-extras-pen-grid { grid-template-columns: repeat(3, 2.75rem); gap: 4px; margin: 6px 0; }
  ${E} .pen-tool-extras-pen input[type=color] { -webkit-appearance: none; appearance: none; box-sizing: border-box; width: 2.75rem; height: 2.75rem; padding: 0; margin: 0; border: 1px solid rgb(0 0 0 / .25); border-radius: 6px; background: none; cursor: pointer; }
  ${E} .pen-tool-extras-pen input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
  ${E} .pen-tool-extras-pen input[type=color]::-webkit-color-swatch { border: none; border-radius: 5px; }`
const TABLE = `
  ${E} .pen-tool-extras-marks-table { grid-template-columns: 5rem repeat(3, 5.5rem); column-gap: 8px; justify-items: center; }
  ${E} .pen-tool-extras-marks-table > div:nth-child(4n+1) { justify-self: start; }`
const A = TABLE + `
  ${E} .pen-tool-extras-mark-head { display: flex; flex-direction: column; align-items: center; gap: 4px; color: ${C}; font-size: .85rem; }
  ${E} .pen-tool-extras-mark-head span { color: #555; }
  ${E} .pen-tool-extras-mark-head svg { height: 22px; width: auto; }
  ${E} .pen-tool-extras-mark svg { display: none; }`
const B = TABLE + `
  ${E} .pen-tool-extras-mark-head { color: #555; font-size: .85rem; }
  ${E} .pen-tool-extras-mark { position: relative; box-sizing: border-box; justify-content: center; width: 5.5rem !important; height: 2.75rem; border: 1px solid #ccc; border-radius: 8px; background: #fff; color: #aaa; cursor: pointer; }
  ${E} .pen-tool-extras-mark input { position: absolute; opacity: 0; pointer-events: none; }
  ${E} .pen-tool-extras-mark:has(input:checked) { background: ${C}; border-color: ${C}; color: #fff; }
  ${E} .pen-tool-extras-mark svg { height: 20px; width: auto; }`

const PAD_W = 'calc(3 * 2.75rem + 2 * 4px)'
const SELECT = `${E} select[data-pen-preset] { width: ${PAD_W}; box-sizing: border-box; }`
const ALIGN = `
  ${E} .pen-tool-extras-marks-table { grid-template-columns: 5rem repeat(3, 5.5rem); column-gap: 8px; justify-items: center; }
  ${E} .pen-tool-extras-marks-table > div:nth-child(4n+1) { justify-self: start; }
  ${E} .pen-tool-extras-mark-head { display: flex; align-items: center; gap: 5px; font-size: .85rem; color: #555; }
  ${E} .pen-tool-extras-mark-head svg { height: 11px; width: auto; color: #555; }
  ${E} .pen-tool-extras-mark svg { display: none; }
  ${E} .pen-tool-extras-mark input { margin: 0; }`
const COMMON = `
  ${E} .pen-tool-extras-mark { gap: 8px; }
  ${E} .pen-tool-extras-mark svg { stroke-width: 2.6; }
  ${E} .pen-tool-extras-marks-table { column-gap: 8px; row-gap: 8px; }`
const SA = COMMON + `
  ${E} .pen-tool-extras-marks-table { grid-template-columns: 5rem repeat(2, 4.5em) max-content; }`
const SB = COMMON + `
  ${E} .pen-tool-extras-marks-table { grid-template-columns: minmax(6em, 12.5em) repeat(2, 4.5em) max-content; }`
const TOPC = `
  ${E} .mock-top { display: grid; grid-template-columns: max-content max-content; column-gap: 12px; align-items: start; }
  ${E} .mock-top .pen-tool-extras-pen-grid { margin: 0; }`
const TOPD = `
  ${E} .mock-title { display: flex; align-items: center; gap: 12px; }
  ${E} .pen-tool-extras-pen-grid { grid-template-columns: repeat(9, 2.75rem) !important; }
  ${E} select[data-pen-preset] { width: auto !important; }`
const TIGHT = `
  ${E} .pen-tool-extras-mark { gap: 3px; }
  ${E} .pen-tool-extras-mark svg { stroke-width: 2.6; }
  ${E} .pen-tool-extras-marks-table { grid-template-columns: repeat(4, max-content); column-gap: 18px; row-gap: 8px; }`
const SIDE = `
  .dialog:has(#pen-tool-extras-editor) { width: fit-content !important; max-width: 96vw !important; max-width: none !important; margin: 0 !important; }
  ${E} .mock-side { display: grid; grid-template-columns: calc(3 * 2.75rem + 2 * 4px + 24px) 1fr; margin-bottom: 4px; }
  ${E} .mock-side > div { padding: 10px 24px 10px 0; }
  ${E} .mock-side > div:nth-child(n+3) { border-top: 1px solid #ddd; }
  ${E} .mock-side > div:nth-child(1), ${E} .mock-side > div:nth-child(2) { padding-top: 0; }
  ${E} .mock-side > div:nth-child(2n) { border-left: 1px solid #ddd; padding: 10px 0 10px 24px; }
  ${E} .mock-side > div:nth-child(2) { padding-top: 0; }
  ${E} .mock-side .pen-tool-extras-section-title { margin-top: 0 !important; }
  ${E} .mock-side > div { min-width: 0; }
  
  ${E} .mock-side .pen-tool-extras-heading-row { margin-top: 0 !important; }
  ${E} .mock-side .pen-tool-extras-columns { grid-template-columns: 7.6em 96px 1.6em !important; }
  ${E} .mock-side .pen-tool-extras-range { width: 96px !important; min-width: 0 !important; }
  ${E} .mock-side .pen-tool-extras-style-block > .pen-tool-extras-span { grid-column: 1 / -1 !important; }
  ${E} .mock-sub { display: flex !important; justify-content: flex-start !important; width: auto !important; align-items: center; gap: 6px; padding-left: 1.2em; color: #444; margin: 0 0 4px; }
  ${E} .mock-sub input { margin: 0 !important; }
  ${E} .mock-side .pen-tool-extras-column-heading { text-align: center; justify-self: center; font-size: .8rem; }
  ${E} .mock-side .pen-tool-extras-columns > .pen-tool-extras-box { justify-self: center; }
  ${E} .mock-style-label { display: flex; align-items: center; gap: 6px; }
  ${E} .mock-style-label input { margin: 0 !important; }
  ${E} .mock-side .pen-tool-extras-style-block > .pen-tool-extras-span { grid-column: 1 / 4; }
  
  ${E} .mock-side .pen-tool-extras-divider { margin: 8px 0; }
  ${E} .mock-noop { }`
const MARKS2 = `
  ${E} .mock-marks { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
  ${E} .mock-marks .mock-row { display: grid; grid-template-columns: 52px 52px max-content; align-items: center; margin-bottom: 6px; }
  ${E} .mock-marks .pen-tool-extras-mark { gap: 3px; }
  ${E} .mock-marks .pen-tool-extras-mark input { margin: 0 !important; }
  ${E} .mock-marks .pen-tool-extras-mark svg { color: var(--mock-under); }
  ${E} .mock-marks .pen-tool-extras-mark svg { stroke-width: 2.6; }`
const WIDER = `
  ${E} .mock-side { grid-template-columns: calc(3 * 2.75rem + 2 * 4px + 52px) 1fr !important; }`
const CLOSE = `
  ${E} .mock-marks .pen-tool-extras-mark { gap: 0 !important; }
  ${E} .mock-marks .pen-tool-extras-mark svg { margin-left: -3px; }
  ${E} .mock-marks .pen-tool-extras-mark input { margin-right: -10px !important; }
  ${E} .mock-marks .mock-row > .pen-tool-extras-mark:nth-child(3) svg { margin-left: 3px; }`
const LINES = `
  ${E} .mock-side { border-top: 1px solid #ddd; margin-top: 8px; margin-bottom: 0 !important; }
  ${E} .mock-side > div:nth-child(1), ${E} .mock-side > div:nth-child(2) { padding-top: 10px !important; }
  ${E} .mock-side > div:nth-child(2) .pen-tool-extras-divider { margin-left: -24px !important; }
  .dialog-options.pen-tool-extras-dialog { margin-top: 0 !important; }
  .dialog p:has(> #pen-tool-extras-editor) { margin-bottom: 0 !important; }
  .mock-tools { position: absolute; top: 11px; right: 16px; display: flex; align-items: center; gap: 4px; }
  .mock-tools button { background: none !important; border: none !important; padding: 4px !important; margin: 0 !important; width: auto !important; min-width: 0 !important; height: auto !important; line-height: 0 !important; color: #777 !important; cursor: pointer; border-radius: 6px !important; }
  .mock-tools button:hover { background: #f0edf5 !important; }
  .mock-tools svg { width: 20px; height: 20px; }
  .mock-tools svg path, .mock-tools svg rect { fill: none !important; }
  .mock-tools [data-role="settings-status"] { font-size: .8rem; color: #777; margin-right: 6px; }
  ${E} .mock-side { grid-template-columns: max-content 1fr !important; }
  ${E} .mock-marks.pen-tool-extras-marks-table { display: grid !important; grid-template-columns: max-content repeat(3, 28px); column-gap: 0; row-gap: 0; align-items: stretch; justify-items: stretch; margin: 6px 0 0; }
  ${E} .mock-marks.pen-tool-extras-marks-table > div:nth-child(4n+1) { padding-right: 10px; justify-self: start; }
  ${E} .mock-marks .mock-head { display: flex; justify-content: center; }
  ${E} .mock-marks.pen-tool-extras-marks-table > * { display: flex !important; align-items: center; justify-content: center; height: 28px; box-sizing: border-box; margin: 0 !important; }
  ${E} .mock-marks.pen-tool-extras-marks-table > :nth-child(4n+1) { justify-content: flex-start; }
  ${E} .mock-marks.pen-tool-extras-marks-table > :not(:nth-child(4n+1)) { border-left: 1px solid #eee; }
  ${E} .mock-marks.pen-tool-extras-marks-table > :nth-child(n+5) { border-top: 1px solid #eee; }
  ${E} .mock-marks .mock-head svg { color: #444; stroke-width: 2.6; overflow: visible; }
  ${E} .mock-marks .pen-tool-extras-mark input { margin: 0 !important; }
  ${E} .mock-marks > .pen-tool-extras-mark:nth-child(4) svg { margin-left: 3px !important; }
  .dialog-options.pen-tool-extras-dialog button[data-role="restore"] { margin-right: auto !important; }
  .dialog-options.pen-tool-extras-dialog button[data-act] { background: none !important; border: none !important; color: #777 !important; padding: 0 4px !important; font-size: 0.85rem !important; text-decoration: underline !important; text-underline-offset: 3px; width: auto !important; min-width: 0 !important; height: 38px !important; line-height: 36px !important; margin: 0 !important; }
  .dialog-options.pen-tool-extras-dialog [data-role="settings-status"] { margin-right: auto; font-size: .8rem; color: #777; }`
const FILL = `
  ${E} .mock-side .pen-tool-extras-pen-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
  ${E} .mock-side .pen-tool-extras-pen { width: 0; min-width: 100%; }
  ${E} .mock-side div select[data-pen-preset] { width: 0 !important; min-width: 100% !important; }
  ${E} .mock-side .pen-tool-extras-pen input[type=color] { width: 100% !important; height: auto !important; aspect-ratio: 1; }
  ${E} .mock-side select[data-pen-preset] { width: 100% !important; }`
const shots = []
const Q = 'q', R = 'r'
for (const [label, css, mod, top, clean] of [['ruled', SQUARES + SELECT + TIGHT + SIDE + MARKS2 + WIDER + CLOSE + LINES + FILL, true, 'l', 's']]) {
  await p.evaluate(([html, css, mod, top, clean]) => {
    const ed = document.querySelector('#pen-tool-extras-editor')
    ed.innerHTML = html
    document.querySelectorAll('style[data-mock]').forEach(e => e.remove())
    document.head.insertAdjacentHTML('beforeend', `<style data-mock>${css}</style>`)
    const names = { 'page-1': 'Darker page 1', 'page-2': 'Darker page 2', 'page-3': 'Darker page 3', sudokupad: 'SudokuPad colors', custom: 'Custom', unsaved: 'Not saved yet' }
    ed.querySelectorAll('select[data-pen-preset] option').forEach(o => { if (names[o.value]) o.textContent = names[o.value] })
    const t = ed.querySelector('.pen-tool-extras-marks-table')
    ed.querySelectorAll('.pen-tool-extras-mark-head').forEach(h => h.remove())
    t.firstElementChild.remove()
    if (top === 'e' || top === 'l') {
      const title = ed.querySelector('.pen-tool-extras-pen-title'), sel = ed.querySelector('select[data-pen-preset]'), grid = ed.querySelector('.pen-tool-extras-pen-grid')
      const head = [...ed.querySelectorAll('.pen-tool-extras-heading-row')].find(h => h.textContent.includes('Line settings'))
      const divider = head.previousElementSibling
      const rows = []
      let n = head.nextElementSibling
      for (; n && !n.classList.contains('pen-tool-extras-divider'); n = n.nextElementSibling) rows.push(n)
      rows.push(n)
      for (n = n.nextElementSibling; n && !n.classList.contains('pen-tool-extras-divider'); n = n.nextElementSibling) rows.push(n)
      const side = document.createElement('div'); side.className = 'mock-side'
      const left = document.createElement('div'), right = document.createElement('div')
      title.before(side); side.append(left, right); left.append(title, sel, grid); right.append(head, ...rows)
      divider.remove()
      const titles = [...ed.querySelectorAll('.pen-tool-extras-section-title')]
      const marksTitle = titles.find(t => t.textContent.startsWith('Marks')), otherTitle = titles.find(t => t.textContent === 'Other')
      const left2 = document.createElement('div'), right2 = document.createElement('div')
      side.append(left2, right2)
      marksTitle.previousElementSibling.remove(); otherTitle.previousElementSibling.remove()
      const after = []
      for (let n = otherTitle.nextElementSibling; n; n = n.nextElementSibling) after.push(n)
      marksTitle.textContent = 'Marks to cycle'
      { const b = [...document.querySelectorAll('.dialog b')].find(e => e.textContent === 'Pen tool extras'); if (b) b.textContent = 'Pen Tool Extras' }
      for (const lab of ed.querySelectorAll('.pen-tool-extras-check-row label')) { if (lab.textContent.startsWith('White outline')) lab.textContent = 'White outlines'; if (lab.textContent.startsWith('Middle click')) lab.textContent = 'Middle click erase' }
      t.classList.add('mock-marks')
      const svgs = [...t.querySelectorAll('.pen-tool-extras-mark svg')]
      const markHeads = [document.createElement('div')].concat(svgs.slice(0, 3).map(sv => { const d = document.createElement('div'); d.className = 'mock-head'; d.append(sv.cloneNode(true)); return d }))
      t.prepend(...markHeads)
      svgs.forEach(sv => sv.remove())
      { const d = markHeads[3].querySelector('svg'); d.setAttribute('width', '30'); d.setAttribute('viewBox', '0 0 30 16'); d.innerHTML = '<path d="M3 11 L8 5 L13 11 M17 5 L22 11 L27 5"/>' }
      const m = t
      left2.append(marksTitle, m)
      { const opts = document.querySelector('.dialog-options.pen-tool-extras-dialog'), restore = opts.querySelector('[data-role="restore"]')
        const copy = document.querySelector('[data-act="copy-settings"]'), paste = document.querySelector('[data-act="paste-settings"]'), status = document.querySelector('[data-role="settings-status"]'), para = copy.closest('p')
        if (copy && para) {
          const tools = document.createElement('div'); tools.className = 'mock-tools'
          const icon = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
          copy.innerHTML = icon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'); copy.title = 'Copy settings'; copy.setAttribute('aria-label', 'Copy settings')
          paste.innerHTML = icon('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4"/>'); paste.title = 'Paste settings'; paste.setAttribute('aria-label', 'Paste settings')
          tools.append(status, copy, paste); status.textContent = ''
          document.querySelector('.dialog').append(tools); para.remove() } }
      const heads = [...ed.querySelectorAll('.pen-tool-extras-heading-row')]
      const cap = (word, text) => { const h = heads.find(x => x.textContent.includes(word)); h.querySelector('.pen-tool-extras-column-heading').textContent = text }
      cap('Line settings', '')
      if (clean === 's') {
        cap('Line styles', '')
        ed.querySelectorAll('.pen-tool-extras-style-block').forEach(b => { const box = b.querySelector('input'), span = b.querySelector('.pen-tool-extras-span'); span.classList.add('mock-style-label'); span.prepend(box) })
        ed.querySelectorAll('.mock-side .pen-tool-extras-columns').forEach(row => { const last = row.lastElementChild; if (last && last.tagName === 'SPAN' && !last.textContent) last.remove() })
        ed.querySelectorAll('.pen-tool-extras-heading-row').forEach(h => { const c = h.querySelector('.pen-tool-extras-column-heading'); if (c && !c.textContent) c.remove() })
        for (const key of ['thickness', 'opacity']) {
          const row = ed.querySelector(`[data-row="${key}"]`), box = row.querySelector('.pen-tool-extras-box')
          const sub = document.createElement('div'); sub.className = 'mock-sub'; const t = document.createElement('span'); t.textContent = 'In panel'; sub.append(box, t); row.after(sub)
        }
      }
      if (clean === 'r') cap('Line styles', 'On')
      if (clean === 'q') {
        cap('Line styles', '')
        ed.querySelectorAll('.pen-tool-extras-style-block').forEach(b => { const box = b.querySelector('input'), span = b.querySelector('.pen-tool-extras-span'); span.classList.add('mock-style-label'); span.prepend(box) })
      }
      right2.append(otherTitle, ...after)
    }
  }, [original, css, mod, top, clean])
  await p.waitForTimeout(200)
  console.log(label, await p.evaluate(() => { const l = (s) => +document.querySelector(s).getBoundingClientRect().left.toFixed(1); return { slider: l('#pen-tool-extras-editor input[type=range]'), boxes: [...document.querySelectorAll('#pen-tool-extras-editor .pen-tool-extras-mark input')].slice(0, 3).map(i => +i.getBoundingClientRect().left.toFixed(1)) } }))
  if (top === "e") console.log(await p.evaluate(() => [...document.querySelectorAll(".mock-marks input")].map(i => Math.round(i.getBoundingClientRect().left))))
  console.log(await p.evaluate(() => {
    const r = (e) => e.getBoundingClientRect()
    const side = document.querySelector('.mock-side'), cells = [...side.children], opts = document.querySelector('.dialog-options.pen-tool-extras-dialog')
    const div = cells[1].querySelector('.pen-tool-extras-divider'), ed = document.querySelector('#pen-tool-extras-editor')
    return { gridTop: r(side).top, vTop: r(cells[1]).top, vBottom: r(cells[3]).bottom, footerLine: r(opts).top, editorBottom: r(ed).bottom, innerDivLeft: r(div).left, vlineX: r(cells[1]).left, midLine: r(cells[3]).top, leftMid: r(cells[2]).top }
  }))
  console.log(await p.evaluate(() => { const col = document.querySelector('.mock-side').children[0].getBoundingClientRect(), t = document.querySelector('.mock-marks').getBoundingClientRect(), g = document.querySelector('.pen-tool-extras-pen-grid').getBoundingClientRect(); const hs = [...document.querySelectorAll('.mock-head svg')].map(e => e.getBoundingClientRect()); const sq = document.querySelector('.pen-tool-extras-pen-grid input[data-pen="9"]').getBoundingClientRect(), row = document.querySelector('.mock-side').children[1].getBoundingClientRect(); const right = document.querySelector('.mock-side').children[1]; const wide = [...right.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim()).map(e => [e.textContent.trim(), Math.round(e.getBoundingClientRect().right)]).sort((a, b) => b[1] - a[1]).slice(0, 4); const opts = document.querySelector('.dialog-options.pen-tool-extras-dialog'); const kids = [...opts.children].reduce((w, c) => w + c.getBoundingClientRect().width, 0); const ranges = [...document.querySelectorAll('.mock-side .pen-tool-extras-range')].map(r => Math.round(r.getBoundingClientRect().left)); const rightMax = Math.max(...[...right.querySelectorAll('.pen-tool-extras-columns, .mock-sub, .pen-tool-extras-check-row, .pen-tool-extras-heading-row')].map(e => { const k = [...e.children]; return k.length ? Math.max(...k.map(c => c.getBoundingClientRect().right)) - right.getBoundingClientRect().left : 0 })); return { ranges, footerChildrenW: Math.round(kids), rightContent: Math.round(rightMax), wide, rightCol: [Math.round(right.getBoundingClientRect().left), Math.round(right.getBoundingClientRect().right)], square: Math.round(sq.width), padBottom: Math.round(sq.bottom), rowBottom: Math.round(row.bottom), headGaps: [Math.round(hs[1].left - hs[0].right), Math.round(hs[2].left - hs[1].right)], boxes: [...document.querySelectorAll('.mock-marks input')].map(i => { const b = i.getBoundingClientRect(); return Math.round((b.left + b.right) / 2) }), heads: [...document.querySelectorAll('.mock-head svg')].map(e => { const b = e.getBoundingClientRect(); return Math.round((b.left + b.right) / 2) }), table: [Math.round(t.left), Math.round(t.right), Math.round(t.height)], pad: [Math.round(g.left), Math.round(g.right)], colRight: Math.round(col.right), dialogW: Math.round(document.querySelector('.dialog').getBoundingClientRect().width) } }))
  const titleBox = await p.evaluate(() => { const t = [...document.querySelectorAll('.dialog *')].find(e => e.children.length <= 1 && /^Pen tool extras/i.test(e.textContent)); const r = t.getBoundingClientRect(), i = document.querySelector('.mock-tools').getBoundingClientRect(); return { titleMid: Math.round((r.top + r.bottom) / 2), iconsMid: Math.round((i.top + i.bottom) / 2), iconsRight: Math.round(i.right), divR: Math.round(document.querySelector('.mock-side').getBoundingClientRect().right) } })
  console.log(titleBox)
  shots.push([label, (await p.locator('.dialog').screenshot()).toString('base64')])
}
const sheet = await b.newPage({ viewport: { width: 1800, height: 900 } })
await sheet.setContent(`<body style="margin:0;background:#888;font:20px sans-serif;display:flex;gap:16px;padding:16px;align-items:flex-start">${shots.map(([l, d]) => `<figure style="margin:0"><img src="data:image/png;base64,${d}" style="width:900px"><figcaption style="color:#fff">${l}</figcaption></figure>`).join('')}</body>`)
await sheet.screenshot({ path: out, fullPage: true })
await b.close()
