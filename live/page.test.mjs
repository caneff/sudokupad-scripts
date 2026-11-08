// `captureConsoleErrors` of the live checks, run against a fake page so no browser is needed.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { captureConsoleErrors } from './page.mjs'

// A page whose `console` listener is fed messages by the test.
const fakePage = () => {
  let listener
  return { on: (event, fn) => { if (event === 'console') listener = fn }, say: (type, text) => listener({ type: () => type, text: () => text }) }
}
const collect = (take) => {
  const page = fakePage()
  const errors = []
  captureConsoleErrors(page, errors, take)
  return { page, errors }
}

describe('captureConsoleErrors', () => {
  it('collects a console.error line and leaves out a failed resource', () => {
    const { page, errors } = collect()
    page.say('error', 'boom')
    page.say('error', 'Failed to load resource: net::ERR_FAILED')
    assert.deepEqual(errors, ['console.error: boom'])
  })

  it('collects the skip line of each of the six scripts and not an unrelated console.warn', () => {
    const { page, errors } = collect()
    const scripts = ['auto-rules-resizer', 'color-by-digit', 'dark-page', 'draw-tool', 'no-tab-letters', 'pen-tool-extras']
    for (const s of scripts) page.say('warning', `${s}: marks skipped: SudokuPad has no grid.rows`)
    page.say('warning', 'pen-tool-extras: marks skipped: SudokuPad changed: TypeError: boom')
    page.say('warning', 'deprecated API in use')
    page.say('warning', 'draw-tool: pasted 3 settings, skipped 1')
    assert.equal(errors.length, scripts.length + 1)
    assert.deepEqual(errors.slice(0, 1), ['console.warn: auto-rules-resizer: marks skipped: SudokuPad has no grid.rows'])
  })

  it('leaves out a skip line the caller takes', () => {
    const { page, errors } = collect((text) => /^pen-tool-extras: marks skipped:/.test(text))
    page.say('warning', 'pen-tool-extras: marks skipped: SudokuPad has no grid.rows')
    page.say('warning', 'pen-tool-extras: line erase skipped: SudokuPad has no grid.rows')
    assert.deepEqual(errors, ['console.warn: pen-tool-extras: line erase skipped: SudokuPad has no grid.rows'])
  })
})
