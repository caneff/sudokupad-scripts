// Live check of the options dialog of ui-tweaks.user.js on sudokupad.app, in headless Chromium: each option on and off, its
// effect on the bottom row, and that the choices survive a reload. The Tab option's own behavior is in ui-tweaks-tab.live.mjs.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { numberPadText } from '../scripts.mjs'
import { keydownDefaults } from '../input.mjs'
import { closeDialogWith, dialogButton, openScriptDialog } from '../settings.mjs'
import { settle } from '../settle.mjs'
import { openWith, reloadWith, useBrowser } from '../session.mjs'

const SCRIPT_FILE = 'ui-tweaks.user.js'

const DIALOG = '#ui-tweaks-dialog'
const ROW = '.controls-aux'
const SELECT = `${ROW} [data-control="select"]`
const TOGGLE_BUTTON = 'button[data-control="toggleletter"]'
const DIGITS = '1234567890'
const LETTERS = 'ABCDEFGHIO'
// Stand-ins for the buttons other scripts add to the bottom row: with SudokuPad's own four, seven in all.
const EXTRA_BUTTONS = ['five', 'six', 'seven']

const browser = useBrowser()

const box = (p, id) => p.locator(`${DIALOG} input[data-option="${id}"]`)
const openDialog = (p) => openScriptDialog(p, 'UI Tweaks', DIALOG)
// Sets each named option in the open dialog and presses Save.
async function chooseAndSave (p, choices) {
  await openDialog(p)
  for (const [id, on] of Object.entries(choices)) await box(p, id).setChecked(on)
  await closeDialogWith(p, 'Save', DIALOG)
}
const rowButtons = (p) => p.evaluate((row) => [...document.querySelector(row).children]
  .filter((button) => button.getClientRects().length > 0)
  .map((button) => { const at = button.getBoundingClientRect(); return { id: button.id, x: Math.round(at.x), y: Math.round(at.y), width: Math.round(at.width) } }), ROW)
const belowFirst = async (p) => {
  const found = await rowButtons(p)
  return found.map((b) => b.y > found[0].y)
}
const addExtraButtons = (p) => p.evaluate((names) => {
  names.forEach((name) => Framework.addControlButton({ parent: '.controls-aux', name, title: name, content: `<div class="icon">${name[0]}</div>`, onClick () {} }))
  Framework.app.refreshControls()
}, EXTRA_BUTTONS)

// Once the scripts are in: the stand-in buttons added and the letter tool on.
async function ready (p) {
  await addExtraButtons(p)
  await p.evaluate(() => Framework.setSetting('toolletter', true))
  await p.locator(TOGGLE_BUTTON).waitFor({ state: 'attached' })
  await p.locator('#control-seven').waitFor({ state: 'visible' })
}

// A page with `scripts` in, `ready`.
async function open (scripts = [SCRIPT_FILE]) {
  const opened = await openWith(browser(), scripts)
  await ready(opened.p)
  return opened
}

