// Takes the nine slides of Text Anywhere's slideshow (site/slideshows.json), each 800 x 500, from the real text-anywhere.user.js on the recorded puzzle, with no caption drawn in.
// A board slide is a crop of the board round the notes it shows (BOARD cells), with the panel hidden. A joined slide is a narrower crop of the board beside a picture of
// the control the slide is about (the panel, or the settings dialog), both at the same scale, joined on white with Python's Pillow (python3 with Pillow).
// The notes are what a solver writes: formulas (A=B+5, X+Y=2Z) and short deductions, mostly in the margin beside the grid or above it, as solvers do, and on the board only where the slide needs it (a note on a cell's edge, in a box), never one digit and never centered in a cell (the script checks both).
//   text-anywhere-slide-1-type.png        a three-line note typed with Enter in the margin beside rows 1 and 2
//   text-anywhere-slide-2-format.png      a note typed with a header, bold, -> and checklist items, finished, so it shows them formatted
//   text-anywhere-slide-3-style.png       notes in three colors, two sizes and a lower opacity, beside the panel with its sliders moved
//   text-anywhere-slide-4-background.png  the Background button on: a formula in a Tint box over the grid lines, beside one made with it off
//   text-anywhere-slide-5-select.png      three margin notes selected by a drag on empty space, the dragged box solid purple, and recolored together from the panel
//   text-anywhere-slide-6-long.png        a four-line note open for typing, made two lines tall with its bottom right handle of four, so it scrolls to its last two lines, its scroll bar visible
//   text-anywhere-slide-7-hide.png        the board with every note hidden, beside the panel with a ring on the pressed eye button
//   text-anywhere-slide-8-erase.png       the pointer on a note with a red ring round it, where a right click erases it (the click follows the shot and must erase the note)
//   text-anywhere-slide-9-settings.png    notes drawn with Fixed width, a Thick halo and a Yellow box, beside the settings dialog that set them
// Every note is typed with real clicks and keys. It fails when a step does not land; each slide is written as soon as it is taken, so a failed run leaves the earlier slides replaced.
// Run from the repo root with Playwright's Chromium installed:
//   node docs/research/text-anywhere/text-anywhere-slides-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openTextAnywherePage } from './text-anywhere-screenshot-page.mjs'
import { saved, valueOf } from '../../../live/text-anywhere/text-anywhere-fixtures.mjs'
import { slideTo } from '../../../live/slider.mjs'

const out = (name) => new URL(`./text-anywhere-slide-${name}.png`, import.meta.url).pathname
const DRAG_STEPS = 10
// Every picture is PICTURE pixels, the 16:10 of the site's slide frame. A board slide is BOARD cells from its own [row, column] from the grid's top left, taking in the notes it shows;
// the origin is picked so neither edge cuts a digit (a digit's glyph fills about 0.2 to 0.8 of its cell down). The panel is hidden.
const PICTURE = [800, 500]
const BOARD = [10, 6.25]
// The gap between the board and the control in a joined slide, in picture pixels.
const GAP = 16
const JOIN = `
import sys
from PIL import Image
board, control, target, gap, width, height = Image.open(sys.argv[1]).convert('RGB'), Image.open(sys.argv[2]).convert('RGB'), sys.argv[3], int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])
scale = min(1, height / control.height)
if scale < 1: control = control.resize((round(control.width * scale), round(control.height * scale)), Image.LANCZOS)
if board.width + gap + control.width > width: sys.exit(f'the board ({board.width}) and the control ({control.width}) do not fit {width} across')
sheet = Image.new('RGB', (width, height), 'white')
left = (width - board.width - gap - control.width) // 2
sheet.paste(board, (left, (height - board.height) // 2))
sheet.paste(control, (left + board.width + gap, (height - control.height) // 2))
sheet.save(target)
`
// A cell's width in page pixels at the recorded puzzle's layout. The page is shot at the scale that makes it 80 picture pixels, so a note looks as large as it does in SudokuPad; a layout that moves it fails the run.
const CELL = 70.592
const SCALE = PICTURE[0] / 10 / CELL
const GREEN = 1
const ORANGE = 3
const RED = 4
const BLUE = 6
const NOTES = '#text-anywhere-layer .text-anywhere-text'

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

