import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { openSettings } from '../../live/settings.mjs'
const url = readFileSync('live/puzzle-url.txt', 'utf8').trim()
const script = readFileSync('pen-tool-extras.user.js', 'utf8')
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1.5 })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.evaluate(() => Framework.setData('setting-toolpen', true))
await page.addScriptTag({ content: script })
await page.waitForTimeout(800)
const group = await openSettings(page)
await group.locator('button').filter({ hasText: /pen tool extras/i }).click()
await page.waitForTimeout(500)
await page.evaluate(MOCK)
await page.waitForTimeout(300)
await page.locator('.dialog').first().screenshot({ path: '.scratch/pte-dialog/mock-tmp.png' })
await browser.close()
function MOCK () {
  const d = document.querySelector('.dialog')
  const ed = d.querySelector('#pen-tool-extras-editor')
  const st = document.createElement('style')
  st.textContent = `
    #pen-tool-extras-editor label[for*="setting-"] { min-width: 11em !important }
    #pen-tool-extras-editor input[type=range] { width: 11em }
    #pen-tool-extras-editor [data-sudokupad-colors] { background: #f1eff5 !important; color: #333 !important; border: 1px solid #cfc9db !important; border-radius: 8px !important; font-size: 0.9rem !important; padding: 0 14px !important; height: 34px !important; line-height: 32px !important; align-self: center !important; margin: 0 !important; font-weight: 500 }
    #pen-tool-extras-editor [data-colors-row] { align-items: center !important }
    #pen-tool-extras-editor select { font-size: 0.95rem !important; padding: 4px 28px 4px 10px; border: 1px solid #b9b0c9; border-radius: 6px; background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b4fa0'/%3E%3C/svg%3E") no-repeat right 10px center; appearance: none; color: #222 }
    .dialog-options.mock { display: flex !important; align-items: center; gap: 10px; flex-direction: row !important; justify-content: flex-end; border-top: 1px solid #e3dff0; padding: 14px 4px 2px; margin-top: 8px; box-sizing: border-box; width: 100% }
    .dialog-options.mock button { width: auto !important; min-width: 0 !important; margin: 0 !important; padding: 0 22px !important; height: 38px !important; line-height: 36px !important; border-radius: 8px !important; font-size: 1rem !important; flex: none }
    .dialog-options.mock button.save { background: #6b3fa0 !important; color: #fff !important; border: 1px solid #5a3489 !important; font-weight: 600 }
    .dialog-options.mock button.cancel { background: #f1eff5 !important; color: #333 !important; border: 1px solid #cfc9db !important }
    .dialog-options.mock button.restore { margin-right: auto !important; background: none !important; border: none !important; color: #777 !important; padding: 0 4px !important; font-size: 0.85rem !important; text-decoration: underline; text-underline-offset: 3px }
  `
  document.head.appendChild(st)
  d.querySelector('#pen-tool-extras-outline').checked = true
  const ow = d.querySelector('[data-setting=outlineWidth]'); ow.value = 2; d.querySelector('[data-readout=outlineWidth]').textContent = '2'
  // Middle click section, before Pen line mode.
  const lm = [...ed.children].find((e) => e.textContent === 'Pen line mode')
  const h = document.createElement('div'); h.style.cssText = 'font-weight:600;margin-top:10px'; h.textContent = 'Middle click line erase'
  const row = document.createElement('div'); row.style.cssText = 'margin:6px 0 4px;display:flex;align-items:center;gap:6px'
  row.innerHTML = '<input type="checkbox" checked id="mc" style="margin:0"><label for="mc" style="width:auto;text-align:left;margin:0">Middle click erases a whole line</label>'
  ed.insertBefore(row, lm)
  const oh = [...ed.children].find((e) => e.textContent === 'Outline'); oh.textContent = 'Other'
  const LABEL_W = '12.5em'
  for (const k of ['thickness', 'opacity', 'dash', 'outlineWidth']) {
    const row = d.querySelector('[data-setting=' + k + ']').parentElement
    row.querySelector('label').style.minWidth = LABEL_W
    row.querySelector('output').style.minWidth = '2em'
  }
  for (const k of ['thickness', 'opacity']) {
    const box = d.querySelector('[data-show=' + k + ']')
    const oldRow = box.parentElement
    const row = d.querySelector('[data-setting=' + k + ']').parentElement
    box.title = 'Show this slider in the pen panel'
    box.style.margin = '0 0 0 14px'
    row.append(box)
    oldRow.remove()
  }
  {
    const dash = d.querySelector('[data-setting=dash]')
    const dRow = dash.parentElement
    const aRow = dRow.cloneNode(true)
    aRow.querySelector('label').textContent = 'Arrow spacing (page 3)'
    const ai = aRow.querySelector('input'); ai.dataset.setting = 'arrow'; ai.removeAttribute('id'); ai.min = 1; ai.max = 8; ai.value = 3
    aRow.querySelector('output').textContent = '3'
    dRow.after(aRow)
    for (const r of [dRow, aRow]) {
      const t = document.createElement('input'); t.type = 'checkbox'; t.checked = true; t.title = 'Include this page in the page rotation'
      t.style.margin = '0 0 0 14px'; r.append(t)
    }
  }
  for (const [k, name, param] of [['dash', 'Dashed lines', 'Dash width'], ['arrow', 'Directional arrow lines', 'Arrow spacing']]) {
    const row = d.querySelector('[data-setting=' + k + ']').parentElement
    const lab = row.querySelector('label')
    lab.textContent = param
    lab.style.paddingLeft = '1.2em'; lab.style.boxSizing = 'border-box'; lab.style.color = '#444'
    const top = document.createElement('div'); top.style.cssText = 'display:flex;align-items:center;margin:6px 0 2px'
    top.innerHTML = '<span>' + name + '</span>'
    top.dataset.styleName = k
    row.before(top)
  }
  for (const k of ['dash', 'arrow']) {
    const row = d.querySelector('[data-setting=' + k + ']').parentElement
    const tick = row.querySelector('input[type=checkbox]')
    const top = d.querySelector('[data-style-name=' + k + ']')
    if (tick) { tick.style.marginLeft = 'auto'; top.append(tick); const pad = document.createElement('span'); pad.style.width = '13px'; pad.style.marginLeft = '14px'; pad.style.visibility = 'hidden'; row.append(pad) }
  }
  const sh = [...ed.children].find((e) => e.textContent === 'Sliders')
  sh.style.display = 'flex'; sh.style.alignItems = 'baseline'
  const col = document.createElement('span'); col.textContent = 'Slider in panel'
  col.style.cssText = 'font-weight:400;font-size:.8rem;color:#666;margin-left:auto;margin-right:2px'
  sh.append(col)
  {
    const box = d.querySelector('#pen-tool-extras-outline'); const oldRow = box.parentElement
    const row = d.querySelector('[data-setting=outlineWidth]').parentElement
    const lab = row.querySelector('label')
    lab.textContent = 'White outline on lines and marks'
    const wrap = document.createElement('span'); wrap.style.cssText = 'display:flex;align-items:center;gap:6px;white-space:nowrap;min-width:' + LABEL_W
    box.style.margin = '0'
    lab.style.minWidth = '0'
    wrap.append(box, lab); row.prepend(wrap); oldRow.remove()
  }
  {
    const ref = d.querySelector('[data-setting=thickness]').getBoundingClientRect().left
    const ow = d.querySelector('[data-setting=outlineWidth]')
    const wrap = ow.parentElement.firstElementChild
    wrap.style.minWidth = '0'; wrap.style.flex = 'none'
    wrap.style.marginRight = '14px'; ow.style.width = '7em'; void ref
    const b = d.querySelector('[data-show=thickness]').getBoundingClientRect()
    const shr = sh.getBoundingClientRect()
    sh.style.width = (b.left + b.width / 2 - shr.left + col.getBoundingClientRect().width / 2) + 'px'
    col.style.marginRight = '0'
    sh.firstChild.textContent = 'Line settings'
    const sh2 = sh.cloneNode(true)
    sh2.firstChild.textContent = 'Line styles'
    sh2.style.marginTop = '10px'
    d.querySelector('[data-style-name=dash]').before(sh2)
    sh2.lastChild.textContent = 'Enable'
    for (const top of d.querySelectorAll('[data-style-name]')) {
      const tk = top.querySelector('input'); tk.style.marginRight = (top.getBoundingClientRect().right - b.right) + 'px'
    }
    sh2.style.width = (b.left + b.width / 2 - shr.left + sh2.lastChild.getBoundingClientRect().width / 2) + 'px'
  }
  {
    const cell = (k) => { const r = d.querySelector('[data-mark=' + k + ']').parentElement; const lab = r.querySelector('label'); r.title = lab.textContent; lab.textContent = ''; r.style.margin = '0'; return r }
    const ch = (pts) => '<polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
    const dir = cell('directions'); dir.querySelector('svg').outerHTML = '<svg width="64" height="16" viewBox="0 0 64 16">' + ch('3,3 9,8 3,13') + ch('25,3 19,8 25,13') + ch('36,11 41,5 46,11') + ch('54,5 59,11 64,5') + '</svg>'
    const cells = { x: cell('x'), dot: cell('dot'), cx: cell('cornerX'), cd: cell('cornerDot') }
    const heads = [...ed.children].filter((e) => /cycles through$/.test(e.textContent))
    const grid = document.createElement('div')
    grid.style.cssText = 'display:grid;grid-template-columns:max-content repeat(3, max-content);column-gap:28px;row-gap:6px;align-items:center;margin:4px 0'
    const t = (txt, css) => { const e = document.createElement('div'); e.textContent = txt; e.style.cssText = css || ''; return e }
    const hcss = 'font-size:.85rem;color:#666'
    grid.append(t(''), t('X Mark', hcss), t('Circle', hcss), t('Directions', hcss),
      t('Edge'), cells.x, cells.dot, dir,
      t('Corner'), cells.cx, cells.cd, t(''))
    heads[0].textContent = 'Marks a click cycles through'
    heads[0].after(grid)
    heads[1].remove()
    for (const e of [...ed.children]) if (e.children.length === 0 && e.tagName === 'DIV' && !e.textContent.trim() && e !== grid) e.remove()
  }
  for (const e of [...ed.children]) {
    if (e.style.fontWeight === '600' && e !== ed.firstElementChild) { const hr = document.createElement('div'); hr.style.cssText = 'border-top:1px solid #e3dff0;margin:12px 0 0'; e.before(hr); e.style.marginTop = '10px' }
  }
  const o = d.querySelector('.dialog-options'); o.classList.add('mock')
  const [s, c, r] = o.querySelectorAll('button')
  s.className = 'save'; c.className = 'cancel'; r.className = 'restore'
  o.replaceChildren(r, c, s)
}
