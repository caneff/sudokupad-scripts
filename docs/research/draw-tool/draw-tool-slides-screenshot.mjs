// Takes the nine slides of Text Annotation's slideshow on site/index.html, each the board patch beside the Text Annotation panel, from the real draw-tool.user.js on the recorded puzzle, with no caption drawn in.
// The notes are what a solver writes: short remarks beside the grid, in the margin above it, or small on a cell's corner or edge, never one digit and never centered in a cell (the script checks both).
//   draw-tool-slide-1-type.png        a remark typed beside row 2, with markdown
//   draw-tool-slide-2-size.png        the Size menu open after a pick: a small note beside the grid and a large one above it
//   draw-tool-slide-3-background.png  the Background button on: a note in a page-colored box over the digits, beside one made with it off
//   draw-tool-slide-4-colors.png      a hold on a color button: a picker over each color, one recolored, and the note in it recolored too
//   draw-tool-slide-5-move.png        a note dragged off the grid to above it, its old place dashed, a ring on the point it is held by
//   draw-tool-slide-6-select.png      three notes selected by a drag on empty space, the dragged box dashed, and recolored together from the panel
//   draw-tool-slide-7-erase.png       the pointer on a note with a red ring round it, where a right click erases it
//   draw-tool-slide-8-erased.png      the same board after the right click: the note gone
//   draw-tool-slide-9-long.png        a two-line note open for typing, made smaller with its corner handle, its text wrapped and scrolled, the scroll bar under the pointer
// Every note is typed with real clicks and keys. It fails when a step does not land; each slide is written as soon as it is taken, so a failed run leaves the earlier slides replaced.
// Run from the repo root with Playwright's Chromium installed:
//   node docs/research/draw-tool/draw-tool-slides-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { openDrawPage } from './draw-tool-screenshot-page.mjs'

const out = (name) => new URL(`./draw-tool-slide-${name}.png`, import.meta.url).pathname
const DRAG_STEPS = 10
// The picture's size, and its top left in cells from the grid's top left: it takes in the margin above the grid and the room beside it, down to the panel's bottom.
const CLIP_SIZE = [1000, 625]
const CLIP_CORNER = [2.3, -0.95]
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

// Headless Chromium hides every scroll bar unless told not to, and slide 9 shows one.
const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })

// A fresh page with Draw on and helpers working in cell units from the grid's top left.
async function scene () {
  const p = await openDrawPage(browser, 1)
  const [x0, y0, cell] = await p.evaluate(() => {
    const box = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
    return [box.x, box.y, box.width]
  })
  const at = ([row, col]) => [x0 + col * cell, y0 + row * cell]
  const clipRect = () => ({ x: x0 + CLIP_CORNER[0] * cell, y: y0 + CLIP_CORNER[1] * cell, width: CLIP_SIZE[0], height: CLIP_SIZE[1] })
  const items = () => p.locator(NOTES).count()
  // Picks `size`, one of the Size menu's numbers, with a click on its button and one on its item.
  const pickSize = async (size) => {
    await p.click('.draw-tool-menu-button[data-menu="size"]')
    await p.locator('.draw-tool-menu-item', { hasText: new RegExp(`^${size}$`) }).click()
    await p.locator('.draw-tool-menu').waitFor({ state: 'detached' })
  }
  const pick = (color, size) => p.click(`.controls-input button[data-key="${color}"]`).then(() => pickSize(size))
  const note = async (cell, text) => {
    const before = await items()
    await p.mouse.click(...at(cell))
    await p.keyboard.type(text)
    await p.keyboard.press('Escape')
    if ((await items()) !== before + 1) throw new Error(`the note ${text} did not land`)
  }
  const background = async (on) => {
    const button = p.locator('.draw-tool-background')
    if ((await button.getAttribute('aria-pressed')) !== String(on)) await button.click()
    if ((await button.getAttribute('aria-pressed')) !== String(on)) throw new Error(`Background did not turn ${on ? 'on' : 'off'}`)
  }
  // No note may sit on a cell's middle or cover a given digit, none may be a lone digit, and every note, open or not, lies wholly inside the picture.
  const checkNotes = async () => {
    const found = await p.evaluate(({ x0, y0, cell, selector, clip }) => {
      const given = [...document.querySelectorAll('text.cell-given')].map((el) => {
        const r = el.getBoundingClientRect()
        return { digit: el.textContent, x: r.x + r.width / 2, y: r.y + r.height / 2 }
      })
      return [...document.querySelectorAll(selector)].map((el) => {
        const r = el.getBoundingClientRect()
        const [row, col] = [(r.y + r.height / 2 - y0) / cell, (r.x + r.width / 2 - x0) / cell]
        const off = (v) => Math.abs(v - Math.floor(v) - 0.5)
        const inGrid = row > 0 && row < 9 && col > 0 && col < 9
        // A digit's glyph fills about 0.45 of a cell across and 0.6 down from its middle.
        const covers = given.filter((g) => Math.abs(g.x - (r.x + r.width / 2)) < r.width / 2 + cell * 0.225 && Math.abs(g.y - (r.y + r.height / 2)) < r.height / 2 + cell * 0.3).map((g) => g.digit)
        const inside = r.left >= clip.x && r.right <= clip.x + clip.width && r.top >= clip.y && r.bottom <= clip.y + clip.height
        return { text: el.textContent, away: inGrid ? Math.hypot(off(row), off(col)) : Infinity, covers, inside }
      })
    }, { x0, y0, cell, selector: `${NOTES}, #draw-tool-layer .draw-tool-textbox`, clip: clipRect() })
    for (const { text, away, covers, inside } of found) {
      if (/^\d$/.test(text.trim())) throw new Error(`the note ${text} is a lone digit`)
      if (away < 0.3) throw new Error(`the note ${text} sits in the middle of a cell`)
      if (covers.length) throw new Error(`the note ${text} covers the digit ${covers.join(', ')}`)
      if (!inside) throw new Error(`the note ${text} is not wholly inside the picture`)
    }
  }
  const shoot = async (name, { keepOpen = false } = {}) => {
    await checkNotes()
    await p.screenshot({ path: out(name), clip: clipRect() })
    console.log(`wrote ${out(name)}`)
    if (!keepOpen) await p.close()
  }
  return { p, at, items, pick, pickSize, note, background, shoot }
}

// Beside the grid, next to row 2, in the free space above the panel.
const BESIDE_ROW_2 = [1.3, 11.2]

// 1: a remark typed beside the grid, next to the row it talks about.
{
  const s = await scene()
  await s.pick(ORANGE, 26)
  await s.note(BESIDE_ROW_2, 'r2: 3 must be in c7-9')
  await s.p.mouse.move(0, 0)
  await s.shoot('1-type')
}

// 2: a size picked from the Size menu between two notes: a small one beside row 2, a large one in the margin above the grid, with the menu open after the pick.
{
  const s = await scene()
  await s.pick(BLUE, 20)
  await s.note(BESIDE_ROW_2, 'r2: 3 must be in c7-9')
  await s.pickSize(32)
  await s.note([-0.5, 5.6], '*X-wing* on 6')
  await s.p.click('.draw-tool-menu-button[data-menu="size"]')
  await s.p.locator('.draw-tool-menu').waitFor({ state: 'visible' })
  await s.p.mouse.move(0, 0)
  await s.shoot('2-size')
}

// 3: one note made with Background off, one with it on, both over digits and on cell edges.
{
  const s = await scene()
  await s.pick(RED, 26)
  await s.background(false)
  await s.note([3.3, 6.2], '**not** 5 (box 5)')
  await s.background(true)
  await s.note([5.2, 6.4], 'cage = 17')
  if ((await s.p.locator('#draw-tool-layer .draw-tool-text-bg').count()) !== 1) throw new Error('only the second note should have a box')
  await s.p.mouse.move(0, 0)
  await s.shoot('3-background')
}