// A fresh page with Text Anywhere on and helpers working in cell units from the grid's top left.
async function scene (origin, cols = BOARD[0]) {
  const p = await openTextAnywherePage(browser, SCALE)
  const [x0, y0, cell] = await p.evaluate(() => {
    const box = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
    return [box.x, box.y, box.width]
  })
  const at = ([row, col]) => [x0 + col * cell, y0 + row * cell]
  if (Math.abs(cell - CELL) > 0.01) throw new Error(`a cell is ${cell} page pixels wide, not ${CELL}: the pictures would not be ${PICTURE.join(' x ')}`)
  // The clip is half a picture pixel over, so rounding down never drops a pixel row.
  const clipRect = () => ({ x: x0 + origin[1] * cell, y: y0 + origin[0] * cell, width: (cols * PICTURE[0] / BOARD[0] + 0.5) / SCALE, height: (PICTURE[1] + 0.5) / SCALE })
  const items = () => p.locator(NOTES).count()
  // Sets the Size slider to the text size `size` (2 x width + 8), then checks it landed.
  const pickSize = async (size) => {
    const width = (size - 8) / 2
    await slideTo(p, '#text-anywhere-size', width)
    const set = await valueOf(p, '#text-anywhere-size')
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
    const button = p.locator('.text-anywhere-background')
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
        return { text: el.textContent, away: inGrid ? Math.hypot(off(row), off(col)) : Infinity, covers, inside, rect: [r.left, r.top, r.right, r.bottom].map(Math.round) }
      })
    }, { x0, y0, cell, selector: `${NOTES}, #text-anywhere-layer .text-anywhere-textbox`, clip: clipRect() })
    for (const { text, away, covers, inside, rect } of found) {
      if (/^\d$/.test(text.trim())) throw new Error(`the note ${text} is a lone digit`)
      if (away < 0.3) throw new Error(`the note ${text} sits in the middle of a cell`)
      if (covers.length) throw new Error(`the note ${text} covers the digit ${covers.join(', ')}`)
      if (!inside) throw new Error(`the note ${text} is not wholly inside the picture: ${JSON.stringify(rect)} in ${JSON.stringify(clipRect())}`)
    }
  }
  const shoot = async (name, { keepOpen = false } = {}) => {
    await checkNotes()
    await p.addStyleTag({ content: '#controls { visibility: hidden !important }' })
    const picture = await p.screenshot({ path: out(name), clip: clipRect() })
    const size = [picture.readUInt32BE(16), picture.readUInt32BE(20)]
    if (size.join() !== PICTURE.join()) throw new Error(`the picture is ${size.join(' x ')}, not ${PICTURE.join(' x ')}`)
    console.log(`wrote ${out(name)}`)
    if (!keepOpen) await p.close()
  }
  // Writes a joined slide: the board crop, then beside it the control `shootControl(path)` writes, taken after the board with the panel shown again (a ring the page draws over it shows).
  const join2 = async (name, shootControl) => {
    await checkNotes()
    const frames = mkdtempSync(join(tmpdir(), 'ta-slides-'))
    const hidden = await p.addStyleTag({ content: '#controls { visibility: hidden !important }' })
    await p.screenshot({ path: join(frames, 'board.png'), clip: clipRect() })
    await hidden.evaluate((el) => el.remove())
    await shootControl(join(frames, 'control.png'))
    const joined = spawnSync('python3', ['-I', '-c', JOIN, join(frames, 'board.png'), join(frames, 'control.png'), out(name), String(GAP), String(PICTURE[0]), String(PICTURE[1])], { encoding: 'utf8' })
    rmSync(frames, { recursive: true })
    if (joined.status !== 0) throw new Error(`joining slide ${name} failed: ${joined.error ?? joined.stderr}`)
    console.log(`wrote ${out(name)}`)
    await p.close()
  }
  return { p, at, items, pick, pickSize, note, typeLines, background, shoot, join: join2 }
}

// The margin beside the grid, above the panel, next to rows 1 and 2.
const BESIDE_ROWS_1_2 = [0.1, 10.9]
// The margin above the grid, over a column.
const ABOVE_COL_5 = [-0.55, 4.4]
const ABOVE_COL_8 = [-0.55, 7.3]
// The cells a joined slide's board crop is across: as many as fit beside the panel, and beside the dialog.
const STYLE_COLS = 6.5
const SETTINGS_COLS = 3.3
const PANEL = '.controls-input'
const SETTINGS_DIALOG = '#text-anywhere-dialog'

// 1: a three-line note typed with Enter in the margin beside the first two rows.
{
  const s = await scene([-1.25, 4])
  await s.pick(ORANGE, 26)
  await s.note(BESIDE_ROWS_1_2, 'A=B+5\nA+B=11\nB=3, A=8')
  await s.p.mouse.move(0, 0)
  await s.shoot('1-type')
}

