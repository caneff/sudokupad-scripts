// Research script for docs/research/sudokupad-replay-files.md (#98). Frozen once that note is written; the lint and the
// seam never read docs/research/. Run: `node docs/research/sudokupad-replay-files.mjs [record] [play [case ...]]`
// from the repo root. It needs the network and a Playwright Chromium. It never prints the puzzle URL.
//
//   record  records one solve with every script installed (real mouse and keyboard input), saves it through SudokuPad's own
//           "Replay Save/Load" dialog to docs/research/replay-files/recorded.replay, and writes the recorded grid next to it.
//   play    for each case (all scripts, each script alone, no scripts) opens a fresh page, loads that file through the same
//           dialog, then plays it in the replay tool at normal speed and by stepping, comparing the grid each time.
//
// Results go to .scratch/replay-results.json and screenshots to .scratch/replay-shots/, both outside the note.
/* global Framework, Replay, ToolReplay, ToolPen, Puzzle */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'

const ROOT = new URL('../../', import.meta.url)
const url = readFileSync(new URL('live/puzzle-url.txt', ROOT), 'utf8').trim()
const SCRIPT_NAMES = ['pen-tool-extras', 'color-by-digit', 'digit-color', 'dark-page', 'no-tab-letters']
const sources = Object.fromEntries(SCRIPT_NAMES.map((n) => [n, readFileSync(new URL(`${n}.user.js`, ROOT), 'utf8')]))
const CASES = { all: SCRIPT_NAMES, ...Object.fromEntries(SCRIPT_NAMES.map((n) => [n, [n]])), none: [] }
const FILE_DIR = new URL('docs/research/replay-files/', ROOT)
const REPLAY_FILE = new URL('recorded.replay', FILE_DIR).pathname
const GRID_FILE = new URL('recorded-grid.json', FILE_DIR).pathname
const SHOT_DIR = new URL('.scratch/replay-shots/', ROOT).pathname
const RESULTS = new URL('.scratch/replay-results.json', ROOT).pathname
const START = /Start Puzzle|Continue|Resume/i
const PAGE_BUTTON = '.pen-tool-extras-page'
const PAGES = { 1: '123456789', 2: 'abcdefghi', 3: 'jlnprtvxz' }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
mkdirSync(SHOT_DIR, { recursive: true })
mkdirSync(FILE_DIR.pathname, { recursive: true })

// Polls `read` until `ok(value)` or the timeout; returns the last value.
async function until (read, ok, timeoutMs = 10000, everyMs = 50) {
  const deadline = Date.now() + timeoutMs
  let v = await read()
  while (!ok(v) && Date.now() < deadline) { await sleep(everyMs); v = await read() }
  return v
}

// A fresh browser context holding one page with `names` installed at DOMContentLoaded (as @run-at document-idle),
// the puzzle started, and the pen tool and replay tool settings turned on when asked.
async function openPage (browser, names, { toolpen = true, label = '' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true })
  const p = await context.newPage()
  p.errors = []
  p.phase = 'boot'
  const note = (text) => p.errors.push({ phase: p.phase, text: text.slice(0, 400) })
  p.on('pageerror', (e) => note(`pageerror: ${e}`))
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) note(`console.error: ${m.text()}`) })
  await p.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
  if (names.length) {
    await p.addInitScript((srcs) => {
      document.addEventListener('DOMContentLoaded', () => srcs.forEach((src) => {
        const s = document.createElement('script')
        s.textContent = src
        document.documentElement.appendChild(s)
      }))
    }, names.map((n) => sources[n]))
  }
  await p.goto(url, { waitUntil: 'load', timeout: 60000 })
  await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
  const start = p.getByRole('button', { name: START }).first()
  await start.waitFor({ state: 'visible' })
  await start.click()
  await start.waitFor({ state: 'hidden' })
  await p.locator('#control-undo').waitFor({ state: 'visible' })
  await p.evaluate(([pen]) => { Framework.setSetting('toolpen', pen); Framework.setSetting('toolreplay', true) }, [toolpen])
  p.label = label
  return p
}

