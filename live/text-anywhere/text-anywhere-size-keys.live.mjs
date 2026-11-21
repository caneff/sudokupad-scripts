// Owed: SudokuPad's compact-marks range (1-5 giving 1 to 5) did not run in headless Chromium, so only that - is left untouched is checked.
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { useBrowser } from '../session.mjs'
import { clickAt, finishNote, gridPoint, typeText } from '../board.mjs'
import { savedValue } from '../settings.mjs'

const { SIZE_SLIDER, TEXT_BOX, WIDTH_KEY, valueOf } = textAnywhere
const A = [1.5, 1.5]
const B = [5.5, 5.5]
const CENTRE_BUTTON = '#control-centre'

const browser = useBrowser()

describe('Text Anywhere\'s + and - keys', { concurrency: false }, () => {
  let context, p, errors

  const savedSize = async (text) => (await textAnywhere.saved(p)).find((item) => item.text === text).size

  before(async () => {
    ;({ context, p, errors } = await textAnywhere.open(browser(), { contextOptions: { viewport: { width: 1280, height: 720 } } }))
  })
  after(async () => { await context.close() })
  beforeEach(async () => {
    await textAnywhere.forgetNotes(p)
    await p.evaluate((key) => Framework.removeData(key), WIDTH_KEY)
    await textAnywhere.reloadOnTextAnywhere(p)
  })

  it('with a note selected, + twice and - once make it one step (1 text size) bigger, the slider follows, and - after + gives the size back', async () => {
    await typeText(p, A, 'A')
    assert.equal(await savedSize('A'), 20)
    await clickAt(p, A)
    await p.keyboard.press('+')
    assert.deepEqual([await savedSize('A'), await valueOf(p, SIZE_SLIDER)], [21, 6.5])
    await p.keyboard.press('-')
    assert.deepEqual([await savedSize('A'), await valueOf(p, SIZE_SLIDER)], [20, 6])
    await p.keyboard.press('+')
    await p.keyboard.press('+')
    await p.keyboard.press('-')
    assert.deepEqual([await savedSize('A'), await valueOf(p, SIZE_SLIDER)], [21, 6.5])
    await p.keyboard.press('=')
    await p.keyboard.press('NumpadAdd')
    assert.equal(await savedSize('A'), 23, '= and the keypad + step it too')
    await p.keyboard.press('NumpadSubtract')
    assert.equal(await savedSize('A'), 22)
  })

  it('holding + grows a selected note past one step, and the release stops it', async () => {
    await typeText(p, A, 'A')
    await clickAt(p, A)
    await p.keyboard.down('+')
    await p.waitForFunction((id) => Number(document.getElementById(id).value) > 7, SIZE_SLIDER.slice(1))
    await p.keyboard.up('+')
    const stopped = await savedSize('A')
    assert.equal(stopped > 22, true, `a held key kept growing: ${stopped}`)
    // A "nothing happened in 400 ms" check: the release must leave the size where it stopped.
    await p.waitForTimeout(400)
    assert.equal(await savedSize('A'), stopped)
  })

  it('holding + with nothing selected keeps stepping the next note\'s size, and the release stops it', async () => {
    await p.keyboard.down('+')
    await p.waitForFunction((id) => Number(document.getElementById(id).value) > 7, SIZE_SLIDER.slice(1))
    await p.keyboard.up('+')
    const stopped = await p.evaluate((k) => Framework.getData(k), WIDTH_KEY)
    assert.equal(stopped > 7, true, `the next-note size kept growing: ${stopped}`)
    // A "nothing happened in 400 ms" check: the release must leave the size where it stopped.
    await p.waitForTimeout(400)
    assert.equal(await p.evaluate((k) => Framework.getData(k), WIDTH_KEY), stopped)
  })

  it('a held + stops when Shift is let go before the key, which then comes up as =, and when the window loses focus', async () => {
    const width = () => p.evaluate((k) => Framework.getData(k), WIDTH_KEY)
    await p.keyboard.down('Shift')
    await p.keyboard.down('Equal')
    await p.waitForFunction((id) => Number(document.getElementById(id).value) > 7, SIZE_SLIDER.slice(1))
    await p.keyboard.up('Shift')
    await p.keyboard.up('Equal')
    const released = await width()
    // A "nothing happened in 400 ms" check.
    await p.waitForTimeout(400)
    assert.equal(await width(), released, 'the release of the key stopped the hold')
    await p.keyboard.press('-')
    await p.keyboard.down('-')
    await p.waitForFunction(([id, from]) => Number(document.getElementById(id).value) < from - 1, [SIZE_SLIDER.slice(1), released])
    await p.evaluate(() => window.dispatchEvent(new Event('blur')))
    const blurred = await width()
    // A "nothing happened in 400 ms" check.
    await p.waitForTimeout(400)
    await p.keyboard.up('-')
    assert.equal(await width(), blurred, 'the blur stopped the hold')
  })

  it('with Ctrl, Alt or Meta held the keys leave the size alone (only the Alt ones witness the script\'s own check)', async () => {
    await typeText(p, A, 'A')
    await clickAt(p, A)
    await p.keyboard.press('+')
    // Ctrl (and Cmd, which SudokuPad treats alike) switches the tool while held, so the Control and Meta cases pass for that reason; Alt goes first because a chord after a Ctrl one would never reach this script.
    for (const chord of ['Alt+=', 'Alt+-', 'Meta+=', 'Control+-']) {
      await p.keyboard.press(chord)
      assert.equal(await savedSize('A'), 21, `${chord} left the size as the plain + made it`)
    }
  })

  it('with notes of different sizes selected, + and - step each from its own size, and the slider and the next note take the first note\'s new size', async () => {
    await typeText(p, A, 'A')
    await typeText(p, B, 'B')
    await clickAt(p, A)
    await p.keyboard.press('+')
    await p.keyboard.press('+')
    await clickAt(p, B)
    await p.keyboard.press('-')
    await p.keyboard.down('Shift')
    await clickAt(p, A)
    await p.keyboard.up('Shift')
    // A is 22 (width 7), B 19 (width 5.5) and the next note's width is 5.5, so only the first note's step can make it 7.5.
    await p.keyboard.press('+')
    assert.deepEqual([await savedSize('A'), await savedSize('B')], [23, 20])
    assert.deepEqual([await valueOf(p, SIZE_SLIDER), await p.evaluate((k) => Framework.getData(k), WIDTH_KEY)], [7.5, 7.5])
    await p.keyboard.press('-')
    await p.keyboard.press('-')
    assert.deepEqual([await savedSize('A'), await savedSize('B')], [21, 18])
  })

  it('a + pressed in the middle of a move of the note changes nothing, and the size stays what the drop leaves', async () => {
    await typeText(p, A, 'A')
    await clickAt(p, A)
    const [x, y] = await gridPoint(p, A)
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x + 40, y + 40, { steps: 5 })
    await p.keyboard.press('+')
    await p.mouse.up()
    assert.deepEqual([await savedSize('A'), await valueOf(p, SIZE_SLIDER)], [20, 6])
  })

  it('with nothing selected, + moves the slider and the next note\'s size, not a note already made', async () => {
    await typeText(p, A, 'A')
    await p.keyboard.press('+')
    assert.deepEqual([await valueOf(p, SIZE_SLIDER), await p.evaluate((k) => Framework.getData(k), WIDTH_KEY)], [6.5, 6.5])
    await typeText(p, B, 'B')
    assert.deepEqual([await savedSize('A'), await savedSize('B')], [20, 21])
  })

  it('with a note selected, + changes that note and is also the next note\'s size', async () => {
    await typeText(p, A, 'A')
    await clickAt(p, A)
    await p.keyboard.press('+')
    assert.equal(await savedSize('A'), 21)
    assert.equal(await p.evaluate((k) => Framework.getData(k), WIDTH_KEY), 6.5, 'the next-note size stepped too')
    await finishNote(p)
    await typeText(p, B, 'B')
    assert.equal(await savedSize('B'), 21)
  })

  it('inside an open note, + and - type as text and change no size', async () => {
    await clickAt(p, A)
    await p.keyboard.type('1+2-3')
    assert.equal(await p.locator(TEXT_BOX).textContent(), '1+2-3')
    await finishNote(p)
    assert.equal(await savedSize('1+2-3'), 20)
    assert.equal(await valueOf(p, SIZE_SLIDER), 6)
  })

  it('under the centre tool, - is not taken: it reaches SudokuPad unprevented and the next note\'s size stays', async () => {
    await p.click(CENTRE_BUTTON)
    await p.mouse.click(...await gridPoint(p, A))
    await p.evaluate(() => {
      window.seenMinus = []
      document.addEventListener('keydown', (event) => { if (event.key === '-') window.seenMinus.push(event.defaultPrevented) }, true)
    })
    await p.keyboard.press('-')
    assert.deepEqual(await p.evaluate(() => window.seenMinus), [false])
    assert.equal(await savedValue(p, WIDTH_KEY), null)
  })

  it('raised no page error', () => assert.deepEqual(errors, []))
})
