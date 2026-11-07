// Live check of the shared settings helpers (`live/settings.mjs`) on sudokupad.app, in headless Chromium.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { closeDialogWith, openScriptDialog } from './settings.mjs'
import { stable } from './settle.mjs'

const code = readFileSync(new URL('../color-by-digit.user.js', import.meta.url), 'utf8')
const EDITOR = '#color-by-digit-editor'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('openScriptDialog', { concurrency: false }, () => {
  let context, p, errors
  before(async () => {
    ({ context, p, errors } = await openPage(browser))
    await startPuzzle(p, { injection: { mode: 'after-start', code } })
  })
  after(async () => { await context?.close() })

  it('returns with the dialog at rest, where it stays', async () => {
    await openScriptDialog(p, 'Color by Digit', EDITOR)
    const atReturn = await p.locator(EDITOR).boundingBox()
    assert.deepEqual(atReturn, await stable(() => p.locator(EDITOR).boundingBox()))
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
