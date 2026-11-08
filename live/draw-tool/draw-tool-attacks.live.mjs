// Live attacks on Text Anywhere's editing (#597, attacks 19-33 of #590): each test tries to break the script in one hostile way and asserts the crash signals
// (a page error or a skip line, collected by `openPage` and checked after every test) plus what a user expects to see. Attack 34 waits on #584.
// Real mouse and keyboard input throughout, at a desktop size.
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { captureConsoleErrors, openPage } from '../page.mjs'
import { gridPoint, mouseDrag } from '../pen.mjs'
import { SETTLE_MS, settle } from '../settle.mjs'

const { CLEAR_BUTTON, DIALOG, DIGIT_BUTTON, OPACITY_SLIDER, SELECTED, SIZE_SLIDER, TEXT_BOX, TEXTS, slideTo } = draw
const { HIT_MARGIN_PX } = createRequire(import.meta.url)('../../draw-tool.user.js')
const HOME = { width: 1200, height: 900 }
const SPOT = [2.5, 2.5]
const OTHER = [6.5, 5.5]
const key = (n) => `.controls-input button[data-key="${n}"]`
const RED = 4
// A held arrow must carry a note past this many px (one press moves about 1), and Shift+arrow past this many.
const HELD_FAR_PX = 15
const SHIFT_FAR_PX = 40
// The debounced save is 500 ms after typing pauses, so a read must stay unchanged longer than that before it is given up on.
const SAVE_QUIET_MS = 1500

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere attacked while editing', { concurrency: false }, () => {
  let context, p, errors

  const saved = () => draw.saved(p)
  const savedTexts = async () => ((await saved()) ?? []).map((item) => item.text)
  const shown = () => draw.texts(p)
  const boxOpen = async () => (await p.locator(TEXT_BOX).count()) === 1
  const boxText = () => p.locator(TEXT_BOX).textContent()
  const noteBox = (text) => p.locator(TEXTS).filter({ hasText: new RegExp(`^${text}$`) }).boundingBox()
  const clickAt = async (at, options) => p.mouse.click(...await gridPoint(p, at), options)
  const typeAt = async (at, text) => {
    await clickAt(at)
    await p.keyboard.type(text)
    await draw.finishNote(p)
  }
  const reload = async () => {
    await draw.reload(p)
    await draw.pickDraw(p)
  }
  const undoButton = () => p.click('#control-undo')
  const restartFromDialog = async () => {
    await p.click('#control-restart')
    await p.locator('.dialog button').filter({ hasText: /Restart/ }).filter({ hasNotText: /Keep Time/ }).first().click()
    await p.locator('.dialog').waitFor({ state: 'detached' })
  }
  const setClipboard = (items) => p.evaluate((data) => navigator.clipboard.write([new window.ClipboardItem(Object.fromEntries(Object.entries(data).map(([type, value]) => [type, new Blob([value], { type })])))]), items)
  const noOpenBox = async () => assert.equal(await boxOpen(), false, 'no note is left open')

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport: HOME, permissions: ['clipboard-read', 'clipboard-write'] }, seed: captureConsoleErrors }))
    await draw.boot(p)
  })
  after(async () => { await context.close() })
  // Each attack starts from a clean page with Text Anywhere current and no notes.
  beforeEach(async () => {
    await p.setViewportSize(HOME)
    await draw.forgetDrawings(p)
    await reload()
  })
  // Errors are checked and cleared after each attack, so one failure names its own attack and no other.
  afterEach(() => {
    const seen = errors.splice(0)
    assert.deepEqual(seen, [], 'no page error, console error or skip line')
  })

  it('attack 19: a note being typed in is kept when the tool is switched without leaving the note', async () => {
    await clickAt(SPOT)
    await p.keyboard.type('keep')
    await p.click(DIGIT_BUTTON)
    assert.equal(await draw.tool(p), 'normal')
    await noOpenBox()
    assert.deepEqual(await settle(shown, ['keep']), ['keep'])
    assert.deepEqual(await savedTexts(), ['keep'])
    await draw.pickDraw(p)
    assert.deepEqual(await shown(), ['keep'])
    await reload()
    assert.deepEqual(await shown(), ['keep'], 'and over a reload')
  })

  it('attack 20: a note being typed in, then Restart, is cleared with the rest and Undo brings it back', async () => {
    await typeAt(OTHER, 'old')
    await clickAt(SPOT)
    await p.keyboard.type('typing')
    await restartFromDialog()
    await noOpenBox()
    assert.deepEqual(await settle(shown, []), [], 'Restart cleared the notes, the one being typed in too')
    assert.deepEqual(await savedTexts(), [])
    await undoButton()
    assert.deepEqual((await settle(shown, ['old', 'typing'])).sort(), ['old', 'typing'], 'Undo brings back both')
    assert.deepEqual((await savedTexts()).sort(), ['old', 'typing'])
  })

  it('attack 21: a note being typed in is saved while typing, so a reload keeps it, drawn and saved alike, and leaves no half-open note', async () => {
    await typeAt(OTHER, 'saved')
    await clickAt(SPOT)
    await p.keyboard.type('unsaved')
    // The debounced save, not the reload's pagehide, wrote it.
    assert.deepEqual(await settle(savedTexts, ['saved', 'unsaved'], SETTLE_MS, SAVE_QUIET_MS), ['saved', 'unsaved'])
    assert.equal(await boxOpen(), true, 'saving left the note open')
    await reload()
    await noOpenBox()
    assert.deepEqual((await shown()).sort(), ['saved', 'unsaved'])
    assert.deepEqual((await savedTexts()).sort(), ['saved', 'unsaved'], 'what is drawn is what is saved')
    // The page still takes a note.
    await typeAt([7.5, 1.5], 'again')
    assert.ok((await shown()).includes('again'))
  })

  // The page's own save at unload, fired by hand: what is saved the moment the event returns is what that listener wrote, with no debounce to credit.
  const savedByEvent = async (fire) => {
    const key = draw.DRAWING_PREFIX + await draw.puzzleKey(p)
    return (draw.drawingOf(await p.evaluate(([dataKey, run]) => {
      Framework.removeData(dataKey)
      new Function(run)() // eslint-disable-line no-new-func
      return Framework.getData(dataKey)
    }, [key, fire])) ?? []).map((item) => item.text)
  }
  const PAGEHIDE = 'window.dispatchEvent(new Event("pagehide"))'
  const HIDDEN = 'Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); delete document.visibilityState'

  it('attack 21b: typing and reloading at once keeps the text, and the pagehide and the hidden-page saves each write it alone', async () => {
    await clickAt(SPOT)
    await p.keyboard.type('quick')
    assert.deepEqual(await savedByEvent(PAGEHIDE), ['quick'], 'pagehide')
    assert.deepEqual(await savedByEvent(HIDDEN), ['quick'], 'visibilitychange to hidden')
    await reload()
    await noOpenBox()
    assert.deepEqual(await shown(), ['quick'])
    assert.deepEqual(await savedTexts(), ['quick'])
  })

  it('attack 21c: the saves while typing add no SudokuPad undo step and leave the note\'s own Undo whole', async () => {
    const undoSteps = () => p.evaluate(() => Framework.app.puzzle.undoStack.length)
    const before = await undoSteps()
    await clickAt(SPOT)
    await p.keyboard.type('abcdef')
    assert.deepEqual(await settle(savedTexts, ['abcdef'], SETTLE_MS, SAVE_QUIET_MS), ['abcdef'], 'the save while typing ran')
    assert.equal(await undoSteps(), before, 'the saves added no undo step')
    await p.keyboard.press('Control+z')
    assert.equal(await boxText(), '', 'one Undo in the note removes everything typed')
    await draw.finishNote(p)
  })

  it('attack 21d: a note saved while typing and then emptied is not brought back by a reload, by the pause save or by the pagehide save', async () => {
    for (const waitForSave of [true, false]) {
      await clickAt(SPOT)
      await p.keyboard.type('abc')
      assert.deepEqual(await settle(savedTexts, ['abc'], SETTLE_MS, SAVE_QUIET_MS), ['abc'])
      await p.keyboard.press('Control+a')
      await p.keyboard.press('Backspace')
      if (waitForSave) assert.deepEqual(await settle(savedTexts, [], SETTLE_MS, SAVE_QUIET_MS), [], 'the pause save took the emptied note out')
      await reload()
      await noOpenBox()
      assert.deepEqual(await shown(), [], `nothing drawn (waited for the save: ${waitForSave})`)
      assert.deepEqual(await savedTexts(), [], `nothing saved (waited for the save: ${waitForSave})`)
    }
  })

  it('attack 21e: a reopened note typed in is saved while typing, and a note emptied then Escaped after a Restart leaves Undo bringing the cleared notes back', async () => {
    await typeAt(OTHER, 'old')
    await draw.reopen(p, await gridPoint(p, OTHER))
    await p.keyboard.type('+new')
    assert.deepEqual(await settle(savedTexts, ['old+new'], SETTLE_MS, SAVE_QUIET_MS), ['old+new'])
    await reload()
    assert.deepEqual(await shown(), ['old+new'])
    await restartFromDialog()
    await clickAt(SPOT)
    await p.keyboard.type('x')
    assert.deepEqual(await settle(savedTexts, ['x'], SETTLE_MS, SAVE_QUIET_MS), ['x'])
    await p.keyboard.press('Backspace')
    await draw.finishNote(p)
    await undoButton()
    assert.deepEqual(await settle(shown, ['old+new']), ['old+new'], 'Undo brought the Restart\'s notes back')
  })

  it('attack 22: Undo and Redo pressed over and over inside a note, and Undo from the toolbar, keep the note\'s text and SudokuPad\'s state sound', async () => {
    await clickAt(SPOT)
    await p.keyboard.type('abc')
    for (let i = 0; i < 6; i++) {
      await p.keyboard.press('Control+z')
      await p.keyboard.press('Control+z')
      await p.keyboard.press('Control+Shift+z')
      await p.keyboard.press('Control+y')
    }
    for (let i = 0; i < 10; i++) await p.keyboard.press('Control+y')
    assert.equal(await boxOpen(), true, 'the note is still open')
    assert.equal(await boxText(), 'abc', 'redo put the whole text back')
    for (let i = 0; i < 10; i++) await p.keyboard.press('Control+z')
    for (let i = 0; i < 10; i++) await p.keyboard.press('Control+y')
    assert.equal(await boxText(), 'abc')
    await draw.finishNote(p)
    assert.deepEqual(await savedTexts(), ['abc'])
    // SudokuPad's own Undo and Redo from the toolbar, again and again, leave the note alone.
    for (let i = 0; i < 6; i++) {
      await undoButton()
      await p.click('#control-redo')
    }
    assert.deepEqual(await shown(), ['abc'])
    assert.deepEqual(await savedTexts(), ['abc'])
  })

  it('attack 23: an empty note left by a click elsewhere is discarded, and Undo afterwards brings nothing back', async () => {
    await typeAt(OTHER, 'stay')
    await clickAt(SPOT)
    assert.equal(await boxOpen(), true, 'an empty note is open')
    await clickAt([7.5, 1.5])
    // The click that ended the empty note may open another empty one; Escape ends it.
    if (await boxOpen()) await draw.finishNote(p)
    assert.deepEqual(await shown(), ['stay'], 'the empty note left nothing')
    assert.deepEqual(await savedTexts(), ['stay'])
    await undoButton()
    await p.keyboard.press('Control+z')
    assert.deepEqual(await shown(), ['stay'], 'Undo did not touch the notes')
    await reload()
    assert.deepEqual(await shown(), ['stay'])
  })

  it('attack 24: every symbol shortcut and a checklist line type in, and the note\'s own Undo gives the typed characters back', async () => {
    const symbols = [['->', '→'], ['!=', '≠'], ['<=', '≤'], ['>=', '≥'], ['<-', '←'], ['sum ', 'Σ ']]
    for (const [typed, sign] of symbols) {
      await clickAt(SPOT)
      await p.keyboard.type(typed)
      assert.equal(await boxText(), sign, `${typed} became ${sign}`)
      await p.keyboard.press('Control+z')
      assert.equal(await boxText(), typed, `Undo gave back ${typed}`)
      await p.keyboard.press('Control+y')
      assert.equal(await boxText(), sign, `Redo made ${sign} again`)
      await draw.finishNote(p)
      assert.deepEqual(await shown(), [sign.trim()], `${sign} is drawn`)
      await p.mouse.click(...await draw.middleAt(p, await gridPoint(p, SPOT)), { button: 'right' })
      assert.deepEqual(await settle(shown, []), [])
    }
    await clickAt(SPOT)
    await p.keyboard.type('- [ ] one')
    await p.keyboard.press('Shift+Enter')
    await p.keyboard.type('- [x] two')
    await draw.finishNote(p)
    assert.deepEqual(await savedTexts(), ['- [ ] one\n- [x] two'])
    assert.equal(await p.locator(`${TEXTS} [data-line]`).count(), 2, 'two checklist boxes are drawn')
    await draw.reopen(p, await gridPoint(p, SPOT))
    for (let i = 0; i < 12; i++) await p.keyboard.press('Control+z')
    assert.equal(await boxOpen(), true, 'the note is still open after Undo')
    await draw.finishNote(p)
    assert.equal((await shown()).length, 1, 'the checklist note is still drawn')
    assert.equal((await savedTexts()).length, 1, 'and saved')
  })

  it('attack 25: a 5000-character line and a 200-line text pasted into a note are kept whole, and the page keeps working', async () => {
    const line = 'abcdefghij'.repeat(500)
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n')
    await clickAt(SPOT)
    await setClipboard({ 'text/plain': line })
    await p.keyboard.press('Control+v')
    assert.equal(await boxText(), line, 'the whole line pasted')
    await draw.finishNote(p)
    assert.deepEqual(await savedTexts(), [line])
    await p.keyboard.press('Escape')
    await clickAt(OTHER)
    await setClipboard({ 'text/plain': lines })
    await p.keyboard.press('Control+v')
    await draw.finishNote(p)
    assert.equal((await savedTexts()).includes(lines), true, 'all 200 lines saved')
    assert.equal((await shown()).length, 2)
    await reload()
    assert.equal((await shown()).length, 2, 'both over a reload')
    // The notes can still be selected and erased.
    await p.mouse.click(...await draw.middleAt(p, await gridPoint(p, OTHER)), { button: 'right' })
    assert.deepEqual(await settle(shown, [line]), [line], 'the other note is the one left')
  })

  it('attack 26: rich HTML pasted into a note comes in as its plain text only', async () => {
    await clickAt(SPOT)
    await setClipboard({ 'text/html': '<h1 style="color:red">Title</h1><p>some <b>bold</b> and <a href="https://example.com">link</a></p><img src="x.png"><script>window.__pwned = 1</script>', 'text/plain': 'Title\nsome bold and link' })
    await p.keyboard.press('Control+v')
    assert.equal(await p.locator(`${TEXT_BOX} *`).count(), 0, 'the open note holds text only, no element')
    assert.equal(await boxText(), 'Title\nsome bold and link')
    await draw.finishNote(p)
    assert.deepEqual(await savedTexts(), ['Title\nsome bold and link'])
    await reload()
    assert.equal(await p.locator(`${TEXTS} img, ${TEXTS} script, ${TEXTS} a`).count(), 0)
  })

  it('attack 27: emoji, right-to-left text and combining characters are kept exactly, over a reload too', async () => {
    const text = '😀👍🏽 שלום עולם مرحبا é ạ̈ 👨‍👩‍👧'
    await clickAt(SPOT)
    await p.keyboard.insertText(text)
    await draw.finishNote(p)
    assert.deepEqual(await savedTexts(), [text])
    assert.deepEqual(await shown(), [text])
    await reload()
    assert.deepEqual(await shown(), [text])
    await draw.reopen(p, await gridPoint(p, SPOT))
    assert.equal(await boxText(), text, 'the open note shows the same text')
    await draw.finishNote(p)
    assert.deepEqual(await savedTexts(), [text], 'opening and closing it changed nothing')
  })

  it('attack 28: a double-click on a note while another note is open saves the first and opens the second', async () => {
    await typeAt(SPOT, 'first')
    await typeAt(OTHER, 'second')
    await draw.reopen(p, await gridPoint(p, SPOT))
    await p.keyboard.type('!')
    await p.mouse.dblclick(...await draw.middleAt(p, await gridPoint(p, OTHER)))
    assert.equal(await boxOpen(), true, 'one note is open')
    assert.equal(await boxText(), 'second', 'the second note is the open one')
    assert.deepEqual((await savedTexts()).sort(), ['first!', 'second'], 'the first note kept what was typed')
    await p.keyboard.press('Control+End')
    await p.keyboard.type('?')
    await draw.finishNote(p)
    assert.deepEqual((await savedTexts()).sort(), ['first!', 'second?'])
    assert.deepEqual((await shown()).sort(), ['first!', 'second?'])
  })

  it('attack 29: two overlapping notes are erased by right click, the top one by its own end first, then the bottom one; a click on the overlap takes both', async () => {
    await typeAt(SPOT, 'bottom note')
    const [bottom] = await saved()
    const scale = await p.evaluate(() => Framework.app.svgRenderer.getElem().getScreenCTM().a)
    const width = (await noteBox('bottom note')).width
    const plant = async () => {
      await draw.plantDrawing(p, [bottom, { ...bottom, text: 'top note', at: [bottom.at[0] + width * 0.6 / scale, bottom.at[1] + 3 / scale] }])
      await reload()
      assert.deepEqual(await shown(), ['bottom note', 'top note'])
    }
    await plant()
    const a = await noteBox('bottom note')
    const b = await noteBox('top note')
    const overlap = [(b.x + a.x + a.width) / 2, (a.y + a.height / 2 + b.y + b.height / 2) / 2]
    assert.ok(overlap[0] > b.x && overlap[0] < a.x + a.width, 'the notes overlap')
    assert.ok(b.x - a.x > 2 * HIT_MARGIN_PX, 'the bottom note has an end the top one does not reach')
    // The top note's right end and the bottom note's left end each lie on one note only.
    await p.mouse.click(b.x + b.width - 2, b.y + b.height / 2, { button: 'right' })
    assert.deepEqual(await settle(shown, ['bottom note']), ['bottom note'], 'the top note went first')
    assert.deepEqual(await savedTexts(), ['bottom note'])
    await p.mouse.click(a.x + 2, a.y + a.height / 2, { button: 'right' })
    assert.deepEqual(await settle(shown, []), [], 'then the bottom one')
    assert.deepEqual(await savedTexts(), [])
    await reload()
    assert.deepEqual(await shown(), [])
    await plant()
    await p.mouse.click(...overlap, { button: 'right' })
    assert.deepEqual(await settle(shown, []), [], 'a click on the overlap erases every note under it')
    assert.deepEqual(await savedTexts(), [])
  })

  it('attack 30: several selected notes take a new Size, Color and Transparency from the panel, and SudokuPad\'s Undo leaves those notes as they are', async () => {
    const places = { A: [1.5, 1.5], B: [1.5, 3.5], C: [3.5, 2.5] }
    for (const [text, at] of Object.entries(places)) await typeAt(at, text)
    // A digit gives SudokuPad's Undo something to undo.
    await p.click(DIGIT_BUTTON)
    await clickAt([7.5, 7.5])
    await p.keyboard.press('5')
    await draw.pickDraw(p)
    await mouseDrag(p, [[0.6, 0.6], [3, 3], [4.4, 4.4]])
    assert.equal(await p.locator(SELECTED).count(), 3, 'three notes are selected')
    const before = await saved()
    await p.click(key(RED))
    await slideTo(p, SIZE_SLIDER, 14)
    await slideTo(p, OPACITY_SLIDER, 40)
    const changed = await saved()
    for (const [i, item] of changed.entries()) {
      assert.equal(item.color, RED, 'recolored')
      assert.ok(item.size > before[i].size, 'bigger')
      assert.equal(item.opacity, 40, 'faded')
    }
    for (let i = 0; i < 3; i++) await undoButton()
    await p.keyboard.press('Control+z')
    assert.equal(await p.evaluate(() => Framework.app.grid.getCell(7, 7).propGet('normal') ?? null), null, 'Undo took the digit back')
    assert.deepEqual(await saved(), changed, 'and left the notes as they were changed')
    assert.deepEqual((await shown()).sort(), ['A', 'B', 'C'])
    await reload()
    assert.deepEqual(await saved(), changed)
  })

  it('attack 31: arrows held on several selected notes move them all together with a ramp, Shift+arrows move them farther, and each release saves once and keeps them reachable', async () => {
    await typeAt([1.5, 1.5], 'A')
    await typeAt([3.5, 1.5], 'B')
    await mouseDrag(p, [[0.6, 0.6], [2, 2], [4.4, 3.4]])
    assert.equal(await p.locator(SELECTED).count(), 2, 'two notes are selected')
    // Counts the writes of this puzzle's drawing.
    await p.evaluate((prefix) => {
      window.drawSaves = 0
      const setData = Framework.setData
      Framework.setData = function (name, value) {
        if (String(name).startsWith(prefix)) window.drawSaves++
        return setData.call(this, name, value)
      }
    }, draw.DRAWING_PREFIX)
    const saves = () => p.evaluate(() => window.drawSaves)
    const start = [await noteBox('A'), await noteBox('B')]
    await p.keyboard.down('ArrowRight')
    try {
      // A ramp: well past the 1 px of a single press.
      assert.equal(await settle(async () => (await noteBox('A')).x - start[0].x > HELD_FAR_PX, true), true, `the held key moved the notes only ${(await noteBox('A')).x - start[0].x} px`)
      assert.equal(await saves(), 0, 'nothing is saved while the key is held')
    } finally {
      await p.keyboard.up('ArrowRight')
    }
    assert.equal(await settle(saves, 1), 1, 'one save after the release')
    const right = await noteBox('A')
    await p.keyboard.down('Shift')
    try {
      await p.keyboard.down('ArrowDown')
      assert.equal(await settle(async () => (await noteBox('A')).y - start[0].y > SHIFT_FAR_PX, true), true, `Shift+arrow moved the notes only ${(await noteBox('A')).y - start[0].y} px`)
      await p.keyboard.up('ArrowDown')
    } finally {
      await p.keyboard.up('Shift')
    }
    assert.equal(await settle(saves, 2), 2, 'one more save after the second release')
    const end = [await noteBox('A'), await noteBox('B')]
    assert.ok(end[0].x >= right.x - 1, 'the Shift+arrow down did not undo the move right')
    assert.ok(Math.abs((end[0].x - start[0].x) - (end[1].x - start[1].x)) <= 1, 'both moved the same way across')
    assert.ok(Math.abs((end[0].y - start[0].y) - (end[1].y - start[1].y)) <= 1, 'and down')
    assert.equal(await draw.tool(p), 'draw')
    await reload()
    const reloaded = await noteBox('A')
    assert.ok(Math.abs(reloaded.x - end[0].x) <= 1.5 && Math.abs(reloaded.y - end[0].y) <= 1.5, `saved where it stopped (${end[0].x},${end[0].y} then ${reloaded.x},${reloaded.y})`)
    for (const box of [await noteBox('A'), await noteBox('B')]) assert.ok(box.x + box.width / 2 <= HOME.width && box.y + box.height / 2 <= HOME.height, 'inside the window')
  })

  it('attack 32: notes put at the window\'s corners and the board\'s edges stay reachable when the window shrinks below them', async () => {
    // The window's four corners; the top ones sit under SudokuPad's menu and top bar, so those notes start just below and inside them, on the page.
    const corners = { TL: [46, 46], TR: [HOME.width - 46, 46], BL: [6, HOME.height - 6], BR: [HOME.width - 6, HOME.height - 6] }
    for (const [text, at] of Object.entries(corners)) {
      await p.mouse.click(...at)
      assert.equal(await boxOpen(), true, `a click at the ${text} corner of the window opens a note`)
      await p.keyboard.type(text)
      await draw.finishNote(p)
    }
    assert.deepEqual((await shown()).sort(), ['BL', 'BR', 'TL', 'TR'], 'a note sits at each corner')
    await typeAt([0.05, 0.05], 'BoardTL')
    await typeAt([8.95, 8.95], 'BoardBR')
    await typeAt([4.5, 4.5], 'a long note that is wider than the small window will be')
    const insideWindow = async () => {
      const [w, h] = await p.evaluate(() => [window.innerWidth, window.innerHeight])
      const middles = await Promise.all((await p.locator(TEXTS).all()).map(async (e) => { const b = await e.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2] }))
      return middles.every(([x, y]) => x >= 0 && x <= w && y >= 0 && y <= h)
    }
    const count = (await shown()).length
    assert.equal(count, 7, 'seven notes were placed')
    for (const size of [{ width: 1024, height: 600 }, { width: 800, height: 600 }, HOME]) {
      await p.setViewportSize(size)
      assert.equal(await settle(insideWindow, true), true, `every note's middle is inside a ${size.width}x${size.height} window`)
      assert.equal((await shown()).length, count, 'no note was lost')
    }
    await reload()
    assert.equal((await shown()).length, count, 'all kept over a reload')
  })

  it('attack 33: the trash button pressed while the text in an open note is selected clears the notes after its question, with no note left open', async () => {
    await typeAt(OTHER, 'other')
    await clickAt(SPOT)
    await p.keyboard.type('selected text')
    await p.keyboard.press('Control+a')
    await p.click(CLEAR_BUTTON)
    await noOpenBox()
    await p.locator(DIALOG).waitFor({ state: 'visible' })
    assert.match(await p.locator(DIALOG).textContent(), /Clear all notes\?/)
    await p.waitForFunction(() => !window.dialogJustShown)
    await p.locator(`${DIALOG} button`).filter({ hasText: /^OK$/ }).first().click()
    await p.locator(DIALOG).waitFor({ state: 'detached' })
    assert.deepEqual(await settle(shown, []), [], 'every note is gone, the one being typed in too')
    assert.deepEqual(await savedTexts(), [])
    await reload()
    assert.deepEqual(await shown(), [])
    await typeAt(SPOT, 'fresh')
    assert.deepEqual(await shown(), ['fresh'], 'a new note works')
  })
})
