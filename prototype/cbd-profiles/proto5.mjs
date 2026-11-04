// PROTOTYPE, throwaway: the profile menu popped from the Color by Digit button, and the dialog's
// profile list, drawn on sudokupad.app. Run from the repo root: node .scratch/proto-profiles/proto5.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const dir = new URL('./', import.meta.url).pathname
const url = readFileSync('live/puzzle-url.txt', 'utf8').trim()
const script = readFileSync('color-by-digit.user.js', 'utf8')

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.evaluate(() => Framework.setData('ColorByDigit_auto', true))
await page.addScriptTag({ content: script })
const btn = page.locator('#control-colorbydigit')
await btn.waitFor({ state: 'visible' })
await page.waitForTimeout(800)

// [name, [[palette key, lowest digit], ...]]; Low/5/High is active.
const PROFILES = [
  ['Low/5/High', [['1', '1'], ['5', '5'], ['9', '6']]],
  ['Odd/Even', [['1', '1'], ['2', '2']]],
  ['Killer sums', [['3', '1'], ['5', '4'], ['7', '7']]]
]
const ACTIVE = 0

await page.evaluate(() => {
  const css = getComputedStyle(document.documentElement)
  const color = (k) => css.getPropertyValue('--cell-color-' + k).trim()
  const ink = (c) => {
    const el = document.createElement('div'); el.style.color = c; document.body.appendChild(el)
    const [r, g, b] = getComputedStyle(el).color.match(/\d+/g).map(Number); el.remove()
    return 0.299 * r + 0.587 * g + 0.114 * b < 140 ? '#fff' : '#111'
  }
  // The button face: an Auto pill at the top (ticked or not), the profile's colors, the menu arrow bottom right.
  window.protoButton = (groups, on) => {
    const n = Math.min(groups.length, 4)
    const size = n === 4 ? 14 : 17
    const cells = groups.slice(0, 4).map(([k, d]) => `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:3px;background:${color(k)};color:${ink(color(k))};box-shadow:inset 0 0 0 1px rgba(0,0,0,.25);font:700 ${Math.round(size * 0.62)}px/1 system-ui,sans-serif">${d}</span>`).join('')
    const pill = `<span style="position:absolute;top:5px;left:5px;display:inline-flex;align-items:center;gap:3px;height:15px;padding:0 5px 0 3px;border-radius:8px;font:700 9px/1 system-ui,sans-serif;letter-spacing:.04em;${on ? 'background:#6a1b9a;color:#fff' : 'background:#fff;color:#6a1b9a;box-shadow:inset 0 0 0 1.5px #6a1b9a'}"><span style="display:inline-flex;align-items:center;justify-content:center;width:10px;height:10px;border-radius:2px;${on ? 'background:#fff;color:#6a1b9a' : 'box-shadow:inset 0 0 0 1.5px #6a1b9a'};font-size:8px">${on ? '&#10003;' : ''}</span>AUTO</span>`
    const arrow = '<span style="position:absolute;bottom:4px;right:4px;width:14px;height:14px;box-sizing:border-box;border-radius:3px;box-shadow:inset 0 0 0 1.5px #6a1b9a;background:#fff;color:#6a1b9a;font:bold 8px/14px system-ui;text-align:center">&#9660;</span>'
    const grid = n === 4 ? 'display:grid;grid-template-columns:repeat(2,14px);gap:2px' : 'display:flex;gap:2px'
    return `<span class="proto-face" style="position:absolute;inset:0">${pill}<span style="position:absolute;left:0;right:0;top:23px;display:flex;justify-content:center"><span style="${grid}">${cells}</span></span>${arrow}</span>`
  }
})
await page.evaluate(([PROFILES, ACTIVE]) => {
  const css = getComputedStyle(document.documentElement)
  const color = (k) => css.getPropertyValue('--cell-color-' + k).trim()
  // Black or white digit, whichever reads on the color.
  const ink = (c) => {
    const el = document.createElement('div'); el.style.color = c; document.body.appendChild(el)
    const [r, g, b] = getComputedStyle(el).color.match(/\d+/g).map(Number); el.remove()
    return 0.299 * r + 0.587 * g + 0.114 * b < 140 ? '#fff' : '#111'
  }
  const chips = (groups, size) => groups.slice(0, 4).map(([k, d]) => `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:4px;background:${color(k)};color:${ink(color(k))};box-shadow:inset 0 0 0 1px rgba(0,0,0,.25);font:600 ${Math.round(size * 0.6)}px/1 system-ui,sans-serif">${d}</span>`).join('')
  const style = document.createElement('style')
  style.textContent = `
    .pm { position: fixed; z-index: 1000; width: 250px; background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(30,20,60,.28), 0 0 0 1px rgba(0,0,0,.08); font: 15px/1.2 system-ui, sans-serif; color: #1d1b26; padding: 6px; }
    .pm::after { content: ''; position: absolute; bottom: -7px; right: 34px; width: 14px; height: 14px; background: #fff; transform: rotate(45deg); box-shadow: 3px 3px 4px rgba(30,20,60,.12); }
    .pm-head { font: 600 11px/1 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #8a8496; padding: 8px 10px 6px; }
    .pm-row { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; }
    .pm-row.on { background: #f1ebfb; }
    .pm-row .name { flex: 1; }
    .pm-row.on .name { font-weight: 600; color: #5b2a9a; }
    .pm-chips { display: flex; gap: 3px; width: 84px; }
    .pm-tick { width: 16px; color: #6a1b9a; font-weight: 700; text-align: center; }
    .pm-sep { height: 1px; background: #ece8f2; margin: 4px 6px; }
    .pm-edit { display: flex; align-items: center; gap: 10px; padding: 9px 10px; color: #5d5868; border-radius: 8px; }
    .pm-box { position:absolute; width:16px; height:16px; box-sizing:border-box; border:2px solid #5b2a9a; border-radius:4px; background:#fff; color:#5b2a9a; font:bold 11px/12px system-ui,sans-serif; text-align:center }
  `
  document.head.appendChild(style)

  // The button: icon from the active profile, tick top left, menu arrow bottom right.
  const b = document.querySelector('#control-colorbydigit')
  b.style.position = 'relative'
  b.querySelectorAll('[data-role="auto"]').forEach((e) => { e.style.display = 'none' })
  b.querySelector('.icon').style.visibility = 'hidden'
  const g = PROFILES[ACTIVE][1]
  b.insertAdjacentHTML('beforeend', window.protoButton(g, true))

  // The menu above the button.
  const m = document.createElement('div')
  m.className = 'pm'
  m.innerHTML = '<div class="pm-head">Color by digit profile</div>' +
    PROFILES.map(([n, gs], i) => `<div class="pm-row${i === ACTIVE ? ' on' : ''}"><span class="pm-tick">${i === ACTIVE ? '&#10003;' : ''}</span><span class="pm-chips">${chips(gs, 20)}</span><span class="name">${n}</span></div>`).join('') +
    '<div class="pm-sep"></div><div class="pm-edit"><span class="pm-tick">&#9881;</span>Edit profiles…</div>'
  document.body.appendChild(m)
  const r = b.getBoundingClientRect()
  m.style.left = (r.right - 250 + 8) + 'px'
  m.style.top = (r.top - m.getBoundingClientRect().height - 12) + 'px'
}, [PROFILES, ACTIVE])
const bb = await btn.boundingBox()
await page.screenshot({ path: dir + 'menu-nice.png', clip: { x: bb.x - 300, y: bb.y - 300, width: 440, height: bb.height + 320 } })

