// Live check that a SudokuPad internal missing before Color by Digit loads turns off the feature that needs it and nothing else: the console
// names it once, the bar at the bottom of the page names it with a Report link, and the other features work.
// The snippet runs ahead of the script's own startup check and puts the internal back after it, so SudokuPad's own code still runs.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { BUTTON, coloredCountOn, EDITOR, GIVEN_COUNT, MODE_STORAGE_KEY, ODD_EVEN, openSession, pressTo, savedProfiles, SEEDED_OFF } from './color-by-digit-fixtures.mjs'
import { openScriptDialog } from '../settings.mjs'
import { settle } from '../settle.mjs'

const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')

const WARNING = /^color-by-digit: /
const BAR = '#sudokupad-scripts-notices [data-script="color-by-digit"]'
const DIGIT_STYLE = 'color-by-digit-digits'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

const missingBefore = (owner, name) => `;Framework.getApp().then(() => {
  const owner = ${owner}
  const original = owner.${name}
  owner[${JSON.stringify(name)}] = undefined
  Framework.getApp().then(() => { owner[${JSON.stringify(name)}] = original })
});\n`

const CASES = [
  {
    internal: 'app.act',
    owner: 'Framework.app',
    name: 'act',
    off: 'cell coloring',
    saved: { ...SEEDED_OFF },
    buttonExpected: true,
    // Cell coloring is off, so Cell mode colors nothing; the button still steps, digits take their colors, and the editor opens.
    works: async (p) => {
      await pressTo(p, 'Cell')
      assert.equal(await coloredCountOn(p), 0, 'Cell mode colors no cell')
      await pressTo(p, 'Digit')
      const css = () => p.evaluate((id) => document.getElementById(id)?.textContent ?? '', DIGIT_STYLE)
      assert.equal(await settle(async () => (await css()).length > 0, true), true, 'the digit colors are written')
      await openScriptDialog(p, 'Color by Digit', EDITOR)
      assert.equal(await p.locator(EDITOR).isVisible(), true)
    }
  },
  {
    internal: 'Framework.addControlButton',
    owner: 'Framework',
    name: 'addControlButton',
    off: 'mode button',
    saved: { ...savedProfiles({ profiles: [{ name: 'Odd/Even', groups: ODD_EVEN }], active: 0 }), [MODE_STORAGE_KEY]: 'cell' },
    buttonExpected: false,
    // There is no button, but the saved Cell mode still colors the givens, and the editor opens from the settings.
    works: async (p) => {
      assert.equal(await p.locator(BUTTON).count(), 0, 'no button')
      assert.equal(await settle(() => coloredCountOn(p), GIVEN_COUNT), GIVEN_COUNT, 'the givens are colored')
      await openScriptDialog(p, 'Color by Digit', EDITOR)
      assert.equal(await p.locator(EDITOR).isVisible(), true)
    }
  }
]

for (const kase of CASES) {
  describe(`SudokuPad has no ${kase.internal}`, { concurrency: false }, () => {
    let context, p, errors
    const warned = []

    before(async () => {
      ;({ context, p, errors } = await openSession(browser, `${missingBefore(kase.owner, kase.name)}${script}`, {
        saved: kase.saved,
        buttonExpected: kase.buttonExpected,
        expectedSkips: [WARNING],
        seed: (page) => { page.on('console', (m) => { if (m.type() === 'warning' && WARNING.test(m.text())) warned.push(m.text()) }) }
      }))
    })
    after(async () => { await context.close() })

    it('one console warning names the feature', async () => {
      assert.equal(await settle(async () => warned.length, 1), 1, warned.join('\n'))
      assert.equal(warned[0], `color-by-digit: ${kase.off} skipped because SudokuPad has no ${kase.internal}`)
    })

    it('the bar names the feature with a Report link, and goes when dismissed', async () => {
      const bar = p.locator(BAR)
      await bar.waitFor({ state: 'attached' })
      assert.match(await bar.textContent(), new RegExp(`^Color by Digit: ${kase.off} is off — SudokuPad changed\\.Report`))
      assert.match(await bar.locator('a').getAttribute('href'), /^https:\/\/github\.com\/caneff\/sudokupad-scripts\/issues\/new\?title=/)
      await bar.locator('button[aria-label="Dismiss"]').click()
      assert.equal(await bar.count(), 0)
    })

    it('the script\'s other features still work', async () => {
      await kase.works(p)
    })

    it('the page raised no error, and no further warning came', () => {
      assert.deepEqual(errors, [])
      assert.equal(warned.length, 1, warned.join('\n'))
    })
  })
}