// The grid as data and as drawn. `state` is every cell's stored values; `draw` is what each pen element computes to, so a
// stroke that has no color shows as stroke `none`; `texts` is each digit's computed fill.
const snapshot = (p) => p.evaluate(() => {
  const plain = (v) => v instanceof Set ? [...v].sort() : Array.isArray(v) ? v.map(plain) : (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v)
  const P = Framework.app.puzzle
  const state = P.cells.map((c) => ({ r: c.row, c: c.col, given: c.given, value: c.value, candidates: plain(c.candidates), pencilmarks: plain(c.pencilmarks), colours: plain(c.colours), pen: plain(c.pen) }))
  const r1 = (n) => Math.round(n * 10) / 10
  const draw = [...document.querySelectorAll('#cell-pen *')].filter((e) => !/^(g|defs|filter|feMorphology|feGaussianBlur|feFlood|feComposite|feMerge|feMergeNode|feOffset)$/i.test(e.tagName)).map((e) => {
    const cs = window.getComputedStyle(e)
    let box = { x: 0, y: 0, width: 0, height: 0 }
    try { box = e.getBBox() } catch (_) { /* no box */ }
    return `${e.tagName}|${e.getAttribute('class') || ''}|stroke=${cs.stroke}|fill=${cs.fill}|w=${cs.strokeWidth}|dash=${cs.strokeDasharray}|d=${r1(box.x)},${r1(box.y)},${r1(box.width)},${r1(box.height)}`
  }).sort()
  const texts = [...document.querySelectorAll('svg text')].map((t) => {
    const b = t.getBBox()
    const layer = t.closest('g[id]')
    return `${layer ? layer.id : ''}|${t.textContent}|${r1(b.x)},${r1(b.y)}|${window.getComputedStyle(t).fill}`
  })
  texts.sort()
  return { state, draw, texts, penPaths: document.querySelectorAll('#cell-pen path').length, stack: P.replayStack.slice(), undo: P.undoStack.length }
})

const digest = (v) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 10)
const strip = (a) => a.map((s) => s.replace(/\/\d+$/, ''))

// How `now` differs from the recorded snapshot `ref`: cell states that differ, and the actions that differ.
function compare (ref, now) {
  const cells = []
  ref.state.forEach((r, i) => { if (JSON.stringify(r) !== JSON.stringify(now.state[i])) cells.push({ cell: `r${r.r + 1}c${r.c + 1}`, recorded: r, played: now.state[i] }) })
  const a = strip(ref.stack); const b = strip(now.stack)
  const same = a.length === b.length && a.every((x, i) => x === b[i])
  const sortedSame = a.length === b.length && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  const i = a.findIndex((x, k) => x !== b[k])
  const stack = same ? null : { recorded: a.length, played: b.length, sameActionsReordered: sortedSame, firstDifference: i, recordedAround: a.slice(Math.max(0, i - 1), i + 4), playedAround: b.slice(Math.max(0, i - 1), i + 4) }
  const setDiff = (x, y) => x.filter((v) => !y.includes(v))
  const invisible = now.draw.filter((d) => /stroke=none/.test(d) && /fill=none/.test(d)).length
  return {
    stateEqual: cells.length === 0, cells: cells.slice(0, 5), cellsDiffering: cells.length,
    stackEqual: stack === null, stack,
    drawEqual: JSON.stringify(ref.draw) === JSON.stringify(now.draw), drawDigest: digest(now.draw), drawCount: now.draw.length, invisibleStrokes: invisible,
    drawOnlyRecorded: setDiff(ref.draw, now.draw).length, drawOnlyPlayed: setDiff(now.draw, ref.draw).length, drawSample: setDiff(now.draw, ref.draw).slice(0, 3),
    textsEqual: JSON.stringify(ref.texts) === JSON.stringify(now.texts), textsDigest: digest(now.texts), textCount: now.texts.length, textSample: setDiff(now.texts, ref.texts).slice(0, 3)
  }
}

