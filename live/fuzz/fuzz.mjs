// The fuzz on real SudokuPad: opens a page of `live/page.mjs` (on the puzzle a list names) with all six scripts installed the way a userscript manager does (at
// DOMContentLoaded of every load, so a reload keeps them), gives the engine (`engine.mjs`) a page of its own for every action list, and reads the crash
// signals (`signals.mjs`) from it. Each list names its puzzle (`puzzle-set.mjs`, #679). Not a check itself.
import { setTimeout as sleep } from 'node:timers/promises'
import { ERROR_LOG_KEY, captureConsoleErrors, openPage, restartPuzzle, startPuzzle, START } from '../page.mjs'
import { NOTICE_BAR } from '../all-scripts.mjs'
import { cellCentre, finishNote, gridPoint, undoAll } from '../board.mjs'
import { goToPenPage, openPenTool, PAGE_BUTTON, PAGE_THREE } from '../pen.mjs'
import { holdUntil, middleOf, setInputValue } from '../input.mjs'
import { actButton, animationsDone, closeDialogWith, dialogButton, paste, STATUS } from '../settings.mjs'
import { closeExtrasEditorWith, COLOR_BY_DIGIT_DIALOG, EXTRAS_EDITOR, openExtrasEditor, SETTINGS_SCRIPTS, settingsScript } from '../scripts.mjs'
import { CORNER, FONT_BAR, MAX_HEIGHT_INPUT, MAX_WIDTH_INPUT, RULES_PANE } from '../auto-rules-resizer/auto-rules-resizer-fixtures.mjs'
import { HOLD_WAIT_MS } from '../pen-tool-extras/pen-tool-extras-fixtures.mjs'
import { BACKGROUND_BUTTON, BOX_CUSTOM_INPUT, BOX_PICKS, CHECK_BOXES, CLEAR_BUTTON, DIALOG, HANDLES, HIDE_BUTTON, KEYPAD, PICKER_BOX, OPACITY_SLIDER as NOTE_OPACITY_SLIDER, SELECTED, SETTINGS_BUTTON, SETTINGS_EDITOR, SIZE_SLIDER as NOTE_SIZE_SLIDER, pickTextAnywhere, TEXT_BOX, TEXTS, tool as noteTool } from '../text-anywhere/text-anywhere-fixtures.mjs'
import { ARROW, BUTTON as COLOR_BUTTON, buttonPoint, deleteProfileRow, dragProfileRow, EDITOR as PROFILE_EDITOR, MENU as PROFILE_MENU, PROFILE_ROWS, ROW_CORNER, typeProfileName } from '../color-by-digit/color-by-digit-fixtures.mjs'
import { installAll, puzzleIdFor, openPuzzleId, resumeAfterHistory, startWithTools } from '../puzzles.mjs'
import { configOptions, DEFAULT_CONFIG } from './configs.mjs'
import { runFuzz, runScript } from './engine.mjs'
import { DIGIT_KEYS, DIGITS, KINDS, MARK_BOXES, PROFILE_NAMES, ROW_KEYS, scriptedList, SLIDERS, SWATCH_KEYS } from './actions.mjs'
import { readPageState } from './page-state.mjs'
import { tagSource, trackClosing } from './coverage.mjs'
import { plantPatch } from './plants.mjs'
import { actWhereItIs, MOVE_TRIES } from './act-where-it-is.mjs'
import { noteDrop } from './note-drop.mjs'
import { visiblePoint } from './visible-point.mjs'
import { replayCommand } from './replay-command.mjs'
import { FUZZ_PUZZLES, insideGrid, rulesTextFor } from './puzzle-set.mjs'
import { newestErrorRecords } from './signals.mjs'

const plantEscapeError = (p) => p.addInitScript(() => {
  let down = false
  window.addEventListener('mousedown', () => { down = true }, true)
  window.addEventListener('mouseup', () => { down = false }, true)
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && down) setTimeout(() => { throw new Error('planted page error') }, 0) }, true)
})

// Shows the puzzle's rules text the way a loaded puzzle gets it; the snapshot waits for the fit. A puzzle with no rules text shows none.
async function showRules (p, puzzle) {
  const rules = rulesTextFor(puzzle)
  if (rules === null) return
  await p.evaluate((text) => {
    Framework.app.showMetaInfoUI({ title: 'fuzz', author: 'fuzz', rules: text })
    Framework.app.resize()
  }, rules)
}

// Each slider `actions.mjs` names: its selector, whether the pen tool or Text Anywhere's tool shows it, and for a pen slider the key of the Show boxes that can hide it. Pen Tool Extras' ids are typed out, as the live tests type them.
const SLIDER_SELECTORS = {
  'pen thickness': { selector: '#pen-tool-extras-thickness', tool: 'pen', shown: 'thickness' },
  'pen opacity': { selector: '#pen-tool-extras-opacity', tool: 'pen', shown: 'opacity' },
  'note size': { selector: NOTE_SIZE_SLIDER, tool: 'notes' },
  'note opacity': { selector: NOTE_OPACITY_SLIDER, tool: 'notes' }
}
for (const name of SLIDERS) if (!SLIDER_SELECTORS[name]) throw new Error(`actions.mjs names a ${name} slider that fuzz.mjs has no selector for`)
// A press on a track this far in from its end is on the track, not on the edge pixel that belongs to the next element.
const TRACK_MARGIN_PX = 6

