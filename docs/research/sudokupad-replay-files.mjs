// Research script for docs/research/sudokupad-replay-files.md (#98). Frozen once that note is written; the lint and the
// seam never read docs/research/. Run: `node docs/research/sudokupad-replay-files.mjs [record] [play [case ...]]`
// from the repo root. It needs the network and a Playwright Chromium. It never prints the puzzle URL.
//
//   record  records one solve with every script installed (real mouse and keyboard input), saves it through SudokuPad's own
//           "Replay Save/Load" dialog to docs/research/replay-files/recorded.replay, and writes the recorded grid next to it.
//   play    for each case (all scripts, each script alone, no scripts; `:nopen` after a case turns SudokuPad's pen tool setting
//           off) opens a fresh page, loads that file through the same dialog, rewinds the replay tool and plays it at normal
//           speed (speed 1) and with the tool's own Play button (speed 10), then steps by its buttons and by action, comparing
//           the grid each time.
//
// A page that fails to load reports that without the puzzle URL. Results go to .scratch/replay-results.json and screenshots to .scratch/replay-shots/, both outside the note.
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
// The hosts the page's own trackers use, blocked in every context; the console errors that blocking causes are the only ones ignored.
const BLOCKED = /cookiebot|googletagmanager|plausible/
// Each phase name is typed once: a page error is filed under the phase running when it arrives, and read back under the same name.
const PHASE = { boot: 'boot', record: 'record', save: 'record: save', load: 'load file', normal: 'normal speed', play10: 'play button', buttons: 'step by buttons', action: 'step by action' }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
mkdirSync(SHOT_DIR, { recursive: true })
mkdirSync(FILE_DIR.pathname, { recursive: true })

// Polls `read` until `ok(value)` or the timeout; returns the last value, so the caller decides what a timeout means.
async function tryUntil (read, ok, timeoutMs = 10000, everyMs = 50) {
  const deadline = Date.now() + timeoutMs
  let v = await read()
  while (!ok(v) && Date.now() < deadline) { await sleep(everyMs); v = await read() }
  return v
}
// The same, but a timeout stops the run naming what was waited for.
async function waitFor (what, read, ok, timeoutMs = 10000, everyMs = 50) {
  const v = await tryUntil(read, ok, timeoutMs, everyMs)
  if (!ok(v)) throw new Error(`timed out waiting for ${what}`)
  return v
}
const errorsOf = (p, phase) => p.errors.filter((e) => e.phase === phase)

// A fresh browser context holding one page with `names` installed at DOMContentLoaded (as @run-at document-idle),
// the puzzle started, the pen tool setting as `toolpen` says and the replay tool setting on.
async function openPage (browser, names, { toolpen = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true })
  const p = await context.newPage()
  p.errors = []
  p.phase = PHASE.boot
  const note = (text) => p.errors.push({ phase: p.phase, text: text.slice(0, 400) })
  p.on('pageerror', (e) => note(`pageerror: ${e}`))
  p.on('console', (m) => { if (m.type() === 'error' && !BLOCKED.test(m.location().url)) note(`console.error: ${m.text()}`) })
  await p.route(BLOCKED, (r) => r.abort())
  if (names.length) {
    await p.addInitScript((srcs) => {
      document.addEventListener('DOMContentLoaded', () => srcs.forEach((src) => {
        const s = document.createElement('script')
        s.textContent = src
        document.documentElement.appendChild(s)
      }))
    }, names.map((n) => sources[n]))
  }
  // Playwright's own error names the URL, which stays out of the terminal.
  await p.goto(url, { waitUntil: 'load', timeout: 60000 }).catch((e) => { throw new Error(`the puzzle page did not load: ${String(e.message).split('\n')[0].replace(/https?:\/\/\S+/g, '<url>')}`) })
  await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
  const start = p.getByRole('button', { name: START }).first()
  await start.waitFor({ state: 'visible' })
  await start.click()
  await start.waitFor({ state: 'hidden' })
  await p.locator('#control-undo').waitFor({ state: 'visible' })
  await p.evaluate(([pen]) => { Framework.setSetting('toolpen', pen); Framework.setSetting('toolreplay', true) }, [toolpen])
  return p
}