const STATES = [['on-3', PROFILES[0][1], true], ['off-3', PROFILES[0][1], false], ['on-2', PROFILES[1][1], true], ['on-4', [['1', '1'], ['3', '3'], ['5', '5'], ['9', '7']], true]]
for (const [name, groups, on] of STATES) {
  await page.evaluate(([groups, on]) => { const b = document.querySelector('#control-colorbydigit'); b.querySelectorAll('.proto-face').forEach((e) => e.remove()); b.insertAdjacentHTML('beforeend', window.protoButton(groups, on)) }, [groups, on])
  const c = await btn.boundingBox()
  await page.screenshot({ path: dir + 'btn-' + name + '.png', clip: { x: c.x - 6, y: c.y - 6, width: c.width + 12, height: c.height + 12 } })
}
// The dialog's profile list, drawn the way SudokuPad draws a dialog.
await page.evaluate(() => document.querySelectorAll('.pm').forEach((e) => e.remove()))
await page.evaluate(([PROFILES, ACTIVE]) => {
  const css = getComputedStyle(document.documentElement)
  const color = (k) => css.getPropertyValue('--cell-color-' + k).trim()
  const ink = (c) => {
    const el = document.createElement('div'); el.style.color = c; document.body.appendChild(el)
    const [r, g, b] = getComputedStyle(el).color.match(/\d+/g).map(Number); el.remove()
    return 0.299 * r + 0.587 * g + 0.114 * b < 140 ? '#fff' : '#111'
  }
  const chips = (groups) => groups.slice(0, 4).map(([k, d]) => `<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:4px;background:${color(k)};color:${ink(color(k))};box-shadow:inset 0 0 0 1px rgba(0,0,0,.25);font:600 13px/1 system-ui,sans-serif">${d}</span>`).join('')
  const row = ([n, gs], i) => `<div style="display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:8px;${i === ACTIVE ? 'background:#f1ebfb;box-shadow:inset 0 0 0 1.5px #b79be0' : 'box-shadow:inset 0 0 0 1px #e2dcea'}">
      <span style="width:18px;height:18px;box-sizing:border-box;border-radius:4px;border:2px solid ${i === ACTIVE ? '#6a1b9a' : '#9a93a6'};background:${i === ACTIVE ? '#6a1b9a' : '#fff'};color:#fff;font:bold 12px/14px system-ui;text-align:center">${i === ACTIVE ? '&#10003;' : ''}</span>
      <span style="display:flex;gap:3px;width:100px">${chips(gs)}</span>
      <span style="flex:1;font:${i === ACTIVE ? 600 : 400} 15px system-ui;color:${i === ACTIVE ? '#5b2a9a' : '#1d1b26'}">${n}</span>
      <span title="Delete" style="font:18px/1 system-ui;color:#9a93a6">&#215;</span></div>`
  Framework.showDialog({
    centerOverBoard: true,
    parts: [
      { tag: 'text', innerHTML: '<b>Color by digit</b> <small style="opacity:.6">v0.4.0</small>' },
      { tag: 'text', innerHTML: '<div style="display:flex;gap:10px;align-items:center;margin:4px 0 12px;font:15px system-ui;text-align:left"><span style="flex:none;width:18px;height:18px;box-sizing:border-box;border-radius:4px;background:#6a1b9a;color:#fff;font:bold 12px/18px system-ui;text-align:center">&#10003;</span><span><b>Auto mode</b>: keep colors in step with digits and centre marks</span></div>' +
        '<div style="font:600 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#8a8496;margin:6px 0">Profiles <span style="text-transform:none;letter-spacing:0;font-weight:400">(3 of 4)</span></div>' +
        `<div style="display:flex;flex-direction:column;gap:6px">${PROFILES.map(row).join('')}</div>` +
        '<div style="display:flex;gap:8px;margin-top:8px"><input placeholder="New profile name" style="flex:1;font:15px system-ui;padding:7px 10px;border:1px solid #cfc8da;border-radius:8px"><button style="font:600 14px system-ui;padding:7px 14px;border-radius:8px;border:0;background:#6a1b9a;color:#fff">+ Add</button></div>' +
        '<div style="margin-top:14px;padding-top:10px;border-top:1px solid #ece8f2;color:#8a8496;font:13px system-ui">Groups for <b style="color:#5b2a9a">Low/5/High</b> follow below, as today.</div>' },
      { tag: 'options', options: [{ tag: 'button', content: 'Save' }, { tag: 'button', content: 'Cancel' }] }
    ]
  })
}, [PROFILES, ACTIVE])
await page.waitForTimeout(400)
const dlg = await page.locator('.dialog').first().boundingBox()
await page.screenshot({ path: dir + 'dialog-nice.png', clip: { x: dlg.x - 10, y: dlg.y - 10, width: dlg.width + 20, height: dlg.height + 20 } })
await browser.close()
console.log('done')
