// `npm run test:tampermonkey`: installs every script into a real Tampermonkey, main's copy and then the checkout's
// over it as an update, and checks each one runs on SudokuPad. Then it follows Text Anywhere's move from its old
// address in a Tampermonkey of its own. live/README.md § The Tampermonkey test is the full rule.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { headerVersion } from '../../test/header-version.js'
import { RAW } from '../../tag-pictures.js'
import { newPage, gotoPuzzle, startPuzzle } from '../page.mjs'
import { SCRIPTS } from '../scripts.mjs'
import { SCRIPT_FILES, scriptSource } from '../session.mjs'
import { settle } from '../settle.mjs'
import { checkForUpdate, installedScripts, installScript, launchTampermonkey, serveFiles } from './tampermonkey.mjs'

const headerName = (text) => /^\/\/ @name\s+(.+?)\s*$/m.exec(text)?.[1]
const headerUpdateUrl = (text) => /^\/\/ @updateURL\s+(.+?)\s*$/m.exec(text)?.[1]
const readFile = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
// Text Anywhere's old address, kept as a frozen handover (sync-lib.js's HANDOVERS), and its new one.
const OLD_FILE = 'draw-tool.user.js'
const NEW_FILE = 'text-anywhere.user.js'
// The last copy main served from the old address, before the move (#711).
const LAST_OLD_COPY = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/fa98fe11d52325f58eac8fe72ce5fd609c1c6f23/draw-tool.user.js'
const UPDATE_MS = 30000

it('every *.user.js has a check that it ran', () => {
  assert.deepEqual(SCRIPTS.map((s) => s.file).sort(), SCRIPT_FILES)
})

describe('Tampermonkey', { concurrency: false }, () => {
  let tm, served

  before(async () => {
    tm = await launchTampermonkey()
    served = await serveFiles(Object.fromEntries(SCRIPT_FILES.map((f) => [f, scriptSource(f)])))
  })
  after(async () => {
    await served?.close()
    await tm?.close()
  })

  for (const file of SCRIPT_FILES) {
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
    const expected = SCRIPT_FILES.map((f) => ({ name: headerName(scriptSource(f)), version: headerVersion(scriptSource(f)) })).sort(byName)
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

// Text Anywhere moved its address (#711): the copy a user installed from draw-tool.user.js updates to the frozen handover there,
// whose header names text-anywhere.user.js, and then to the checkout's text-anywhere.user.js, in one install. Every copy is
// served from 127.0.0.1 with its header's raw GitHub addresses pointed there, so each update fetches the checkout's file of
// that name; test/text-anywhere.test.js holds the handover's own addresses to raw GitHub.
describe(`${OLD_FILE} hands over to ${NEW_FILE}`, { concurrency: false }, () => {
  let tm, served

  after(async () => {
    await served?.close()
    await tm?.close()
  })

  it(`a copy installed from ${OLD_FILE} updates to the handover there, then to the checkout's ${NEW_FILE}`, async () => {
    const response = await fetch(LAST_OLD_COPY)
    assert.equal(response.ok, true, `${LAST_OLD_COPY} answered ${response.status}`)
    const old = await response.text()
    assert.equal(headerUpdateUrl(old), RAW + OLD_FILE, 'the old copy updates from the old address')
    const files = {}
    served = await serveFiles(files)
    const local = (text) => text.split(RAW).join(served.url)
    Object.assign(files, { [`old/${OLD_FILE}`]: local(old), [OLD_FILE]: local(readFile(OLD_FILE)), [NEW_FILE]: local(scriptSource(NEW_FILE)) })
    tm = await launchTampermonkey()
    const name = headerName(old)
    const installed = (version) => settle(() => installedScripts(tm), [{ name, version }], UPDATE_MS, Infinity)

    assert.equal(await installScript(tm, served.url + `old/${OLD_FILE}`), 'Install')
    assert.deepEqual(await installed(headerVersion(old)), [{ name, version: headerVersion(old) }])
    await checkForUpdate(tm)
    assert.deepEqual(await installed(headerVersion(files[OLD_FILE])), [{ name, version: headerVersion(files[OLD_FILE]) }], 'the old copy updated to the handover')
    await checkForUpdate(tm)
    assert.deepEqual(await installed(headerVersion(files[NEW_FILE])), [{ name, version: headerVersion(files[NEW_FILE]) }], `the handover updated from ${NEW_FILE}`)
  })
})