// 4: a note in color 3, then a hold on a color button puts a picker over each color, and color 3 is changed in its picker.
{
  const s = await scene()
  await s.pick(ORANGE, 26)
  await s.note([2.5, 5.0], '**not** 5 (box 6)')
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

// 5: a note dragged by its middle off the grid, into the margin above it; the old place is a dashed gray box and a ring marks where the pointer holds it.
{
  const s = await scene()
  await s.pick(ORANGE, 26)
  const FROM = [5.2, 6.4]
  const TO = [-0.55, 7.4]
  await s.note(FROM, 'cage = 17')
  const text = s.p.locator(NOTES)
  const placed = await text.boundingBox()
  await s.p.mouse.move(...s.at(FROM))
  await s.p.mouse.down()
  await s.p.mouse.move(...s.at(TO), { steps: DRAG_STEPS })
  await s.p.mouse.up()
  const moved = await text.boundingBox()
  if ((await text.count()) !== 1 || Math.abs(moved.y - placed.y) < 10) throw new Error('the drag did not leave one moved note')
  const stored = await storedNotes(s.p)
  if (!stored[0].fixed) throw new Error(`the note was not stored off the board: ${JSON.stringify(stored)}`)
  await addDashedBox(s.p, { x: placed.x - 4, y: placed.y - 3, width: placed.width + 8, height: placed.height + 6 })
  await addRing(s.p, s.at(TO), 60)
  await s.p.mouse.move(0, 0)
  await s.shoot('5-move')
}

// 6: three orange notes selected by a drag that starts on empty space, then recolored blue with one click on a color button; the dragged box is drawn dashed gray where it was.
{
  const s = await scene()
  await s.pick(ORANGE, 26)
  await s.note([3.5, 6.1], '**not** 5')
  await s.note([5.2, 6.4], 'cage = 17')
  await s.note([6.3, 4.2], '*X-wing* on 6')
  const FROM = [2.9, 2.9]
  const TO = [7.0, 7.25]
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
  await s.pick(GREEN, 32)
  await s.note([5.2, 6.4], 'cage = 17')
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

// 9: a two-line note with a background box, open for typing, dragged smaller by its corner handle, so its text wraps and scrolls; a ring marks the handle and the pointer rests on the note.
{
  const s = await scene()
  await s.pick(BLUE, 26)
  await s.background(true)
  const LINES = ['r1: 1 and 2 only fit in c8 and c9', 'so r1c9 is not 4, and r2c9 is 5']
  await s.p.mouse.click(...s.at([0.6, 10.8]))
  for (const [i, line] of LINES.entries()) {
    if (i) await s.p.keyboard.press('Enter')
    await s.p.keyboard.type(line)
  }
  const handle = s.p.locator('#draw-tool-layer .draw-tool-resize')
  const { x, y, width, height } = await handle.boundingBox()
  const [hx, hy] = [x + width / 2, y + height / 2]
  const BY = [-80, -20]
  await s.p.mouse.move(hx, hy)
  await s.p.mouse.down()
  await s.p.mouse.move(hx + BY[0], hy + BY[1], { steps: DRAG_STEPS })
  await s.p.mouse.up()
  const open = s.p.locator('#draw-tool-layer .draw-tool-textbox')
  // Make the box exactly two lines tall, so the scrolled text ends on a whole line and not in the middle of one.
  const { lineHeight, padding, clientHeight } = await open.evaluate((el) => {
    const css = window.getComputedStyle(el)
    return { lineHeight: parseFloat(css.lineHeight), padding: parseFloat(css.paddingTop) + parseFloat(css.paddingBottom), clientHeight: el.clientHeight }
  })
  const grow = 2 * lineHeight + padding - clientHeight
  const grip = await handle.boundingBox()
  await s.p.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await s.p.mouse.down()
  await s.p.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + grow, { steps: DRAG_STEPS })
  await s.p.mouse.up()
  const scrolls = await open.evaluate((el) => el.classList.contains('draw-tool-scrolls'))
  if (!scrolls) throw new Error('the resized note does not scroll')
  const box = await open.boundingBox()
  await s.p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await s.p.mouse.wheel(0, -30)
  const end = await handle.boundingBox()
  await addRing(s.p, [end.x + end.width / 2, end.y + end.height / 2], 30)
  await s.shoot('9-long')
}
await browser.close()