const BOX_TIMEOUT_MS = 2000
// How long a dialog is given to show after its button was pressed where the button was.
const DIALOG_OPENS_MS = 30000
// Longer than the button's hold, so a hold that drifted off had time to open a menu and did not.
const COLOR_HOLD_DRIFT_WAIT_MS = 800
const COLOR_HOLD_DRIFT_PX = 40

const UI_TWEAKS = settingsScript('ui-tweaks.user.js')
const UI_TWEAKS_DIALOG = UI_TWEAKS.editor
const DARK_PAGE_INPUT = '#dark-page-input'
// The dialog of each script by the lower-case words of its entry, which is how `actions.mjs` names it.
const SETTINGS_DIALOGS = Object.fromEntries(SETTINGS_SCRIPTS.map((script) => [script.entry.toLowerCase(), script]))
const PEN_SETTINGS_BUTTON = '.pen-tool-extras-settings'
const NOTE_COLOR_PRESET = `${SETTINGS_EDITOR} select[data-role="color-choice"]`
// What a press of Copy error log or Clear is answered with on a page where nothing is broken (a log with records is copied, an empty one says so); any other answer is a failure.
const ERROR_LOG_ANSWERS = { copy: /^(Error log copied\.|The error log is empty\.)$/, clear: /^(Error log cleared\.|The error log was already empty\.)$/ }
const isSettingsObject = (text) => {
  try {
    const data = JSON.parse(text)
    return data !== null && typeof data === 'object' && !Array.isArray(data)
  } catch {
    return false
  }
}
// The point nearest the pane's middle where the pane is the topmost element, as `{ x, y }`; null when the page shows no rules, or every point tried of the pane is covered by something, a note most likely (#1187).
// The pane shows its corners and font bar only while it is hovered, and a pointer over a note that spreads across the pane's middle is not over the pane.
async function rulesPoint (p) {
  if (!await p.locator(RULES_PANE).isVisible()) return null
  return p.locator(RULES_PANE).evaluate((pane) => {
    const box = pane.getBoundingClientRect()
    const fractions = [0.5, 0.35, 0.65, 0.2, 0.8, 0.08, 0.92]
    const points = fractions.flatMap((fx) => fractions.map((fy) => ({ fx, fy })))
      .sort((a, b) => Math.hypot(a.fx - 0.5, a.fy - 0.5) - Math.hypot(b.fx - 0.5, b.fy - 0.5))
      .map(({ fx, fy }) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy }))
    return points.find(({ x, y }) => pane.contains(document.elementFromPoint(x, y))) || null
  })
}
// The pointer's way onto the rules pane, so the corners and the bar show; false when the page shows no rules or a note covers them.
async function hoverRules (p) {
  const point = await rulesPoint(p)
  if (!point) return false
  await p.mouse.move(point.x, point.y)
  return true
}
// The same, until `target` (a corner, a font button) shows; false when the page shows no rules or a note covers them.
const hoverRulesFor = (p, target) => actWhereItIs(target, () => rulesPoint(p), ({ x, y }) => p.mouse.move(x, y), { finalMs: BOX_TIMEOUT_MS })
// How long a press of the font bar waits before the pointer goes back over the pane.
const PRESS_LOOK_MS = 500
const LINE_MODE_BUTTON = '[data-control="penlinemode-step"]'
export const COLOR_PICKERS = '.pen-tool-extras-picker'
const COLOR_CHOICE = `${EXTRAS_EDITOR} select[data-role="color-choice"]`
// A click this far (in cells) inside the edge of a cell is an edge click, and a corner's own point is a corner click.
const EDGE_INSET = 0.04

// The option at position `pick` (wrapped to the options there are) of a color preset pulldown. The option that is the colors in force (Custom after a hand edit) is selected and
// disabled, and a disabled option cannot be picked.
async function pickPreset (p, selector, pick) {
  const values = await p.locator(selector).evaluate((el) => [...el.options].filter((o) => !o.disabled).map((o) => o.value))
  await p.locator(selector).selectOption(values[pick % values.length])
}

// A real click on the middle of the element `selector` matches, which waits for nothing about its state: a button that cannot be pressed now (Undo
// with nothing to undo) is pressed like a user presses it, and nothing happens. An element that is not there is a crash: a script lost its control.
async function clickIn (p, selector) {
  const box = await p.locator(selector).first().boundingBox({ timeout: BOX_TIMEOUT_MS })
  if (!box) throw new Error(`no ${selector} on the page to click`)
  await p.mouse.click(...middleOf(box))
}

