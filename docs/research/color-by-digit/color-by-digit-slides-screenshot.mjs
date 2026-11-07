// Takes the ten slides of Color by Digit's slideshow (site/index.html and site/color-by-digit.html), from the real script on the live page, on the shared
// example of color-by-digit-example.mjs (two boxes, one given 2, the demo profile Entropic, no blue, with Modular to switch to). One picture per step, with
// no caption drawn in (the captions are page text):
//   color-by-digit-slide-1-start.png    the boxes in Cell mode
//   color-by-digit-slide-2-type.png     a 1 typed in an empty cell, which fills with its group's color
//   color-by-digit-slide-3-marks.png    center marks 7 and 9, both in one group, typed into another cell: it fills with that group's color
//   color-by-digit-slide-4-add.png      a center mark 2 from another group added: the fill goes
//   color-by-digit-slide-5-digit.png    Digit: darker shades and the red circles of the marks that conflict with the given 2
//   color-by-digit-slide-6-both.png     Both: the fills and the shades
//   color-by-digit-slide-7-off.png      Off: the plain boxes
//   color-by-digit-slide-8-menu.png     back in Cell, the profile menu open from the button's arrow box
//   color-by-digit-slide-9-modular.png  Modular picked from the menu: the boxes recolored
//   color-by-digit-slide-10-split.png   Both with the cells on the demo profile and the digits on Modular, set through saved settings
// Every change but the last is real input on the real script; a slide is taken once the page has settled. The mascot is hidden. Each slide is the boxes
// beside the profile menu's space (the menu when it is open), with the button under the boxes, all scaled to SLIDE_WIDTH, on white (Pillow: python3 with Pillow).
// Run from the repo root: node docs/research/color-by-digit/color-by-digit-slides-screenshot.mjs
import { chromium } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { modeLabel } from '../../../live/color-by-digit/color-by-digit-fixtures.mjs'
import { BUTTON, DEVICE_SCALE, exampleClip, openExample, pressTo, SETTLE_MS, typeInto, waitForCircles } from './color-by-digit-example.mjs'

const out = (name) => new URL(`./color-by-digit-slide-${name}.png`, import.meta.url).pathname
// The slide's width in pixels: the page shows it at half that, at two pixels to one.
const SLIDE_WIDTH = 900
// The pixels between the boxes and the menu's space, after scaling.
const GAP = 40
// The pixels between the boxes and the button under them, before scaling.
const STACK_GAP = 8
const MENU = '#color-by-digit-menu'
const MENU_ARROW = `${BUTTON} [data-role="menu"]`
const JOIN = `
import json, sys
from PIL import Image
grid, button, menu, menu_size, target, scale, gap, stack_gap, width = json.loads(sys.argv[1])
parts = [Image.open(grid).convert('RGB'), Image.open(button).convert('RGB')]
left = Image.new('RGB', (max(p.width for p in parts), sum(p.height for p in parts) + stack_gap), 'white')
left.paste(parts[0], (left.width - parts[0].width, 0))
left.paste(parts[1], (left.width - parts[1].width, parts[0].height + stack_gap))
right = Image.open(menu).convert('RGB') if menu else Image.new('RGB', tuple(menu_size), 'white')
def scaled(image):
    return image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
left, right = scaled(left), scaled(right)
sheet = Image.new('RGB', (max(left.width + gap + right.width, width), max(left.height, right.height)), 'white')
sheet.paste(left, (0, 0))
sheet.paste(right, (left.width + gap, 0))
sheet.save(target)
`

const browser = await chromium.launch()
const frames = mkdtempSync(join(tmpdir(), 'cbd-slides-'))
// The scale and the menu's white space slides 1 to 9 were laid out with, which slide 10 reuses.
let layout

