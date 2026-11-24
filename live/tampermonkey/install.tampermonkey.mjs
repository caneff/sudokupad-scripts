import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { headerField, headerVersion } from '../../userscript-header.js'
import { RAW } from '../../tag-pictures.js'
import { CANEFF_RAW } from '../../sync-lib.js'
import { newPage, gotoPuzzle, startPuzzle } from '../page.mjs'
import { SCRIPTS } from '../scripts.mjs'
import { PUBLISHED_FILES, publishedSource, SCRIPT_FILES, scriptSource } from '../session.mjs'
import { settle } from '../settle.mjs'
import { checkForUpdate, installedScripts, installScript, launchTampermonkey, serveFiles } from './tampermonkey.mjs'

const readFile = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
// Text Anywhere's old address, kept as a frozen handover (sync-lib.js's HANDOVERS), and its new one.
const OLD_FILE = 'draw-tool.user.js'
const NEW_FILE = 'text-anywhere.user.js'
// The last copy main served from the old address, before the move (#711).
const LAST_OLD_COPY = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/fa98fe11d52325f58eac8fe72ce5fd609c1c6f23/draw-tool.user.js'
const UPDATE_MS = 30000
// Whether git shows the file on main: only a file that is not there may answer 404 at RAW, so a wrong RAW address cannot pass every file as a fresh install.
// Only git's own "path does not exist in 'origin/main'" answers no; no git, no origin/main or any other failure throws and fails the test.
const REPO = fileURLToPath(new URL('../..', import.meta.url))
const onMain = (file) => {
  try {
    execFileSync('git', ['cat-file', '-e', `origin/main:${file}`], { cwd: REPO, stdio: 'pipe' })
    return true
  } catch (e) {
    if (e.status === 128 && /does not exist in 'origin\/main'/.test(String(e.stderr))) return false
    throw new Error(`could not ask git whether origin/main has ${file}: ${e.message}`)
  }
}
const updated = []

it('every SudokuPad script has a check that it ran', () => {
  assert.deepEqual(SCRIPTS.map((s) => s.file).sort(), SCRIPT_FILES)
})

describe('Tampermonkey', { concurrency: false }, () => {
  let tm, served

  before(async () => {
    tm = await launchTampermonkey()
    served = await serveFiles(Object.fromEntries(PUBLISHED_FILES.map((f) => [f, publishedSource(f)])))
  })
  after(async () => {
    await served?.close()
    await tm?.close()
  })

  for (const file of PUBLISHED_FILES) {
    it(`${file}: main's copy installs, and the checkout's installs over it as an update; with no copy on main, the checkout's installs fresh`, async () => {
      const main = await fetch(RAW + file, { method: 'HEAD' })
      // A script this branch adds has no copy on main: its first install is the checkout's own.
      const there = main.status === 404 ? onMain(file) : undefined
      if (main.status === 404 && !there) {
        assert.equal(await installScript(tm, served.url + file), 'Install', 'Tampermonkey did not offer the checkout\'s copy as a new script')
        return
      }
      assert.equal(main.ok, true, `${RAW + file} answered ${main.status}${there ? ', and git shows the file on main' : ''}`)
      assert.equal(await installScript(tm, RAW + file), 'Install')
      assert.notEqual(await installScript(tm, served.url + file), 'Install', 'Tampermonkey offered the checkout\'s copy as a new script, not an update of main\'s')
      updated.push(file)
    })
  }

  it('at least one script took the update path', () => {
    assert.notEqual(updated.length, 0, 'every file answered 404 at RAW: the update path ran for none')
  })

  it('the dashboard lists each script once, at the checkout\'s @version', async () => {
    const byName = (a, b) => a.name.localeCompare(b.name)
    const expected = PUBLISHED_FILES.map((f) => ({ name: headerField(publishedSource(f), 'name'), version: headerVersion(publishedSource(f)) })).sort(byName)
    assert.deepEqual((await installedScripts(tm)).sort(byName), expected)
  })

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
    assert.equal(headerField(old, 'updateURL'), CANEFF_RAW + OLD_FILE, 'the old copy updates from the old address')
    const files = {}
    served = await serveFiles(files)
    const local = (text) => text.replaceAll(CANEFF_RAW, served.url).replaceAll(RAW, served.url)
    Object.assign(files, { [`old/${OLD_FILE}`]: local(old), [OLD_FILE]: local(readFile(OLD_FILE)), [NEW_FILE]: local(scriptSource(NEW_FILE)) })
    tm = await launchTampermonkey()
    const name = headerField(old, 'name')
    const installed = (version) => settle(() => installedScripts(tm), [{ name, version }], UPDATE_MS, Infinity)

    assert.equal(await installScript(tm, served.url + `old/${OLD_FILE}`), 'Install')
    assert.deepEqual(await installed(headerVersion(old)), [{ name, version: headerVersion(old) }])
    await checkForUpdate(tm)
    assert.deepEqual(await installed(headerVersion(files[OLD_FILE])), [{ name, version: headerVersion(files[OLD_FILE]) }], 'the old copy updated to the handover')
    await checkForUpdate(tm)
    assert.deepEqual(await installed(headerVersion(files[NEW_FILE])), [{ name, version: headerVersion(files[NEW_FILE]) }], `the handover updated from ${NEW_FILE}`)
  })
})