// What a player does when a Text Anywhere note (or its handle) covers a button: drags the note off, onto the board's middle or, for a note that would still cover the button there, to the nearest place that clears every button (`note-drop.mjs`).
const CLEAR_TRIES = 4
const LAYER = '#text-anywhere-layer'
// Fractions of a button's box: its centre, and where `buttonPoint` presses (the Color by Digit hold, clear of the arrow).
const PRESS_POINTS = [[0.5, 0.5], [0.3, 0.6]]
const COVERED_BUTTON_NOTE = ([layer, notes, pressPoints]) => {
  // The points an action presses on each button: its centre, and the Color by Digit hold's (`buttonPoint`), which a note over it only takes (#1015).
  const buttons = [...document.querySelectorAll('button, [id^="control-"]')].flatMap((button) => {
    const box = button.getBoundingClientRect()
    return box.width === 0 || box.height === 0 ? [] : [{ button, points: pressPoints.map(([fx, fy]) => [box.x + box.width * fx, box.y + box.height * fy]) }]
  })
  // Every button's points, so a drop clears the next button a wide note would cover and not only this one (#1060).
  const avoid = buttons.flatMap(({ points }) => points)
  for (const { button, points } of buttons) {
    const [x, y, top] = points
      .map(([px, py]) => [px, py, document.elementFromPoint(px, py)])
      .find(([, , hit]) => hit && hit !== button && !button.contains(hit) && hit.closest(layer)) ?? []
    if (!top) continue
    // A handle sits on its note's corner, so the note is the one whose box, grown by the handle's own size, holds the point.
    const reach = top.closest(notes) ? 0 : top.getBoundingClientRect().width
    // A note's own element is that note: the grown box below would match any note within its width of the button, a wide one's included.
    const note = top.closest(notes) ?? [...document.querySelectorAll(notes)].find((n) => {
      const b = n.getBoundingClientRect()
      return x >= b.left - reach && x <= b.right + reach && y >= b.top - reach && y <= b.bottom + reach
    })
    if (!note) return { button: button.id || button.className, point: null }
    const b = note.getBoundingClientRect()
    return { button: button.id || button.className, point: [b.x + b.width / 2, b.y + b.height / 2], size: [b.width, b.height], reach, at: [x, y], avoid }
  }
  return null
}

async function openPadMenu (p) {
  await clickIn(p, ARROW)
  await p.locator(PROFILE_MENU).waitFor({ state: 'visible' })
}

// Color by Digit's profiles dialog (#814): opens it the way a user finds it, makes each edit of `actions.mjs`'s `profileEdit` on the dialog as it stands (a row, a
// swatch or an option is counted from 0 and wrapped to how many there are, an edit the dialog's state does not allow, such as a delete of the only profile, is
// not made), and presses Save or Cancel.
async function editProfiles (p, edits, save, fromMenu) {
  if (fromMenu) {
    await openPadMenu(p)
    await p.locator(`${PROFILE_MENU} [data-act=edit]`).click()
    await p.locator(PROFILE_EDITOR).waitFor({ state: 'visible' })
    await animationsDone(p.locator(PROFILE_EDITOR))
  } else {
    await COLOR_BY_DIGIT_DIALOG.open(p)
  }
  const wrapped = async (locator, n) => {
    const count = await locator.count()
    if (count === 0) throw new Error(`the profiles dialog has none of ${locator} to pick`)
    return locator.nth(n % count)
  }
  const rows = p.locator(PROFILE_ROWS)
  for (const [op, a, b, c] of edits) {
    if (op === 'new') {
      const add = p.locator(`${PROFILE_EDITOR} [data-act=new-profile]`)
      if (await add.isEnabled()) await add.click()
    } else if (op === 'rename') {
      await typeProfileName(p, PROFILE_NAMES[a])
    } else if (op === 'delete') {
      await wrapped(rows, 0)
      const n = a % await rows.count()
      if (await p.locator(`${PROFILE_ROWS}:nth-child(${n + 1}) button[data-act=delete]`).isEnabled()) await deleteProfileRow(p, n + 1)
    } else if (op === 'move') {
      await wrapped(rows, 0)
      const count = await rows.count()
      await dragProfileRow(p, a % count, b % count)
    } else if (op === 'select') {
      await (await wrapped(rows, a)).click(ROW_CORNER)
    } else if (op === 'paint') {
      await (await wrapped(p.locator(`${PROFILE_EDITOR} button[data-role=swatch]`), b)).click()
      await p.locator(`${PROFILE_EDITOR} button[data-act=digit][data-digit="${a}"]`).click()
    } else if (op === 'swatch key') {
      const swatch = await wrapped(p.locator(`${PROFILE_EDITOR} button[data-role=swatch]`), a)
      await swatch.focus()
      await swatch.press(SWATCH_KEYS[b])
    } else if (op === 'digit key') {
      await p.locator(`${PROFILE_EDITOR} button[data-act=digit][data-digit="${DIGITS[a]}"]`).focus()
      await p.keyboard.press(DIGIT_KEYS[b])
    } else if (op === 'row key') {
      const button = await wrapped(p.locator(`${PROFILE_EDITOR} [data-act=select]`), a)
      await button.focus()
      await button.press(ROW_KEYS[b])
    } else if (op === 'paint drag') {
      await (await wrapped(p.locator(`${PROFILE_EDITOR} button[data-role=swatch]`), c)).click()
      const from = await p.locator(`${PROFILE_EDITOR} button[data-act=digit][data-digit="${DIGITS[a]}"]`).boundingBox({ timeout: BOX_TIMEOUT_MS })
      const to = await p.locator(`${PROFILE_EDITOR} button[data-act=digit][data-digit="${DIGITS[b]}"]`).boundingBox({ timeout: BOX_TIMEOUT_MS })
      if (!from || !to) throw new Error('a digit key is not on the page to drag across')
      await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await p.mouse.down()
      await p.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
      await p.mouse.up()
    } else if (op === 'clear all') {
      const clear = p.locator(`${PROFILE_EDITOR} [data-act=clear]`)
      if (await clear.isEnabled()) await clear.click()
    } else {
      const select = p.locator(`${PROFILE_EDITOR} select[data-role=${op === 'cell profile' ? 'cell-profile' : 'digit-profile'}]`)
      await select.selectOption({ index: a % await select.locator('option').count() })
    }
  }
  await closeDialogWith(p, save ? 'Save' : 'Cancel', PROFILE_EDITOR)
}

