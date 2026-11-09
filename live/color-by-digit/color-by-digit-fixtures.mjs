// Color by Digit's live fixtures: the board, the saved profiles every session starts with, the storage keys, the
// script's selectors, and the helpers that open a session on that board. Not a check itself, so `live/**/*.live.mjs` skips it.
// The keys are typed out here, not imported from the script (docs/adr/0001-live-tests-type-storage-keys.md).

import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { openPage, startPuzzle } from '../page.mjs'
import { POLL_MS, settle } from '../settle.mjs'

// The puzzle's givens, row by row, 0 for empty. Must match the board built by puzzle-url.txt; the
// 'the board holds the givens' test in color-by-digit.live.mjs checks it.
export const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
export const GIVEN_COUNT = [...GIVENS].filter((d) => d !== '0').length

export const group = (key, digits) => ({ key, digits })
export const ODD_EVEN = [group('1', ['1', '3', '5', '7', '9']), group('2', ['0', '2', '4', '6', '8'])]
export const LOW_FIVE_HIGH = [group('1', ['0', '1', '2', '3', '4']), group('5', ['5']), group('9', ['6', '7', '8', '9'])]

// The fresh install and the migration are checked in color-by-digit-profiles.live.mjs.
export const SEED = { profiles: [{ name: 'Odd/Even', groups: ODD_EVEN }, { name: 'Low/5/High', groups: LOW_FIVE_HIGH }], active: 0 }

// The keys the script saves under, and the ones Framework.setData stores them at (the site's own prefix in front).
const storedAt = (key) => `svencodes_${key}`
export const PROFILES_KEY = 'ColorByDigit_profiles'
export const PROFILES_STORAGE_KEY = storedAt(PROFILES_KEY)
export const LEGACY_STORAGE_KEY = storedAt('ColorByDigit_groups')
export const ADDED_PRELOADS_STORAGE_KEY = storedAt('ColorByDigit_addedPreloads')
const ADDED_EACH_DIGIT_STORAGE_KEY = storedAt('ColorByDigit_addedEachDigit')
// Saved profiles with the one-time adds (Entropic and Modular, then Each digit) already done, so a test sees exactly the profiles it seeded.
export const savedProfiles = (state) => ({ [PROFILES_STORAGE_KEY]: state, [ADDED_PRELOADS_STORAGE_KEY]: true, [ADDED_EACH_DIGIT_STORAGE_KEY]: true })
// The profiles as the script reads them back: the state inside the `{ v, data }` envelope it saves, or one seeded in the shape saved
// before the envelope.
export const savedState = (saved) => (saved !== null && Object.hasOwn(saved, 'data') ? saved.data : saved)
export const MODE_KEY = 'ColorByDigit_mode'
export const MODE_STORAGE_KEY = storedAt(MODE_KEY)
// Auto mode's on/off from before the mode existed, read for the starting mode when no mode is saved.
export const AUTO_KEY = 'ColorByDigit_auto'
export const AUTO_STORAGE_KEY = storedAt(AUTO_KEY)
// The mode's value on an untouched board: SEED's profiles with the mode saved Off, so nothing is colored until a test says so.
export const SEEDED_OFF = { ...savedProfiles(SEED), [MODE_STORAGE_KEY]: 'off' }

export const BUTTON = '#control-colorbydigit'
export const EDITOR = '#color-by-digit-editor'
export const ARROW = `${BUTTON} [data-role="menu"]`
export const MENU = '#color-by-digit-menu'

// '' for a digit in no group.
export const paintedKeys = (p) => p.$$eval(`${EDITOR} button[data-act=digit]`, (es) => Object.fromEntries(es.map((e) => [e.dataset.digit, e.dataset.key])))

export async function groupCountOn (p) {
  return new Set(Object.values(await paintedKeys(p)).filter(Boolean)).size
}

// How long a "nothing happened" check watches. A fixed sleep is correct only here.
const QUIET_MS = 500

export async function watch (read) {
  const seen = [JSON.stringify(await read())]
  const deadline = Date.now() + QUIET_MS
  while (Date.now() < deadline) {
    await sleep(POLL_MS)
    const now = JSON.stringify(await read())
    if (now !== seen[seen.length - 1]) seen.push(now)
  }
  return seen.map((s) => JSON.parse(s))
}

