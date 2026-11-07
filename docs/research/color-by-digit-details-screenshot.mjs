// Takes the pictures for site/color-by-digit.html from the real script on the live page, on the shared example of
// color-by-digit-example.mjs (two boxes, one given, the default Low/5/High profile): color-by-digit-details-cell.png (Cell),
// color-by-digit-details-digit.png (the same boxes in Digit, with the red circles of its two corner 5s that conflict with the given 5),
// color-by-digit-details-modes.gif (an animation: the two boxes and the button stepping Cell, Digit, Both and Off by real presses, 1.5 s a frame, joined with Python's PIL)
// and color-by-digit-details-menu.png (the profile menu open above the button, Each digit picked). The mascot is hidden.
// Run from the repo root: node docs/research/color-by-digit-details-screenshot.mjs
import { chromium } from 'playwright'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exampleClip, openExample, pressTo, waitForCircles } from './color-by-digit-example.mjs'

const out = (name, ext = 'png') => new URL(`./color-by-digit-details-${name}.${ext}`, import.meta.url).pathname
const MODES = ['CELL', 'DIGIT', 'BOTH', 'OFF']
const FRAME_MS = 1500
// Puts each frame's grid and button side by side, the button centered on the grid's height with its mode named under it, on white, and saves one looping GIF.
const JOIN = `
import sys
from PIL import Image, ImageDraw, ImageFont
frames, target, ms = sys.argv[1], sys.argv[2], int(sys.argv[3])
LABELS = ['Cell', 'Digit', 'Both', 'Off']
font = ImageFont.load_default(size=36)
GAP = 40
images = []
for i in range(4):
    grid = Image.open(f'{frames}/{i}-grid.png').convert('RGB')
    button = Image.open(f'{frames}/{i}-button.png').convert('RGB')
    sheet = Image.new('RGB', (grid.width + GAP + button.width, grid.height), 'white')
    sheet.paste(grid, (0, 0))
    sheet.paste(button, (grid.width + GAP, (grid.height - button.height) // 2))
    # The button's own label is too small to read at a phone's width, so each frame names its mode again under the button.
    top = (grid.height - button.height) // 2 + button.height + 12
    ImageDraw.Draw(sheet).text((grid.width + GAP + button.width // 2, top), LABELS[i], fill='black', font=font, anchor='mt')
    images.append(sheet)
palette = images[0].quantize(colors=64)
images = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in images]
images[0].save(target, save_all=True, append_images=images[1:], duration=ms, loop=0, optimize=True)
`

const browser = await chromium.launch()
const p = await openExample(browser, { deviceScaleFactor: 2 })
await pressTo(p, 'CELL')
await p.screenshot({ path: out('cell'), clip: await exampleClip(p) })

// The two boxes and, beside them, the button, one frame per mode, each after a real press; PIL joins them into the GIF.
const frames = mkdtempSync(join(tmpdir(), 'cbd-modes-'))
const button = p.locator('#control-colorbydigit')
for (const [i, mode] of MODES.entries()) {
  await pressTo(p, mode)
  if (mode === 'DIGIT' || mode === 'BOTH') await waitForCircles(p)
  if (mode === 'DIGIT') await p.screenshot({ path: out('digit'), clip: await exampleClip(p) })
  await p.mouse.move(0, 0)
  await p.screenshot({ path: join(frames, `${i}-grid.png`), clip: await exampleClip(p) })
  await button.screenshot({ path: join(frames, `${i}-button.png`) })
}
const joined = spawnSync('python3', ['-I', '-c', JOIN, frames, out('modes', 'gif'), String(FRAME_MS)], { encoding: 'utf8' })
rmSync(frames, { recursive: true })
if (joined.status !== 0) throw new Error(`joining the frames failed: ${joined.stderr}`)

await p.click('#control-colorbydigit [data-role="menu"]')
await p.locator('#color-by-digit-menu [data-act=pick]').filter({ hasText: 'Each digit' }).click()
await p.click('#control-colorbydigit [data-role="menu"]')
await p.locator('#color-by-digit-menu').waitFor({ state: 'visible' })
await p.waitForTimeout(300)
const b = await button.boundingBox()
const m = await p.locator('#color-by-digit-menu').boundingBox()
const x = Math.max(Math.min(b.x, m.x) - 10, 0)
const y = Math.max(m.y - 10, 0)
await p.screenshot({ path: out('menu'), clip: { x, y, width: Math.max(b.x + b.width, m.x + m.width) + 10 - x, height: b.y + b.height + 10 - y } })
await browser.close()