// Picks the profile at row `i` (wrapped) for the cells from the menu on the Color by Digit button's arrow; with a separate digit profile the menu has a dot column per target, and the cells' one is picked.
async function pickProfileFromMenu (p, i) {
  await openPadMenu(p)
  const picks = p.locator(`${PROFILE_MENU} [data-act=pick][data-target=cells]`)
  await picks.nth(i % await picks.count()).click()
  await p.locator(PROFILE_MENU).waitFor({ state: 'detached' })
}

function envFor (p, puzzle, { beforeReload, reads }) {
  const openPen = async () => {
    if (!await openPenTool(p)) throw new Error('the pen tool could not be opened')
  }
  const pickPenColor = (color) => clickIn(p, `.tool-pen button[data-key="${color}"]`)
  const windowSize = () => p.evaluate(() => [window.innerWidth, window.innerHeight])
  // SudokuPad's solved dialog sits over the whole page until a press on its overlay, which a player makes before the next move. The press goes to the page's corner, clear of the dialog and the board.
  // Only that dialog is pressed away: a script's dialog left open stays what blocks the next click, and the run fails on it.
  const dismissSolvedDialog = async () => {
    const dialog = p.locator('.dialog-overlay .dialog', { hasText: 'Congrats' })
    if (await dialog.count() === 0) return
    await p.mouse.click(2, 2)
    await dialog.waitFor({ state: 'detached', timeout: BOX_TIMEOUT_MS })
  }
  const clearControls = async () => {
    for (let i = 0; i <= CLEAR_TRIES; i++) {
      const covered = await p.evaluate(COVERED_BUTTON_NOTE, [LAYER, TEXTS, PRESS_POINTS])
      if (!covered) return i > 0
      if (!covered.point) throw new Error(`${covered.button} is covered by a Text Anywhere element that belongs to no note`)
      if (i === CLEAR_TRIES) throw new Error(`${covered.button} is still covered by a note after ${CLEAR_TRIES} drags off it`)
      const middle = (await cellCentre(p, Math.floor(puzzle.rows / 2), Math.floor(puzzle.cols / 2))).slice(0, 2)
      const to = noteDrop(middle, covered, await windowSize())
      await p.mouse.move(...covered.point)
      await p.mouse.down()
      await p.mouse.move(...to, { steps: 6 })
      await p.mouse.up()
    }
  }
  // Holds the left button on a color button until the nine color pickers show, then lets go; a hold that shows none is a failure: the player's hold opens them.
  const holdColor = (button, pickers) => holdUntil(p, button, pickers, { timeout: HOLD_WAIT_MS, boxTimeout: BOX_TIMEOUT_MS })
  const pickNotes = async () => {
    if (await pickTextAnywhere(p) !== 'textanywhere') throw new Error('Text Anywhere\'s tool could not be picked')
    // A note blocks clicks only while its tool is current, so a button it covers shows only now.
    await clearControls()
  }
  // Pen Tool Extras saves the Show boxes a player unticked as `false` under their key, and nothing while both are ticked.
  const sliderHidden = (name) => p.evaluate(([key]) => Framework.getData('PenColor_sliders')?.[key] === false, [SLIDER_SELECTORS[name].shown])
  // Picking the tool again ends a selection, so a caller that has chosen a note keeps the tool it has.
  const keepNotes = async () => {
    if (await noteTool(p) !== 'textanywhere') await pickNotes()
  }
  const sliderFor = async (name, keepTool = false) => {
    const { selector, tool } = SLIDER_SELECTORS[name]
    if (tool === 'pen') await openPen()
    else if (keepTool) await keepNotes()
    else await pickNotes()
    return p.locator(selector)
  }
  return {
    page: p,
    // A target outside the grid is where the puzzle's clues are: the middle of the cell that would be there. SudokuPad's own links sit over a corner of the board
    // (a click there leaves the page, which no script did), so a point under a link is the nearest cell of the grid instead.
    cellPoint: async (i) => {
      const [row, col] = puzzle.cells[i]
      if (insideGrid(puzzle, [row, col])) return (await cellCentre(p, row, col)).slice(0, 2)
      const point = await gridPoint(p, [row + 0.5, col + 0.5])
      const onLink = await p.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('a')), point)
      return !onLink ? point : (await cellCentre(p, Math.min(Math.max(row, 0), puzzle.rows - 1), Math.min(Math.max(col, 0), puzzle.cols - 1))).slice(0, 2)
    },
    clearControls,
    dismissSolvedDialog,
    async usePen (color) {
      await openPen()
      await pickPenColor(color)
    },
    async useArrowPen (color) {
      await openPen()
      await goToPenPage(p, PAGE_THREE)
      await pickPenColor(color)
    },
    useNotes: pickNotes,
    async turnPenPage () {
      await openPen()
      await clickIn(p, PAGE_BUTTON)
    },
    undo: () => clickIn(p, '#control-undo'),
    redo: () => clickIn(p, '#control-redo'),
    undoAll: () => undoAll(p),
    clickColorMode: () => clickIn(p, COLOR_BUTTON),
    holdColorMode: async (drift) => {
      const { x, y } = await buttonPoint(p)
      await p.mouse.move(x, y)
      await p.mouse.down()
      try {
        if (drift) {
          await p.mouse.move(x, y + COLOR_HOLD_DRIFT_PX, { steps: 4 })
          // A "nothing happened in N ms" check: the hold timer would have fired by now.
          await sleep(COLOR_HOLD_DRIFT_WAIT_MS)
          if (await p.locator(PROFILE_MENU).count() > 0) throw new Error('a hold that drifted off the Color by Digit button opened its menu')
        } else {
          await p.locator(PROFILE_MENU).waitFor({ state: 'visible', timeout: HOLD_WAIT_MS })
        }
      } finally {
        await p.mouse.up()
      }
      if (!drift) {
        await p.keyboard.press('Escape')
        await p.locator(PROFILE_MENU).waitFor({ state: 'detached' })
      }
    },
    profileEditor: (edits, save, fromMenu) => editProfiles(p, edits, save, fromMenu),
    pickProfile: (i) => pickProfileFromMenu(p, i),
    restartPuzzle: () => restartPuzzle(p),
    async placeNote (text, i) {
      await pickNotes()
      await p.mouse.click(...await this.cellPoint(i))
      // A click that lands on a note selects it and opens no box; that is a user's click too, not a failure.
      const opened = await p.locator(TEXT_BOX).waitFor({ state: 'attached', timeout: 1500 }).then(() => true, () => false)
      if (opened) await p.keyboard.type(text)
      await finishNote(p)
    },
    noteCentre: () => p.evaluate((selector) => {
      const note = document.querySelector(selector)
      if (!note) return null
      const box = note.getBoundingClientRect()
      return [box.x + box.width / 2, box.y + box.height / 2]
    }, TEXTS),
    async extrasSettings (values, save) {
      await openExtrasEditor(p)
      for (const [key, value] of Object.entries(values)) await setInputValue(p.locator(`${EXTRAS_EDITOR} input[data-setting="${key}"]`), value)
      await closeExtrasEditorWith(p, save ? 'Save' : 'Cancel')
    },
    async sliderPoint (name, fraction, keepTool) {
      if (await sliderHidden(name)) return null
      const box = await (await sliderFor(name, keepTool)).boundingBox({ timeout: BOX_TIMEOUT_MS })
      if (!box) throw new Error(`the ${name} slider is not on the page`)
      return [box.x + TRACK_MARGIN_PX + (box.width - 2 * TRACK_MARGIN_PX) * fraction, box.y + box.height / 2]
    },
    async stepLineMode () {
      await openPen()
      await clickIn(p, LINE_MODE_BUTTON)
    },
    async tickMarks (names) {
      await openExtrasEditor(p)
      for (const name of MARK_BOXES) await p.locator(`${EXTRAS_EDITOR} input[data-box="marks.${name}"]`).setChecked(names.includes(name))
      await closeExtrasEditorWith(p, 'Save')
    },
    // A cell outside the grid is the nearest one in it; the target's side is the cell's own edge or corner.
    async markPoint (i, side) {
      const row = Math.min(Math.max(puzzle.cells[i][0], 0), puzzle.rows - 1)
      const col = Math.min(Math.max(puzzle.cells[i][1], 0), puzzle.cols - 1)
      const at = [[row + EDGE_INSET, col + 0.5], [row + 0.5, col + 1 - EDGE_INSET], [row + 1 - EDGE_INSET, col + 0.5], [row + 0.5, col + EDGE_INSET], [row, col], [row, col + 1], [row + 1, col], [row + 1, col + 1]]
      return gridPoint(p, at[side])
    },
    holdPenColor: (color) => holdColor(`.tool-pen button[data-key="${color}"]`, COLOR_PICKERS),
    async holdNoteColor (color) {
      await pickNotes()
      await holdColor(`${KEYPAD} button[data-key="${color}"]`, PICKER_BOX)
    },
    setNotePicker: (color, hex) => p.locator(`${PICKER_BOX} input[data-key="${color}"]`).fill(hex),
    setPenPicker: (color, hex) => p.locator(`${COLOR_PICKERS} input[data-key="${color}"]`).fill(hex),
    async penPresets (pick, restore, save) {
      await openExtrasEditor(p)
      if (restore) {
        await dialogButton(p, 'Restore defaults').click()
      } else {
        await pickPreset(p, COLOR_CHOICE, pick)
      }
      await closeExtrasEditorWith(p, save ? 'Save' : 'Cancel')
    },
    async focusSlider (name) {
      if (await sliderHidden(name)) return false
      await (await sliderFor(name)).focus()
      return true
    },
    async leaveSlider (name) { await p.locator(SLIDER_SELECTORS[name].selector).evaluate((el) => el.blur()) },
    async noteBoxDialog (choice, color, save) {
      await pickNotes()
      await p.click(SETTINGS_BUTTON)
      await p.locator(SETTINGS_EDITOR).waitFor({ state: 'visible' })
      await p.locator(`${BOX_PICKS}[data-value="${choice}"]`).click()
      if (choice === 'custom') await p.locator(BOX_CUSTOM_INPUT).fill(color)
      await closeDialogWith(p, save ? 'Save' : 'Cancel', SETTINGS_EDITOR)
    },
    async noteHandle (corner) {
      const handles = p.locator(HANDLES)
      return await handles.count() === 0 ? null : middleOf(await handles.nth(corner).boundingBox({ timeout: BOX_TIMEOUT_MS }))
    },
    async visibleHandlePoint (corner) {
      const handles = p.locator(HANDLES)
      return await handles.count() === 0 ? null : visiblePoint(await handles.nth(corner).boundingBox({ timeout: BOX_TIMEOUT_MS }), await windowSize())
    },
    async checkBoxPoint () {
      const boxes = p.locator(CHECK_BOXES)
      return await boxes.count() === 0 ? null : middleOf(await boxes.first().boundingBox({ timeout: BOX_TIMEOUT_MS }))
    },
    // With a note selected the button deletes it and asks nothing, and with no notes there is nothing to ask; otherwise it asks, and the question is
    // answered like a player does: ok presses its Delete button ("Delete" for one note, "Delete all" for more).
    async clearNotes (ok) {
      // Picking the tool again ends the selection, which a clear after a click on a note needs kept.
      if (await noteTool(p) !== 'textanywhere') await pickNotes()
      const asks = await p.locator(SELECTED).count() === 0 && await p.locator(TEXTS).count() > 0
      await clickIn(p, CLEAR_BUTTON)
      if (asks) await closeDialogWith(p, ok ? 'Delete(?: all)?' : 'Cancel', DIALOG)
    },
    // A key held down is time passing, not a verdict waited on a clock.
    holdFor: (ms) => sleep(ms),
    finishNote: () => finishNote(p),
    async pressNotePanel (what) {
      await keepNotes()
      await clickIn(p, typeof what === 'number' ? `${KEYPAD} button[data-key="${what}"]` : what === 'hide all' ? HIDE_BUTTON : BACKGROUND_BUTTON)
    },
    async setNoteBackground (on) {
      await pickNotes()
      if (await p.locator(BACKGROUND_BUTTON).getAttribute('aria-pressed') !== String(on)) await clickIn(p, BACKGROUND_BUTTON)
    },
    resize: (size) => p.setViewportSize(size),
    blurFocus: () => p.evaluate(() => {
      window.dispatchEvent(new Event('blur'))
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    }),
    async reload () {
      await beforeReload()
      await p.reload({ waitUntil: 'load' })
      // The intro dialog (Resume Puzzle) can show after the board does, which `resumeAfterHistory` alone would not wait for.
      // A solved board shows SudokuPad's "You've already solved this puzzle" dialog instead of an intro (#1212): a player presses its overlay, as `dismissSolvedDialog` does.
      const solved = p.locator('.dialog-overlay .dialog', { hasText: 'already solved' })
      await p.getByRole('button', { name: START }).first().or(solved).waitFor({ state: 'visible' })
      if (await solved.count() > 0) {
        await p.mouse.click(2, 2)
        await solved.waitFor({ state: 'detached', timeout: BOX_TIMEOUT_MS })
      } else await startPuzzle(p)
      await resumeAfterHistory(p)
      await showRules(p, puzzle)
    },
    async dragRules (corner, dx, dy) {
      if (!await hoverRulesFor(p, p.locator(CORNER(corner)))) return
      // A note over the corner (it sits outside the pane, at the board's right edge) takes the press, as it would a player's: nothing to drag.
      if (!await p.locator(CORNER(corner)).evaluate((el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el })) return
      const box = await p.locator(CORNER(corner)).boundingBox()
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.move(x + dx, y + dy, { steps: 6 })
      await p.mouse.up()
    },
    async rulesFont (step, times) {
      for (let i = 0; i < times; i++) {
        // Each press refits the pane and moves the bar, so the pointer goes back over the pane first: the bar shows only while it is there.
        const button = p.locator(`${FONT_BAR} button`).filter({ hasText: step > 0 ? 'f+' : 'f-' })
        // The script's own refit can move the pane a moment after the pointer reached it (after a restart, #1188): the bar then hides under a pointer that is off the pane, so a press that waits is made again after a new hover.
        for (let tries = 1; ; tries++) {
          if (!await hoverRulesFor(p, button)) return
          const last = tries === MOVE_TRIES
          if (await button.click({ timeout: last ? BOX_TIMEOUT_MS : PRESS_LOOK_MS }).then(() => true, (error) => { if (last || error.name !== 'TimeoutError') throw error })) break
        }
      }
    },
    async scrollRules (dy) {
      if (!await hoverRules(p)) return
      await p.mouse.wheel(0, dy)
    },
    // A limit typed is a limit saved only on Save; Restore defaults empties both boxes in the draft, so a Cancel after it undoes it.
    async rulesDialog ({ maxWidth, maxHeight, restore }, save) {
      await settingsScript('auto-rules-resizer.user.js').open(p)
      await p.locator(MAX_WIDTH_INPUT).fill(maxWidth)
      await p.locator(MAX_HEIGHT_INPUT).fill(maxHeight)
      if (restore) await dialogButton(p, 'Restore defaults').click()
      if (save) {
        // A text the script refuses leaves the dialog open with "Not saved"; that is its answer, so the dialog is then cancelled.
        await dialogButton(p, 'Save').click()
        const refused = p.locator(STATUS).filter({ hasText: 'Not saved' })
        const closed = p.locator(MAX_WIDTH_INPUT).waitFor({ state: 'detached' }).then(() => false)
        if (await Promise.race([closed, refused.waitFor().then(() => true)])) await closeDialogWith(p, 'Cancel', MAX_WIDTH_INPUT)
      } else {
        await closeDialogWith(p, 'Cancel', MAX_WIDTH_INPUT)
      }
    },
    // `restore` presses Restore defaults after the color is picked.
    async darkPage (color, save, restore = false) {
      await SETTINGS_DIALOGS['dark page'].open(p)
      await p.locator(DARK_PAGE_INPUT).fill(color)
      if (restore) await dialogButton(p, 'Restore defaults').click()
      await closeDialogWith(p, save ? 'Save' : 'Cancel', DARK_PAGE_INPUT)
    },
    // Copy settings answers on the dialog's status line, which is waited for: a press with no answer is a failure. Paste settings is `paste` of settings.mjs, which waits for the same line.
    async settingsText (script, text, save) {
      const { entry, editor, open } = SETTINGS_DIALOGS[script]
      await open(p)
      if (text === null) {
        await actButton(p, 'copy-settings').click()
        await p.locator(STATUS).filter({ hasText: 'Settings copied.' }).waitFor()
      } else {
        // A refused text is answered with a "Could not paste", which is the answer; a settings object the script should take is not.
        const status = await paste(p, text)
        if (/^Could not paste/.test(status) && isSettingsObject(text)) throw new Error(`pasting ${text} into ${entry} failed: ${status}`)
      }
      await closeDialogWith(p, save ? 'Save' : 'Cancel', editor)
    },
    async restoreDefaults (script, save) {
      const { editor, open } = SETTINGS_DIALOGS[script]
      await open(p)
      await dialogButton(p, 'Restore defaults').click()
      // Color by Digit asks first, inside its dialog, when the draft holds profiles of the player's own: the player says Restore defaults, or the restore is skipped.
      const ask = p.locator(`${editor} [data-role="restore-confirm"]`)
      if (await ask.count()) await ask.getByRole('button', { name: 'Restore defaults' }).click()
      await closeDialogWith(p, save ? 'Save' : 'Cancel', editor)
    },
    // Clear empties the shared log the run reads its failure's records from, which is a report's context only: a failure is a crash signal or a broken rule, read from the page.
    async errorLogButton (script, clear) {
      const { editor, open } = SETTINGS_DIALOGS[script]
      await open(p)
      await actButton(p, clear ? 'clear-error-log' : 'copy-error-log').click()
      const status = await p.locator(STATUS).filter({ hasText: /\S/ }).textContent()
      if (!ERROR_LOG_ANSWERS[clear ? 'clear' : 'copy'].test(status)) throw new Error(`${script}'s ${clear ? 'Clear' : 'Copy error log'} answered "${status}"`)
      await closeDialogWith(p, 'Cancel', editor)
    },
    async noteColorPreset (pick, save) {
      const { editor, open } = SETTINGS_DIALOGS['text anywhere']
      await open(p)
      await pickPreset(p, NOTE_COLOR_PRESET, pick)
      await closeDialogWith(p, save ? 'Save' : 'Cancel', editor)
    },
    async noteDialogFromMenu (save) {
      const { editor, open } = SETTINGS_DIALOGS['text anywhere']
      await open(p)
      await closeDialogWith(p, save ? 'Save' : 'Cancel', editor)
    },
    async penDialogFromSettingsButton (save) {
      await openPen()
      const button = p.locator(PEN_SETTINGS_BUTTON).first()
      const opened = await actWhereItIs(p.locator(EXTRAS_EDITOR), () => button.boundingBox({ timeout: BOX_TIMEOUT_MS }), (box) => p.mouse.click(...middleOf(box)), { finalMs: DIALOG_OPENS_MS })
      if (!opened) throw new Error(`no ${PEN_SETTINGS_BUTTON} on the page to click`)
      await animationsDone(p.locator(EXTRAS_EDITOR))
      await closeExtrasEditorWith(p, save ? 'Save' : 'Cancel')
    },
    async penShowBoxes ({ thickness, opacity }, save) {
      await openExtrasEditor(p)
      await p.locator(`${EXTRAS_EDITOR} input[data-box="show.thickness"]`).setChecked(thickness)
      await p.locator(`${EXTRAS_EDITOR} input[data-box="show.opacity"]`).setChecked(opacity)
      await closeExtrasEditorWith(p, save ? 'Save' : 'Cancel')
    },
    // A swatch is edited after a preset in the same dialog, which can leave colors missing from the page's palette and put a note on them; Cancel drops both.
    async penSwatchEdit (pick, pen, hex, save) {
      await openExtrasEditor(p)
      await pickPreset(p, COLOR_CHOICE, pick)
      await p.locator(`${EXTRAS_EDITOR} input[data-role="swatch"][data-key="${pen}"]`).fill(hex)
      await closeExtrasEditorWith(p, save ? 'Save' : 'Cancel')
    },
    async uiTweaks ({ hideSelect, wrapButtons, toggleTab, restore }, save) {
      await UI_TWEAKS.open(p)
      reads.uiTweaksOffNote = await p.locator(`.dialog:has(${UI_TWEAKS_DIALOG}) [data-role="off-note"]`).textContent()
      const box = (id) => p.locator(`${UI_TWEAKS_DIALOG} input[data-option="${id}"]`)
      await box('hideSelect').setChecked(hideSelect)
      await box('wrapButtons').setChecked(wrapButtons)
      // The Tab option ends where it began: a rule says Tab never switches to letters.
      if (toggleTab) {
        const was = await box('tab').isChecked()
        await box('tab').setChecked(!was)
        await box('tab').setChecked(was)
      }
      if (restore) await dialogButton(p, 'Restore defaults').click()
      await closeDialogWith(p, save ? 'Save' : 'Cancel', UI_TWEAKS_DIALOG)
    }
  }
}

