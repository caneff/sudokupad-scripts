// Live check of text-anywhere.user.js's polish on sudokupad.app: symbols typed as ASCII become their signs with the caret where the solver was typing, a click
// on a checklist box ticks it and saves the note without opening it, and a note being moved is drawn at 60% of its own opacity. Real mouse and keyboard input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { useBrowser } from '../session.mjs'
import { finishNote, gridPoint } from '../board.mjs'

const { CHECK_BOXES, TEXT_BOX, TEXTS } = textAnywhere
const SYMBOLS_AT = [1.5, 1.5]
const TRAILING_AT = [3.5, 3.5]
const MOVED_AT = [7.5, 6.5]
const BY = [1, 2]

const browser = useBrowser()

describe('Text Anywhere\'s polish', { concurrency: false }, () => {
  let context, p, errors

  const reload = () => textAnywhere.reloadOnTextAnywhere(p)
  const boxText = () => p.locator(TEXT_BOX).textContent()
  // The caret's offset in the open box's text, or null when it is not a collapsed caret in the box.
  const caret = () => p.evaluate(() => {
    const { anchorNode, anchorOffset, isCollapsed } = window.getSelection()
    return isCollapsed && anchorNode ? anchorOffset : null
  })
  const typeInto = async (at, keys) => {
    await p.mouse.click(...await gridPoint(p, at))
    await p.keyboard.type(keys)
  }
  const savedTexts = async () => (await textAnywhere.saved(p)).map((item) => item.text)
  const opacityOf = () => p.locator(TEXTS).evaluate((e) => Number(window.getComputedStyle(e).opacity))

  before(async () => {
    ;({ context, p, errors } = await textAnywhere.open(browser()))
    await textAnywhere.forgetNotes(p)
    await reload()
  })
  after(async () => { await context.close() })

  it('typing a->b in an open note leaves a→b, with the caret after the arrow', async () => {
    await typeInto(SYMBOLS_AT, 'a->')
    assert.equal(await boxText(), 'a→')
    assert.equal(await caret(), 2)
    await p.keyboard.type('b')
    assert.equal(await boxText(), 'a→b')
  })

  it('a symbol typed in the middle of the text keeps the caret right after it', async () => {
    await p.keyboard.press('Home')
    await p.keyboard.press('ArrowRight')
    await p.keyboard.type('<=')
    assert.equal(await boxText(), 'a≤→b')
    assert.equal(await caret(), 2)
  })

  it('every pair becomes its sign, and sum only as a word of its own', async () => {
    await p.keyboard.press('Control+A')
    await p.keyboard.type('x!=y <-z q>=r sum summary ')
    assert.equal(await boxText(), 'x≠y ←z q≥r Σ summary ')
    assert.equal(await caret(), 21)
  })

  it('Undo gives back the typed characters, and the saved text holds the signs', async () => {
    await p.keyboard.press('Control+A')
    await p.keyboard.type('a->')
    await p.keyboard.press('Control+Z')
    assert.equal(await boxText(), 'a->', 'Undo undid the replacement and gave back the typed characters')
    await p.keyboard.press('Control+A')
    await p.keyboard.type('1<=2')
    await finishNote(p)
    assert.deepEqual(await savedTexts(), ['1≤2'])
  })

  it('deleting text after a typed arrow, or a note closing on the word sum, leaves the text as typed or makes the sigma', async () => {
    await typeInto(TRAILING_AT, '')
    await p.keyboard.insertText('r1->r2')
    assert.equal(await boxText(), 'r1->r2', 'text inserted whole is not converted')
    await p.keyboard.press('Backspace')
    await p.keyboard.press('Backspace')
    assert.equal(await boxText(), 'r1->', 'deleting back to the arrow does not convert it')
    await p.keyboard.press('Control+A')
    await p.keyboard.type('r5 sum')
    assert.equal(await boxText(), 'r5 sum', 'sum waits for the character after it')
    await finishNote(p)
    assert.deepEqual(await savedTexts(), ['1≤2', 'r5 Σ'])
  })

  it('a click on a checklist box ticks it and saves the note, a reload keeps it, and the note does not open', async () => {
    await textAnywhere.plantNotes(p, [{ kind: 'text', color: 1, size: 20, opacity: 100, text: '- [ ] one\n- [x] two', at: [352, 288] }])
    await reload()
    assert.equal(await p.locator(CHECK_BOXES).count(), 2)
    const first = p.locator(CHECK_BOXES).first()
    await first.click()
    assert.deepEqual(await savedTexts(), ['- [x] one\n- [x] two'])
    assert.equal(await p.locator(TEXT_BOX).count(), 0, 'no text box opened')
    assert.equal(await p.locator(`${CHECK_BOXES}.text-anywhere-check-done`).count(), 2)
    await reload()
    assert.equal(await p.locator(`${CHECK_BOXES}.text-anywhere-check-done`).count(), 2, 'the tick survives a reload')
    await p.locator(CHECK_BOXES).nth(1).click()
    assert.deepEqual(await savedTexts(), ['- [x] one\n- [ ] two'])
  })

  it('"[] milk" and an empty "- [ ]" typed on two lines both become boxes when the note finishes, and a click ticks each in its own form', async () => {
    await textAnywhere.forgetNotes(p)
    await reload()
    await typeInto(SYMBOLS_AT, '[] milk')
    await p.keyboard.press('Enter')
    await p.keyboard.type('- [ ] ')
    await finishNote(p)
    assert.deepEqual(await savedTexts(), ['[] milk\n- [ ]'])
    assert.equal(await p.locator(CHECK_BOXES).count(), 2)
    await p.locator(CHECK_BOXES).nth(1).click()
    assert.deepEqual(await savedTexts(), ['[] milk\n- [x]'])
    await p.locator(CHECK_BOXES).first().click()
    assert.deepEqual(await savedTexts(), ['[x] milk\n- [x]'])
    assert.equal(await p.locator(`${CHECK_BOXES}.text-anywhere-check-done`).count(), 2)
  })

  it('a press on a box that moves the pointer starts no drag: the note stays where it was', async () => {
    const before = (await textAnywhere.saved(p))[0].at
    const box = await p.locator(CHECK_BOXES).first().boundingBox()
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await p.mouse.down()
    await p.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 40, { steps: 6 })
    await p.mouse.up()
    assert.deepEqual((await textAnywhere.saved(p))[0].at, before)
  })

  it('a dragged note is drawn at 60% of its own opacity, and back to it on release', async () => {
    await textAnywhere.plantNotes(p, [{ kind: 'text', color: 1, size: 20, opacity: 80, text: 'move', at: [416, 480] }])
    await reload()
    assert.equal(await opacityOf(), 0.8)
    await p.mouse.move(...await gridPoint(p, MOVED_AT))
    await p.mouse.down()
    await p.mouse.move(...await gridPoint(p, [MOVED_AT[0] + BY[0], MOVED_AT[1] + BY[1]]), { steps: 8 })
    await textAnywhere.frames(p)
    assert.ok(Math.abs(await opacityOf() - 0.48) < 0.001, `during the drag: ${await opacityOf()}`)
    await p.mouse.up()
    assert.equal(await opacityOf(), 0.8)
  })

  it('threw no page error', () => { assert.deepEqual(errors, []) })
})
