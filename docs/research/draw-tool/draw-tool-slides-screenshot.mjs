// Takes the five slides of Text Annotation's slideshow on site/index.html, each an 800 x 320 crop of the board round the notes it shows, with the panel hidden, from the real draw-tool.user.js on the recorded puzzle, with no caption drawn in.
// The notes are what a solver writes: formulas (A=B+5, X+Y=2Z) and short deductions, mostly in the margin beside the grid or above it, as solvers do, and on the board only where the slide needs it (a note on a cell's edge, in a box), never one digit and never centered in a cell (the script checks both).
//   draw-tool-slide-1-type.png        a three-line note typed with Enter in the margin beside rows 1 and 2
//   draw-tool-slide-3-background.png  the Background button on: a formula in a page-colored box over the grid lines, beside one made with it off
//   draw-tool-slide-6-select.png      three margin notes selected by a drag on empty space, the dragged box solid purple, and recolored together from the panel
//   draw-tool-slide-7-erase.png       the pointer on a note with a red ring round it, where a right click erases it (the click follows the shot and must erase the note)
//   draw-tool-slide-9-long.png        a four-line note open for typing, made two lines tall with its bottom right handle of four, so it scrolls to its last two lines, its scroll bar visible
// Every note is typed with real clicks and keys. It fails when a step does not land; each slide is written as soon as it is taken, so a failed run leaves the earlier slides replaced.
// Run from the repo root with Playwright's Chromium installed:
//   node docs/research/draw-tool/draw-tool-slides-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { openDrawPage } from './draw-tool-screenshot-page.mjs'
import { saved, slideTo, valueOf } from '../../../live/draw-tool/draw-tool-fixtures.mjs'

const out = (name) => new URL(`./draw-tool-slide-${name}.png`, import.meta.url).pathname
const DRAG_STEPS = 10
// Every picture is the same size in cells, 10 across and 4 down, and each starts at its own [column, row] from the grid's top left, so it takes in the notes it shows and the grid round them. The panel is hidden.
const CLIP_CELLS = [10, 4]
// The page is shot at this scale, so a note looks as large as it does in SudokuPad.
const SCALE = 80 / 70.592
const GREEN = 1
const ORANGE = 3
const RED = 4
const BLUE = 6
const NOTES = '#draw-tool-layer .draw-tool-text'

// A red ring round the point (x, y), where a press lands.
const addRing = (p, [x, y], size = 34) => p.evaluate(([px, py, d]) => {
  const ring = document.createElement('div')
  ring.style.cssText = `position:fixed;left:${px}px;top:${py}px;width:${d}px;height:${d}px;margin:${-d / 2}px 0 0 ${-d / 2}px;box-sizing:border-box;border-radius:50%;border:3px solid #d32f2f;pointer-events:none;z-index:99998`
  document.body.appendChild(ring)
}, [x, y, size])

// A solid purple box with a faint fill over the page box `{ x, y, width, height }`: where a drag went, as the script draws it.
const addSelectionRectangle = (p, box) => p.evaluate(({ x, y, width, height }) => {
  const el = document.createElement('div')
  el.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${width}px;height:${height}px;box-sizing:border-box;border:1px solid #6a1b9a;background:rgb(106 27 154 / .06);pointer-events:none;z-index:99998`
  document.body.appendChild(el)
}, box)

// Headless Chromium hides every scroll bar unless told not to, and slide 9 shows one.
const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })

// A fresh page with Draw on and helpers working in cell units from the grid's top left.
async function scene (origin) {
  const p = await openDrawPage(browser, SCALE)
  const [x0, y0, cell] = await p.evaluate(() => {
    const box = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
    return [box.x, box.y, box.width]
  })
  const at = ([row, col]) => [x0 + col * cell, y0 + row * cell]
  const clipRect = () => ({ x: x0 + origin[1] * cell, y: y0 + origin[0] * cell, width: CLIP_CELLS[0] * cell, height: CLIP_CELLS[1] * cell })
  const items = () => p.locator(NOTES).count()
  // Sets the Size slider to the text size `size` (2 x width + 8), then checks it landed.
  const pickSize = async (size) => {
    const width = (size - 8) / 2
    await slideTo(p, '#draw-tool-size', width)
    const set = await valueOf(p, '#draw-tool-size')
    if (set !== width) throw new Error(`the Size slider is at ${set}, not ${width}`)
  }
  const pick = (color, size) => p.click(`.controls-input button[data-key="${color}"]`).then(() => pickSize(size))
  const typeLines = async (lines) => {
    for (const [i, line] of lines.entries()) {
      if (i) await p.keyboard.press('Enter')
      await p.keyboard.type(line)
    }
  }
  const note = async (cell, text) => {
    const before = await items()
    await p.mouse.click(...at(cell))
    await typeLines(text.split('\n'))
    await p.keyboard.press('Escape')
    // A note just made stays selected: the Background button would then change its box and the next click would only deselect it. A second Escape deselects it.
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
    await p.addStyleTag({ content: '#controls { visibility: hidden !important }' })
    await p.screenshot({ path: out(name), clip: clipRect() })
    console.log(`wrote ${out(name)}`)
    if (!keepOpen) await p.close()
  }
  return { p, at, items, pick, pickSize, note, typeLines, background, shoot }
}

