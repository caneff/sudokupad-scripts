import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { openPage, startPuzzle } from './page.mjs'
import { settle } from './settle.mjs'
import { useBrowser } from './session.mjs'

const SKIP = 'dark-page: settings entry skipped because SudokuPad has no Framework.addSetting'
// Logged after `SKIP`. Console messages arrive in order, so once it has landed in `errors`, `SKIP` has been handled.
const MARKER = 'color-by-digit: marker skipped because SudokuPad has no Framework.addSetting'

const browser = useBrowser()

// Logs `SKIP` and then `MARKER` from the page the way a script does, and returns what the helper collected, `MARKER` out.
const plant = async (options) => {
  const { context, p, errors } = await openPage(browser(), options)
  try {
    await startPuzzle(p)
    await p.evaluate(([skip, marker]) => { console.warn(skip); console.warn(marker) }, [SKIP, MARKER])
    await settle(async () => errors.some((e) => e.endsWith(MARKER)), true)
    return errors.filter((e) => !e.endsWith(MARKER))
  } finally {
    await context.close()
  }
}

describe('a skip line on a page opened with no seed', () => {
  it('is collected, so an undeclared one fails a suite that asserts no errors', async () => {
    assert.deepEqual(await plant(), [`console.warn: ${SKIP}`])
  })

  it('is left out when the suite declares it', async () => {
    assert.deepEqual(await plant({ expectedSkips: [/^dark-page: settings entry skipped because/] }), [])
  })

  it('is collected when the suite declares a different one', async () => {
    assert.deepEqual(await plant({ expectedSkips: [/^draw-tool: /] }), [`console.warn: ${SKIP}`])
  })
})