// ---- Real input helpers -------------------------------------------------------------------------------------------------

const cellRect = (p, r, c) => p.evaluate(([r, c]) => { const e = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).elem.getBoundingClientRect(); return { x: e.x, y: e.y, w: e.width, h: e.height } }, [r, c])
const centre = async (p, r, c) => { const e = await cellRect(p, r, c); return [e.x + e.w / 2, e.y + e.h / 2] }
// A point 2 px inside a side of a cell: a click there is an edge click.
const edgeAt = async (p, r, c, side) => { const e = await cellRect(p, r, c); return { right: [e.x + e.w - 2, e.y + e.h / 2], left: [e.x + 2, e.y + e.h / 2], bottom: [e.x + e.w / 2, e.y + e.h - 2], top: [e.x + e.w / 2, e.y + 2] }[side] }
// The page point of grid corner [r, c] (0 to 9).
const cornerAt = async (p, r, c) => { const size = 9; const e = await cellRect(p, Math.min(r, size - 1), Math.min(c, size - 1)); return [e.x + (c >= size ? e.w : 0) + 2 * (c >= size ? -1 : 1), e.y + (r >= size ? e.h : 0) + 2 * (r >= size ? -1 : 1)] }
const select = (p, r, c) => p.evaluate(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [r, c])
const settle = async (p) => { await sleep(120) }

async function openPenTool (p) {
  const shown = () => p.locator('.tool-pen button[data-key="1"]').isVisible()
  const deadline = Date.now() + 10000
  while (!(await shown()) && Date.now() < deadline) { await p.click('#control-pen'); await sleep(400) }
}
async function goToPage (p, n) {
  for (let i = 0; i < 4; i++) {
    const pad = await p.evaluate(() => [...document.querySelectorAll('.controls-input button[data-key]')].filter((b) => b.dataset.key !== '0').map((b) => b.dataset.value).join(''))
    if (pad === PAGES[n]) return
    await p.locator(PAGE_BUTTON).click()
    await sleep(200)
  }
  throw new Error(`could not reach pen page ${n}`)
}
async function drag (p, points) {
  await p.mouse.move(...points[0])
  await p.mouse.down()
  for (const pt of points.slice(1)) await p.mouse.move(...pt, { steps: 6 })
  await p.mouse.up()
  await settle(p)
}
const gridPoints = async (p, cells) => Promise.all(cells.map(([r, c]) => centre(p, r, c)))

// ---- The recorded solve -------------------------------------------------------------------------------------------------

