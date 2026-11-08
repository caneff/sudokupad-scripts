// Live check of the error log on sudokupad.app in headless Chromium: a feature turned off is recorded in the page's localStorage, the
// record outlives a reload, and Copy error log in a script's settings dialog puts it on the real clipboard; Clear empties it.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { gotoPuzzle, openPage, startPuzzle } from './page.mjs'
import { openScriptDialog } from './settings.mjs'

const script = readFileSync(new URL('../dark-page.user.js', import.meta.url), 'utf8')
const LOG_KEY = 'sudokupad-scripts-error-log'
const EDITOR = '#dark-page-input'
const STATUS = '.dialog [data-role="settings-status"]'
const actButton = (p, act) => p.locator(`.dialog button[data-act="${act}"]`)
// Takes Framework.getData away for the script's startup check, which runs as the script loads and turns its saved color off, and puts it back once that task ends.
const WITHOUT_GET_DATA = ';{ const original = Framework.getData; Framework.getData = undefined; setTimeout(() => { Framework.getData = original }, 0) }\n'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('the error log', { concurrency: false }, () => {
  let context, p, errors
  before(async () => {
    // The skip line is the planted break's own.
    ({ context, p, errors } = await openPage(browser, { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] }, expectedSkips: [/^dark-page: saved color skipped because SudokuPad has no Framework\.getData$/] }))
    await startPuzzle(p, { injection: { mode: 'after-start', code: `${WITHOUT_GET_DATA}${script}` } })
  })
  after(async () => { await context?.close() })

  it('records the feature turned off, with the script, both versions and the page', async () => {
    const [record, ...rest] = JSON.parse(await p.evaluate((key) => localStorage.getItem(key), LOG_KEY))
    assert.deepEqual(rest, [])
    assert.deepEqual({ script: record.script, feature: record.feature, missing: record.missing }, { script: 'dark-page', feature: 'saved color', missing: 'Framework.getData' })
    assert.match(record.version, /^\d+\.\d+\.\d+$/)
    assert.match(record.sudokupad, /^\d+(\.\d+)+$/)
    assert.match(record.url, /^https:\/\/sudokupad\.app\//)
  })

  it('after a reload, Copy error log in the settings dialog copies the record', async () => {
    await gotoPuzzle(p)
    await startPuzzle(p, { injection: { mode: 'after-start', code: script } })
    await openScriptDialog(p, 'Dark Page', EDITOR)
    await actButton(p, 'copy-error-log').click()
    await p.locator(STATUS).filter({ hasText: 'Error log copied.' }).waitFor()
    const copied = await p.evaluate(() => navigator.clipboard.readText())
    assert.match(copied, /dark-page@\d+\.\d+\.\d+ on SudokuPad \d+(\.\d+)+: saved color\n {2}https:\/\/sudokupad\.app\/\S*\n {2}SudokuPad has no Framework\.getData/)
  })

  it('Clear empties the log, and Copy error log then says so', async () => {
    await actButton(p, 'clear-error-log').click()
    await p.locator(STATUS).filter({ hasText: 'Error log cleared.' }).waitFor()
    assert.equal(await p.evaluate((key) => localStorage.getItem(key), LOG_KEY), null)
    await actButton(p, 'copy-error-log').click()
    await p.locator(STATUS).filter({ hasText: 'The error log is empty.' }).waitFor()
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