// The margin beside the grid, above the panel, next to rows 1 and 2.
const BESIDE_ROWS_1_2 = [0.1, 10.9]
// The margin above the grid, over a column.
const ABOVE_COL_5 = [-0.55, 4.4]
const ABOVE_COL_8 = [-0.55, 7.3]

// 1: a three-line note typed with Enter in the margin beside the first two rows.
{
  const s = await scene([-1, 4.2])
  await s.pick(ORANGE, 26)
  await s.note(BESIDE_ROWS_1_2, 'A=B+5\nA+B=11\nB=3, A=8')
  await s.p.mouse.move(0, 0)
  await s.shoot('1-type')
}

// 3: one formula made with Background off, one with it on, both on the board over grid lines, where the box is what the slide shows.
{
  const s = await scene([2.3, 2.2])
  await s.pick(RED, 26)
  await s.background(false)
  await s.note([3.3, 6.2], '**A+B=11**')
  await s.background(true)
  await s.note([5.2, 6.4], 'X+Y=2Z')
  if ((await s.p.locator('#draw-tool-layer .draw-tool-text-bg').count()) !== 1) throw new Error('only the second note should have a box')
  await s.p.mouse.move(0, 0)
  await s.shoot('3-background')
}

// 6: three orange margin notes selected by a drag that starts on empty space, then recolored blue with one click on a color button; the dragged box is drawn solid purple where it was.
{
  const s = await scene([-1, 3.7])
  await s.pick(ORANGE, 26)
  await s.note(ABOVE_COL_5, 'A=B+5')
  await s.note(ABOVE_COL_8, 'X+Y=2Z')
  await s.note(BESIDE_ROWS_1_2, 'r1: 4,6 in c7-9')
  const FROM = [-0.9, 3.8]
  const TO = [1.7, 13.5]
  await s.p.mouse.move(...s.at(FROM))
  await s.p.mouse.down()
  await s.p.mouse.move(...s.at(TO), { steps: DRAG_STEPS })
  await s.p.mouse.up()
  if ((await s.p.locator('#draw-tool-layer .draw-tool-selected').count()) !== 3) throw new Error('the drag did not select the three notes')
  await s.p.click(`.controls-input button[data-key="${BLUE}"]`)
  const stored = await saved(s.p)
  if (!stored.every((item) => item.color === BLUE)) throw new Error(`the notes were not recolored: ${JSON.stringify(stored)}`)
  const [[x1, y1], [x2, y2]] = [s.at(FROM), s.at(TO)]
  await addSelectionRectangle(s.p, { x: x1, y: y1, width: x2 - x1, height: y2 - y1 })
  await s.p.mouse.move(0, 0)
  await s.shoot('6-select')
}

// 7: the pointer on a note with a ring round it, where a right click lands. The click itself follows the shot and must erase the note.
{
  const s = await scene([-1, 1.2])
  await s.pick(GREEN, 32)
  await s.note(ABOVE_COL_5, 'A=B+5')
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
  // The erase redraws on the next frame, so give it one.
  await s.p.waitForFunction((selector) => !document.querySelector(selector), NOTES, { timeout: 2000 }).catch(() => {})
  if ((await s.items()) !== 0) throw new Error('the right click did not erase the note')
  await s.p.close()
}

// 9: a four-line note with a background box, open for typing, dragged by its bottom right corner handle to two lines tall, so its text scrolls; a ring marks the dragged handle and the pointer rests on the note, which shows its scroll bar.
{
  const s = await scene([-1, 4.2])
  await s.pick(BLUE, 26)
  await s.background(true)
  await s.p.mouse.click(...s.at([0.35, 10.9]))
  await s.typeLines(['A=B+5', 'A+B=11', '2B+5=11', 'B=3, A=8'])
  const handle = s.p.locator('#draw-tool-layer .draw-tool-resize').last()
  const open = s.p.locator('#draw-tool-layer .draw-tool-textbox')
  // Make the box exactly two lines tall, so the scrolled text ends on a whole line and not in the middle of one.
  const { lineHeight, padding, clientHeight } = await open.evaluate((el) => {
    const css = window.getComputedStyle(el)
    return { lineHeight: parseFloat(css.lineHeight), padding: parseFloat(css.paddingTop) + parseFloat(css.paddingBottom), clientHeight: el.clientHeight }
  })
  // A little wider too, so the scroll bar leaves the longest line whole.
  const WIDEN = 40
  const grow = 2 * lineHeight + padding - clientHeight
  const grip = await handle.boundingBox()
  await s.p.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await s.p.mouse.down()
  await s.p.mouse.move(grip.x + grip.width / 2 + WIDEN, grip.y + grip.height / 2 + grow, { steps: DRAG_STEPS })
  await s.p.mouse.up()
  const scrolls = await open.evaluate((el) => el.classList.contains('draw-tool-scrolls'))
  if (!scrolls) throw new Error('the resized note does not scroll')
  const box = await open.boundingBox()
  await s.p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  // Scroll to the end, so the text has moved, the scroll bar's thumb is off the top and no part of a further line shows under the box.
  await s.p.mouse.wheel(0, 10 * lineHeight)
  const end = await handle.boundingBox()
  await addRing(s.p, [end.x + end.width / 2, end.y + end.height / 2], 30)
  await s.shoot('9-long')
}
await browser.close()
