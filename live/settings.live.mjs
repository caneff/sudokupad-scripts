// Live check of the shared settings helpers (`live/settings.mjs`) on sudokupad.app, in headless Chromium.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { openPage, startPuzzle } from './page.mjs'
import { closeDialogWith, openScriptDialog } from './settings.mjs'
import { stable } from './settle.mjs'
import { scriptSource, useBrowser } from './session.mjs'

const code = scriptSource('color-by-digit.user.js')
const EDITOR = '#color-by-digit-editor'

const browser = useBrowser()

describe('openScriptDialog', { concurrency: false }, () => {
  let context, p, errors
  before(async () => {
    ({ context, p, errors } = await openPage(browser()))
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
