// `npm run test:tampermonkey`: installs every *.user.js into a real Tampermonkey in Playwright's Chromium, as a user
// does, and checks each one runs on SudokuPad. Each script's copy on main is installed first, from the address every
// installed copy updates from, and then the checkout's copy over it: Tampermonkey must offer that as an update, and
// list each script once. A changed `@name` or `@namespace` shows as a second install. The puzzle page is the live
// harness's recording; the install needs tampermonkey.net and raw.githubusercontent.com.
// Not covered: the Chrome Web Store install, the browser's own prompts, and Tampermonkey's scheduled update check.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { headerVersion } from '../../test/header-version.js'
import { RAW } from '../../tag-pictures.js'
import { newPage, gotoPuzzle, startPuzzle } from '../page.mjs'
import { keydownDefaults } from '../pen.mjs'
import { settle } from '../settle.mjs'
import { installedScripts, installScript, launchTampermonkey, serveFiles } from './tampermonkey.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const source = (file) => readFileSync(new URL(file, `file://${ROOT}`), 'utf8')
const headerName = (text) => /^\/\/ @name\s+(.+?)\s*$/m.exec(text)?.[1]

const DIGITS = '1234567890'
const LETTER_MODE_KEY = 'ToolLetter_letterMode'
const LETTER_TOGGLE = 'button[data-control="toggleletter"]'

// Per script: what shows it ran on the puzzle page, after Start Puzzle.
const RAN = {
  'auto-rules-resizer.user.js': (p) => p.locator('style#auto-rules-resizer-style').waitFor({ state: 'attached' }),
  'color-by-digit.user.js': (p) => p.locator('#control-colorbydigit').waitFor({ state: 'attached' }),
  'dark-page.user.js': (p) => p.locator('style#dark-page-style').waitFor({ state: 'attached' }),
  'draw-tool.user.js': (p) => p.locator('#control-draw').waitFor({ state: 'attached' }),
  // It adds nothing to the page: with the letter tool on, Tab leaves the number pad on digits and saves no letter mode.
  'no-tab-letters.user.js': async (p) => {
    await p.evaluate(() => Framework.setSetting('toolletter', true))
    await p.locator(LETTER_TOGGLE).waitFor({ state: 'attached' })
    await keydownDefaults(p, 'Tab')
    const pad = () => p.evaluate(() => [...document.querySelectorAll('.controls-buttons .digit')].map((d) => d.textContent).join(''))
    assert.equal(await settle(pad, DIGITS), DIGITS, 'the number pad stayed on digits')
    assert.equal(await p.evaluate((key) => Framework.getData(key), LETTER_MODE_KEY), null, 'no letter mode was saved')
  },
  'pen-tool-extras.user.js': (p) => p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
}

const FILES = readdirSync(ROOT).filter((f) => f.endsWith('.user.js')).sort()

it('every *.user.js has a check that it ran', () => {
  assert.deepEqual(Object.keys(RAN).sort(), FILES)
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
    it(`${file}: main's copy installs, and the checkout's installs over it as an update`, async (t) => {
      const main = await fetch(RAW + file, { method: 'HEAD' })
      if (main.status === 404) {
        t.skip('not on main yet')
      } else {
        assert.equal(main.ok, true, `${RAW + file} answered ${main.status}`)
        assert.equal(await installScript(tm, RAW + file), 'Install')
      }
      const label = await installScript(tm, served.url + file)
      if (main.ok) assert.notEqual(label, 'Install', 'Tampermonkey offered the checkout\'s copy as a new script, not an update of main\'s')
    })
  }

  it('the dashboard lists each script once, at the checkout\'s @version', async () => {
    const byName = (a, b) => a.name.localeCompare(b.name)
    const expected = FILES.map((f) => ({ name: headerName(source(f)), version: headerVersion(source(f)) })).sort(byName)
    assert.deepEqual((await installedScripts(tm)).sort(byName), expected)
  })

  describe('on the puzzle page', { concurrency: false }, () => {
    let p, errors

    before(async () => {
      ;({ p, errors } = await newPage(tm.context))
      await gotoPuzzle(p)
      await startPuzzle(p)
    })

    for (const file of FILES) {
      it(`${file} ran`, async () => {
        await RAN[file](p)
      })
    }

    it('the page raised no error', () => {
      assert.deepEqual(errors, [])
    })
  })
})
