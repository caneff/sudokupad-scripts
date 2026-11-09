// Live check of the Tab option of ui-tweaks.user.js on sudokupad.app, in headless Chromium.
// The letter tool is switched on through its setting after the script is in, as a player does.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { openPage, startPuzzle } from '../page.mjs'
import { keydownDefaults } from '../pen.mjs'
import { openSettings } from '../settings.mjs'
import { LETTER_MODE_KEY as MODE_KEY, numberPadText } from '../scripts.mjs'
import { settle } from '../settle.mjs'
import { scriptSource, useBrowser } from '../session.mjs'

const script = scriptSource('ui-tweaks.user.js')

const DIGITS = '1234567890'
const LETTERS = 'ABCDEFGHIO'
const TOGGLE_BUTTON = 'button[data-control="toggleletter"]'
const WARNING = /ui-tweaks/
const BAR = '#sudokupad-scripts-notices [data-script="ui-tweaks"]'

const browser = useBrowser()

describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  // The tests below are one ordered sequence on one page: each starts from the letter mode the one
  // before left (digits, with the saved mode null, then false once a toggle has saved it).
  const pad = () => numberPadText(p)
  const saved = () => p.evaluate((key) => Framework.getData(key), MODE_KEY)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser()))
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    // Enable Letter Tool, switched on after the page and the script are in.
    await p.evaluate(() => Framework.setSetting('toolletter', true))
    await p.locator(TOGGLE_BUTTON).waitFor({ state: 'attached' })
  })
  after(async () => { await context.close() })

  // Records each Tab keydown's repeat flag and whether it was prevented once every listener has run, in a fresh list.
  const watchTab = () => p.evaluate(() => {
    window.__held = []
    if (window.__watchingTab) return
    window.__watchingTab = true
    window.addEventListener('keydown', (e) => { if (e.key === 'Tab') window.__held.push([e.repeat, e.defaultPrevented]) })
  })
  const focused = () => p.evaluate(() => { const a = document.activeElement; return `${a.tagName}#${a.id}.${a.className}|${a.textContent.slice(0, 30)}` })

  it('Tab in play leaves the number pad on digits, saves nothing, and leaves focus where it is', async () => {
    assert.equal(await pad(), DIGITS, 'before')
    assert.equal(await saved(), null, 'saved before')
    const focus = await focused()
    assert.deepEqual(await keydownDefaults(p, 'Tab'), [true], 'Tab was prevented, as with SudokuPad\'s own toggle')
    assert.equal(await focused(), focus, 'focus did not move')
    assert.equal(await pad(), DIGITS, 'after')
    assert.equal(await saved(), null, 'saved after')
  })

  // SudokuPad's App.handleKeydown returns early on event.repeat, so its own Tab entry never sees a held Tab.
  it('a held Tab (repeat keydowns) is prevented too, leaves the pad on digits, and leaves focus where it is', async () => {
    const focus = await focused()
    await watchTab()
    await p.keyboard.down('Tab')
    await p.keyboard.down('Tab')
    await p.keyboard.down('Tab')
    await p.keyboard.up('Tab')
    assert.deepEqual(await p.evaluate(() => window.__held), [[false, true], [true, true], [true, true]], 'repeat flag, prevented')
    assert.equal(await focused(), focus, 'focus did not move')
    assert.equal(await pad(), DIGITS, 'pad')
    assert.equal(await saved(), null, 'saved')
  })

  it('"/" and the letter button still toggle letter mode and save it', async () => {
    await keydownDefaults(p, '/')
    assert.equal(await pad(), LETTERS, 'after "/"')
    assert.equal(await saved(), true, 'saved after "/"')
    await p.click(TOGGLE_BUTTON)
    assert.equal(await pad(), DIGITS, 'after the button')
    assert.equal(await saved(), false, 'saved after the button')
    await p.click(TOGGLE_BUTTON)
    assert.equal(await pad(), LETTERS, 'after the button again')
    await keydownDefaults(p, '/')
    assert.equal(await pad(), DIGITS, 'after "/" again')
  })

  it('Tab in play leaves letter mode on while it is on', async () => {
    await keydownDefaults(p, '/')
    assert.equal(await pad(), LETTERS, 'on')
    await keydownDefaults(p, 'Tab')
    assert.equal(await pad(), LETTERS, 'still on after Tab')
    assert.equal(await saved(), true, 'saved stays true')
    await keydownDefaults(p, '/')
    assert.equal(await pad(), DIGITS, 'off')
  })

  it('Tab still moves focus in a dialog, and is not prevented there', async () => {
    await p.click('#control-settings')
    await p.locator('.dialog').waitFor({ state: 'visible' })
    const before = await focused()
    assert.deepEqual(await keydownDefaults(p, 'Tab'), [false], 'Tab was not prevented')
    assert.notEqual(await focused(), before, 'focus moved')
    assert.equal(await pad(), DIGITS, 'pad')
    assert.equal(await saved(), false, 'saved')
  })

  it('a held Tab in a dialog is not prevented either', async () => {
    await watchTab()
    await p.keyboard.down('Tab')
    await p.keyboard.down('Tab')
    await p.keyboard.up('Tab')
    assert.deepEqual(await p.evaluate(() => window.__held), [[false, false], [true, false]])
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

describe('the Tab binding is not found', () => {
  it('warns in the console and changes nothing', async () => {
    const warnings = []
    let warned
    const { context, p } = await openPage(browser(), {
      expectedSkips: [WARNING],
      seed: (page) => {
        page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()) })
        warned = page.waitForEvent('console', { predicate: (m) => WARNING.test(m.text()), timeout: 30000 })
      }
    })
    try {
      await startPuzzle(p, {
        beforeStart: async () => {
          // A SudokuPad whose letter tool binds no Tab.
          await p.evaluate(() => { ToolLetter.tool.keyHandlers = ToolLetter.tool.keyHandlers.filter((e) => e.key !== 'Tab') })
        }
      })
      await p.addScriptTag({ content: script })
      await warned
      const handlers = await p.evaluate(() => ToolLetter.tool.keyHandlers.map((e) => (typeof e.key === 'string' ? e.key : 'fn')))
      assert.deepEqual(handlers, ['/', 'fn'])
      assert.equal(warnings.filter((w) => WARNING.test(w)).length, 1, JSON.stringify(warnings))
      await p.locator(BAR).waitFor({ state: 'attached' })
      assert.match(await p.locator(BAR).textContent(), /^UI Tweaks: Tab key is off — SudokuPad changed\.Report/)
    } finally {
      await context.close()
    }
  })
})

