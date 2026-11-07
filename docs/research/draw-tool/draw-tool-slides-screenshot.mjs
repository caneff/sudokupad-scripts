// Takes the eight slides of Draw Tool's slideshow on site/index.html, each the board patch beside the Draw panel, from the real draw-tool.user.js on the recorded puzzle, with no caption drawn in:
//   draw-tool-slide-1-line.png      a freehand line
//   draw-tool-slide-2-straight.png  a Shift+drag, which draws a straight line
//   draw-tool-slide-3-opacity.png   the Size slider up and the Opacity slider down: a thick, see-through line over a thin solid one
//   draw-tool-slide-4-rectangle.png the Shape button on rectangle, a rectangle round two cells
//   draw-tool-slide-5-ellipse.png   the Shape button on ellipse, an ellipse round two cells
//   draw-tool-slide-6-text.png      a cage sum typed in a cell's corner
//   draw-tool-slide-7-colors.png    a hold on a color button: a picker over each color, one recolored, and the line in it recolored too
//   draw-tool-slide-8-erase.png     a right-drag part way across a line, its path dotted and the pointer on it
// Every stroke is a real mouse drag, click or key. It fails when a step does not land; each slide is written as soon as it is taken, so a failed run leaves the earlier slides replaced.
// Run from the repo root with Playwright's Chromium installed:
//   node docs/research/draw-tool/draw-tool-slides-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { openDrawPage, OLD_WIDTHS } from './draw-tool-screenshot-page.mjs'

const out = (name) => new URL(`./draw-tool-slide-${name}.png`, import.meta.url).pathname
const DRAG_STEPS = 10
// The picture's left edge, in cells from the grid's left, and the page pixels kept round its edges.
const FIRST_COL = 4
const MARGIN = 4
// SudokuPad's own number: how long the script holds a color button before it shows the pickers, plus slack.
const HOLD_MS = 1300
const GREEN = 1
const PINK = 2
const ORANGE = 3
const RED = 4
const BLUE = 6

const browser = await chromium.launch()

// A fresh page with Draw on and helpers working in cell units from the grid's top left.
async function scene () {
  const p = await openDrawPage(browser, 1)
  const [x0, y0, cell] = await p.evaluate(() => {
    const box = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
    return [box.x, box.y, box.width]
  })
  const at = ([row, col]) => [x0 + col * cell, y0 + row * cell]
  const items = (selector) => p.locator(`#draw-tool-layer ${selector}`).count()
  const pick = async (color, width) => {
    await p.click(`.controls-input button[data-key="${color}"]`)
    await p.locator('#draw-tool-size').fill(String(width))
  }
  const drag = async (points, { shift = false } = {}) => {
    const before = await items('path')
    if (shift) await p.keyboard.down('Shift')
    await p.mouse.move(...at(points[0]))
    await p.mouse.down()
    for (const point of points.slice(1)) await p.mouse.move(...at(point), { steps: DRAG_STEPS })
    await p.mouse.up()
    if (shift) await p.keyboard.up('Shift')
    return before
  }
  const landed = async (before) => { if ((await items('path')) <= before) throw new Error('the stroke did not land') }
  const shape = async (mode) => {
    for (let i = 0; i < 2 && (await p.locator('.draw-tool-shape-mode').getAttribute('data-mode')) !== mode; i++) await p.click('.draw-tool-shape-mode')
    if ((await p.locator('.draw-tool-shape-mode').getAttribute('data-mode')) !== mode) throw new Error(`Shape did not step to ${mode}`)
  }
  const shoot = async (name) => {
    const [panelTop, panelRight] = await p.evaluate(() => [
      document.querySelector('.controls-input').getBoundingClientRect().top,
      document.querySelector('.controls-tool').getBoundingClientRect().right
    ])
    const left = x0 + FIRST_COL * cell - MARGIN
    const top = panelTop - MARGIN
    await p.screenshot({ path: out(name), clip: { x: left, y: top, width: panelRight + MARGIN - left, height: y0 + 9 * cell + MARGIN - top } })
    console.log(`wrote ${out(name)}`)
    await p.close()
  }
  return { p, at, items, pick, drag, landed, shape, shoot }
}

// 1: a freehand line, a little uneven as a hand draws one.
{
  const s = await scene()
  await s.pick(GREEN, OLD_WIDTHS[1])
  await s.landed(await s.drag([[5.6, 4.4], [5.0, 5.4], [5.9, 6.5], [5.2, 7.5], [5.5, 8.6]]))
  await s.p.mouse.move(0, 0)
  await s.shoot('1-line')
}

// 2: Shift held, a wobbly drag comes out as one straight line.
{
  const s = await scene()
  await s.pick(BLUE, OLD_WIDTHS[1])
  await s.landed(await s.drag([[4.6, 4.4], [5.4, 5.6], [5.0, 6.8], [6.4, 8.6]], { shift: true }))
  await s.p.mouse.move(0, 0)
  await s.shoot('2-straight')
}

