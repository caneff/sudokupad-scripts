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
    for (const s of scripts) page.say('warning', `${s}: marks skipped because SudokuPad has no grid.rows`)
    page.say('warning', 'pen-tool-extras: marks skipped because SudokuPad changed: TypeError: boom')
    page.say('warning', 'deprecated API in use')
    page.say('warning', 'pen-tool-extras: marks, line erase skipped because SudokuPad has no grid.rows')
    page.say('warning', 'pen-tool-extras: pasted 3 settings, skipped 1')
    page.say('warning', 'draw-tool: could not undo marks')
    assert.equal(errors.length, scripts.length + 2)
    assert.deepEqual(errors.slice(0, 1), ['console.warn: auto-rules-resizer: marks skipped because SudokuPad has no grid.rows'])
  })

  it('leaves out a skip line the caller takes', () => {
    const { page, errors } = collect((text) => /^pen-tool-extras: marks skipped because/.test(text))
    page.say('warning', 'pen-tool-extras: marks skipped because SudokuPad has no grid.rows')
    page.say('warning', 'pen-tool-extras: line erase skipped because SudokuPad has no grid.rows')
    assert.deepEqual(errors, ['console.warn: pen-tool-extras: line erase skipped because SudokuPad has no grid.rows'])
  })
})
