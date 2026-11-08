// Live attacks 73 to 75 (#628, from #590): a full browser store, settings pasted in odd shapes and settings changed in another tab, on
// sudokupad.app in headless Chromium. Each test names its attack and asserts the crash signals (no uncaught error, console error or
// skip line) beside what a user expects. Clicks, drags and keys are real input.
/* global Framework, Storage */
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { assertClean, installScripts, openAttackPage, pickTool } from './attack-fixtures.mjs'
import { captureConsoleErrors, gotoPuzzle, newPage, openPage, startPuzzle } from './page.mjs'
import { mouseDrag, openPenTool, penEntries, setSlider, gridPoint } from './pen.mjs'
import { closeDialogWith, code, openScriptDialog, paste, SETTINGS_SCRIPTS } from './settings.mjs'
import { settle } from './settle.mjs'
import { labelOn } from './color-by-digit/color-by-digit-fixtures.mjs'
import * as draw from './draw-tool/draw-tool-fixtures.mjs'

// The bug tickets of the attacks that fail on main (todo until fixed).
const FULL_STORE_BUG = '#634'

const THICKNESS = '#pen-tool-extras-thickness'
const OPACITY = '#pen-tool-extras-opacity'
// The longest a paste, even of a megabyte, gets to answer.
const PASTE_BUDGET_MS = 5000
const MEGABYTE = 1024 * 1024

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('attacks on storage', { concurrency: false }, () => {
  let context, p, errors
  afterEach(async () => { await context?.close() })

  describe('with the three scripts installed', () => {
    beforeEach(async () => {
      ;({ context, p, errors } = await openAttackPage(browser))
    })

    it('attack 73: a full store (setItem throws QuotaExceededError) on the scripts\' own keys leaves every feature working in the session, with no uncaught error or skip line', { todo: `${FULL_STORE_BUG}: a refused write is read as SudokuPad having changed, and the script's saved data goes off` }, async () => {
      // Only the scripts' keys refuse: SudokuPad's own writes (its tool and progress) throw uncaught on a full store with no script installed.
      await p.evaluate(() => {
        const set = Storage.prototype.setItem
        Storage.prototype.setItem = function (key, value) {
          if (/(DrawTool|PenColor|EdgeMarks|ColorByDigit)_/.test(key)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
          return set.call(this, key, value)
        }
      })
      const dismissNotice = async () => {
        const ok = p.locator('.dialog button').filter({ hasText: /^\s*OK\s*$/ })
        if (await ok.count() > 0) await ok.click()
      }

      await pickTool(p, 'draw')
      await p.mouse.click(...await gridPoint(p, [4.5, 4.5]))
      await p.keyboard.type('15')
      await draw.finishNote(p)
      await dismissNotice()
      assert.deepEqual(await draw.texts(p), ['15'], 'Text Anywhere draws the note')

      await setSlider(p, THICKNESS, 9)
      await mouseDrag(p, [[1.5, 1.5], [1.5, 4.5]])
      assert.equal((await penEntries(p)).length, 3, 'Pen Tool Extras draws the line')

      const before = await labelOn(p)
      await p.click('#control-colorbydigit')
      assert.notEqual(await settle(() => labelOn(p), before), before, 'Color by Digit changes its mode')

      assertClean(errors, 'a full store')
    })
  })

  it('attack 74: settings pasted as malformed text, from an older version and a megabyte large change nothing they should not, and answer in time', async () => {
    for (const script of SETTINGS_SCRIPTS) {
      ;({ context, p, errors } = await openPage(browser, { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }))
      await startPuzzle(p, { injection: { mode: 'after-start', code: code(script.file) } })
      await openScriptDialog(p, script.entry, script.editor)
      // Everything the script owns in the store, as saved strings.
      const owned = () => p.evaluate((pattern) => Object.fromEntries(Object.keys(window.localStorage).filter((k) => new RegExp(pattern).test(k.replace(/^svencodes_/, ''))).sort().map((k) => [k, window.localStorage.getItem(k)])), script.owns.source)
      const timed = async (text) => {
        const started = Date.now()
        const status = await paste(p, text)
        assert.equal(Date.now() - started < PASTE_BUDGET_MS, true, `${script.file}: a paste of ${text.length} characters answers in ${PASTE_BUDGET_MS} ms`)
        return status
      }
      await p.evaluate(([key, value]) => Framework.setData(key, value), [script.key, script.saved])
      const savedBefore = await owned()

      for (const text of ['', '{', '{"a":1,', 'null', '[]', '"text"', '12', 'not json', '{"__proto__":{"polluted":1}}', '{}']) {
        assert.match(await timed(text), /^(Could not paste|Nothing to paste)/, `${script.file}: ${JSON.stringify(text)} is refused in words`)
      }
      assert.equal(await p.evaluate(() => ({}).polluted), undefined, `${script.file}: a pasted __proto__ pollutes nothing`)
      assert.deepEqual(await owned(), savedBefore, `${script.file}: malformed text saved nothing`)

      // A megabyte of text that is not JSON, and a megabyte under a key the script's reader refuses.
      assert.equal(await timed('x'.repeat(MEGABYTE)), 'Could not paste: the clipboard text is not JSON', `${script.file}: a megabyte of text is refused`)
      assert.equal(await timed(JSON.stringify({ [script.badKey]: 'x'.repeat(MEGABYTE) })), 'Pasted 0 settings; skipped 1 that did not check out.', `${script.file}: a megabyte value is skipped`)
      assert.deepEqual(await owned(), savedBefore, `${script.file}: a megabyte saved nothing`)

      // An older version's export holds only some keys: those are pasted, and the rest of the script's settings stay as they were. A megabyte of a foreign key beside it is ignored.
      await p.evaluate((key) => Framework.removeData(key), script.key)
      const withoutKey = await owned()
      assert.equal(await timed(JSON.stringify({ [script.key]: script.saved, Foreign_key: 'x'.repeat(MEGABYTE) })), 'Pasted 1 setting.', `${script.file}: an export with one key pastes that key`)
      const after = await owned()
      assert.deepEqual(Object.fromEntries(Object.entries(after).filter(([k]) => k in withoutKey)), withoutKey, `${script.file}: the other keys stay as they were`)
      assert.deepEqual(await p.evaluate((key) => Framework.getData(key), script.key), script.enveloped ? { v: 0, data: script.saved } : script.saved, `${script.file}: the pasted key is saved`)
      assert.equal(await p.evaluate(() => Framework.getData('Foreign_key')), null, `${script.file}: the foreign key is not saved`)

      await closeDialogWith(p, 'Cancel', script.editor)
      assertClean(errors, script.file)
      await context.close()
    }
  })

  it('attack 75: settings changed in one tab while another tab has the puzzle open leave that tab working, keep the other settings, and show up on its reload', async () => {
    ;({ context, p, errors } = await openAttackPage(browser))
    const other = await newPage(context)
    captureConsoleErrors(other.p, other.errors)
    await gotoPuzzle(other.p)
    await installScripts(other.p)
    const stored = (page, key) => page.evaluate((k) => Framework.getData(k), key)

    // The other tab changes three settings, one of each script, the way a user does.
    await setSlider(other.p, THICKNESS, 9)
    await other.p.click('#control-colorbydigit')
    const modeThere = await settle(() => labelOn(other.p), await labelOn(p))
    await pickTool(other.p, 'draw')
    await draw.slideTo(other.p, draw.SIZE_SLIDER, 40)
    const widthThere = await draw.valueOf(other.p, draw.SIZE_SLIDER)
    assert.equal(await stored(p, 'PenColor_thickness'), 9, 'the first tab sees the saved thickness')

    // This tab goes on working through the change, and a save of one setting does not put back the old value of another.
    await openPenTool(p)
    await mouseDrag(p, [[1.5, 1.5], [1.5, 4.5]])
    assert.equal((await penEntries(p)).length, 3, 'the first tab draws a line')
    await setSlider(p, OPACITY, 60)
    assert.equal(await stored(p, 'PenColor_thickness'), 9, 'the first tab\'s save of the opacity leaves the other tab\'s thickness')
    assert.equal(await stored(p, 'PenColor_opacity'), 60, 'the opacity is saved')
    await pickTool(p, 'draw')
    await p.mouse.click(...await gridPoint(p, [4.5, 4.5]))
    await p.keyboard.type('15')
    await draw.finishNote(p)
    assert.deepEqual(await draw.texts(p), ['15'], 'the first tab makes a note')
    assert.equal(await draw.valueOf(other.p, draw.SIZE_SLIDER), widthThere, 'the first tab\'s note does not change the other tab\'s width')

    // A reload shows the other tab's settings and this tab's own.
    await p.reload({ waitUntil: 'load' })
    await installScripts(p)
    await openPenTool(p)
    assert.equal(await p.evaluate((selector) => Number(document.querySelector(selector).value), THICKNESS), 9, 'the reload shows the thickness the other tab saved')
    assert.equal(await p.evaluate((selector) => Number(document.querySelector(selector).value), OPACITY), 60, 'the reload shows the opacity this tab saved')
    assert.equal(await labelOn(p), modeThere, 'the reload shows the mode the other tab saved')
    await pickTool(p, 'draw')
    assert.equal(await draw.valueOf(p, draw.SIZE_SLIDER), widthThere, 'the reload shows the width the other tab saved')
    assertClean(errors, 'the first tab')
    assertClean(other.errors, 'the other tab')
  })
})