// Runs the loaded page through the script's injection time for `mode` (document-idle is already set up by `openSession`)
// and Start Puzzle, and returns once the script's button shows.
// A script without the button (`buttonExpected` false: SudokuPad lacks what adds it) waits for nothing of its own.
export async function startInjected (p, script, mode = 'after-start', buttonExpected = true) {
  await startPuzzle(p, {
    injection: { mode, code: script },
    beforeStart: mode === 'before-start' && buttonExpected ? () => p.locator(BUTTON).waitFor({ state: 'attached' }) : undefined
  })
  if (buttonExpected) await p.locator(BUTTON).waitFor({ state: 'visible' })
}

// A page with `script` injected at `mode`. `saved` maps a localStorage key to a JSON value, written before the page's own
// scripts run and only while the key is absent, so a reload keeps what was saved. `force` is written every load.
// With neither, the page starts with SEED saved as the profiles and the mode saved Off.
export async function openSession (browser, script, { saved = SEEDED_OFF, force = {}, contextOptions = {}, mode = 'after-start', buttonExpected = true, seed = async () => {}, expectedSkips } = {}) {
  const entries = (object) => Object.entries(object).map(([key, value]) => [key, JSON.stringify(value)])
  const opened = await openPage(browser, {
    contextOptions,
    expectedSkips,
    injection: { mode, code: script },
    seed: async (page) => {
      await seed(page)
      await page.addInitScript((list) => {
        list.forEach(([key, value]) => { if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value) })
      }, entries(saved))
      await page.addInitScript((list) => list.forEach(([key, value]) => window.localStorage.setItem(key, value)), entries(force))
    }
  })
  await startInjected(opened.p, script, mode, buttonExpected)
  return opened
}

const LABEL_PREFIX = 'Color by digit: '
export const modeLabel = (mode) => `${LABEL_PREFIX}${mode}`
export const labelOn = async (p) => {
  const label = await p.locator(BUTTON).getAttribute('aria-label')
  return label?.startsWith(LABEL_PREFIX) ? label.slice(LABEL_PREFIX.length) : label
}

export const wordOn = (p) => p.locator(`${BUTTON} [data-role="mode"]`).textContent()
export const buttonBoxesOn = (p) => p.locator(BUTTON).evaluate((button) => {
  const box = (selector) => { const r = button.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }
  return { word: box('[data-role="mode"]'), chips: box('svg[data-role="chips"]'), arrow: box('[data-role="menu"]') }
})

export const center = async (locator) => { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }

// A profile row's top-left corner in the dialog, clear of its drag handle.
export const ROW_CORNER = { position: { x: 2, y: 2 } }

export const chipLookOn = (p) => p.locator(`${BUTTON} svg[data-role="chips"]`).evaluate((run) => ({
  cells: [...run.querySelectorAll('[data-role="chip"]')].map((g) => [window.getComputedStyle(g.querySelector('rect')).fill, window.getComputedStyle(g.querySelector('text')).fill]),
  outline: window.getComputedStyle(run.querySelector(':scope > rect[fill="none"]')).stroke
}))

// Where every press on the button lands: on the button proper, left of and above the arrow box.
export async function buttonPoint (p) {
  const box = await p.locator(BUTTON).boundingBox()
  return { x: box.x + box.width * 0.3, y: box.y + box.height * 0.6 }
}

// A short press on the button, which steps the mode to `want`.
export async function pressTo (p, want) {
  const { x, y } = await buttonPoint(p)
  await p.mouse.click(x, y)
  assert.equal(await settle(() => labelOn(p), want), want)
}

export const coloredCountOn = (p) => p.evaluate(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).filter((c) => (c.colours || []).length).length)
export const givensColoredOn = (p) => p.evaluate(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).filter((c) => c.given && (c.colours || []).length).length)

// Toggles palette key `key` on the cell at row r, column c, as a solver's color tool does: one SudokuPad action.
export const paintOn = (p, r, c, key) => p.evaluate(([r, c, key]) => {
  const a = Framework.app
  a.deselect(); a.select(a.grid.getCell(r, c)); a.act({ type: 'colour', arg: key }); a.deselect()
}, [r, c, key])

// SudokuPad's own color for an entered digit or a mark, read off the page with no script installed.
export const DEFAULT_FILL = 'rgb(29, 106, 229)'

const rgbOf = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

