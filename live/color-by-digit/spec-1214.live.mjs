// Spec #1214's closing check: one session drives the spec's acceptance end to end on real SudokuPad.
// Blind to: a real Tampermonkey install (the script is injected after Start Puzzle) and settings saved by a real older install.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { EDITOR, GIVEN_COUNT, givensColoredOn, labelOn, MENU, MODE_KEY, MODE_WORD_STORAGE_KEY, modeTick, modeTicksOn, menuTicksOn, openEditorOn, openMenuOn, openSession, pressTo, PROFILES_STORAGE_KEY, SEED, SEEDED_OFF, savedProfiles, shadeReaders, tickMenuOn, watch, wordOn, allFillsOn } from './color-by-digit-fixtures.mjs'
import { colorCell, selectCell } from '../board.mjs'
import { closeDialogWith } from '../settings.mjs'
import { settle } from '../settle.mjs'
import { scriptSource, useBrowser } from '../session.mjs'

const script = scriptSource('color-by-digit.user.js')
const { shadeOn } = shadeReaders(createRequire(import.meta.url)('../../color-by-digit.user.js'))
const browser = useBrowser()

describe('spec #1214 end to end: the on/off button, the menu ticks and the dialog checkboxes', { concurrency: false }, () => {
  let context, p, errors
  const cellColors = () => p.evaluate(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).map((c) => [...(c.colours || [])]))
  const savedMode = () => p.evaluate((key) => Framework.getData(key), MODE_KEY)
  let painted

  before(async () => {
    ({ context, p, errors } = await openSession(browser(), script, { saved: SEEDED_OFF }))
  })
  after(async () => { await context.close() })

  it('the solver colors cells by hand (in the active profile\'s groups) with coloring off; the button reads OFF', async () => {
    await selectCell(p, 0, 2); await p.keyboard.press('4')
    assert.equal(await settle(() => p.evaluate(() => String(Framework.app.grid.getCell(0, 2).value)), '4'), '4')
    await colorCell(p, [0, 0], '2')
    await colorCell(p, [0, 2], '2')
    await colorCell(p, [1, 1], '1')
    painted = await cellColors()
    assert.equal(painted.filter((c) => c.length).length, 3)
    assert.equal(await labelOn(p), 'Off')
    assert.equal((await wordOn(p)).trim().toUpperCase(), 'OFF')
  })

  it('in the menu, Digit ticked and Cell unticked while off change nothing on the board, and the menu stays open', async () => {
    await openMenuOn(p)
    assert.deepEqual(await menuTicksOn(p), { cell: true, digit: false })
    await tickMenuOn(p, 'digit', { cell: true, digit: true })
    await tickMenuOn(p, 'cell', { cell: false, digit: true })
    assert.deepEqual(await settle(savedMode, { on: false, cell: false, digit: true }), { on: false, cell: false, digit: true })
    assert.deepEqual(await watch(cellColors), [painted])
  })

  it('the last ticked box refuses to untick in the menu', async () => {
    await p.click(`${MENU} [data-act="tick"][data-box="digit"]`)
    assert.deepEqual(await watch(() => menuTicksOn(p)), [{ cell: false, digit: true }])
    await p.keyboard.press('Escape')
    await p.locator(MENU).waitFor({ state: 'detached' })
  })

  it('a press turns on Digit alone: the digits are shaded, the word reads DIGIT, and every hand color stays', async () => {
    await pressTo(p, 'Digit')
    const shade = await shadeOn(p, '2')
    assert.deepEqual(await settle(allFillsOn(p, 'entered', '4'), [shade]), [shade])
    assert.equal((await wordOn(p)).trim().toUpperCase(), 'DIGIT')
    assert.deepEqual(await watch(cellColors), [painted])
  })

  it('a press turns coloring off and the next brings back the same ticks', async () => {
    await pressTo(p, 'Off')
    assert.deepEqual(await settle(savedMode, { on: false, cell: false, digit: true }), { on: false, cell: false, digit: true })
    await pressTo(p, 'Digit')
    assert.deepEqual(await watch(cellColors), [painted])
  })

  it('ticking Cell in the menu while on colors the grid as one undo step; Undo takes the colors and the tick back', async () => {
    await openMenuOn(p)
    await tickMenuOn(p, 'cell', { cell: true, digit: true })
    assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
    assert.equal(await labelOn(p), 'Both')
    await p.keyboard.press('Escape')
    await p.locator(MENU).waitFor({ state: 'detached' })
    await p.click('#control-undo')
    assert.equal(await settle(() => labelOn(p), 'Digit'), 'Digit')
    assert.deepEqual(await settle(cellColors, painted), painted)
  })

  it('the dialog shows On, Cell and Digit as the mode in force, has no None, refuses the last untick, and Save applies', async () => {
    await openEditorOn(p)
    assert.deepEqual(await modeTicksOn(p), { on: true, cell: false, digit: true })
    const options = await p.$$eval(`${EDITOR} select[data-role=digit-profile] option`, (os) => os.map((o) => o.textContent))
    assert.equal(options.includes('None'), false, JSON.stringify(options))
    await p.locator(modeTick('digit')).click()
    assert.deepEqual(await modeTicksOn(p), { on: true, cell: false, digit: true })
    await p.locator(modeTick('on')).uncheck()
    await closeDialogWith(p, 'Save', EDITOR)
    assert.equal(await settle(() => labelOn(p), 'Off'), 'Off')
    assert.deepEqual(await watch(cellColors), [painted])
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

describe('spec #1214 end to end: an install that saved the mode word Digit with Digit: None', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ({ context, p, errors } = await openSession(browser(), script, { saved: savedProfiles(SEED), force: { [MODE_WORD_STORAGE_KEY]: 'digit', [PROFILES_STORAGE_KEY]: { ...SEED, useDigitColors: false } } }))
  })
  after(async () => { await context.close() })

  it('starts Off with Cell ticked, the board untouched, and a press turns on Cell', async () => {
    assert.equal(await labelOn(p), 'Off')
    assert.deepEqual(await settle(() => p.evaluate((key) => Framework.getData(key), MODE_KEY), { on: false, cell: true, digit: false }), { on: false, cell: true, digit: false })
    assert.deepEqual(await watch(() => givensColoredOn(p)), [0])
    await pressTo(p, 'Cell')
    assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})