// Takes slide `name` from page `p`: the boxes, the button and, when `menuOpen` is set, the open menu, joined at `scale`. `menuSize` is the white space kept for a menu.
async function takeSlide (p, name, { scale, menuSize, menuOpen }) {
  const button = p.locator(BUTTON)
  await p.mouse.move(0, 0)
  await p.waitForTimeout(SETTLE_MS)
  const parts = ['grid', 'button', 'menu'].map((part) => join(frames, `${name}-${part}.png`))
  await p.screenshot({ path: parts[0], clip: await exampleClip(p) })
  await button.screenshot({ path: parts[1] })
  if (menuOpen) await p.screenshot({ path: parts[2], clip: await p.locator(MENU).boundingBox() })
  const joined = spawnSync('python3', ['-I', '-c', JOIN, JSON.stringify([parts[0], parts[1], menuOpen ? parts[2] : null, menuSize, out(name), scale, GAP, STACK_GAP, SLIDE_WIDTH])], { encoding: 'utf8' })
  if (joined.status !== 0) throw new Error(`joining slide ${name} failed: ${joined.stderr}`)
}

// Slides 1 to 9: one page, real input.
{
  const p = await openExample(browser, { leave: [[2, 5]] })
  // The menu has rounded corners over the number pad; while it is open the other buttons are hidden so no strip of one shows there.
  await p.addStyleTag({ content: `body.hide-others button:not(${BUTTON}):not(${MENU} *) { visibility: hidden !important }` })
  const hideOthers = (on) => p.evaluate((on) => document.body.classList.toggle('hide-others', on), on)
  await hideOthers(true)
  const modular = p.locator(`${MENU} [data-act=pick]`).filter({ hasText: 'Modular' })
  await pressTo(p, 'Cell')
  // Measure the menu once, open and closed again, so every slide is laid out the same.
  await p.click(MENU_ARROW)
  await p.locator(MENU).waitFor({ state: 'visible' })
  await p.waitForTimeout(SETTLE_MS)
  const menuBox = await p.locator(MENU).boundingBox()
  await p.click(MENU_ARROW)
  await p.locator(MENU).waitFor({ state: 'hidden' })
  const boardBox = await exampleClip(p)
  const buttonBox = await p.locator(BUTTON).boundingBox()
  const scale = (SLIDE_WIDTH - GAP) / ((Math.max(boardBox.width, buttonBox.width) + menuBox.width) * DEVICE_SCALE)
  const menuSize = [Math.round(menuBox.width * DEVICE_SCALE), Math.round(menuBox.height * DEVICE_SCALE)]
  await hideOthers(false)
  const slide = (name, open = false) => takeSlide(p, name, { scale, menuSize, menuOpen: open })
  const press = async (mode) => {
    await pressTo(p, mode)
    if (mode === 'Digit' || mode === 'Both') await waitForCircles(p)
  }
  await slide('1-start')
  await typeInto(p, '#control-normal', 2, 4, '1')
  await slide('2-type')
  await typeInto(p, '#control-centre', 2, 5, '79')
  await slide('3-marks')
  await typeInto(p, '#control-centre', 2, 5, '2')
  await slide('4-add')
  await press('Digit')
  await slide('5-digit')
  await press('Both')
  await slide('6-both')
  await press('Off')
  await slide('7-off')
  await press('Cell')
  await hideOthers(true)
  await p.click(MENU_ARROW)
  await p.locator(MENU).waitFor({ state: 'visible' })
  await slide('8-menu', true)
  await modular.click()
  await p.locator(MENU).waitFor({ state: 'hidden' })
  await slide('9-modular')
  await p.context().close()
  layout = { scale, menuSize }
}

// Slide 10: a fresh page whose saved settings give the cells the demo profile and the digits Modular, in Both; the same entries as slide 9's board.
{
  const p = await openExample(browser, { leave: [[2, 5]], split: true })
  await typeInto(p, '#control-normal', 2, 4, '1')
  await typeInto(p, '#control-centre', 2, 5, '279')
  await p.waitForFunction(([selector, label]) => document.querySelector(selector).getAttribute('aria-label') === label, [BUTTON, modeLabel('Both')])
  await waitForCircles(p)
  await takeSlide(p, '10-split', { ...layout, menuOpen: false })
  await p.context().close()
}

rmSync(frames, { recursive: true })
await browser.close()
