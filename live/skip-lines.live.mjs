// Live check that the shared page helper collects a script's skip line on every page it opens, with no suite seeding it:
// a skip line nobody declared lands in `errors`, so a suite that asserts `errors` is empty fails on it, and one a suite
// declares in `expectedSkips` does not.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'

const SKIP = 'dark-page: settings entry skipped because SudokuPad has no Framework.addSetting'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// Logs `SKIP` from the page the way a script does, then returns what the helper collected.
const plant = async (options) => {
  const { context, p, errors } = await openPage(browser, options)
  try {
    await startPuzzle(p)
    await p.evaluate((line) => console.warn(line), SKIP)
    await p.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)))
    return errors
  } finally {
    await context.close()
  }
}

describe('a skip line on a page opened with no seed', () => {
  it('is collected, so an undeclared one fails a suite that asserts no errors', async () => {
    const errors = await plant()
    assert.deepEqual(errors, [`console.warn: ${SKIP}`])
    assert.throws(() => assert.deepEqual(errors, []), 'the check a suite runs fails')
  })

  it('is left out when the suite declares it', async () => {
    assert.deepEqual(await plant({ expectedSkips: [/^dark-page: settings entry skipped because/] }), [])
  })

  it('is collected when the suite declares a different one', async () => {
    assert.deepEqual(await plant({ expectedSkips: [/^draw-tool: /] }), [`console.warn: ${SKIP}`])
  })
})