export const paletteColorOn = (p, key) => p.evaluate((key) => {
  const probe = document.createElement('span')
  probe.style.color = window.getComputedStyle(document.documentElement).getPropertyValue(`--cell-color-${key}`).trim()
  document.body.appendChild(probe)
  const color = window.getComputedStyle(probe).color
  probe.remove()
  return color
}, key)
// The shade a digit of a group on a color shows (`shadeOf`), and on palette key `key` (`shadeOn`). The shade's math is the
// unit tests'; the caller passes the script's own `darkenColor` and `parseColor`, since these fixtures import nothing
// from the script (ADR 0001).
export function shadeReaders ({ darkenColor, parseColor }) {
  const shadeOf = (color) => rgbOf(darkenColor(parseColor(color)))
  return { shadeOf, shadeOn: async (p, key) => shadeOf(await paletteColorOn(p, key)) }
}

// `conflict` picks marks in SudokuPad's conflict state; entered digits never get one.
export const styleOn = (p, property, place, digit, conflict = false) => p.evaluate(([property, place, digit, conflict]) => {
  const sel = {
    given: '#cell-givens text.cell-given',
    entered: '#cell-values text.cell-value',
    corner: '#cell-pencilmarks text.cell-pencilmark',
    centre: '#cell-candidates tspan'
  }[place]
  return [...document.querySelectorAll(sel)]
    .filter((e) => (place === 'given' || place === 'entered' ? e.textContent.trim() : e.dataset.val) === digit)
    .filter((e) => e.classList.contains('conflict') === conflict)
    .map((e) => window.getComputedStyle(e)[property])
}, [property, place, digit, conflict])
export const allFillsOn = (p, place, digit, conflict) => async () => [...new Set(await styleOn(p, 'fill', place, digit, conflict))]

export const PROFILE_ROWS = `${EDITOR} [data-role=profile-row]`
export const PROFILE_NAME_FIELD = `${EDITOR} [data-role=profile-name]`
// How far past a row's middle a drag ends to land beyond it.
export const DROP_PAST_MIDDLE_PX = 8

// A row's × shows only while its row is hovered or selected, so the pointer goes onto the row first.
export const deleteProfileRow = async (p, n) => {
  await p.hover(`${PROFILE_ROWS}:nth-child(${n})`, ROW_CORNER)
  await p.click(`${PROFILE_ROWS}:nth-child(${n}) button[data-act=delete]`)
}

export const keyOf = (groups, digit) => (groups.find((g) => g.digits.includes(String(digit))) || {}).key

const cellsStateOn = (p) => p.evaluate(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).map((c) => ({ r: c.row, c: c.col, given: c.given, value: c.value, colours: [...(c.colours || [])] })))

// How many cells hold a color other than their digit's group color in `groups`: a given or an entered digit takes its group's key, an empty cell none.
export async function wrongCountOn (p, groups) {
  return (await cellsStateOn(p)).filter((x) => {
    const digit = String(x.given || x.value || '')
    return JSON.stringify(x.colours) !== JSON.stringify(digit === '' ? [] : [keyOf(groups, digit)])
  }).length
}

export const selectCell = (p, r, c) => p.evaluate(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [r, c])

export async function dragProfileRow (p, from, to) {
  await p.locator(PROFILE_ROWS).first().scrollIntoViewIfNeeded()
  const start = await center(p.locator(`${PROFILE_ROWS} [data-role=handle]`).nth(from))
  const end = await center(p.locator(PROFILE_ROWS).nth(to))
  end.y += to > from ? DROP_PAST_MIDDLE_PX : -DROP_PAST_MIDDLE_PX
  await p.mouse.move(start.x, start.y)
  await p.mouse.down()
  await p.mouse.move(start.x, (start.y + end.y) / 2, { steps: 4 })
  await p.mouse.move(start.x, end.y, { steps: 4 })
  await p.mouse.up()
}

// Types `text` over the selected profile's name with real key presses (an empty `text` deletes it): SudokuPad listens for keys on the page, and a digit or letter must reach the field.
export async function typeProfileName (p, text) {
  await p.locator(PROFILE_NAME_FIELD).press('Control+a')
  if (text === '') await p.locator(PROFILE_NAME_FIELD).press('Backspace')
  else await p.locator(PROFILE_NAME_FIELD).pressSequentially(text)
}