// `coverage` (`coverage.mjs`'s `createCoverage`) hears the coverage of the scripts on this page: V8 keeps it per script load, so it is read before a reload and at the end.
export async function openTarget (browser, puzzle, { planted, plant, coverage }) {
  const patch = plant && plantPatch(plant)
  const { context, p, errors } = await openPage(browser, {
    // Copy settings and Paste settings of the dialogs use the clipboard.
    contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] },
    seed: async (page, collected) => {
      captureConsoleErrors(page, collected)
      if (planted) await plantEscapeError(page)
      if (coverage) await page.coverage.startJSCoverage({ resetOnNavigation: false })
      await installAll(page, coverage ? (file, code) => tagSource(file, patch ? patch(file, code) : code) : patch)
    }
  })
  // What an action read while its dialog was open, for the snapshot after it.
  const reads = { uiTweaksOffNote: null }
  const readCoverage = async () => { if (coverage) coverage.add(await p.coverage.stopJSCoverage()) }
  const restartCoverage = async () => { if (coverage) await p.coverage.startJSCoverage({ resetOnNavigation: false }) }
  try {
    if (puzzle.data) await openPuzzleId(p, await puzzleIdFor(p, puzzle.data))
    else await startWithTools(p)
    // Tab must have a letter tool to switch to, and a puzzle with rules text shows it for Auto Rules Resizer to fit.
    await p.evaluate(() => Framework.setSetting('toolletter', true))
    await showRules(p, puzzle)
    // The puzzle set says which cells are free: a page that disagrees would send every action to the wrong cell.
    const onPage = await freeCells(p)
    if (JSON.stringify(sortedCells(onPage)) !== JSON.stringify(sortedCells(puzzle.free))) throw new Error(`the ${puzzle.name} puzzle opened with ${onPage.length} free cells that are not the ${puzzle.free.length} of puzzle-set.mjs`)
    return {
      env: envFor(p, puzzle, { reads, beforeReload: async () => { await readCoverage(); await restartCoverage() } }),
      snapshot: async () => ({ errors: [...errors], notices: await p.evaluate((selector) => [...document.querySelectorAll(selector)].map((e) => e.textContent.trim()), NOTICE_BAR), page: { ...await readPageState(p, { expectRules: rulesTextFor(puzzle) !== null }), uiTweaksOffNote: reads.uiTweaksOffNote } }),
      wait: (ms) => sleep(ms),
      errorLog: async () => newestErrorRecords(await p.evaluate((key) => window.localStorage.getItem(key), ERROR_LOG_KEY)),
      close: async () => {
        try {
          await readCoverage()
        } finally {
          await context.close()
        }
      }
    }
  } catch (error) {
    await context.close()
    throw error
  }
}