// The grid as data and as drawn. `state` is every cell's stored values; `draw` is what each pen element computes to, so a
// stroke that has no color shows as stroke `none`; `texts` is every `svg text`'s computed fill, with the button icons' own.
const snapshot = (p) => p.evaluate(() => {
  const plain = (v) => v instanceof Set ? [...v].sort() : Array.isArray(v) ? v.map(plain) : (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v)
  const P = Framework.app.puzzle
  const state = P.cells.map((c) => ({ r: c.row, c: c.col, given: c.given, value: c.value, candidates: plain(c.candidates), pencilmarks: plain(c.pencilmarks), colours: plain(c.colours), pen: plain(c.pen) }))
  const r1 = (n) => Math.round(n * 10) / 10
  // Drawn shapes only: a group, a filter and its primitives have no box of their own.
  const draw = [...document.querySelectorAll('#cell-pen *')].filter((e) => e instanceof window.SVGGraphicsElement && e.tagName !== 'g').map((e) => {
    const cs = window.getComputedStyle(e)
    const box = e.getBBox()
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
    stackEqual: stack === null, stack, stackDigest: digest(b),
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
// Pacing between recorded inputs, so each lands as its own action with a gap; nothing is waited on.
const settle = () => sleep(120)
// `n` clicks at one point.
const clicks = async (p, pt, n) => { for (let i = 0; i < n; i++) { await p.mouse.click(...pt); await settle() } }
// Selects each cell and types its keys.
const typeInto = async (p, entries) => { for (const [cell, keys] of entries) { await select(p, ...cell); for (const k of keys) await p.keyboard.press(k); await settle() } }

async function openPenTool (p) {
  const shown = () => p.locator('.tool-pen button[data-key="1"]').isVisible()
  await waitFor('the pen tool to open', async () => { if (!(await shown())) await p.click('#control-pen'); return shown() }, (v) => v === true, 10000, 400)
}
const padValues = (p) => p.evaluate(() => [...document.querySelectorAll('.controls-input button[data-key]')].filter((b) => b.dataset.key !== '0').map((b) => b.dataset.value).join(''))
async function goToPage (p, n) {
  for (let i = 0; i < 4; i++) {
    if ((await padValues(p)) === PAGES[n]) return
    await p.locator(PAGE_BUTTON).click()
    await tryUntil(() => padValues(p), (v) => v === PAGES[n], 1000)
  }
  throw new Error(`could not reach pen page ${n}`)
}
async function drag (p, points) {
  await p.mouse.move(...points[0])
  await p.mouse.down()
  for (const pt of points.slice(1)) await p.mouse.move(...pt, { steps: 6 })
  await p.mouse.up()
  await settle()
}
const gridPoints = async (p, cells) => Promise.all(cells.map(([r, c]) => centre(p, r, c)))

// ---- The recorded solve -------------------------------------------------------------------------------------------------

async function recordSolve (p) {
  const empties = await p.evaluate(() => Framework.app.puzzle.cells.filter((c) => !c.given).map((c) => [c.row, c.col]))
  const rowOf = (r) => empties.filter(([x]) => x === r)
  // Two empty cells in one row take the same digit, so Digit Color has a conflict to mark.
  const row = [...new Set(empties.map(([r]) => r))].find((r) => rowOf(r).length >= 4)
  const [a, b, c, d] = rowOf(row)
  p.phase = PHASE.record
  await typeInto(p, [[a, '5'], [b, '5'], [c, '2'], [d, '8']])
  const others = empties.filter(([r]) => r !== row)
  const [e, f, g, h] = others
  await p.click('#control-corner')
  await typeInto(p, [[e, '13'], [f, '4']])
  await p.click('#control-centre')
  await typeInto(p, [[g, '13'], [h, '2468']])
  await p.click('#control-normal')
  await p.click('#control-colour')
  await typeInto(p, [[others[4], '3'], [others[5], '5']])
  await p.click('#control-normal')
  // A press changes the colored cell count; SudokuPad binds a new button's handler a moment late, so a dead click is repeated.
  const colored = () => p.evaluate(() => Framework.app.puzzle.cells.filter((x) => x.colours && x.colours.length).length)
  const pressColorByDigit = async (what) => {
    const before = await colored()
    await waitFor(what, async () => { if ((await colored()) === before) await p.click('#control-colorbydigit'); return colored() }, (n) => n !== before, 10000, 400)
  }
  await pressColorByDigit('Color by Digit to color cells')
  const afterPress = await colored()
  await p.click('#control-undo') // takes the whole press back
  await waitFor('the undo of Color by Digit', colored, (n) => n < afterPress)
  await pressColorByDigit('Color by Digit to color cells again')
  await openPenTool(p)
  await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
  let erasePoint
  // Page 1, 2 and 3 lines across rows 6, 7 and 8, each with a bend so page 3 has arrows to turn.
  for (const [page, key, row, bend] of [[1, 1, 6, 1], [2, 2, 7, 1], [3, 3, 8, 1], [2, 4, 5, 0]]) {
    await goToPage(p, page)
    await p.locator(`.tool-pen button[data-key="${key}"]`).click()
    const pts = await gridPoints(p, bend ? [[row, 1], [row, 3], [row - 1, 4], [row - 1, 6]] : [[row, 6], [row, 8]])
    await drag(p, pts)
    if (!bend) erasePoint = pts[1]
  }
  await goToPage(p, 1)
  await p.locator('.tool-pen button[data-key="6"]').click()
  for (const [r, c, side, n] of [[0, 0, 'right', 1], [0, 1, 'bottom', 2], [1, 3, 'right', 3], [2, 5, 'bottom', 4], [3, 2, 'left', 1], [4, 4, 'top', 2]]) {
    await clicks(p, await edgeAt(p, r, c, side), n)
  }
  await p.locator('.tool-pen button[data-key="7"]').click()
  for (const [r, c, n] of [[0, 0, 1], [3, 3, 2], [9, 9, 1], [0, 9, 2], [9, 0, 1], [5, 5, 1]]) {
    await clicks(p, await cornerAt(p, r, c), n)
  }
  await p.locator('.tool-pen button[data-key="8"]').click()
  for (const [r, c, n] of [[3, 7, 1], [4, 7, 2]]) {
    await clicks(p, await centre(p, r, c), n)
  }
  // The middle click erases the page 2 line through `erasePoint`, the undo brings it back, and a second erase leaves it erased.
  await goToPage(p, 2)
  const [mx, my] = erasePoint
  await p.mouse.move(mx, my)
  await p.mouse.click(mx, my, { button: 'middle' })
  await settle()
  await p.click('#control-undo') // the erase is one act, so one undo brings the line back
  await settle()
  await p.mouse.click(mx, my, { button: 'middle' })
  await settle()
  await p.click('#control-pen')
  await settle()
  await p.evaluate(() => Framework.app.deselect())
  await settle()
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

// `actions` is the number of actions the file holds: the load is done when the stack holds all of them and nothing is playing.
async function loadFile (p, from, actions) {
  await openReplayDialog(p)
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('.dialog-options').getByText('Load File', { exact: true }).click()])
  await chooser.setFiles(from)
  await p.locator('#replaysave_filename').waitFor({ state: 'detached', timeout: 30000 })
  await waitFor('the file to load', () => p.evaluate(() => ({ n: Framework.app.puzzle.replayStack.length, playing: Framework.app.puzzle.replayPlaying })), (s) => s.n === actions && !s.playing, 15000)
}

// ---- Recording ----------------------------------------------------------------------------------------------------------

async function record (browser) {
  const p = await openPage(browser, SCRIPT_NAMES)
  await recordSolve(p)
  p.phase = PHASE.save
  const name = await saveFile(p, REPLAY_FILE)
  const snap = await snapshot(p)
  writeFileSync(GRID_FILE, JSON.stringify(snap, null, 1))
  await p.screenshot({ path: `${SHOT_DIR}recorded.png` })
  const filePayload = JSON.parse(readFileSync(REPLAY_FILE, 'utf8'))
  console.log(JSON.stringify({ file: name, format: filePayload.format, replayVersion: filePayload.replay.version, actions: snap.stack.length, penPaths: snap.penPaths, errors: p.errors, stackDigest: digest(strip(snap.stack)), stateDigest: digest(snap.state), drawDigest: digest(snap.draw) }, null, 1))
  await p.context().close()
}

// ---- Playing ------------------------------------------------------------------------------------------------------------

async function enterReplayTool (p) {
  await waitFor('the replay tool to open', async () => { await p.click('#control-replay'); return waitToolOpen(p) }, (t) => t === 'replay', 15000, 0)
}
// SudokuPad binds the tool button's handler a moment after the button appears, so a click can do nothing.
const waitToolOpen = (p) => tryUntil(() => p.evaluate(() => Framework.app.tool), (t) => t === 'replay', 500)

const toolState = (p) => p.evaluate(() => ({ cls: document.body.className.split(' ').filter((c) => /^replay-/.test(c)).join(' '), playing: Framework.app.puzzle.replayPlaying, time: ToolReplay.tool.replayCurrentTime, total: ToolReplay.tool.replayTotalTime, stack: Framework.app.puzzle.replayStack.length }))
const isPaused = (s) => s.cls === 'replay-paused' && !s.playing
// Waits for the tool to be paused: a jump finishes on its own, a play when the last action has run.
const untilPaused = (what, p, timeoutMs = 10000) => waitFor(what, () => toolState(p), isPaused, timeoutMs, 50)
const pressKey = (p, key) => p.locator(`.controls-input button[data-key="${key}"]`).click()

// What a phase's end reads: the grid against the recording, and the page errors filed under the phase.
async function checked (p, phase, ref, extra = {}) {
  return { ...extra, ...compare(ref, await snapshot(p)), errors: errorsOf(p, phase) }
}

// Plays from the start with `start()`, sampling the tool while it runs, so a play that never advanced shows. The mid picture is
// taken once half the actions have played.
async function playFromStart (p, ref, phase, start, shot, timeoutMs) {
  p.phase = phase
  await pressKey(p, '1') // the tool's start-of-replay button
  const rewound = await untilPaused('the rewind', p)
  const t0 = Date.now()
  const progress = []
  let shotTaken = false
  await start()
  const last = await tryUntil(async () => {
    const s = await toolState(p)
    progress.push({ ms: Date.now() - t0, stack: s.stack, cls: s.cls })
    if (!shotTaken && s.stack >= ref.stack.length / 2) { shotTaken = true; await shot(`mid-${phase.replace(/ /g, '-')}`) }
    return s
  }, isPaused, timeoutMs, 100)
  const stacks = [...new Set(progress.map((x) => x.stack))]
  return checked(p, phase, ref, {
    ms: Date.now() - t0, stalled: !isPaused(last), finalTool: last, startedAt: { time: rewound.time, stack: rewound.stack },
    sawPlaying: progress.some((x) => x.cls === 'replay-playing'), distinctStackSizes: stacks.length, progress: progress.filter((x, i) => i === 0 || x.stack !== progress[i - 1].stack).slice(0, 40)
  })
}

async function playCase (browser, name, ref, opts = {}) {
  const toolpen = opts.toolpen !== false
  const out = { case: name, toolpen }
  const p = await openPage(browser, CASES[name], { toolpen })
  const shot = (tag) => p.screenshot({ path: `${SHOT_DIR}${name}${toolpen ? '' : '-nopen'}-${tag}.png` })
  p.phase = PHASE.load
  const t0 = Date.now()
  await loadFile(p, REPLAY_FILE, ref.stack.length)
  out.load = await checked(p, PHASE.load, ref, { ms: Date.now() - t0 })
  await shot('loaded')

  await enterReplayTool(p)
  out.totalMs = (await toolState(p)).total
  // Normal speed: the tool's own play at speed 1, from the start. Entering the tool leaves its clock at the end, so it is rewound first.
  out.normal = await playFromStart(p, ref, PHASE.normal, () => p.evaluate(() => { ToolReplay.tool.play(-1, 1) }), shot, out.totalMs + 30000)
  await shot('normal')
  // The tool's Play button, which plays at speed 10.
  out.play10 = await playFromStart(p, ref, PHASE.play10, () => pressKey(p, '2'), shot, out.totalMs + 30000)
  await shot('play10')

  p.phase = PHASE.buttons
  const step = async (key) => { await pressKey(p, key); return (await untilPaused(`the replay tool after button ${key}`, p)).stack }
  await untilPaused('the tool before stepping', p)
  const trail = [await step('1')]
  for (let i = 0; i < 12 && (await toolState(p)).time < out.totalMs; i++) trail.push(await step('6'))
  trail.push(await step('4'))
  trail.push(await step('4'))
  trail.push(await step('3'))
  out.buttons = await checked(p, PHASE.buttons, ref, { trail })
  await shot('buttons')

  p.phase = PHASE.action
  // Every action boundary in time order, forward, then back from the end every seventh action, then the start and the end: each
  // jump resets the puzzle and plays up to the time.
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
    const s = await untilPaused(`the jump to ${time}`, p)
    const want = times.filter((x) => x <= time).length
    if (s.stack < want || s.stack > want + 1) wrongCount.push({ time, stack: s.stack, want })
  }
  for (let k = 0; k < times.length; k++) await jump(times[k])
  for (let k = times.length - 1; k >= 0; k -= 7) await jump(times[k])
  await jump(0)
  await jump(out.totalMs)
  out.step = await checked(p, PHASE.action, ref, { jumps, wrongCount: wrongCount.slice(0, 5) })
  await shot('step')
  out.errors = p.errors
  await p.context().close()
  return out
}

// Whether each phase's played action list equals the "none" case's, which is SudokuPad's own list with no script installed.
function annotateAgainstNone (results) {
  for (const [name, result] of Object.entries(results)) {
    const none = results[name.endsWith(':nopen') ? 'none:nopen' : 'none']
    if (!none) continue
    for (const phase of ['load', 'normal', 'play10', 'buttons', 'step']) result[phase].stackSameAsNone = result[phase].stackDigest === none[phase].stackDigest
  }
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
      const phases = ['load', 'normal', 'play10', 'buttons', 'step']
      console.log(name, JSON.stringify(Object.fromEntries([...phases.map((ph) => [ph, results[name][ph].stateEqual]), ['stalled', results[name].normal.stalled || results[name].play10.stalled], ['errors', results[name].errors.length]])))
    }
    annotateAgainstNone(results)
    writeFileSync(RESULTS, JSON.stringify(results, null, 1))
  }
} finally {
  await browser.close()
}
