// Takes the pictures for site/color-by-digit.html from the real script on the live page, on the shared example of
// color-by-digit-example.mjs (two boxes, one given, the default Low/5/High profile):
//   color-by-digit-details-digit.png  the boxes in Digit, with the red circles of its marks that conflict with the given 5
//   color-by-digit-details-modes.gif  an animation: the boxes and the button stepping Cell, Digit, Both and Off by real presses, 1.5 s a frame
//   color-by-digit-details-cell.gif   an animation in Cell: a 2 typed into an empty cell fills it, center marks 7 and 8 in another fill it,
//                                     and a center mark 2 from the other group takes the fill away; the last state holds longer
//   color-by-digit-details-menu.gif   an animation: the boxes and, beside them, the profile menu opened from the button's arrow box,
//                                     Odd/Even picked by a real click, and the boxes recolored; the last state holds longer
// Every change is real input on the real script; a frame is taken once the page has settled. The mascot is hidden.
// Needs python3 with Pillow for the GIFs. Run from the repo root: node docs/research/color-by-digit-details-screenshot.mjs
import { chromium } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BUTTON, exampleClip, MODES, openExample, pressTo, SETTLE_MS, typeInto, waitForCircles } from './color-by-digit-example.mjs'
import { joinGif } from './gif-join.mjs'

const out = (name, ext = 'png') => new URL(`./color-by-digit-details-${name}.${ext}`, import.meta.url).pathname
const FRAME_MS = 1500
const HOLD_MS = 3000
const OPEN_MS = 2000
const MENU = '#color-by-digit-menu'
const MENU_ARROW = `${BUTTON} [data-role="menu"]`

const browser = await chromium.launch()
const frames = mkdtempSync(join(tmpdir(), 'cbd-gifs-'))
const shot = (p, name, clip) => p.screenshot({ path: join(frames, `${name}.png`), clip })

// The modes: the two boxes and, beside them, the button, one frame per mode, each after a real press.
{
  const p = await openExample(browser)
  await pressTo(p, 'CELL')
  const button = p.locator(BUTTON)
  for (const [i, mode] of MODES.entries()) {
    await pressTo(p, mode)
    if (mode === 'DIGIT' || mode === 'BOTH') await waitForCircles(p)
    if (mode === 'DIGIT') await p.screenshot({ path: out('digit'), clip: await exampleClip(p) })
    await p.mouse.move(0, 0)
    await shot(p, `modes-${i}-grid`, await exampleClip(p))
    await button.screenshot({ path: join(frames, `modes-${i}-button.png`) })
  }
  joinGif(MODES.map((mode, i) => ({ files: [join(frames, `modes-${i}-grid.png`), join(frames, `modes-${i}-button.png`)], caption: mode.charAt(0) + mode.slice(1).toLowerCase(), ms: FRAME_MS })), out('modes', 'gif'))
  await p.context().close()
}

// Kept in step: cells (2, 4) and (2, 5) start empty; a digit, then center marks, then a center mark from the other group.
{
  const p = await openExample(browser, { leave: [[2, 5]] })
  const entries = [
    ['Start', null],
    ['Type 2', ['#control-normal', 2, 4, '2']],
    ['Center marks 7 and 8', ['#control-centre', 2, 5, '78']],
    ['Add a center mark 2', ['#control-centre', 2, 5, '2']]
  ]
  for (const [i, [, entry]] of entries.entries()) {
    if (entry) await typeInto(p, ...entry)
    await p.mouse.move(0, 0)
    await p.waitForTimeout(SETTLE_MS)
    await shot(p, `cell-${i}`, await exampleClip(p))
  }
  joinGif(entries.map(([caption], i) => ({ files: [join(frames, `cell-${i}.png`)], caption, captionUnder: 0, ms: i === entries.length - 1 ? HOLD_MS : FRAME_MS })), out('cell', 'gif'))
  await p.context().close()
}

// The profile menu: shut, open, Odd/Even picked.
{
  const p = await openExample(browser)
  const button = p.locator(BUTTON)
  const oddEven = () => p.locator(`${MENU} [data-act=pick]`).filter({ hasText: 'Odd/Even' })
  await p.click(MENU_ARROW)
  await p.locator(MENU).waitFor({ state: 'visible' })
  await p.waitForTimeout(SETTLE_MS)
  const b = await button.boundingBox()
  const m = await p.locator(MENU).boundingBox()
  const x = Math.max(Math.min(b.x, m.x) - 10, 0)
  const y = Math.max(m.y - 10, 0)
  const menuClip = { x, y, width: Math.max(b.x + b.width, m.x + m.width) + 10 - x, height: b.y + b.height + 10 - y }
  await p.click(MENU_ARROW)
  await p.locator(MENU).waitFor({ state: 'hidden' })
  const steps = [
    [async () => {}, FRAME_MS],
    [async () => { await p.click(MENU_ARROW); await p.locator(MENU).waitFor({ state: 'visible' }) }, OPEN_MS],
    [async () => { await oddEven().click(); await p.locator(MENU).waitFor({ state: 'hidden' }); await p.mouse.move(0, 0) }, HOLD_MS]
  ]
  await p.mouse.move(0, 0)
  for (const [i, [act]] of steps.entries()) {
    await act()
    await p.waitForTimeout(SETTLE_MS)
    await shot(p, `menu-${i}-grid`, await exampleClip(p))
    await shot(p, `menu-${i}-menu`, menuClip)
  }
  joinGif(steps.map(([, ms], i) => ({ files: [join(frames, `menu-${i}-grid.png`), join(frames, `menu-${i}-menu.png`)], ms })), out('menu', 'gif'))
  await p.context().close()
}

rmSync(frames, { recursive: true })
await browser.close()