// 2: a note typed with Discord-style formatting, a header, bold, an arrow and checklist items, then finished, so it shows formatted.
{
  const s = await scene([-1.25, 4])
  await s.pick(ORANGE, 26)
  await s.note([-0.8, 9.4], '## X-wing on 6\n**r2** and **r8** -> c3, c7\n- [x] box 1\n- [ ] box 7')
  const shown = await s.p.locator(NOTES).innerText()
  if (!shown.includes('→') || shown.includes('**')) throw new Error(`the note did not format: ${JSON.stringify(shown)}`)
  await s.p.mouse.move(0, 0)
  await s.shoot('2-format')
}

// 3: notes in three colors, at two sizes, one at a lower opacity, beside the panel showing the sliders as the last note was made.
{
  const s = await scene([-1.25, 3], STYLE_COLS)
  await s.pick(GREEN, 20)
  await s.note([-0.95, 3.2], 'r1: 4,6 in c7-9')
  await s.pick(RED, 34)
  await s.note([-0.75, 6.3], 'A=B+5')
  await s.pick(BLUE, 26)
  await slideTo(s.p, '#text-anywhere-opacity', 50)
  await s.note([3.95, 6.1], 'X+Y=2Z')
  await s.p.mouse.move(0, 0)
  await s.join('3-style', (path) => s.p.locator(PANEL).screenshot({ path }))
}

// 4: one formula made with Background off, one with it on, both on the board over grid lines, where the box is what the slide shows.
{
  const s = await scene([3, 2])
  // The default Box color is the page's own white, which reads as no box on a white page: the slide picks Tint, a pale shade of the note's color.
  await s.p.click('.text-anywhere-settings')
  const dialog = s.p.locator(SETTINGS_DIALOG)
  await dialog.waitFor({ state: 'visible' })
  await dialog.locator('button[data-role="box-pick"][data-value="tint"]').click()
  await s.p.locator('.dialog button', { hasText: /^\s*Save\s*$/ }).click()
  await dialog.waitFor({ state: 'detached' })
  await s.pick(RED, 26)
  await s.background(false)
  await s.note([3.3, 6.2], '**A+B=11**')
  await s.background(true)
  await s.note([5.2, 6.4], 'X+Y=2Z')
  if ((await s.p.locator('#text-anywhere-layer .text-anywhere-text-bg').count()) !== 1) throw new Error('only the second note should have a box')
  await s.p.mouse.move(0, 0)
  await s.shoot('4-background')
}

// 5: three orange margin notes selected by a drag that starts on empty space, then recolored blue with one click on a color button; the dragged box is drawn solid purple where it was.
{
  const s = await scene([-1.25, 3])
  await s.pick(ORANGE, 26)
  await s.note(ABOVE_COL_5, 'A=B+5')
  await s.note(ABOVE_COL_8, 'X+Y=2Z')
  await s.note([0.1, 10.3], 'r1: 4,6 in c7-9')
  const FROM = [-0.9, 3.1]
  const TO = [1.7, 12.9]
  await s.p.mouse.move(...s.at(FROM))
  await s.p.mouse.down()
  await s.p.mouse.move(...s.at(TO), { steps: DRAG_STEPS })
  await s.p.mouse.up()
  if ((await s.p.locator('#text-anywhere-layer .text-anywhere-selected').count()) !== 3) throw new Error('the drag did not select the three notes')
  await s.p.click(`.controls-input button[data-key="${BLUE}"]`)
  const stored = await saved(s.p)
  if (!stored.every((item) => item.color === BLUE)) throw new Error(`the notes were not recolored: ${JSON.stringify(stored)}`)
  const [[x1, y1], [x2, y2]] = [s.at(FROM), s.at(TO)]
  await addSelectionRectangle(s.p, { x: x1, y: y1, width: x2 - x1, height: y2 - y1 })
  await s.p.mouse.move(0, 0)
  await s.shoot('5-select')
}

// 6: a four-line note with a background box, open for typing, dragged by its bottom right corner handle to two lines tall, so its text scrolls; a ring marks the dragged handle and the pointer rests on the note, which shows its scroll bar.
{
  const s = await scene([-1.25, 4])
  await s.pick(BLUE, 26)
  await s.background(true)
  await s.p.mouse.click(...s.at([0.35, 10.9]))
  await s.typeLines(['A=B+5', 'A+B=11', '2B+5=11', 'B=3, A=8'])
  const handle = s.p.locator('#text-anywhere-layer .text-anywhere-resize').last()
  const open = s.p.locator('#text-anywhere-layer .text-anywhere-textbox')
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
  const scrolls = await open.evaluate((el) => el.classList.contains('text-anywhere-scrolls'))
  if (!scrolls) throw new Error('the resized note does not scroll')
  const box = await open.boundingBox()
  await s.p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  // Scroll to the end, so the text has moved, the scroll bar's thumb is off the top and no part of a further line shows under the box.
  await s.p.mouse.wheel(0, 10 * lineHeight)
  const end = await handle.boundingBox()
  await addRing(s.p, [end.x + end.width / 2, end.y + end.height / 2], 30)
  await s.shoot('6-long')
}

