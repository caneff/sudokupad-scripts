// Takes the eight slides of Text Annotation's slideshow on site/index.html, each the board patch beside the Text Annotation panel, from the real draw-tool.user.js on the recorded puzzle, with no caption drawn in:
//   draw-tool-slide-1-type.png        a cage sum typed in a cell's corner
//   draw-tool-slide-2-size.png        the Size slider moved: a small note and a large one
//   draw-tool-slide-3-background.png  the Background button on: a note in a page-colored box over the digits, beside one made with it off
//   draw-tool-slide-4-colors.png      a hold on a color button: a picker over each color, one recolored, and the note in it recolored too
//   draw-tool-slide-5-move.png        a note dragged off the grid to beside it, its old place dashed, a ring on the point it is held by
//   draw-tool-slide-6-select.png      three notes selected by a drag on empty space, the dragged box dashed, and recolored together from the panel
//   draw-tool-slide-7-erase.png       the pointer on a note with a red ring round it, where a right click erases it
//   draw-tool-slide-8-erased.png      the same board after the right click: the note gone
// Every note is typed with real clicks and keys. It fails when a step does not land; each slide is written as soon as it is taken, so a failed run leaves the earlier slides replaced.
// Run from the repo root with Playwright's Chromium installed:
//   node docs/research/draw-tool/draw-tool-slides-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { openDrawPage } from './draw-tool-screenshot-page.mjs'

const out = (name) => new URL(`./draw-tool-slide-${name}.png`, import.meta.url).pathname
const DRAG_STEPS = 10
// The picture's left edge, in cells from the grid's left, and the page pixels kept round its edges.
const FIRST_COL = 4
const MARGIN = 4
// SudokuPad's own number: how long the script holds a color button before it shows the pickers, plus slack.
const HOLD_MS = 1300
const GREEN = 1
const ORANGE = 3
const RED = 4
const BLUE = 6
const NOTES = '#draw-tool-layer .draw-tool-text'
const DRAWING_PREFIX = 'DrawTool_drawing_'

// A red ring round the point (x, y), where a press lands.
const addRing = (p, [x, y], size = 34) => p.evaluate(([px, py, d]) => {
  const ring = document.createElement('div')
  ring.style.cssText = `position:fixed;left:${px}px;top:${py}px;width:${d}px;height:${d}px;margin:${-d / 2}px 0 0 ${-d / 2}px;box-sizing:border-box;border-radius:50%;border:3px solid #d32f2f;pointer-events:none;z-index:99998`
  document.body.appendChild(ring)
}, [x, y, size])

// A gray dashed box over the page box `{ x, y, width, height }`: where a note was, or where a drag went.
const addDashedBox = (p, box) => p.evaluate(({ x, y, width, height }) => {
  const el = document.createElement('div')
  el.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${width}px;height:${height}px;box-sizing:border-box;border:2px dashed #666;pointer-events:none;z-index:99998`
  document.body.appendChild(el)
}, box)

// The notes Text Annotation saved for the puzzle on the page.
const storedNotes = (p) => p.evaluate((prefix) => Framework.getData(prefix + (Framework.app.puzzle.puzzleId || window.location.href)), DRAWING_PREFIX)

const browser = await chromium.launch()

// A fresh page with Draw on and helpers working in cell units from the grid's top left.
async function scene () {
  const p = await openDrawPage(browser, 1)
  const [x0, y0, cell] = await p.evaluate(() => {
    const box = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
    return [box.x, box.y, box.width]
  })
  const at = ([row, col]) => [x0 + col * cell, y0 + row * cell]
  const items = () => p.locator(NOTES).count()
  const pick = (color, size) => p.click(`.controls-input button[data-key="${color}"]`).then(() => p.locator('#draw-tool-size').fill(String(size)))
  const note = async (cell, text) => {
    const before = await items()
    await p.mouse.click(...at(cell))
    await p.keyboard.type(text)
    await p.keyboard.press('Enter')
    if ((await items()) !== before + 1) throw new Error(`the note ${text} did not land`)
  }
  const background = async (on) => {
    const button = p.locator('.draw-tool-background')
    if ((await button.getAttribute('aria-pressed')) !== String(on)) await button.click()
    if ((await button.getAttribute('aria-pressed')) !== String(on)) throw new Error(`Background did not turn ${on ? 'on' : 'off'}`)
  }
  const shoot = async (name, { keepOpen = false } = {}) => {
    const [panelTop, panelRight] = await p.evaluate(() => [
      document.querySelector('.controls-input').getBoundingClientRect().top,
      document.querySelector('.controls-tool').getBoundingClientRect().right
    ])
    const left = x0 + FIRST_COL * cell - MARGIN
    const top = panelTop - MARGIN
    await p.screenshot({ path: out(name), clip: { x: left, y: top, width: panelRight + MARGIN - left, height: y0 + 9 * cell + MARGIN - top } })
    console.log(`wrote ${out(name)}`)
    if (!keepOpen) await p.close()
  }
  return { p, at, items, pick, note, background, shoot }
}

// 1: a cage sum typed in the top left corner of a cell.
{
  const s = await scene()
  await s.pick(ORANGE, 16)
  await s.note([7.5, 6.5], '17')
  await s.p.mouse.move(0, 0)
  await s.shoot('1-type')
}

