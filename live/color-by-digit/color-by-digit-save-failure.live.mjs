// Live check that Color by Digit's Save is all-or-nothing, on sudokupad.app in headless Chromium: a Save that throws after storing the
// profiles leaves the stored profiles, and the mode as it was (still unsaved), exactly as they were before Save. The throw comes before the mode step, which runs under guards that swallow a throw,
// so the mode restore has no failing step to witness it.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EDITOR, MODE_KEY, openSession, PROFILES_KEY, savedProfiles, SEED } from './color-by-digit-fixtures.mjs'
import { dialogButton, openScriptDialog } from '../settings.mjs'
import { scriptSource, useBrowser } from '../session.mjs'

const script = scriptSource('color-by-digit.user.js')
const ROWS = `${EDITOR} [data-role=profile-row]`

const browser = useBrowser()

describe('Color by Digit\'s Save is all-or-nothing', { concurrency: false }, () => {
  let context, p
  before(async () => {
    ;({ context, p } = await openSession(browser(), script, { saved: savedProfiles(SEED) }))
  })
  after(async () => { await context.close() })

  const stored = (key) => p.evaluate((k) => Framework.getData(k) ?? null, key)

  it('a Save that throws after the profiles were stored leaves the stored profiles as they were, and says Not saved', async () => {
    const before = await stored(PROFILES_KEY)
    const modeBefore = await stored(MODE_KEY)
    // Once the profiles are written, the next JSON.stringify throws, once: the comparison of the old and new groups, which no guard wraps.
    await p.evaluate((key) => {
      const set = Framework.setData
      const stringify = JSON.stringify
      let armed = false
      Framework.setData = (k, v) => {
        const result = set.call(Framework, k, v)
        if (k === key && !armed) {
          armed = true
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
    assert.equal(await stored(MODE_KEY), modeBefore)
    await dialogButton(p, 'Cancel').click()
  })
})