// The letter tool's key list is missing before the script loads: the Tab feature is off, so SudokuPad's own Tab toggle works, and its "/" does.
// The snippet runs ahead of the script's own startup check and puts the list back after it.
describe('SudokuPad has no ToolLetter.tool.keyHandlers', { concurrency: false }, () => {
  let context, p, errors
  const warned = []
  const pad = () => numberPadText(p)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser(), {
      expectedSkips: [WARNING],
      seed: (page) => {
        page.on('console', (m) => { if (m.type() === 'warning' && WARNING.test(m.text())) warned.push(m.text()) })
      }
    }))
    await startPuzzle(p)
    const breaks = 'const original = ToolLetter.tool.keyHandlers; ToolLetter.tool.keyHandlers = undefined; Framework.getApp().then(() => { ToolLetter.tool.keyHandlers = original })'
    await p.addScriptTag({ content: `;Framework.getApp().then(() => { ${breaks} });\n${script}` })
    await p.evaluate(() => Framework.setSetting('toolletter', true))
    await p.locator(TOGGLE_BUTTON).waitFor({ state: 'attached' })
  })
  after(async () => { await context.close() })

  it('one console warning names the feature', async () => {
    assert.equal(await settle(async () => warned.length, 1), 1, warned.join('\n'))
    assert.equal(warned[0], 'ui-tweaks: Tab key skipped because SudokuPad has no ToolLetter.tool.keyHandlers')
  })

  it('the bar names the feature with a Report link, and goes when dismissed', async () => {
    const bar = p.locator(BAR)
    assert.match(await bar.textContent(), /^UI Tweaks: Tab key is off — SudokuPad changed\.Report/)
    assert.match(await bar.locator('a').getAttribute('href'), /^https:\/\/github\.com\/caneff\/sudokupad-scripts\/issues\/new\?title=/)
    await bar.locator('button[aria-label="Dismiss"]').click()
    assert.equal(await bar.count(), 0)
  })

  it('Tab switches the number pad to letters as SudokuPad does, and "/" switches it back', async () => {
    assert.equal(await pad(), DIGITS)
    await keydownDefaults(p, 'Tab')
    assert.equal(await settle(pad, LETTERS), LETTERS, 'Tab toggled to letters')
    await keydownDefaults(p, '/')
    assert.equal(await settle(pad, DIGITS), DIGITS, '"/" toggled back')
  })

  it('the page raised no error, and no further warning came', () => {
    assert.deepEqual(errors, [])
    assert.equal(warned.length, 1, warned.join('\n'))
  })
})