describe('the options dialog', { concurrency: false }, () => {
  let context, p, errors
  const pad = () => numberPadText(p)

  before(async () => { ;({ context, p, errors } = await open()) })
  after(async () => { await context.close() })

  it('the entry opens a dialog named UI Tweaks with the version, Tab on and the other two off', async () => {
    await openDialog(p)
    assert.equal((await p.locator('.dialog b').first().textContent()).trim(), 'UI Tweaks')
    assert.match(await p.locator('.dialog small.ui-tweaks-version').textContent(), /^v\d+\.\d+\.\d+ by ChinStrap$/)
    assert.deepEqual(await Promise.all(['tab', 'hideSelect', 'wrapButtons'].map((id) => box(p, id).isChecked())), [true, false, false])
    await closeDialogWith(p, 'Cancel', DIALOG)
  })

  it('with nothing chosen, the Toggle Selection button shows and the row is one line', async () => {
    await p.locator(SELECT).waitFor({ state: 'visible' })
    const buttons = await rowButtons(p)
    assert.equal(buttons.length, 7)
    assert.equal(new Set(buttons.map((b) => b.y)).size, 1, JSON.stringify(buttons))
  })

  it('Cancel changes nothing', async () => {
    await openDialog(p)
    await box(p, 'hideSelect').check()
    await box(p, 'wrapButtons').check()
    await closeDialogWith(p, 'Cancel', DIALOG)
    await p.locator(SELECT).waitFor({ state: 'visible' })
    assert.equal(new Set((await rowButtons(p)).map((b) => b.y)).size, 1)
  })

  it('Hide the Toggle Selection button hides it at once on Save, and the rest of the row closes up with no gap', async () => {
    const before = await rowButtons(p)
    await chooseAndSave(p, { hideSelect: true })
    await p.locator(SELECT).waitFor({ state: 'hidden' })
    const after = await rowButtons(p)
    assert.deepEqual(after.map((b) => b.id), before.map((b) => b.id).filter((id) => id !== 'control-select'))
    const pitch = after[1].x - after[0].x
    // Positions are rounded to whole px, so one px of difference is rounding.
    after.slice(1).forEach((b, i) => assert.ok(Math.abs(b.x - after[i].x - pitch) <= 1, `gap before ${b.id}: ${JSON.stringify(after)}`))
    assert.equal(after[0].x, before[0].x, 'the row still starts where it did')
    assert.equal(await p.locator('#control-select').count(), 1, 'the button is hidden, not removed')
  })

  it('switching it off shows the button again', async () => {
    await chooseAndSave(p, { hideSelect: false })
    await p.locator(SELECT).waitFor({ state: 'visible' })
    assert.equal((await rowButtons(p)).length, 7)
  })

  it('Wrap buttons puts the sixth button on a second line, and switching it off puts the row on one line again', async () => {
    await chooseAndSave(p, { wrapButtons: true })
    const wrapped = await settle(() => belowFirst(p), [false, false, false, false, false, true, true])
    assert.deepEqual(wrapped, [false, false, false, false, false, true, true])
    await chooseAndSave(p, { wrapButtons: false })
    assert.equal(await settle(async () => new Set((await rowButtons(p)).map((b) => b.y)).size, 1), 1)
  })

  it('Wrap buttons still breaks the row after five when something gives it an inline max-width', async () => {
    await chooseAndSave(p, { wrapButtons: true })
    await p.evaluate(() => { document.querySelector('.controls-aux').style.maxWidth = '482px' })
    const wrapped = await settle(() => belowFirst(p), [false, false, false, false, false, true, true])
    await p.evaluate(() => { document.querySelector('.controls-aux').style.maxWidth = '' })
    assert.deepEqual(wrapped, [false, false, false, false, false, true, true])
    await chooseAndSave(p, { wrapButtons: false })
  })

  it('Tab never switches to letters: off, Tab switches the number pad as SudokuPad does; on again, it does not', async () => {
    assert.equal(await pad(), DIGITS)
    await chooseAndSave(p, { tab: false })
    await keydownDefaults(p, 'Tab')
    assert.equal(await settle(pad, LETTERS), LETTERS, 'Tab toggled to letters')
    await keydownDefaults(p, '/')
    assert.equal(await settle(pad, DIGITS), DIGITS)
    await chooseAndSave(p, { tab: true })
    await keydownDefaults(p, 'Tab')
    assert.equal(await pad(), DIGITS, 'Tab left the pad on digits')
  })

  it('Restore defaults puts the defaults in the boxes as a draft: Cancel keeps what was saved, Save stores the defaults', async () => {
    const options = ['tab', 'hideSelect', 'wrapButtons']
    const boxes = () => Promise.all(options.map((id) => box(p, id).isChecked()))
    await chooseAndSave(p, { tab: false, hideSelect: true })
    await p.locator(SELECT).waitFor({ state: 'hidden' })
    await openDialog(p)
    await dialogButton(p, 'Restore defaults').click()
    assert.deepEqual(await boxes(), [true, false, false])
    await closeDialogWith(p, 'Cancel', DIALOG)
    assert.equal(await p.locator(SELECT).isHidden(), true, 'Cancel left the saved Hide the Toggle Selection button')
    await openDialog(p)
    assert.deepEqual(await boxes(), [false, true, false], 'the saved options are still the ones shown')
    await dialogButton(p, 'Restore defaults').click()
    await closeDialogWith(p, 'Save', DIALOG)
    await p.locator(SELECT).waitFor({ state: 'visible' })
    await openDialog(p)
    assert.deepEqual(await boxes(), [true, false, false])
    await closeDialogWith(p, 'Cancel', DIALOG)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

describe('the choices survive a reload', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ;({ context, p, errors } = await open())
    await chooseAndSave(p, { tab: false, hideSelect: true, wrapButtons: true })
    await reloadWith(p, [SCRIPT_FILE])
    await ready(p)
  })
  after(async () => { await context.close() })

  it('each saved option is in force with no dialog open', async () => {
    await p.locator(SELECT).waitFor({ state: 'hidden' })
    const buttons = await rowButtons(p)
    assert.deepEqual(buttons.map((b) => b.y > buttons[0].y), [false, false, false, false, false, true], JSON.stringify(buttons))
    await keydownDefaults(p, 'Tab')
    assert.equal(await settle(() => numberPadText(p), LETTERS), LETTERS, 'Tab toggled letters')
  })

  it('the dialog shows what was saved', async () => {
    await openDialog(p)
    assert.deepEqual(await Promise.all(['tab', 'hideSelect', 'wrapButtons'].map((id) => box(p, id).isChecked())), [false, true, true])
    await closeDialogWith(p, 'Cancel', DIALOG)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

describe('with Color by Digit, Pen Tool Extras and Text Anywhere in the row', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ;({ context, p, errors } = await open(['color-by-digit.user.js', 'pen-tool-extras.user.js', 'text-anywhere.user.js', SCRIPT_FILE]))
    await p.evaluate(() => Framework.setSetting('toolpen', true))
    await p.locator('#control-colorbydigit').waitFor({ state: 'visible' })
  })
  after(async () => { await context.close() })

  // Color by Digit caps the row itself, so this shows the two do not conflict; the option's own effect is checked above, without it.
  it('with Wrap buttons on, five buttons are on the first line, Color by Digit\'s among them, and the rest are on the second', async () => {
    await chooseAndSave(p, { wrapButtons: true })
    const buttons = await settle(() => belowFirst(p), [false, false, false, false, false, true, true, true])
    assert.deepEqual(buttons, [false, false, false, false, false, true, true, true])
    assert.equal((await rowButtons(p))[4].id, 'control-colorbydigit')
  })

  it('with Color by Digit also capping the row, Wrap buttons on still breaks it after five under an inline max-width', async () => {
    await p.evaluate(() => { document.querySelector('.controls-aux').style.maxWidth = '482px' })
    const buttons = await settle(() => belowFirst(p), [false, false, false, false, false, true, true, true])
    await p.evaluate(() => { document.querySelector('.controls-aux').style.maxWidth = '' })
    assert.deepEqual(buttons, [false, false, false, false, false, true, true, true])
  })

  it('Hide the Toggle Selection button leaves Color by Digit\'s button and the others', async () => {
    await chooseAndSave(p, { hideSelect: true })
    await p.locator(SELECT).waitFor({ state: 'hidden' })
    const ids = (await rowButtons(p)).map((b) => b.id)
    assert.deepEqual(ids, ['control-undo', 'control-redo', 'control-check', 'control-colorbydigit', 'control-five', 'control-six', 'control-seven'])
  })

  it('the tool buttons of the other scripts stay visible', async () => {
    assert.equal(await p.locator('#control-pen').isVisible(), true)
    assert.equal(await p.locator('#control-textanywhere').isVisible(), true)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
