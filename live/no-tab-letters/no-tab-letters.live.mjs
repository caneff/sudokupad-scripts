// Live check of no-tab-letters.user.js, the last version of a script that is now ui-tweaks.user.js, on sudokupad.app in headless Chromium:
// alone it keeps its Tab behavior and shows a one-time notice; with UI Tweaks running too it leaves Tab to that script. The Tab behavior
// itself is checked in live/ui-tweaks/ui-tweaks-tab.live.mjs.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { gotoPuzzle, openPage, startPuzzle } from '../page.mjs'
import { closeDialogWith, openScriptDialog } from '../settings.mjs'
import { keydownDefaults } from '../pen.mjs'
import { settle } from '../settle.mjs'
import { numberPadText } from '../scripts.mjs'

const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
const oldScript = source('no-tab-letters.user.js')
const uiTweaks = source('ui-tweaks.user.js')

const DIGITS = '1234567890'
const LETTERS = 'ABCDEFGHIO'
const TOGGLE_BUTTON = 'button[data-control="toggleletter"]'
const NOTICE = '#sudokupad-scripts-notices [data-script="no-tab-letters-moved"]'
const DIALOG = '#ui-tweaks-dialog'
const INSTALL_URL = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/ui-tweaks.user.js'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

async function startPage (p, scripts) {
  await startPuzzle(p)
  for (const content of scripts) await p.addScriptTag({ content })
  await p.evaluate(() => Framework.setSetting('toolletter', true))
  await p.locator(TOGGLE_BUTTON).waitFor({ state: 'attached' })
}

describe('No Tab Letters alone', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await startPage(p, [oldScript])
  })
  after(async () => { await context.close() })

  it('shows the notice once, with an install link to UI Tweaks', async () => {
    const notice = p.locator(NOTICE)
    await notice.waitFor({ state: 'visible' })
    assert.equal(await notice.locator('span').textContent(), 'No Tab Letters is now UI Tweaks.')
    assert.equal(await notice.locator('a').getAttribute('href'), INSTALL_URL)
    assert.equal(await notice.count(), 1)
  })

  it('still keeps Tab from switching the number pad to letters', async () => {
    assert.deepEqual(await keydownDefaults(p, 'Tab'), [true])
    assert.equal(await numberPadText(p), DIGITS)
  })

  it('a dismissed notice goes, and stays gone after a reload', async () => {
    await p.locator(`${NOTICE} button[aria-label="Dismiss"]`).click()
    await p.locator(NOTICE).waitFor({ state: 'detached' })
    await gotoPuzzle(p)
    await startPage(p, [oldScript])
    assert.equal(await settle(() => p.evaluate(() => Framework.getData('no-tab-letters-moved-notice')), true), true, 'the dismissal was saved')
    assert.equal(await p.locator(NOTICE).count(), 0)
    assert.deepEqual(await keydownDefaults(p, 'Tab'), [true], 'Tab is still kept')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

// UI Tweaks' own Tab option is turned off first, so a Tab that still did nothing would be the old script's.
for (const order of [['no-tab-letters first', [oldScript, uiTweaks]], ['UI Tweaks first', [uiTweaks, oldScript]]]) {
  describe(`No Tab Letters and UI Tweaks together, ${order[0]}`, { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ;({ context, p, errors } = await openPage(browser))
      await startPage(p, order[1])
    })
    after(async () => { await context.close() })

    it('shows no notice', async () => {
      await p.locator('#control-settings').waitFor({ state: 'visible' })
      assert.equal(await p.locator(NOTICE).count(), 0)
    })

    it('Tab is handled once, by UI Tweaks: with its option on Tab does nothing, and with it off Tab switches to letters', async () => {
      assert.deepEqual(await keydownDefaults(p, 'Tab'), [true])
      assert.equal(await numberPadText(p), DIGITS)
      await openScriptDialog(p, 'UI Tweaks', DIALOG)
      await p.locator(`${DIALOG} input[data-option="tab"]`).uncheck()
      await closeDialogWith(p, 'Save', DIALOG)
      await keydownDefaults(p, 'Tab')
      assert.equal(await settle(() => numberPadText(p), LETTERS), LETTERS, 'the old script left Tab to UI Tweaks, whose option is off')
    })

    it('the page raised no error', () => {
      assert.deepEqual(errors, [])
    })
  })
}
