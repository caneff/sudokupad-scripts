// `npm run test:tampermonkey`: installs every *.user.js into a real Tampermonkey, main's copy and then the checkout's
// over it as an update, and checks each one runs on SudokuPad. live/README.md § The Tampermonkey test is the full rule.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { headerVersion } from '../../test/header-version.js'
import { RAW } from '../../tag-pictures.js'
import { newPage, gotoPuzzle, startPuzzle } from '../page.mjs'
import { SCRIPTS } from '../scripts.mjs'
import { installedScripts, installScript, launchTampermonkey, serveFiles } from './tampermonkey.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const source = (file) => readFileSync(new URL(file, `file://${ROOT}`), 'utf8')
const headerName = (text) => /^\/\/ @name\s+(.+?)\s*$/m.exec(text)?.[1]

const FILES = readdirSync(ROOT).filter((f) => f.endsWith('.user.js')).sort()

it('every *.user.js has a check that it ran', () => {
  assert.deepEqual(SCRIPTS.map((s) => s.file).sort(), FILES)
})

describe('Tampermonkey', { concurrency: false }, () => {
  let tm, served

  before(async () => {
    tm = await launchTampermonkey()
    served = await serveFiles(Object.fromEntries(FILES.map((f) => [f, source(f)])))
  })
  after(async () => {
    await served?.close()
    await tm?.close()
  })

  for (const file of FILES) {
    it(`${file}: main's copy installs, and the checkout's installs over it as an update; with no copy on main, the checkout's installs fresh`, async () => {
      const main = await fetch(RAW + file, { method: 'HEAD' })
      // A script this branch adds has no copy on main: its first install is the checkout's own.
      if (main.status === 404) {
        assert.equal(await installScript(tm, served.url + file), 'Install', 'Tampermonkey did not offer the checkout\'s copy as a new script')
        return
      }
      assert.equal(main.ok, true, `${RAW + file} answered ${main.status}`)
      assert.equal(await installScript(tm, RAW + file), 'Install')
      assert.notEqual(await installScript(tm, served.url + file), 'Install', 'Tampermonkey offered the checkout\'s copy as a new script, not an update of main\'s')
    })
  }

  it('the dashboard lists each script once, at the checkout\'s @version', async () => {
    const byName = (a, b) => a.name.localeCompare(b.name)
    const expected = FILES.map((f) => ({ name: headerName(source(f)), version: headerVersion(source(f)) })).sort(byName)
    assert.deepEqual((await installedScripts(tm)).sort(byName), expected)
  })

  // Each on its own puzzle page, with all of them installed, as a player has them: it starts and its action works.
  for (const script of SCRIPTS) {
    it(`${script.file} runs on the puzzle page`, async () => {
      const { p, errors } = await newPage(tm.context)
      try {
        await gotoPuzzle(p)
        await startPuzzle(p)
        await script.ready(p)
        await script.act(p)
        assert.deepEqual(errors, [], 'the page raised no error')
      } finally {
        await p.close()
      }
    })
  }
})
