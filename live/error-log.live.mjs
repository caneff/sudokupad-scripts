// Live check of the error log on sudokupad.app in headless Chromium: a feature turned off is recorded in the page's localStorage, the
// record outlives a reload, and Copy error log in a script's settings dialog puts it on the real clipboard; Clear empties it.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ERROR_LOG_KEY as LOG_KEY, gotoPuzzle, openPage, startPuzzle } from './page.mjs'
import { openScriptDialog } from './settings.mjs'
import { scriptSource, useBrowser } from './session.mjs'

const script = scriptSource('dark-page.user.js')
const EDITOR = '#dark-page-input'
const STATUS = '.dialog [data-role="settings-status"]'
const actButton = (p, act) => p.locator(`.dialog button[data-act="${act}"]`)
// Makes Framework.getData throw while the script starts, which is inside the script's saved color feature, so the guard turns it off on a
// real throw, and puts it back once that task ends.
const WITH_THROWING_GET_DATA = ';{ const original = Framework.getData; Framework.getData = () => { throw new TypeError(\'planted failure\') }; setTimeout(() => { Framework.getData = original }, 0) }\n'

const browser = useBrowser()

describe('the error log', { concurrency: false }, () => {
  let context, p, errors
  before(async () => {
    // The skip line is the planted break's own.
    ({ context, p, errors } = await openPage(browser(), { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] }, expectedSkips: [/^dark-page: saved color skipped because SudokuPad changed: TypeError: planted failure/] }))
    await startPuzzle(p, { injection: { mode: 'after-start', code: `${WITH_THROWING_GET_DATA}${script}` } })
  })
  after(async () => { await context?.close() })

  it('records the feature turned off, with the script, both versions and the page', async () => {
    const [record, ...rest] = JSON.parse(await p.evaluate((key) => window.localStorage.getItem(key), LOG_KEY))
    assert.deepEqual(rest, [])
    assert.deepEqual({ script: record.script, feature: record.feature, name: record.name, message: record.message, missing: record.missing }, { script: 'dark-page', feature: 'saved color', name: 'TypeError', message: 'planted failure', missing: undefined })
    assert.match(record.stack, /^TypeError: planted failure\n\s+at /)
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
    assert.match(copied, /dark-page@\d+\.\d+\.\d+ on SudokuPad \d+(\.\d+)+: saved color\n {2}https:\/\/sudokupad\.app\/\S*\n {2}TypeError: planted failure\n {6}at /)
  })

  it('Clear empties the log, and Copy error log then says so', async () => {
    await actButton(p, 'clear-error-log').click()
    await p.locator(STATUS).filter({ hasText: 'Error log cleared.' }).waitFor()
    assert.equal(await p.evaluate((key) => window.localStorage.getItem(key), LOG_KEY), null)
    await actButton(p, 'copy-error-log').click()
    await p.locator(STATUS).filter({ hasText: 'The error log is empty.' }).waitFor()
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
