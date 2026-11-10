// Live check of text-anywhere.user.js's erasing on sudokupad.app: a right-drag or right click collects the notes it crosses and deletes them on the release, Escape or a lost pointer cancels it (a middle click or drag does nothing), the
// board's context menu is suppressed while Text Anywhere is current, Clear all asks first, and closing its dialog over the board
// makes no note and opens no text box. Real mouse input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { CLEAR_BUTTON, DIALOG, DIGIT_BUTTON, NOT_NOTES, TEXT_BOX } from './text-anywhere-fixtures.mjs'
import { clickUntil, settle, SETTLE_MS } from '../settle.mjs'
import { useBrowser } from '../session.mjs'
import { gridPoint, mouseDrag, typeText } from '../board.mjs'

// Two notes, in cells from the grid's top left: the upper one reads 15 and the lower one 20.
const UPPER_AT = [1.5, 2.5]
const LOWER_AT = [3.5, 2.5]

const browser = useBrowser()

describe('Text Anywhere\'s erasing', { concurrency: false }, () => {
  let context, p, errors
  // A right click on the board before the script runs: whether the page prevented its menu, and the cells selected.
  let stockRightClick
  // The same for a middle click: which of its pointerdown, mousedown and auxclick the page prevented.
  let stockMiddleClick

  const read = (fn, arg) => p.evaluate(fn, arg)
  const tool = () => textAnywhere.tool(p)
  const pickTextAnywhere = () => textAnywhere.pickTextAnywhere(p)
  const pickDigit = () => clickUntil(() => p.click(DIGIT_BUTTON), tool, 'normal', SETTLE_MS)
  const texts = () => textAnywhere.texts(p)
  const textBoxCount = () => p.locator(TEXT_BOX).count()
  const saved = () => textAnywhere.saved(p)
  const reload = () => textAnywhere.reload(p)
  const makeTwo = async () => {
    await pickTextAnywhere()
    await typeText(p, LOWER_AT, '20')
    await typeText(p, UPPER_AT, '15')
    assert.deepEqual(await texts(), ['20', '15'])
  }
  const rightDrag = (points) => mouseDrag(p, points, { button: 'right' })
  // A right click at r5c5's middle: whether its contextmenu event ended prevented, and the cells selected after it.
  // The listener is added last, so it runs after every listener the page and the script added.
  const rightClick = async () => {
    await read(() => {
      window.__menuPrevented = []
      window.addEventListener('contextmenu', (e) => window.__menuPrevented.push(e.defaultPrevented), { once: true })
    })
    await p.mouse.click(...await gridPoint(p, [4.5, 4.5]), { button: 'right' })
    return { prevented: await read(() => window.__menuPrevented), selected: await read(() => Framework.app.puzzle.selectedCells.length) }
  }
  const openClear = async () => {
    await p.click(CLEAR_BUTTON)
    await p.locator(DIALOG).waitFor({ state: 'visible' })
    // Framework.closeDialog does nothing while window.dialogJustShown is set, which showDialog clears in a
    // setTimeout; on a page busy after a reload a press can come first, and the dialog then stays open.
    await p.waitForFunction(() => !window.dialogJustShown)
  }
  // The middle of the dialog button labelled `label`, which must lie over the board for the check to mean anything.
  const buttonOverBoard = async (label) => {
    const [x, y, inside] = await read((text) => {
      const button = [...document.querySelectorAll('.dialog button')].find((b) => b.textContent === text)
      const b = button.getBoundingClientRect()
      const board = Framework.app.svgRenderer.getElem().getBoundingClientRect()
      const x = b.x + b.width / 2
      const y = b.y + b.height / 2
      return [x, y, x > board.left && x < board.right && y > board.top && y < board.bottom]
    }, label)
    assert.equal(inside, true, `the ${label} button is over the board`)
    return [x, y]
  }
  const pressDragRelease = async ([x, y]) => {
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(...await gridPoint(p, [6.5, 6.5]), { steps: 8 })
    await p.mouse.up()
  }

  before(async () => {
    // The stock clicks are read past Start Puzzle, before the script goes in.
    const readStock = async (page) => {
      p = page
      await p.evaluate(() => Framework.app.deselect())
      stockRightClick = await rightClick()
      await watchPrevented(MIDDLE_EVENTS, MIDDLE)
      await middleClick([8.5, 1.5])
      stockMiddleClick = await prevented()
    }
    ;({ context, p, errors } = await textAnywhere.open(browser(), { afterStart: readStock }))
    await textAnywhere.forgetNotes(p)
  })
  after(async () => { await context.close() })

  it('Text Anywhere gets the right button as a mousedown with button 2', async () => {
    await pickTextAnywhere()
    // App.toolExecHandler triggers `tool-<handler>` with the event before it calls the current tool's handler.
    const got = read(() => new Promise((resolve) => {
      const handler = (e) => { Framework.app.off('tool-handleInputdown', handler); resolve([e.type, e.button]) }
      Framework.app.on('tool-handleInputdown', handler)
    }))
    await p.mouse.click(...await gridPoint(p, [8.5, 8.5]), { button: 'right' })
    assert.deepEqual(await got, ['mousedown', 2])
  })

  it('a right-drag across one of two notes deletes it whole and keeps the other, and a reload shows the same', async () => {
    await makeTwo()
    await rightDrag([[1.5, 2.2], [1.5, 2.8]])
    assert.deepEqual(await texts(), ['20'])
    assert.deepEqual((await saved()).map((item) => item.text), ['20'])
    await reload()
    assert.deepEqual(await settle(texts, ['20']), ['20'])
  })

  it('a right-drag that passes near no note deletes nothing', async () => {
    await pickTextAnywhere()
    await rightDrag([[5.5, 1], [6.5, 8]])
    assert.deepEqual(await texts(), ['20'])
  })

  it('a right click on a note, with no drag, deletes it', async () => {
    await typeText(p, UPPER_AT, '15')
    assert.deepEqual(await texts(), ['20', '15'])
    await p.mouse.click(...await gridPoint(p, UPPER_AT), { button: 'right' })
    assert.deepEqual(await texts(), ['20'])
    assert.deepEqual((await saved()).map((item) => item.text), ['20'])
  })

  // Z switches to Digit with the right button still held, so the release goes to the Digit tool and not to Text Anywhere.
  it('a right-drag cut short by a tool switch removes nothing, and erases nothing more when Text Anywhere is back', async () => {
    await typeText(p, UPPER_AT, '15')
    await p.mouse.move(...await gridPoint(p, [1.5, 2.2]))
    await p.mouse.down({ button: 'right' })
    await p.mouse.move(...await gridPoint(p, [1.5, 2.8]), { steps: 8 })
    assert.deepEqual(await texts(), ['20', '15'], 'nothing is removed while the button is held')
    await p.keyboard.press('z')
    assert.equal(await settle(tool, 'normal'), 'normal')
    await p.mouse.up({ button: 'right' })
    assert.deepEqual(await texts(), ['20', '15'], 'the tool switch cancelled the erase')
    await read(() => Framework.app.changeTool('textanywhere'))
    assert.equal(await tool(), 'textanywhere')
    await p.mouse.move(...await gridPoint(p, [3.5, 2.2]))
    await p.mouse.move(...await gridPoint(p, [3.5, 2.8]), { steps: 8 })
    assert.deepEqual(await texts(), ['20', '15'])
    await p.mouse.click(...await gridPoint(p, UPPER_AT), { button: 'right' })
    assert.deepEqual(await texts(), ['20'])
  })

  it('a right-drag across two notes removes both at the release and not before', async () => {
    await typeText(p, UPPER_AT, '15')
    assert.deepEqual(await texts(), ['20', '15'])
    await p.mouse.move(...await gridPoint(p, [1.5, 2.2]))
    await p.mouse.down({ button: 'right' })
    await p.mouse.move(...await gridPoint(p, [1.5, 2.5]), { steps: 4 })
    await p.mouse.move(...await gridPoint(p, [3.5, 2.5]), { steps: 12 })
    assert.deepEqual(await texts(), ['20', '15'], 'both notes are still there while the button is held')
    assert.deepEqual((await saved()).map((item) => item.text), ['20', '15'], 'and still saved')
    await p.mouse.up({ button: 'right' })
    assert.deepEqual(await settle(texts, []), [])
    assert.equal(await saved(), null)
    await typeText(p, LOWER_AT, '20')
    await typeText(p, UPPER_AT, '15')
    assert.deepEqual(await texts(), ['20', '15'])
  })

  it('Escape while the right button is held cancels the erase: the release removes nothing', async () => {
    await p.mouse.move(...await gridPoint(p, [1.5, 2.2]))
    await p.mouse.down({ button: 'right' })
    await p.mouse.move(...await gridPoint(p, [1.5, 2.5]), { steps: 4 })
    await p.mouse.move(...await gridPoint(p, [3.5, 2.5]), { steps: 12 })
    await p.keyboard.press('Escape')
    await p.mouse.move(...await gridPoint(p, [3.5, 2.2]), { steps: 4 })
    await p.mouse.up({ button: 'right' })
    assert.deepEqual(await texts(), ['20', '15'])
    assert.equal((await saved()).length, 2)
  })

  it('a right press, Escape and a release on a note removes nothing', async () => {
    await p.mouse.move(...await gridPoint(p, UPPER_AT))
    await p.mouse.down({ button: 'right' })
    await p.keyboard.press('Escape')
    await p.mouse.up({ button: 'right' })
    assert.deepEqual(await texts(), ['20', '15'])
    await p.mouse.click(...await gridPoint(p, UPPER_AT), { button: 'right' })
    assert.deepEqual(await texts(), ['20'], 'the next right click erases as before')
  })

  // A mouse move with no button down stands for a release the page never saw, such as one off the window.
  it('a right-drag whose button is no longer held removes nothing, and the release finds no erase', async () => {
    await p.mouse.move(...await gridPoint(p, [3.5, 1.5]))
    await p.mouse.down({ button: 'right' })
    await p.mouse.move(...await gridPoint(p, [3.5, 2.5]), { steps: 8 })
    const [x, y] = await gridPoint(p, [5.5, 2.5])
    await read(([cx, cy]) => document.elementFromPoint(cx, cy).dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: cx, clientY: cy, buttons: 0 })), [x, y])
    await p.mouse.up({ button: 'right' })
    assert.deepEqual(await texts(), ['20'], 'the note the drag crossed before the loss is kept')
    assert.equal((await saved()).length, 1)
  })

  it('a key that changes the selected note during a right press leaves it to the erase: the release removes it', async () => {
    await p.mouse.click(...await gridPoint(p, LOWER_AT))
    await p.keyboard.press('Escape')
    await p.mouse.click(...await gridPoint(p, LOWER_AT))
    assert.equal(await read(() => document.querySelectorAll('#text-anywhere-layer .text-anywhere-selected').length), 1, 'the note is selected')
    await p.mouse.move(...await gridPoint(p, LOWER_AT))
    await p.mouse.down({ button: 'right' })
    await p.keyboard.press('ArrowRight')
    await p.mouse.move(...await gridPoint(p, [5.5, 4.5]), { steps: 4 })
    await p.mouse.up({ button: 'right' })
    assert.deepEqual(await settle(texts, []), [])
    await typeText(p, LOWER_AT, '20')
    assert.deepEqual(await texts(), ['20'])
  })

  it('a right-drag cut short by the window losing focus removes nothing', async () => {
    await p.mouse.move(...await gridPoint(p, [3.5, 2.2]))
    await p.mouse.down({ button: 'right' })
    await p.mouse.move(...await gridPoint(p, [3.5, 2.8]), { steps: 8 })
    await read(() => window.dispatchEvent(new window.Event('blur')))
    await p.mouse.up({ button: 'right' })
    assert.deepEqual(await texts(), ['20'])
    assert.equal((await saved()).length, 1)
  })

  // The window's blur stands for the solver switching window mid-drag; the release then goes to the other window.
  it('a move cut short by the window losing focus is kept and saved', async () => {
    const [before] = (await saved()).map((item) => item.at)
    await p.mouse.move(...await gridPoint(p, LOWER_AT))
    await p.mouse.down()
    await p.mouse.move(...await gridPoint(p, [3.5, 4.5]), { steps: 8 })
    await read(() => window.dispatchEvent(new window.Event('blur')))
    const [after] = (await saved()).map((item) => item.at)
    assert.notDeepEqual(after, before, 'saved at the blur')
    await p.mouse.up()
    assert.deepEqual(await texts(), ['20'])
    assert.equal(await textBoxCount(), 0)
    await p.mouse.click(...await gridPoint(p, [3.5, 4.5]), { button: 'right' })
    assert.deepEqual(await texts(), [])
  })

  it('with Text Anywhere current a right click on the board opens no context menu and selects no cell', async () => {
    await pickTextAnywhere()
    await p.evaluate(() => Framework.app.deselect())
    assert.deepEqual(await rightClick(), { prevented: [true], selected: 0 })
  })

  it('with another tool current a right click behaves as it does without the script', async () => {
    await pickDigit()
    await p.evaluate(() => Framework.app.deselect())
    assert.deepEqual(stockRightClick.prevented, [false], 'the page itself leaves the menu alone')
    assert.deepEqual(await rightClick(), stockRightClick)
  })

  const MIDDLE = 1
  const MIDDLE_EVENTS = ['pointerdown', 'mousedown', 'auxclick']
  const middleDrag = (points) => mouseDrag(p, points, { button: 'middle' })
  const middleClick = async (at) => p.mouse.click(...await gridPoint(p, at), { button: 'middle' })
  // For each mouse event type, the `defaultPrevented` of the events of button `button` that reached the window. The listener
  // is added last, so it runs after every listener the page and the script added.
  const watchPrevented = (types, button) => read(([names, wanted]) => {
    window.__stopWatching?.()
    const seen = {}
    const watch = (e) => { if (e.button === wanted) (seen[e.type] ||= []).push(e.defaultPrevented) }
    for (const name of names) window.addEventListener(name, watch)
    window.__prevented = seen
    window.__stopWatching = () => { for (const name of names) window.removeEventListener(name, watch) }
  }, [types, button])
  const prevented = () => read(() => window.__prevented)

  const NOTE = [7.5, 5.5]

  it('a middle click on a note leaves it, and a reload shows the same', async () => {
    await pickTextAnywhere()
    await typeText(p, NOTE, '15')
    const saved0 = await saved()
    assert.deepEqual(await texts(), ['15'])
    await middleClick(NOTE)
    assert.deepEqual([await texts(), await saved()], [['15'], saved0])
    assert.equal(await textBoxCount(), 0)
    await reload()
    assert.deepEqual(await settle(texts, ['15']), ['15'])
  })

  it('a middle-drag across a note leaves it', async () => {
    await pickTextAnywhere()
    const before = await saved()
    await middleDrag([[7.5, 5], [7.5, 6]])
    assert.deepEqual([await texts(), await saved()], [['15'], before])
  })

  it('a right-drag erases the note the middle-button tests left', async () => {
    await rightDrag([[7.5, 5], [7.5, 6]])
    assert.deepEqual(await texts(), [])
  })

  it('a middle pointerdown, mousedown and auxclick over the board are the page\'s own with Text Anywhere current as with another tool: not prevented, so the autoscroll and Linux paste are the browser\'s', async () => {
    await pickTextAnywhere()
    await watchPrevented(MIDDLE_EVENTS, MIDDLE)
    await middleClick([8.5, 1.5])
    const withTextAnywhere = await prevented()
    assert.deepEqual(withTextAnywhere, { pointerdown: [false], mousedown: [false], auxclick: [false] })
    await pickDigit()
    await watchPrevented(MIDDLE_EVENTS, MIDDLE)
    await middleClick([8.5, 1.5])
    assert.deepEqual(await prevented(), stockMiddleClick)
    assert.deepEqual(withTextAnywhere, stockMiddleClick)
  })

  it('Clear all asks "Clear all notes?", and Cancel keeps every note', async () => {
    await pickTextAnywhere()
    await typeText(p, UPPER_AT, '15')
    await typeText(p, LOWER_AT, '20')
    assert.deepEqual(await texts(), ['15', '20'])
    await openClear()
    assert.match(await p.locator(DIALOG).textContent(), /Clear all notes\?/)
    await p.mouse.click(...await buttonOverBoard('Cancel'))
    await p.locator(DIALOG).waitFor({ state: 'detached' })
    assert.deepEqual(await texts(), ['15', '20'])
    assert.equal((await saved()).length, 2)
    assert.equal(await textBoxCount(), 0, 'the click on Cancel opened no text box')
  })

  it('closing the dialog by a click on its overlay over the board opens no text box', async () => {
    await openClear()
    const corner = await gridPoint(p, [0.5, 0.5])
    assert.equal(await read(([x, y]) => document.elementFromPoint(x, y).classList.contains('dialog-overlay'), corner), true, 'the click lands on the overlay')
    await p.mouse.click(...corner)
    await p.locator(DIALOG).waitFor({ state: 'detached' })
    assert.equal(await textBoxCount(), 0)
    assert.deepEqual(await texts(), ['15', '20'])
  })

  it('closing the dialog by a button pressed over the board and released after a drag on it makes no note', async () => {
    await openClear()
    await pressDragRelease(await buttonOverBoard('Cancel'))
    await p.locator(DIALOG).waitFor({ state: 'detached' })
    assert.deepEqual(await texts(), ['15', '20'])
    assert.equal(await p.locator(NOT_NOTES).count(), 0)
  })

  it('closing the dialog by its overlay over the board, with a drag on the board, makes no note', async () => {
    await openClear()
    // r1c1's middle is over the board and outside the dialog, which sits over the board's middle.
    const corner = await gridPoint(p, [0.5, 0.5])
    assert.equal(await read(([x, y]) => document.elementFromPoint(x, y).classList.contains('dialog-overlay'), corner), true, 'the press lands on the overlay')
    await pressDragRelease(corner)
    await p.locator(DIALOG).waitFor({ state: 'detached' })
    assert.deepEqual(await texts(), ['15', '20'])
    assert.equal(await textBoxCount(), 0)
    assert.equal(await tool(), 'textanywhere')
  })

  it('Clear all\'s OK removes every note, opens no text box, and a reload shows none', async () => {
    await openClear()
    await pressDragRelease(await buttonOverBoard('OK'))
    await p.locator(DIALOG).waitFor({ state: 'detached' })
    assert.deepEqual(await settle(texts, []), [])
    assert.equal(await textBoxCount(), 0)
    assert.equal(await saved(), null)
    await reload()
    assert.deepEqual(await texts(), [])
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