async function recordSolve (p) {
  const empties = await p.evaluate(() => Framework.app.puzzle.cells.filter((c) => !c.given).map((c) => [c.row, c.col]))
  const rowOf = (r) => empties.filter(([x]) => x === r)
  // Two empty cells in one row take the same digit, so Digit Color has a conflict to mark.
  const row = [...new Set(empties.map(([r]) => r))].find((r) => rowOf(r).length >= 4)
  const [a, b, c, d] = rowOf(row)
  p.phase = 'record: digits'
  for (const [cell, digit] of [[a, '5'], [b, '5'], [c, '2'], [d, '8']]) { await select(p, ...cell); await p.keyboard.press(digit); await settle(p) }
  p.phase = 'record: corner and centre marks'
  const others = empties.filter(([r]) => r !== row)
  const [e, f, g, h] = others
  await p.click('#control-corner')
  for (const [cell, digits] of [[e, '13'], [f, '4']]) { await select(p, ...cell); for (const k of digits) await p.keyboard.press(k); await settle(p) }
  await p.click('#control-centre')
  for (const [cell, digits] of [[g, '13'], [h, '2468']]) { await select(p, ...cell); for (const k of digits) await p.keyboard.press(k); await settle(p) }
  await p.click('#control-normal')
  p.phase = 'record: cell colors'
  await p.click('#control-colour')
  for (const [cell, key] of [[others[4], '3'], [others[5], '5']]) { await select(p, ...cell); await p.keyboard.press(key); await settle(p) }
  await p.click('#control-normal')
  p.phase = 'record: color by digit'
  const colored = () => p.evaluate(() => Framework.app.puzzle.cells.filter((x) => x.colours && x.colours.length).length)
  const before = await colored()
  for (let i = 0; i < 10 && (await colored()) === before; i++) { await p.click('#control-colorbydigit'); await sleep(400) }
  await p.click('#control-undo') // takes the whole press back
  await sleep(200)
  const afterUndo = await colored()
  for (let i = 0; i < 5 && (await colored()) === afterUndo; i++) { await p.click('#control-colorbydigit'); await sleep(400) }
  p.phase = 'record: pen'
  await openPenTool(p)
  await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
  const lines = []
  // Page 1, 2 and 3 lines across rows 6, 7 and 8, each with a bend so page 3 has arrows to turn.
  for (const [page, key, row, bend] of [[1, 1, 6, 1], [2, 2, 7, 1], [3, 3, 8, 1], [2, 4, 5, 0]]) {
    await goToPage(p, page)
    await p.locator(`.tool-pen button[data-key="${key}"]`).click()
    const pts = await gridPoints(p, bend ? [[row, 1], [row, 3], [row - 1, 4], [row - 1, 6]] : [[row, 6], [row, 8]])
    await drag(p, pts)
    lines.push({ page, key, row, at: pts[1] })
  }
  p.phase = 'record: edge and corner marks'
  await goToPage(p, 1)
  await p.locator('.tool-pen button[data-key="6"]').click()
  for (const [r, c, side, clicks] of [[0, 0, 'right', 1], [0, 1, 'bottom', 2], [1, 3, 'right', 3], [2, 5, 'bottom', 4], [3, 2, 'left', 1], [4, 4, 'top', 2]]) {
    const pt = await edgeAt(p, r, c, side)
    for (let i = 0; i < clicks; i++) { await p.mouse.click(...pt); await settle(p) }
  }
  await p.locator('.tool-pen button[data-key="7"]').click()
  for (const [r, c, clicks] of [[0, 0, 1], [3, 3, 2], [9, 9, 1], [0, 9, 2], [9, 0, 1], [5, 5, 1]]) {
    const pt = await cornerAt(p, r, c)
    for (let i = 0; i < clicks; i++) { await p.mouse.click(...pt); await settle(p) }
  }
  p.phase = 'record: cell circle and cross'
  await p.locator('.tool-pen button[data-key="8"]').click()
  for (const [r, c, clicks] of [[3, 7, 1], [4, 7, 2]]) {
    const pt = await centre(p, r, c)
    for (let i = 0; i < clicks; i++) { await p.mouse.click(...pt); await settle(p) }
  }
  p.phase = 'record: middle click erase and its undo'
  await goToPage(p, 2)
  const target = lines[3]
  const [mx, my] = target.at
  await p.mouse.move(mx, my)
  await p.mouse.click(mx, my, { button: 'middle' })
  await settle(p)
  await p.click('#control-undo') // the erase is one act, so one undo brings the line back
  await sleep(200)
  await p.mouse.click(...(await lines.slice(0, 1).map(() => [mx, my])[0]), { button: 'middle' }) // erase again; stays erased
  await settle(p)
  p.phase = 'record: leave pen tool'
  await p.click('#control-pen')
  await sleep(300)
  await p.evaluate(() => Framework.app.deselect())
  await sleep(300)
}

// ---- The replay file ----------------------------------------------------------------------------------------------------

