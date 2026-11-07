// Takes the three animations on site/draw-tool.html's "What it adds" list, from the real draw-tool.user.js on the recorded
// puzzle, each a crop of the grid on a fresh page, frames joined into a looping GIF by Python's PIL (as in
// color-by-digit-details-screenshot.mjs):
//   draw-tool-details-text.gif:    a click in a cell's corner, 15 typed, Enter
//   draw-tool-details-erasing.gif: a right-drag across a drawn line removes it
//   draw-tool-details-shapes.gif:  the Shape button set to rectangle, a drag boxing four cells, snapping to the cell edges
// Every step is a real mouse move, click or key; a small dot marks the pointer, which a screenshot does not show. It
// fails, writing nothing, when a step does not land. Each frame lasts FRAME_MS and the last one LAST_MS before the loop.
// Needs python3 with Pillow. Run from the repo root with Playwright's Chromium installed:
//   node docs/research/draw-tool-details-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDrawPage } from './draw-tool-screenshot-page.mjs'

const out = (name) => new URL(`./draw-tool-details-${name}.gif`, import.meta.url).pathname
const FRAME_MS = 250
const LAST_MS = 2500
const MARGIN = 4
const GLIDE_STEPS = 8
// One palette for every frame, so a color only one frame has keeps its own entry.
const JOIN = `
import sys
from PIL import Image
frames, target, ms, last, n = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
images = [Image.open(f'{frames}/{i}.png').convert('RGB') for i in range(n)]
strip = Image.new('RGB', (images[0].width, images[0].height * n))
for i, im in enumerate(images):
    strip.paste(im, (0, i * im.height))
palette = strip.quantize(colors=48)
images = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in images]
images[0].save(target, save_all=True, append_images=images[1:], duration=[ms] * (n - 1) + [last], loop=0, optimize=True)
`

const browser = await chromium.launch()

// A fresh page with Draw on, a pointer dot, and helpers taking frames of the grid from (row, col) to (row2, col2), in cell units.
async function scene (from, to) {
  const p = await openDrawPage(browser, 2)
  await p.evaluate(() => {
    const dot = document.createElement('div')
    dot.id = 'demo-pointer'
    dot.style.cssText = 'position:fixed;left:0;top:0;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:rgba(40,40,40,.55);border:2px solid #fff;pointer-events:none;z-index:99999;display:none'
    document.body.appendChild(dot)
  })
  const [x0, y0, cell] = await p.evaluate(() => {
    const box = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
    return [box.x, box.y, box.width]
  })
  const at = ([row, col]) => [x0 + col * cell, y0 + row * cell]
  const dir = mkdtempSync(join(tmpdir(), 'draw-gif-'))
  let n = 0
  const frame = async () => {
    const [left, top] = at(from)
    const [right, bottom] = at(to)
    await p.screenshot({ path: join(dir, `${n++}.png`), clip: { x: left - MARGIN, y: top - MARGIN, width: right - left + 2 * MARGIN, height: bottom - top + 2 * MARGIN } })
  }
  const pointer = (point, shown = true) => p.evaluate(([x, y, s]) => {
    const dot = document.getElementById('demo-pointer')
    dot.style.display = s ? 'block' : 'none'
    dot.style.left = `${x}px`
    dot.style.top = `${y}px`
  }, [...at(point), shown])
  const move = async (point) => { await p.mouse.move(...at(point)); await pointer(point) }
  // Moves the held or free pointer through points, a frame after each step when `framed`.
  const glide = async (points, framed = true) => {
    let last = points[0]
    for (const point of points.slice(1)) {
      for (let i = 1; i <= GLIDE_STEPS; i++) {
        const t = i / GLIDE_STEPS
        await move([last[0] + (point[0] - last[0]) * t, last[1] + (point[1] - last[1]) * t])
        if (framed && i % 2 === 0) await frame()
      }
      last = point
    }
  }
  const finish = async (target) => {
    await p.mouse.move(0, 0)
    await pointer([0, 0], false)
    await frame()
    const joined = spawnSync('python3', ['-I', '-c', JOIN, dir, target, String(FRAME_MS), String(LAST_MS), String(n)], { encoding: 'utf8' })
    rmSync(dir, { recursive: true })
    if (joined.status !== 0) throw new Error(joined.stderr)
    console.log(`wrote ${target}`)
    await p.close()
  }
  return { p, at, move, glide, frame, finish, pointer }
}

// Text: a click in r8c7's corner, 15 typed, Enter.
{
  const s = await scene([6.5, 5.5], [8.5, 7.5])
  await s.p.click('.controls-input button[data-key="3"]')
  await s.p.locator('#draw-tool-size').fill('10')
  await s.move([8.5, 7.5])
  await s.glide([[8.5, 7.5], [7.25, 6.3]], false)
  await s.frame()
  await s.p.mouse.click(...s.at([7.25, 6.3]))
  await s.frame()
  for (const key of ['1', '5']) { await s.p.keyboard.type(key); await s.frame() }
  await s.p.keyboard.press('Enter')
  if ((await s.p.locator('#draw-tool-layer text.draw-tool-text').allTextContents()).join() !== '15') throw new Error('the typed 15 did not land')
  await s.finish(out('text'))
}

// Erasing: a green line is drawn first, then a right-drag across it removes it.
{
  const s = await scene([3.5, 4], [6.5, 8])
  await s.p.click('.controls-input button[data-key="1"]')
  await s.p.locator('#draw-tool-size').fill('6')
  await s.p.mouse.move(...s.at([4.2, 4.4]))
  await s.p.mouse.down()
  await s.p.mouse.move(...s.at([5.3, 7.3]), { steps: 12 })
  await s.p.mouse.up()
  const strokes = () => s.p.locator('#draw-tool-layer path').count()
  if ((await strokes()) !== 1) throw new Error('the line did not land')
  await s.move([4.9, 7.6])
  await s.frame()
  await s.p.mouse.down({ button: 'right' })
  await s.glide([[4.9, 7.6], [4.9, 5.5], [4.9, 4.0]])
  await s.p.mouse.up({ button: 'right' })
  if ((await strokes()) !== 0) throw new Error('the right-drag did not erase the line')
  await s.finish(out('erasing'))
}

// Shapes: the Shape button stepped to a rectangle, a drag across four cells snapping to their edges.
{
  const s = await scene([3.5, 4], [7.5, 8])
  await s.p.click('.controls-input button[data-key="6"]')
  await s.p.locator('#draw-tool-size').fill('6')
  await s.p.click('.draw-tool-shape-mode')
  if ((await s.p.locator('.draw-tool-shape-mode').getAttribute('data-mode')) !== 'rect') throw new Error('Shape did not step to rectangle')
  await s.move([4.3, 5.2])
  await s.frame()
  await s.p.mouse.down()
  await s.glide([[4.3, 5.2], [5.8, 6.6]])
  await s.p.mouse.up()
  if ((await s.p.locator('#draw-tool-layer rect.draw-tool-shape').count()) !== 1) throw new Error('the rectangle did not land')
  await s.finish(out('shapes'))
}
await browser.close()