// 2: the Size slider moved between two notes.
{
  const s = await scene()
  await s.pick(BLUE, 3)
  await s.note([5.5, 5.4], '17')
  await s.p.locator('#draw-tool-size').fill('14')
  await s.note([7.5, 6.5], '23')
  await s.p.mouse.move(0, 0)
  await s.shoot('2-size')
}

// 3: one note made with Background off, one with it on, both over digits.
{
  const s = await scene()
  await s.pick(RED, 10)
  await s.background(false)
  await s.note([7.5, 5.5], '17')
  await s.background(true)
  await s.note([6.5, 7.5], '23')
  if ((await s.p.locator('#draw-tool-layer .draw-tool-text-bg').count()) !== 1) throw new Error('only the second note should have a box')
  await s.p.mouse.move(0, 0)
  await s.shoot('3-background')
}

// 4: a note in color 3, then a hold on a color button puts a picker over each color, and color 3 is changed in its picker.
{
  const s = await scene()
  await s.pick(ORANGE, 12)
  await s.note([6.5, 5.5], '17')
  await s.p.mouse.move(...await s.p.locator('.controls-input button[data-key="2"]').evaluate((b) => { const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] }))
  await s.p.mouse.down()
  await s.p.waitForTimeout(HOLD_MS)
  await s.p.mouse.up()
  const pickers = '.draw-tool-picker input[type=color]'
  if ((await s.p.locator(pickers).count()) !== 9) throw new Error('the hold did not show nine pickers')
  await s.p.locator(`.draw-tool-picker input[data-key="${ORANGE}"]`).fill('#0d8f8f')
  await s.p.mouse.move(0, 0)
  const note = await s.p.locator(NOTES).first().evaluate((el) => getComputedStyle(el).color)
  if (note !== 'rgb(13, 143, 143)') throw new Error(`the note did not take the new color: ${note}`)
  await s.shoot('4-colors')
}

// 5: a note dragged by its middle off the grid, into the space between it and the panel; the old place is a dashed gray box and a ring marks where the pointer holds it.
{
  const s = await scene()
  await s.pick(ORANGE, 6)
  const FROM = [6.5, 7.5]
  const TO = [5.5, 9.45]
  await s.note(FROM, '17')
  const text = s.p.locator(NOTES)
  const placed = await text.boundingBox()
  await s.p.mouse.move(...s.at(FROM))
  await s.p.mouse.down()
  await s.p.mouse.move(...s.at(TO), { steps: DRAG_STEPS })
  await s.p.mouse.up()
  const moved = await text.boundingBox()
  if ((await text.count()) !== 1 || Math.abs(moved.x - placed.x) < 10) throw new Error('the drag did not leave one moved note')
  const stored = await storedNotes(s.p)
  if (!stored[0].fixed) throw new Error(`the note was not stored off the board: ${JSON.stringify(stored)}`)
  await addDashedBox(s.p, { x: placed.x - 6, y: placed.y - 4, width: placed.width + 12, height: placed.height + 8 })
  await addRing(s.p, s.at(TO), 80)
  await s.p.mouse.move(0, 0)
  await s.shoot('5-move')
}

// 6: three orange notes selected by a drag that starts on empty space, then recolored blue with one click on a color button; the dragged box is drawn dashed gray where it was.
{
  const s = await scene()
  await s.pick(ORANGE, 8)
  await s.note([5.5, 6.5], '17')
  await s.note([6.5, 5.5], '23')
  await s.note([7.5, 6.5], '9')
  const FROM = [4.9, 4.8]
  const TO = [8.1, 8.3]
  await s.p.mouse.move(...s.at(FROM))
  await s.p.mouse.down()
  await s.p.mouse.move(...s.at(TO), { steps: DRAG_STEPS })
  await s.p.mouse.up()
  if ((await s.p.locator('#draw-tool-layer .draw-tool-selected').count()) !== 3) throw new Error('the drag did not select the three notes')
  await s.p.click(`.controls-input button[data-key="${BLUE}"]`)
  const stored = await storedNotes(s.p)
  if (!stored.every((item) => item.color === BLUE)) throw new Error(`the notes were not recolored: ${JSON.stringify(stored)}`)
  const [[x1, y1], [x2, y2]] = [s.at(FROM), s.at(TO)]
  await addDashedBox(s.p, { x: x1, y: y1, width: x2 - x1, height: y2 - y1 })
  await s.p.mouse.move(0, 0)
  await s.shoot('6-select')
}

// 7: the pointer on a note with a ring round it, where a right click lands. The click itself follows the shot and must erase the note.
{
  const s = await scene()
  await s.pick(GREEN, 12)
  await s.note([6.5, 5.5], '17')
  const box = await s.p.locator(NOTES).boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await addRing(s.p, [x, y], 60)
  await s.p.evaluate(([px, py]) => {
    const dot = document.createElement('div')
    dot.style.cssText = `position:fixed;left:${px}px;top:${py}px;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:rgba(40,40,40,.55);border:2px solid #fff;pointer-events:none;z-index:99999`
    document.body.appendChild(dot)
  }, [x, y])
  await s.p.mouse.move(x, y)
  await s.shoot('7-erase', { keepOpen: true })
  await s.p.mouse.click(x, y, { button: 'right' })
  if ((await s.items()) !== 0) throw new Error('the right click did not erase the note')
  // 8: the ring and the pointer taken off, the note gone.
  await s.p.evaluate(() => { for (const el of document.querySelectorAll('body > div[style*="z-index:9999"]')) el.remove() })
  await s.p.mouse.move(0, 0)
  await s.shoot('8-erased')
}
await browser.close()
