// Live check that Color by Digit's Save is all-or-nothing, on sudokupad.app in headless Chromium: a Save that throws after storing the
// profiles leaves the stored profiles and mode, and the profiles the button's menu lists, exactly as they were before Save.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { EDITOR, openSession, PROFILES_KEY, savedProfiles, SEED } from './color-by-digit-fixtures.mjs'
import { dialogButton, openScriptDialog } from '../settings.mjs'

const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')
const ROWS = `${EDITOR} [data-role=profile-row]`

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Color by Digit\'s Save is all-or-nothing', { concurrency: false }, () => {
  let context, p
  before(async () => {
    ;({ context, p } = await openSession(browser, script, { saved: savedProfiles(SEED) }))
  })
  after(async () => { await context.close() })

  const stored = (key) => p.evaluate((k) => Framework.getData(k) ?? null, key)

  it('a Save that throws after the profiles were stored leaves the stored profiles as they were, and says Not saved', async () => {
    const before = await stored(PROFILES_KEY)
    // Once the profiles are written, the next JSON.stringify throws, once: the comparison of the old and new groups, which no guard wraps.
    await p.evaluate((key) => {
      const set = Framework.setData
      const stringify = JSON.stringify
      Framework.setData = (k, v) => {
        const result = set.call(Framework, k, v)
        if (k === key) {
          JSON.stringify = (...args) => {
            JSON.stringify = stringify
            throw new Error('groups unreadable')
          }
        }
        return result
      }
    }, PROFILES_KEY)
    await openScriptDialog(p, 'Color by Digit', EDITOR)
    await p.hover(`${ROWS}:nth-child(2)`)
    await p.click(`${ROWS}:nth-child(2) button[data-act=delete]`)
    await dialogButton(p, 'Save').click()
    await p.locator('.dialog [data-role="settings-status"]').filter({ hasText: 'Not saved: groups unreadable' }).waitFor()
    assert.deepEqual(await stored(PROFILES_KEY), before)
    await dialogButton(p, 'Cancel').click()
  })
})