async function openReplayDialog (p) {
  await p.click('#control-settings')
  const entry = p.locator('.dialog button, .dialog [role=button]').filter({ hasText: /^\s*Replay Save\/Load\s*$/ }).first()
  const group = p.locator('.dialog .setting-group').filter({ has: p.locator('label', { hasText: 'Import/Export' }) })
  if ((await p.locator('.dialog .setting-group.closed').filter({ has: p.locator('label', { hasText: 'Import/Export' }) }).count()) > 0) await group.locator('label').first().click()
  await entry.waitFor({ state: 'visible' })
  await entry.click()
  await p.locator('#replaysave_filename').waitFor({ state: 'visible' })
}

async function saveFile (p, to) {
  await openReplayDialog(p)
  const [download] = await Promise.all([p.waitForEvent('download'), p.locator('.dialog-options').getByText('Save File', { exact: true }).click()])
  await download.saveAs(to)
  return download.suggestedFilename()
}

async function loadFile (p, from) {
  await openReplayDialog(p)
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('.dialog-options').getByText('Load File', { exact: true }).click()])
  await chooser.setFiles(from)
  await p.locator('#replaysave_filename').waitFor({ state: 'detached', timeout: 30000 })
  await until(() => p.evaluate(() => Framework.app.puzzle.replayStack.length), (n) => n > 0, 10000)
  await sleep(500)
}

// ---- Recording ----------------------------------------------------------------------------------------------------------

async function record (browser) {
  const p = await openPage(browser, SCRIPT_NAMES, { label: 'record' })
  await recordSolve(p)
  p.phase = 'record: save'
  const name = await saveFile(p, REPLAY_FILE)
  const snap = await snapshot(p)
  writeFileSync(GRID_FILE, JSON.stringify(snap, null, 1))
  await p.screenshot({ path: `${SHOT_DIR}recorded.png` })
  const filePayload = JSON.parse(readFileSync(REPLAY_FILE, 'utf8'))
  console.log(JSON.stringify({ file: name, format: filePayload.format, actions: snap.stack.length, penPaths: snap.penPaths, errors: p.errors, stateDigest: digest(snap.state), drawDigest: digest(snap.draw) }, null, 1))
  await p.context().close()
}

// ---- Playing ------------------------------------------------------------------------------------------------------------

async function enterReplayTool (p) {
  await until(async () => { await p.click('#control-replay'); await sleep(400); return p.evaluate(() => Framework.app.tool) }, (t) => t === 'replay', 10000, 0)
}

const toolState = (p) => p.evaluate(() => ({ cls: document.body.className.split(' ').filter((c) => /^replay-/.test(c)).join(' '), playing: Framework.app.puzzle.replayPlaying, time: ToolReplay.tool.replayCurrentTime, total: ToolReplay.tool.replayTotalTime, stack: Framework.app.puzzle.replayStack.length }))

