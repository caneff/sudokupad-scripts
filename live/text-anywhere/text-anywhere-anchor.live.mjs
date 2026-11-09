// Live check of text-anywhere.user.js's open note: its text starts at the click and typing never moves that start, a double-click puts the caret at the letter clicked
// without selecting a word, the caret is the note's color and follows a recolor, and selected text is tinted in the note's color. Real mouse and keyboard input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { useBrowser } from '../session.mjs'
import { finishNote, gridPoint } from '../board.mjs'

const { TEXT_BOX, TEXTS } = textAnywhere
const GREEN = 3
const RED = 4
const SPOT = [2.5, 4.5]
const START_TOLERANCE_PX = 2
// The line's middle is read off the letter's box, whose height is the font's and not the line's, so it may sit a few pixels off the click.
const FIRST_LINE_TOLERANCE_PX = 5

const browser = useBrowser()

describe('Text Anywhere\'s open note', { concurrency: false }, () => {
  let context, p, errors

  const key = (n) => `.controls-input button[data-key="${n}"]`
  // The screen box of the character shown at `index` in the selector's element, counting the text of its runs and leaving out any marker it does not show.
  const letterBox = (selector, index) => p.locator(selector).evaluate((element, i) => {
    const walker = document.createTreeWalker(element, window.NodeFilter.SHOW_TEXT)
    let left = i
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (left >= node.length) {
        left -= node.length
        continue
      }
      const range = document.createRange()
      range.setStart(node, left)
      range.setEnd(node, left + 1)
      const box = range.getBoundingClientRect()
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
    }
    throw new Error(`no character ${i}`)
  }, index)
  const resolved = (color, property = 'color') => p.evaluate(([c, name]) => {
    const probe = document.createElement('i')
    probe.style[name] = c
    document.body.append(probe)
    const value = window.getComputedStyle(probe)[name]
    probe.remove()
    return value
  }, [color, property])
  const penColor = (n) => p.evaluate((i) => window.getComputedStyle(document.documentElement).getPropertyValue(`--puzzle-pencolor-${i}`).trim(), n)
  // The caret color the note declares: its computed caret-color is the text color when none is declared, so the declaration is read.
  const caretColor = async () => resolved(await p.locator(TEXT_BOX).evaluate((e) => e.style.caretColor))
  const selectionTint = () => p.locator(TEXT_BOX).evaluate((e) => window.getComputedStyle(e, '::selection').backgroundColor)
  // The tint written out here, so a change to the rule's percentage or color fails.
  const tinted = (color) => resolved(`color-mix(in srgb, ${color} 25%, transparent)`, 'backgroundColor')
  const fresh = async () => {
    await textAnywhere.forgetNotes(p)
    await textAnywhere.reloadOnTextAnywhere(p)
  }

  before(async () => {
    ;({ context, p, errors } = await textAnywhere.open(browser()))
    await fresh()
  })
  after(async () => { await context.close() })

  it('a click then typing starts the first character at the click and at its line\'s middle, and typing more never moves it', async () => {
    const [x, y] = await gridPoint(p, SPOT)
    await p.mouse.click(x, y)
    await p.keyboard.type('Hi')
    const first = await letterBox(TEXT_BOX, 0)
    assert.ok(Math.abs(first.left - x) <= START_TOLERANCE_PX, `the first letter starts at ${first.left}, clicked at ${x}`)
    assert.ok(Math.abs((first.top + first.bottom) / 2 - y) <= FIRST_LINE_TOLERANCE_PX, `the first line's middle is ${(first.top + first.bottom) / 2}, clicked at ${y}`)
    await p.keyboard.type(' there, a long note that wraps over a few lines because it keeps on going')
    assert.equal((await letterBox(TEXT_BOX, 0)).left, first.left, 'typing more left the start where it was')
    assert.equal((await letterBox(TEXT_BOX, 0)).top, first.top)
    await finishNote(p)
    assert.ok(Math.abs((await letterBox(TEXTS, 0)).left - first.left) <= 0.5, 'the closed note starts where the open one did')
  })

  it('a double-click in the middle of a word puts the caret at that letter and selects no word', async () => {
    await fresh()
    await p.mouse.click(...await gridPoint(p, SPOT))
    await p.keyboard.type('abcdefgh')
    await finishNote(p)
    const fifth = await letterBox(TEXTS, 4)
    await p.mouse.dblclick(fifth.left + 1, (fifth.top + fifth.bottom) / 2)
    assert.equal(await p.locator(TEXT_BOX).count(), 1, 'the note is open')
    await p.keyboard.type('X')
    assert.equal(await p.locator(TEXT_BOX).textContent(), 'abcdXefgh')
    await finishNote(p)
  })

  it('a double-click past the end of the text puts the caret at the end', async () => {
    const last = await letterBox(TEXTS, 8)
    await p.mouse.dblclick(last.right + 1, (last.top + last.bottom) / 2)
    await p.keyboard.type('Y')
    assert.equal((await p.locator(TEXT_BOX).textContent()).at(-1), 'Y')
    await finishNote(p)
  })

  it('a double-click on a formatted note puts the caret at the letter shown, past the markers the open note adds', async () => {
    await fresh()
    await p.mouse.click(...await gridPoint(p, SPOT))
    await p.keyboard.type('**ab**cdefgh')
    await finishNote(p)
    const fifth = await letterBox(TEXTS, 4)
    await p.mouse.dblclick(fifth.left + 1, (fifth.top + fifth.bottom) / 2)
    await p.keyboard.type('X')
    assert.equal(await p.locator(TEXT_BOX).textContent(), '**ab**cdXefgh')
    await finishNote(p)
  })

  it('a click just inside the board\'s top edge starts a note pinned to the board, though its stored point is half a line above the click', async () => {
    await fresh()
    const board = await p.evaluate(() => Framework.app.svgRenderer.getElem().getBoundingClientRect().toJSON())
    await p.mouse.click(board.left + board.width / 2, board.top + 2)
    await p.keyboard.type('top')
    await finishNote(p)
    const [note] = await textAnywhere.saved(p)
    assert.ok(note.at && !note.fixed, JSON.stringify(note))
  })

  it('the caret is the note\'s color, and a recolor changes it and the selection tint made after it', async () => {
    await fresh()
    await p.click(key(GREEN))
    await p.mouse.click(...await gridPoint(p, SPOT))
    await p.keyboard.type('ab')
    assert.equal(await caretColor(), await resolved(await penColor(GREEN)))
    await p.click(key(RED))
    assert.equal(await caretColor(), await resolved(await penColor(RED)))
    assert.notEqual(await resolved(await penColor(RED)), await resolved(await penColor(GREEN)))
    await p.locator(TEXT_BOX).focus()
    await p.keyboard.press('Control+A')
    assert.equal(await selectionTint(), await tinted(await penColor(RED)), 'a selection made after the recolor is tinted in the new color')
  })

  it('selected text is tinted in the note\'s color at low opacity, and the rule takes the halo off it', async () => {
    await p.locator(TEXT_BOX).focus()
    await p.keyboard.press('Control+A')
    assert.equal(await selectionTint(), await tinted(await penColor(RED)))
    // A selection's computed text-shadow reads none whatever the rule says, so the rule itself is read.
    const shadows = await p.evaluate(() => [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]).filter((rule) => rule.selectorText?.includes('.text-anywhere-textbox::selection')).map((rule) => rule.style.textShadow))
    assert.deepEqual(shadows, ['none'])
    await finishNote(p)
  })

  it('no page error', () => { assert.deepEqual(errors, []) })
})