const freeCells = (p) => p.evaluate(() => Framework.app.puzzle.cells.filter((c) => !c.given).map((c) => [c.row, c.col]))
const sortedCells = (cells) => [...cells].sort(([r1, c1], [r2, c2]) => r1 - r2 || c1 - c2)

// Fuzzes with `seed` (a number) for `minutes` or `runs` action lists, each on a puzzle of the set that the list names, then shrinks a failure. `path` is a printed replay
// path, `<fast-check path>@<command path>`, which replays that one failure on its puzzle. `planted` plants the Escape-during-drag page error; `plant` (`plants.mjs`) swaps one script's text for a planted bug. `config` names the generator's configuration (`configs.mjs`). `coverage` is a `createCoverage` that hears the scripts' V8 coverage of every page (`coverage.mjs`). `focus` is script files (`focusFiles` of `actions.mjs`) whose actions come up more often.
export async function fuzz ({ browser, seed, runs, minutes, shrinkMinutes, path, planted = false, plant, focus, config = DEFAULT_CONFIG, coverage }) {
  const [fcPath, replayPath] = path == null ? [] : path.split('@')
  const tracked = trackClosing((puzzle) => openTarget(browser, puzzle, { planted, plant, coverage }))
  const result = await runFuzz({
    openTarget: tracked.open,
    puzzles: FUZZ_PUZZLES,
    kinds: KINDS,
    seed,
    runs,
    minutes,
    shrinkMinutes,
    path: fcPath,
    replayPath,
    focus,
    ...configOptions(config)
  })
  // The time limit returns while the last list goes on; its page's coverage comes with its close.
  if (coverage) await tracked.allClosed()
  if (!result.failed) return result
  return { ...result, path: `${result.path}@${result.replayPath}`, replayCommand: replayCommand({ seed: result.seed, path: `${result.path}@${result.replayPath}`, planted, plant, focus, config }) }
}

// Runs one list written by hand (`steps`: `[kind, arg]`, `actions.mjs`) on `puzzle` with the checks of every run; resolves to nothing, or throws the failure.
export function fuzzScripted ({ browser, puzzle, steps }) {
  return runScript({ openTarget: (p) => openTarget(browser, p, { planted: false }), puzzle, actions: scriptedList(puzzle, steps) })
}
