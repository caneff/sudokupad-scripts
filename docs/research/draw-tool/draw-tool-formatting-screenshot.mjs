// Takes the two pictures of Text Anywhere's Formatting section on site/draw-tool.html, from the real draw-tool.user.js on the recorded puzzle at 1200x900:
//   draw-tool-formatting.png      one large finished note on the board that uses every formatting option once, each rendered, with the ticked item ticked by a click on its box
//   draw-tool-formatting-raw.png  the same note open for typing, so the raw text that made it shows
// The note's words name each style, so the picture needs no legend. Both pictures are the same crop of the board: the note plus a little board.
// The note is typed with real clicks and keys. The script fails when the note does not land, when the open note's text differs from the typed text, or when the open note is not the finished note's size. It does not check that each style is drawn: read both pictures after a retake.
// Run from the repo root with Playwright's Chromium installed:
//   node docs/research/draw-tool/draw-tool-formatting-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { openDrawPage } from './draw-tool-screenshot-page.mjs'
import { slideTo, valueOf, finishNote, SIZE_SLIDER, BACKGROUND_BUTTON, TEXT_BOX, TEXTS, HANDLES, KEYPAD } from '../../../live/draw-tool/draw-tool-fixtures.mjs'

const out = (name) => new URL(`./draw-tool-${name}.png`, import.meta.url).pathname
const SCALE = 1.5
const BLUE = 6
// How far the handle is dragged to make the note tall enough, and the board shown round it, in page pixels.
const WIDEN = [75, 270]
const PAD = 20
const PAD_LEFT = 130
// The text a solver types, one style per line, each line naming its style. The ticked item is typed unticked and ticked by a click on its box.
const LINES = [
  '# Header one',
  '## Header two',
  '### Header three',
  '-# subtext, small and faded',
  '**bold**, *italic*, _italic_, ***bold italics***',
  '__underlined__, __*underlined italics*__',
  '__**underlined bold**__, __***all three***__',
  '~~struck through~~',
  '- a bullet',
  '  - a nested bullet',
  '1. a numbered item',
  '2. the next one',
  '- [ ] a ticked item',
  '- [ ] an empty item',
  '`inline code` and a block:',
  '```',
  'code = "as typed"',
  '```',
  'symbols: -> <- != <= >= sum'
]
const TICKED = LINES.findIndex((line) => line.endsWith('a ticked item'))
// What typing and closing the note turn the symbols into, and the ticked item's line once its box is clicked.
const RAW_TEXT = LINES.join('\n').replace('-> <- != <= >=', '→ ← ≠ ≤ ≥').replace('sum', 'Σ').replace(LINES[TICKED], LINES[TICKED].replace('[ ]', '[x]'))
const browser = await chromium.launch()
const p = await openDrawPage(browser, SCALE)
const [x0, y0, cell] = await p.evaluate(() => {
  const box = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
  return [box.x, box.y, box.width]
})
await p.click(`${KEYPAD} button[data-key="${BLUE}"]`)
// The Size slider's value for a text size of 16 (2 x the value + 8).
const SIZE_VALUE = (16 - 8) / 2
await slideTo(p, SIZE_SLIDER, SIZE_VALUE)
if ((await valueOf(p, SIZE_SLIDER)) !== SIZE_VALUE) throw new Error('the Size slider did not land')
// A note with a box has no halo: the halo's shadow of a strikethrough line hides the top half of the struck letters.
const background = p.locator(BACKGROUND_BUTTON)
if ((await background.getAttribute('aria-pressed')) !== 'true') await background.click()
if ((await background.getAttribute('aria-pressed')) !== 'true') throw new Error('Background did not turn on')
// Opens the note on empty margin right of the grid, types it, then drags its bottom right handle until the whole text fits without scrolling.
await p.mouse.click(x0 + 9.35 * cell, y0 + 0.1 * cell)
for (const [i, line] of LINES.entries()) {
  if (i) await p.keyboard.press('Enter')
  await p.keyboard.type(line)
}
const open = p.locator(TEXT_BOX)
const grip = await p.locator(HANDLES).last().boundingBox()
await p.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
await p.mouse.down()
await p.mouse.move(grip.x + grip.width / 2 + WIDEN[0], grip.y + grip.height / 2 + WIDEN[1], { steps: 10 })
await p.mouse.up()
const fits = await open.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)
if (!fits) throw new Error('the open note still scrolls')
await p.addStyleTag({ content: '#controls { visibility: hidden !important }' })
await finishNote(p)
// A solver ticks the item with a click on its box.
const note = p.locator(TEXTS)
if ((await note.count()) !== 1) throw new Error('the note did not land')
await p.locator(`[data-line="${TICKED}"]`).click()
const box = await note.boundingBox()
const clip = { x: box.x - PAD_LEFT, y: box.y - PAD, width: box.width + PAD_LEFT + PAD, height: box.height + 2 * PAD }
await p.mouse.move(0, 0)
writeFileSync(out('formatting'), await p.screenshot({ clip }))
// The same note open for typing: typed symbols are already the symbols, and the ticked item reads [x].
await note.dblclick()
await open.waitFor({ state: 'visible' })
const rawText = await open.evaluate((el) => el.value ?? el.textContent)
if (rawText !== RAW_TEXT) throw new Error(`the open note's text is not the typed text: ${JSON.stringify(rawText)}`)
const rawBox = await open.boundingBox()
if (Math.abs(rawBox.width - box.width) > 2 || Math.abs(rawBox.height - box.height) > 2) throw new Error('the open note is not the finished note\'s size')
await p.mouse.move(0, 0)
writeFileSync(out('formatting-raw'), await p.screenshot({ clip }))
await browser.close()