async function playCase (browser, name, ref, opts = {}) {
  const out = { case: name, toolpen: opts.toolpen !== false }
  const p = await openPage(browser, CASES[name], { toolpen: opts.toolpen !== false, label: name })
  const shot = (tag) => p.screenshot({ path: `${SHOT_DIR}${name}${opts.toolpen === false ? '-nopen' : ''}-${tag}.png` })
  p.phase = 'load file'
  const t0 = Date.now()
  await loadFile(p, REPLAY_FILE)
  out.load = { ms: Date.now() - t0, ...compare(ref, await snapshot(p)), errors: p.errors.filter((e) => e.phase === 'load file') }
  await shot('loaded')
  if (opts.loadOnly) { out.errors = p.errors; await p.context().close(); return out }

  p.phase = 'normal speed'
  await enterReplayTool(p)
  const total = (await toolState(p)).total
  out.totalMs = total
  const t1 = Date.now()
  await p.evaluate(() => { ToolReplay.tool.play(-1, 1) })
  await sleep(Math.min(3000, total / 2))
  await shot('mid-normal')
  const done = await until(() => toolState(p), (s) => s.cls === 'replay-paused' && !s.playing, total + 20000, 200)
  out.normal = { ms: Date.now() - t1, stalled: !(done.cls === 'replay-paused' && !done.playing), finalTool: done, ...compare(ref, await snapshot(p)), errors: p.errors.filter((e) => e.phase === 'normal speed') }
  await shot('normal')

  p.phase = 'step by buttons'
  const press = async (key) => { await p.locator(`.controls-input button[data-key="${key}"]`).click(); await sleep(150) }
  await press('1')
  const afterStart = await toolState(p)
  const trail = [afterStart.stack]
  for (let i = 0; i < 12 && (await toolState(p)).time < total; i++) { await press('6'); trail.push((await toolState(p)).stack) }
  await press('4'); trail.push((await toolState(p)).stack)
  await press('4'); trail.push((await toolState(p)).stack)
  await press('3'); trail.push((await toolState(p)).stack)
  out.buttons = { trail, ...compare(ref, await snapshot(p)), errors: p.errors.filter((e) => e.phase === 'step by buttons') }
  await shot('buttons')

  p.phase = 'step by action'
  // Every action boundary in time order, forward then back to the start, then to the end: each jump resets the puzzle
  // and plays up to the time, so a step lands on exactly that many actions.
  const times = await p.evaluate(() => {
    let t = 0
    return ToolReplay.tool.replay.actions.map((a) => { const [type, arg, time] = Replay.parseActA(a); t += Number(time) * Puzzle.logTimeResolutionMs; if (type === 'up') t -= Number(arg) * Puzzle.logTimeResolutionMs; return t })
  })
  const wrongCount = []
  let jumps = 0
  // Actions with a time at or before the jump's time have played, and the next one may too when its own time is 0.
  const jump = async (time) => {
    jumps++
    await p.evaluate((t) => { ToolReplay.tool.jumpTo(t) }, time)
    const s = await toolState(p)
    const want = times.filter((x) => x <= time).length
    if (s.stack < want || s.stack > want + 1) wrongCount.push({ time, stack: s.stack, want })
    return s
  }
  for (let k = 0; k < times.length; k++) await jump(times[k])
  for (let k = times.length - 1; k >= 0; k -= 7) await jump(times[k])
  await jump(0)
  await jump(total)
  out.step = { jumps, wrongCount: wrongCount.slice(0, 5), ...compare(ref, await snapshot(p)), errors: p.errors.filter((e) => e.phase === 'step by action') }
  await shot('step')
  out.errors = p.errors
  await p.context().close()
  return out
}

// ---- Main ---------------------------------------------------------------------------------------------------------------

const args = process.argv.slice(2)
const wantRecord = args.includes('record')
const playAt = args.indexOf('play')
const wanted = playAt >= 0 ? (args.slice(playAt + 1).length ? args.slice(playAt + 1) : Object.keys(CASES)) : []
const browser = await chromium.launch()
try {
  if (wantRecord) await record(browser)
  if (playAt >= 0) {
    if (!existsSync(REPLAY_FILE)) throw new Error('no recorded file: run `record` first')
    const ref = JSON.parse(readFileSync(GRID_FILE, 'utf8'))
    const results = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {}
    for (const name of wanted) {
      const flag = name.endsWith(':nopen')
      const key = name.replace(':nopen', '')
      results[name] = await playCase(browser, key, ref, { toolpen: !flag })
      writeFileSync(RESULTS, JSON.stringify(results, null, 1))
      console.log(name, JSON.stringify({ load: results[name].load.stateEqual, normal: results[name].normal && results[name].normal.stateEqual, buttons: results[name].buttons && results[name].buttons.stateEqual, step: results[name].step && results[name].step.stateEqual, errors: results[name].errors.length }))
    }
  }
} finally {
  await browser.close()
}
