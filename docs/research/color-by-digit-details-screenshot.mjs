// Takes the pictures for site/color-by-digit.html from the real script on the live page, on the shared example of
// color-by-digit-example.mjs (two boxes, one given, the demo profile Entropic, no blue, with Modular to switch to):
//   color-by-digit-details-digit.png  the boxes in Digit, with the red circles of its marks that conflict with the given 5
//   color-by-digit-details-tour.gif   one captioned animation at the top of the page, on one board: a 1 typed in Cell and its cell filled, center
//                                     marks 7 and 9 filling another cell and a center mark 2 from the other group taking the fill away, the button
//                                     stepping Digit, Both, Off and Cell by real presses (Digit and Both show the darker shades and the circles),
//                                     then the profile menu opened from the button's arrow box and Modular picked by a real click; the last state
//                                     holds longer
// Every change is real input on the real script; a frame is taken once the page has settled. The mascot is hidden. Each frame is the boards beside the
// profile menu's space (the menu when it is open), with the button under the boards, all scaled to TOUR_WIDTH.
// Needs python3 with Pillow for the GIF. Run from the repo root: node docs/research/color-by-digit-details-screenshot.mjs
import { chromium } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BUTTON, DEVICE_SCALE, exampleClip, openExample, pressTo, SETTLE_MS, typeInto, waitForCircles } from './color-by-digit-example.mjs'
import { joinGif } from './gif-join.mjs'

const out = (name, ext = 'png') => new URL(`./color-by-digit-details-${name}.${ext}`, import.meta.url).pathname
const FRAME_MS = 1300
const HOLD_MS = 3000
// The tour's width in pixels, the width the page shows it at (450 px) at two pixels to one.
const TOUR_WIDTH = 900
const GAP = 40
const MENU = '#color-by-digit-menu'
const MENU_ARROW = `${BUTTON} [data-role="menu"]`

const browser = await chromium.launch()

// The Digit picture: the boxes in Digit, after the circles are drawn.
{
  const p = await openExample(browser)
  await pressTo(p, 'DIGIT')
  await waitForCircles(p)
  await p.mouse.move(0, 0)
  await p.screenshot({ path: out('digit'), clip: await exampleClip(p) })
  await p.context().close()
}

// The tour.
{
  const frames = mkdtempSync(join(tmpdir(), 'cbd-tour-'))
  const p = await openExample(browser, { leave: [[2, 5]] })
  // The menu has rounded corners over the number pad; while it is open the other buttons are hidden so no strip of one shows there.
  await p.addStyleTag({ content: `body.hide-others button:not(${BUTTON}):not(${MENU} *) { visibility: hidden !important }` })
  const hideOthers = (on) => p.evaluate((on) => document.body.classList.toggle('hide-others', on), on)
  await hideOthers(true)
  const button = p.locator(BUTTON)
  const modular = p.locator(`${MENU} [data-act=pick]`).filter({ hasText: 'Modular' })
  await pressTo(p, 'CELL')
  await p.click(MENU_ARROW)
  await p.locator(MENU).waitFor({ state: 'visible' })
  await p.waitForTimeout(SETTLE_MS)
  const menuBox = await p.locator(MENU).boundingBox()
  await p.click(MENU_ARROW)
  await p.locator(MENU).waitFor({ state: 'hidden' })
  const boardBox = await exampleClip(p)
  const buttonBox = await button.boundingBox()
  const scale = TOUR_WIDTH / (Math.max(boardBox.width, buttonBox.width) * DEVICE_SCALE + GAP + menuBox.width * DEVICE_SCALE)
  const menuSize = [Math.round(menuBox.width * DEVICE_SCALE), Math.round(menuBox.height * DEVICE_SCALE)]
  await hideOthers(false)
  const list = []
  const snap = async (caption, ms, { menu = false } = {}) => {
    await p.mouse.move(0, 0)
    await p.waitForTimeout(SETTLE_MS)
    const i = list.length
    await p.screenshot({ path: join(frames, `${i}-grid.png`), clip: await exampleClip(p) })
    await button.screenshot({ path: join(frames, `${i}-button.png`) })
    if (menu) await p.screenshot({ path: join(frames, `${i}-menu.png`), clip: menuBox })
    list.push({ files: [{ stack: [join(frames, `${i}-grid.png`), join(frames, `${i}-button.png`)], scale }, { stack: [menu ? join(frames, `${i}-menu.png`) : menuSize], scale }], caption, captionUnder: 0, ms })
  }
  const press = async (mode) => {
    await pressTo(p, mode)
    if (mode === 'DIGIT' || mode === 'BOTH') await waitForCircles(p)
  }
  await snap('Start', FRAME_MS)
  await typeInto(p, '#control-normal', 2, 4, '1')
  await snap('Type a 1', FRAME_MS)
  await typeInto(p, '#control-centre', 2, 5, '79')
  await snap('Center marks 7 and 9', FRAME_MS)
  await typeInto(p, '#control-centre', 2, 5, '2')
  await snap('Add a center mark 2', FRAME_MS + 200)
  for (const mode of ['DIGIT', 'BOTH', 'OFF', 'CELL']) {
    await press(mode)
    await snap(mode.charAt(0) + mode.slice(1).toLowerCase(), FRAME_MS)
  }
  await hideOthers(true)
  await p.click(MENU_ARROW)
  await p.locator(MENU).waitFor({ state: 'visible' })
  await snap('Open the profile menu', FRAME_MS + 500, { menu: true })
  await modular.click()
  await p.locator(MENU).waitFor({ state: 'hidden' })
  await snap('Pick Modular', HOLD_MS)
  joinGif(list, out('tour', 'gif'), { colors: 128 })
  rmSync(frames, { recursive: true })
  await p.context().close()
}

await browser.close()