// 7: the eye button pressed, with a ring, and every note hidden, so the board shows clear.
{
  const s = await scene([-1.25, 3], STYLE_COLS)
  await s.pick(ORANGE, 26)
  await s.note([-0.75, 3.3], 'A=B+5')
  await s.note([3.95, 6.1], 'X+Y=2Z')
  const eye = s.p.locator('.text-anywhere-hide-all')
  await eye.click()
  if ((await eye.getAttribute('aria-pressed')) !== 'true') throw new Error('the eye button did not hide the notes')
  if (await s.p.locator(NOTES).first().isVisible()) throw new Error('a note still shows')
  const box = await eye.boundingBox()
  await addRing(s.p, [box.x + box.width / 2, box.y + box.height / 2], 56)
  await s.p.mouse.move(0, 0)
  await s.join('7-hide', (path) => s.p.locator(PANEL).screenshot({ path }))
}

// 8: the pointer on a note with a ring round it, where a right click lands. The click itself follows the shot and must erase the note.
{
  const s = await scene([-1.25, 1])
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
  await s.shoot('8-erase', { keepOpen: true })
  await s.p.mouse.click(x, y, { button: 'right' })
  // The erase redraws on the next frame, so wait for the note to go; a wait that times out fails the run.
  await s.p.waitForFunction((selector) => !document.querySelector(selector), NOTES, { timeout: 2000 })
  if ((await s.items()) !== 0) throw new Error('the right click did not erase the note')
  await s.p.close()
}

// 9: Fixed width, a Thick halo and a Yellow box saved in the settings, notes drawn with them, beside the dialog opened again to show what set them.
{
  const s = await scene([-0.25, 5.8], SETTINGS_COLS)
  const openDialog = async () => {
    await s.p.click('.text-anywhere-settings')
    await s.p.locator(SETTINGS_DIALOG).waitFor({ state: 'visible' })
  }
  await openDialog()
  const dialog = s.p.locator(SETTINGS_DIALOG)
  await dialog.locator('select[data-role="font-choice"]').selectOption({ label: 'Fixed width' })
  await dialog.locator('button[data-role="outline-pick"][data-value="medium"]').click()
  await dialog.locator('button[data-role="box-pick"][data-value="yellow"]').click()
  await s.p.locator('.dialog button', { hasText: /^\s*Save\s*$/ }).click()
  await dialog.waitFor({ state: 'detached' })
  await s.pick(GREEN, 26)
  await s.note([3.95, 6.1], 'r4: 2,7')
  await s.background(true)
  await s.note([4.95, 6.1], 'A=B+5')
  await s.background(false)
  await s.p.mouse.move(0, 0)
  // The dialog is opened again once the board is taken, and only its rows from Font to Box border are shown, the settings the notes show, at the board's scale.
  await s.join('9-settings', async (path) => {
    await openDialog()
    await dialog.evaluate((el) => Promise.all([el.closest('.dialog'), el.closest('.dialog-overlay')].flatMap((e) => e.getAnimations()).map((a) => a.finished)))
    const pressed = await dialog.evaluate((el) => [...el.querySelectorAll('button[aria-pressed="true"][data-role$="-pick"]')].map((b) => b.dataset.value))
    if (!pressed.includes('medium') || !pressed.includes('yellow')) throw new Error(`the dialog shows ${pressed}, not the saved Thick halo and Yellow box`)
    const clip = await dialog.evaluate((el) => {
      const heading = [...el.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Font')
      const frames = [...el.querySelectorAll('button[data-role="frame-pick"]')]
      if (!heading || !frames.length) return null
      const box = el.getBoundingClientRect()
      const top = heading.getBoundingClientRect().top - 6
      const bottom = Math.max(...frames.map((b) => b.getBoundingClientRect().bottom)) + 6
      return { x: box.x, y: top, width: box.width, height: bottom - top }
    })
    if (!clip) throw new Error('the dialog has no Font heading or Box border row')
    await s.p.screenshot({ path, clip })
  })
}
await browser.close()
