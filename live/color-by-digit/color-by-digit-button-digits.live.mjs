// Live check that each mode picks the button's digits (#389), on sudokupad.app in headless Chromium: Low/5/High on the
// cells, Odd/Even on the digits. Cell and Off show 1 5 9, Digit 5 4 and Both 1 5 6.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BUTTON, MODE_STORAGE_KEY, SEED, openSession, savedProfiles } from './color-by-digit-fixtures.mjs'
import { settle } from '../settle.mjs'
import { scriptSource, useBrowser } from '../session.mjs'

const script = scriptSource('color-by-digit.user.js')
const APART = { profiles: SEED.profiles, active: 1, digitActive: 0 }

const browser = useBrowser()

const chips = (p) => p.locator(BUTTON).evaluate((button) => [...button.querySelectorAll('[data-role="chip"] text')].map((t) => ({ digit: t.textContent, ink: t.getAttribute('fill') })))

const shownIn = (mode, digits) => describe(`with Low/5/High on the cells and Odd/Even on the digits, in ${mode} mode`, { concurrency: false }, () => {
  let context, p
  before(async () => { ({ context, p } = await openSession(browser(), script, { saved: { ...savedProfiles(APART), [MODE_STORAGE_KEY]: mode } })) })
  after(async () => { await context?.close() })

  it(`the button shows ${digits.join(' ')}`, async () => {
    const seen = await settle(async () => (await chips(p)).map((c) => c.digit), digits)
    assert.deepEqual(seen, digits)
  })
})

shownIn('cell', ['1', '5', '9'])
shownIn('off', ['1', '5', '9'])
shownIn('digit', ['5', '4'])
shownIn('both', ['1', '5', '6'])
