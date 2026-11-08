// Shared by `npm run test:tampermonkey`: a real Tampermonkey in Playwright's Chromium, the way a user installs a
// script (open its URL, click Install). Not a check itself. docs/research/tampermonkey-in-playwright.md has the recipe
// and its caveats.
//
// Tampermonkey is closed-source freeware with no redistribution grant, so its CRX is fetched from Google's update
// endpoint at run time into the live cache, beside the SudokuPad recording, and never committed. A copy older than
// a day is fetched again, so a new Tampermonkey shows up in the nightly run.

import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { harPath, MAX_AGE_MS } from '../cache.mjs'

// Tampermonkey's Chrome Web Store id (its FAQ Q406). An unpacked copy gets another id, derived from its path.
const STORE_ID = 'dhdgffkkebhmkfjojejmpbldmpobfkfo'
// `prodversion` must be at least the extension's `minimum_chrome_version` (120 for 5.5.1).
export const CRX_URL = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140.0.0.0&acceptformat=crx3&x=id%3D${STORE_ID}%26uc`
const FETCH_MS = 60000
// How long Tampermonkey gets to open its install page for a URL before the URL is opened again.
const ASK_MS = 5000
const ASK_TRIES = 6
const PAGE_MS = 30000

const cacheDir = (env, home) => join(dirname(harPath(env, home)), 'tampermonkey')

// The zip inside a CRX3 file: a CRX3 is `Cr24`, version 3 and a header length, all little-endian 32-bit, then
// that many bytes of signed header, then the zip. Throws on anything else, such as an error page.
export function crxZip (bytes) {
  if (bytes.length < 12 || bytes.toString('latin1', 0, 4) !== 'Cr24') throw new Error('not a CRX file: no Cr24 magic')
  const version = bytes.readUInt32LE(4)
  if (version !== 3) throw new Error(`CRX version ${version}, expected 3`)
  const start = 12 + bytes.readUInt32LE(8)
  if (start >= bytes.length) throw new Error('CRX header runs past the end of the file')
  return bytes.subarray(start)
}

// The unpacked Tampermonkey's directory, fetched and unpacked first when it is missing or older than a day.
export async function ensureTampermonkey ({ env = process.env, home = homedir() } = {}) {
  const dir = cacheDir(env, home)
  const unpacked = join(dir, 'extension')
  const stamp = join(dir, 'fetched')
  let fresh = false
  try { fresh = Date.now() - statSync(stamp).mtimeMs <= MAX_AGE_MS } catch (e) { if (e.code !== 'ENOENT') throw e }
  if (fresh) return unpacked
  console.error(`tampermonkey: fetching Tampermonkey into ${unpacked}`)
  const response = await fetch(CRX_URL, { signal: AbortSignal.timeout(FETCH_MS) })
  if (!response.ok) throw new Error(`${CRX_URL} answered ${response.status}`)
  const zip = crxZip(Buffer.from(await response.arrayBuffer()))
  rmSync(unpacked, { recursive: true, force: true })
  mkdirSync(unpacked, { recursive: true })
  const zipFile = join(dir, 'tampermonkey.zip')
  writeFileSync(zipFile, zip)
  try { execFileSync('unzip', ['-q', '-o', zipFile, '-d', unpacked]) } finally { rmSync(zipFile, { force: true }) }
  writeFileSync(stamp, `${JSON.parse(readFileSync(join(unpacked, 'manifest.json'), 'utf8')).version}\n`)
  return unpacked
}

// Serves `files` (a name -> text map) on 127.0.0.1 as text/plain, as raw.githubusercontent.com serves a script.
// Resolves to the base URL and a `close()`.
export async function serveFiles (files) {
  const server = createServer((req, res) => {
    const text = files[decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1))]
    res.writeHead(text === undefined ? 404 : 200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(text ?? 'not found')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  // Tampermonkey keeps its connection open, and `close()` alone waits for every open connection to end.
  const close = () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() })
  return { url: `http://127.0.0.1:${server.address().port}/`, close }
}

// A Chromium with Tampermonkey loaded and allowed to run user scripts, on a fresh profile. Resolves to the
// context, the extension's id and a `close()` that also deletes the profile.
export async function launchTampermonkey () {
  const extension = await ensureTampermonkey()
  const profile = mkdtempSync(join(tmpdir(), 'tampermonkey-profile-'))
  // `channel: 'chromium'` is the new headless: the old headless shell does not load extensions.
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  })
  const close = async () => { await context.close(); rmSync(profile, { recursive: true, force: true }) }
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: PAGE_MS })
    const id = new URL(worker.url()).host
    // From Chrome 138 an extension runs user scripts only with its "Allow User Scripts" toggle on.
    const page = await context.newPage()
    await page.goto('chrome://extensions/')
    await page.evaluate((extensionId) => window.chrome.developerPrivate.updateExtensionConfiguration({ extensionId, userScriptsAccess: true }), id)
    await page.close()
    return { context, id, close }
  } catch (e) {
    await close()
    throw e
  }
}

const isAsk = (id) => (p) => p.url().startsWith(`chrome-extension://${id}/ask.html`)

// Opens `url` the way a user does and clicks the install page's action, its first button. Resolves to that
// button's label: "Install" for a script Tampermonkey does not have, another ("Update", "Reinstall") for one it does.
// Tampermonkey shows no install page for a URL opened while it is still starting, and nothing marks when it is
// ready, so the URL is opened again until the page shows.
export async function installScript ({ context, id }, url) {
  let ask
  for (let i = 0; i < ASK_TRIES && !ask; i++) {
    const shown = context.waitForEvent('page', { predicate: isAsk(id), timeout: ASK_MS }).catch(() => null)
    const opener = await context.newPage()
    // The goto fails when Tampermonkey takes the tab over, which is the expected outcome; the page that matters
    // is the install page, waited for above.
    await opener.goto(url).catch(() => {})
    ask = await shown
    if (!opener.isClosed()) await opener.close()
  }
  if (!ask) throw new Error(`Tampermonkey showed no install page for ${url} in ${ASK_TRIES} tries`)
  const button = ask.locator('input[type=button].install').first()
  await button.waitFor({ state: 'visible', timeout: PAGE_MS })
  const label = await button.getAttribute('value')
  const closed = ask.waitForEvent('close', { timeout: PAGE_MS })
  await button.click()
  await closed
  return label
}

// The dashboard's row for an installed script. Its table also holds a header row and a "<New userscript>" row,
// which have no version.
const INSTALLED_VERSION = 'tr.scripttr td.script_version'

// Every script Tampermonkey's dashboard lists, as `{ name, version }`, once it lists at least one.
export async function installedScripts ({ context, id }) {
  const page = await context.newPage()
  try {
    await page.goto(`chrome-extension://${id}/options.html#nav=dashboard`)
    await page.waitForFunction((sel) => [...document.querySelectorAll(sel)].some((td) => td.textContent.trim()), INSTALLED_VERSION, { timeout: PAGE_MS })
    return await page.locator(INSTALLED_VERSION).evaluateAll((cells) => cells
      .filter((td) => td.textContent.trim())
      .map((td) => ({ name: td.parentElement.querySelector('td.script_name').textContent.trim(), version: td.textContent.trim() })))
  } finally {
    await page.close()
  }
}