// 3: a thin solid line, then a thick see-through one across it and the digits.
{
  const s = await scene()
  await s.pick(BLUE, OLD_WIDTHS[0])
  await s.landed(await s.drag([[3.5, 4.3], [5.5, 8.7]], { shift: true }))
  await s.pick(RED, 16)
  await s.p.locator('#draw-tool-opacity').fill('40')
  await s.landed(await s.drag([[6.5, 4.3], [4.5, 8.7]], { shift: true }))
  await s.p.mouse.move(0, 0)
  await s.shoot('3-opacity')
}

// 4: a rectangle round two cells.
{
  const s = await scene()
  await s.pick(PINK, OLD_WIDTHS[1])
  await s.shape('rect')
  await s.p.mouse.move(...s.at([6.1, 6.1]))
  await s.p.mouse.down()
  await s.p.mouse.move(...s.at([6.9, 7.9]), { steps: DRAG_STEPS })
  await s.p.mouse.up()
  if ((await s.items('rect.draw-tool-shape')) !== 1) throw new Error('the rectangle did not land')
  await s.p.mouse.move(0, 0)
  await s.shoot('4-rectangle')
}

// 5: an ellipse round two cells.
{
  const s = await scene()
  await s.pick(GREEN, OLD_WIDTHS[1])
  await s.shape('ellipse')
  await s.p.mouse.move(...s.at([6.0, 6.0]))
  await s.p.mouse.down()
  await s.p.mouse.move(...s.at([7.0, 8.0]), { steps: DRAG_STEPS })
  await s.p.mouse.up()
  if ((await s.items('ellipse.draw-tool-shape')) !== 1) throw new Error('the ellipse did not land')
  await s.p.mouse.move(0, 0)
  await s.shoot('5-ellipse')
}

// 6: a cage sum typed in the top left corner of a cell.
{
  const s = await scene()
  await s.pick(ORANGE, 16)
  await s.p.mouse.click(...s.at([7.25, 6.3]))
  await s.p.keyboard.type('17')
  await s.p.keyboard.press('Enter')
  if ((await s.p.locator('#draw-tool-layer text.draw-tool-text').allTextContents()).join() !== '17') throw new Error('the typed sum did not land')
  await s.p.mouse.move(0, 0)
  await s.shoot('6-text')
}

// 7: a line in color 3, then a hold on a color button puts a picker over each color, and color 3 is changed in its picker.
{
  const s = await scene()
  await s.pick(ORANGE, OLD_WIDTHS[2])
  await s.landed(await s.drag([[5.5, 4.4], [5.1, 6.0], [5.8, 8.6]]))
  await s.p.mouse.move(...await s.p.locator(`.controls-input button[data-key="${PINK}"]`).evaluate((b) => { const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] }))
  await s.p.mouse.down()
  await s.p.waitForTimeout(HOLD_MS)
  await s.p.mouse.up()
  const pickers = '.draw-tool-picker input[type=color]'
  if ((await s.p.locator(pickers).count()) !== 9) throw new Error('the hold did not show nine pickers')
  await s.p.locator(`.draw-tool-picker input[data-key="${ORANGE}"]`).fill('#0d8f8f')
  await s.p.mouse.move(0, 0)
  const line = await s.p.locator('#draw-tool-layer path').first().evaluate((el) => getComputedStyle(el).stroke)
  if (line !== 'rgb(13, 143, 143)') throw new Error(`the line did not take the new color: ${line}`)
  await s.shoot('7-colors')
}

// 8: a right-drag part way across a line: its planned path dotted, a faint trail behind the pointer, the pointer on the line.
{
  const s = await scene()
  await s.pick(GREEN, OLD_WIDTHS[1])
  await s.landed(await s.drag([[4.3, 4.4], [7.3, 8.6]]))
  const path = [[7.0, 5.3], [4.3, 7.6]]
  // Short of the line, which the drag crosses a little further on.
  const STOP = [6.05, 6.1]
  await s.p.evaluate(([planned]) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:99998'
    svg.innerHTML = `<polyline fill="none" stroke="rgba(40,40,40,.4)" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round" points="${planned}"/>`
    document.body.appendChild(svg)
    const dot = document.createElement('div')
    dot.id = 'demo-pointer'
    dot.style.cssText = 'position:fixed;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:rgba(40,40,40,.55);border:2px solid #fff;pointer-events:none;z-index:99999'
    document.body.appendChild(dot)
  }, [path.map((point) => s.at(point).join(',')).join(' ')])
  await s.p.mouse.move(...s.at(path[0]))
  await s.p.mouse.down({ button: 'right' })
  await s.p.mouse.move(...s.at(STOP), { steps: DRAG_STEPS })
  const [x, y] = s.at(STOP)
  await s.p.evaluate(([px, py]) => { const dot = document.getElementById('demo-pointer'); dot.style.left = `${px}px`; dot.style.top = `${py}px` }, [x, y])
  if ((await s.items('path')) !== 1) throw new Error('the line was erased before the shot')
  await s.shoot('8-erase')
}
await browser.close()
