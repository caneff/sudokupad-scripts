import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { addPage, addScripts, installAtIdle, openWith, reloadWith, PUBLISHED_FILES, publishedSource, SCRIPT_FILES, scriptSource } from './session.mjs'

// A browser, context or page that fails the test if anything is asked of it: a guard must refuse before it opens or loads anything.
const untouched = new Proxy({}, { get: (_, name) => () => assert.fail(`${String(name)} was called`) })

describe('PUBLISHED_FILES', () => {
  it('is every script a user installs: SudokuPad\'s, Logic Masters Puzzle Preview, and no handover', () => {
    assert.deepEqual(PUBLISHED_FILES, [...SCRIPT_FILES, 'logic-masters-puzzle-preview.user.js'].sort())
    assert.ok(!PUBLISHED_FILES.includes('draw-tool.user.js'))
  })

  it('reads a published file as it is on disk, and refuses anything else', () => {
    assert.match(publishedSource('logic-masters-puzzle-preview.user.js'), /^\/\/ ==UserScript==/)
    assert.throws(() => publishedSource('package.json'), /no published script package\.json/)
  })
})

describe('scriptSource', () => {
  it('gives a root script as it is on disk', () => {
    assert.match(scriptSource(SCRIPT_FILES[0]), /^\/\/ ==UserScript==/)
  })

  it('refuses a file that is not one of the scripts, naming it', () => {
    assert.throws(() => scriptSource('no-such.user.js'), /no script no-such\.user\.js/)
    assert.throws(() => scriptSource('package.json'), /no script package\.json/)
  })

  it('is what every injection reads a named script with', async () => {
    await assert.rejects(addScripts(untouched, ['typo.user.js']), /no script typo\.user\.js/)
    await assert.rejects(installAtIdle(untouched, ['typo.user.js']), /no script typo\.user\.js/)
  })
})

describe('the injection mode', () => {
  for (const [name, call] of [
    ['openWith', () => openWith(untouched, [], { mode: 'at-noon' })],
    ['addPage', () => addPage(untouched, [], { mode: 'at-noon' })],
    ['reloadWith', () => reloadWith(untouched, [], { mode: 'at-noon' })]
  ]) {
    it(`${name} refuses one that is not a MODE, before it opens or loads a page`, async () => {
      await assert.rejects(call(), /no injection mode at-noon/)
    })
  }
})
