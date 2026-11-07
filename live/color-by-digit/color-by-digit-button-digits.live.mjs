// Live check that the button's strip shows the cell profile's numbers with a separate digit profile (#377), on
// sudokupad.app in headless Chromium: Low/5/High on the cells, Odd/Even on the digits, in Digit mode.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { BUTTON, MODE_STORAGE_KEY, SEED, openSession, savedProfiles } from './color-by-digit-fixtures.mjs'
import { settle } from '../settle.mjs'

const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')
const APART = { profiles: SEED.profiles, active: 1, digitActive: 0 }

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

const chips = (p) => p.locator(BUTTON).evaluate((button) => [...button.querySelectorAll('[data-role="chip"] text')].map((t) => ({ digit: t.textContent, ink: t.getAttribute('fill') })))

describe('with Low/5/High on the cells and Odd/Even on the digits, in Digit mode', { concurrency: false }, () => {
  let context, p
  before(async () => { ({ context, p } = await openSession(browser, script, { saved: { ...savedProfiles(APART), [MODE_STORAGE_KEY]: 'digit' } })) })
  after(async () => { await context?.close() })

  it('the button shows 1 5 9, the cell profile\'s numbers, all inked in the one color Odd/Even gives them', async () => {
    const seen = await settle(async () => (await chips(p)).map((c) => c.digit), ['1', '5', '9'])
    assert.deepEqual(seen, ['1', '5', '9'])
    assert.equal(new Set((await chips(p)).map((c) => c.ink)).size, 1)
  })
})
