import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EDITOR } from './color-by-digit/color-by-digit-fixtures.mjs'
import { closeDialogWith, openScriptDialog } from './settings.mjs'
import { stable } from './settle.mjs'
import { openWith, useBrowser } from './session.mjs'

const browser = useBrowser()

describe('openScriptDialog', { concurrency: false }, () => {
  let context, p, errors
  before(async () => {
    ({ context, p, errors } = await openWith(browser(), ['color-by-digit.user.js']))
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
