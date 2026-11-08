// `captureConsoleErrors` and `collectSkipLines` of the live checks, run against a fake page so no browser is needed.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { captureConsoleErrors, collectSkipLines } from './page.mjs'

// A page whose `console` listener is fed messages by the test.
const fakePage = () => {
  let listener
  return { on: (event, fn) => { if (event === 'console') listener = fn }, say: (type, text) => listener({ type: () => type, text: () => text }) }
}
const collect = (attach) => {
  const page = fakePage()
  const errors = []
  attach(page, errors)
  return { page, errors }
}

describe('captureConsoleErrors', () => {
  it('collects a console.error line, leaves out a failed resource, and leaves a skip line to collectSkipLines', () => {
    const { page, errors } = collect(captureConsoleErrors)
    page.say('error', 'boom')
    page.say('error', 'Failed to load resource: net::ERR_FAILED')
    page.say('warning', 'dark-page: settings entry skipped because SudokuPad has no Framework.addSetting')
    assert.deepEqual(errors, ['console.error: boom'])
  })
})

describe('collectSkipLines', () => {
  it('collects the skip line of each of the six scripts and nothing else', () => {
    const { page, errors } = collect(collectSkipLines)
    const scripts = ['auto-rules-resizer', 'color-by-digit', 'dark-page', 'draw-tool', 'no-tab-letters', 'pen-tool-extras']
    const skips = scripts.map((s) => `${s}: marks skipped because SudokuPad has no grid.rows`)
    skips.push('pen-tool-extras: marks, line erase skipped because SudokuPad changed: TypeError: boom')
    for (const line of skips) page.say('warning', line)
    for (const line of ['deprecated API in use', 'pen-tool-extras: pasted 3 settings, skipped 1', 'draw-tool: could not undo marks',
      'other-script: marks skipped because SudokuPad has no grid.rows', 'pen-tool-extras: marks skipped: SudokuPad has no grid.rows']) page.say('warning', line)
    assert.deepEqual(errors, skips.map((line) => `console.warn: ${line}`))
  })

  it('collects a skip line of any console type', () => {
    const { page, errors } = collect(collectSkipLines)
    page.say('log', 'draw-tool: marks skipped because SudokuPad has no grid.rows')
    assert.deepEqual(errors, ['console.log: draw-tool: marks skipped because SudokuPad has no grid.rows'])
  })

  it('leaves out a skip line a declared pattern matches and collects the rest', () => {
    const { page, errors } = collect((pg, errs) => collectSkipLines(pg, errs, [/^pen-tool-extras: marks skipped because/]))
    page.say('warning', 'pen-tool-extras: marks skipped because SudokuPad has no grid.rows')
    page.say('warning', 'pen-tool-extras: line erase skipped because SudokuPad has no grid.rows')
    assert.deepEqual(errors, ['console.warn: pen-tool-extras: line erase skipped because SudokuPad has no grid.rows'])
  })
})