// Each of these breaks one SudokuPad internal at startup or after it, and the script's guard turns off only what needs it.
describe('SudokuPad has no Framework.getData', { concurrency: false }, () => {
  let context, p, errors
  const warned = []

  before(async () => {
    ;({ context, p, errors } = await openPage(browser(), {
      expectedSkips: [WARNING],
      seed: (page) => { page.on('console', (m) => { if (m.type() === 'warning' && WARNING.test(m.text())) warned.push(m.text()) }) }
    }))
    await startPuzzle(p)
    const breaks = 'const original = Framework.getData; Framework.getData = undefined; Framework.getApp().then(() => { Framework.getData = original })'
    await p.addScriptTag({ content: `;Framework.getApp().then(() => { ${breaks} });\n${script}` })
    await p.evaluate(() => Framework.setSetting('toolletter', true))
    await p.locator(TOGGLE_BUTTON).waitFor({ state: 'attached' })
  })
  after(async () => { await context.close() })

  it('one console warning names the saved options, and the bar says they are off', async () => {
    assert.equal(await settle(async () => warned.length, 1), 1, warned.join('\n'))
    assert.equal(warned[0], 'ui-tweaks: saved options skipped because SudokuPad has no Framework.getData')
    assert.match(await p.locator(BAR).textContent(), /^UI Tweaks: saved options is off — SudokuPad changed\.Report/)
  })

  it('the Tab option still works with its default, and the settings entry is still there', async () => {
    assert.deepEqual(await keydownDefaults(p, 'Tab'), [true])
    assert.equal(await numberPadText(p), DIGITS)
    await openSettings(p)
    await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: /^\s*UI Tweaks\s*$/ }).first().waitFor({ state: 'visible' })
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

describe('SudokuPad loses Framework.app.tools after startup', { concurrency: false }, () => {
  let context, p

  before(async () => {
    ;({ context, p } = await openPage(browser(), { expectedSkips: [WARNING] }))
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.evaluate(() => Framework.setSetting('toolletter', true))
    await p.locator(TOGGLE_BUTTON).waitFor({ state: 'attached' })
    await p.evaluate(() => { Framework.app.tools = undefined })
  })
  after(async () => { await context.close() })

  // SudokuPad's own keydown handler throws on the missing tools too, so page errors say nothing here; the bar is the script's guard catching its own.
  it('a held Tab turns the Tab option off and the bar says so', async () => {
    await p.keyboard.down('Tab')
    await p.keyboard.down('Tab')
    await p.keyboard.up('Tab')
    await p.locator(BAR).waitFor({ state: 'attached' })
    assert.match(await p.locator(BAR).textContent(), /^UI Tweaks: Tab key is off — SudokuPad changed\.Report/)
  })
})
