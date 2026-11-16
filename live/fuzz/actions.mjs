// The fuzz's action vocabulary (#590 Q6 c, #593): what a user does with the six scripts on SudokuPad, weighted so ordinary use is the bulk, then
// interruptions in the middle of a gesture, then page-level events. Each action is one step that leaves the mouse up and no key held, so a shrunk
// list reads as plain steps and replays from the numbers alone. A list names its puzzle (`puzzle-set.mjs`, #679): the puzzle is the first thing a list
// generates, so its path replays on the same puzzle, and an action reads the digit keys and the targets from the puzzle it runs on. Not a check itself.
//
// An action runs on an `env`, never on Playwright directly, so the unit tests drive the same code with a fake one (`fake-target.mjs`). The env is:
//   env.page.mouse {move, down, up, click, dblclick, wheel}   env.page.keyboard {press, type, down, up}      Playwright's, used as they are
//   env.cellPoint(i) -> [x, y]               the page point at the centre of target `i` of the puzzle (a free cell, or a cell just outside the grid)
//   env.usePen(color)                        opens the pen tool and picks its pen color 1 to 9
//   env.clearControls()                      before every action: drags a Text Anywhere note off any button it covers, as a player does; throws when one stays covered
//   env.useNotes()                           picks Text Anywhere's tool
//   env.turnPenPage()  env.undo()  env.redo()  env.clickColorMode()
//   env.undoAll()                            presses Undo until the undo stack is empty
//   env.extrasSettings({ arrowSpacing, dash, thickness }, save)   opens Pen Tool Extras' settings dialog, sets the values it is given and presses Save or Cancel
//   env.sliderPoint(name, fraction, keepTool) -> [x, y] | null   the page point `fraction` (0 to 1) along the track of slider `name` (`SLIDERS`), opening the tool that shows it; null for a pen slider the player hid in Pen Tool Extras' dialog.
//                                            A note slider picks Text Anywhere's tool again unless `keepTool` is true, which ends a selection, so a note chosen stays chosen only with it
//   env.focusSlider(name) -> boolean  env.leaveSlider(name)   puts the keyboard focus on a slider (false for a hidden one, which takes none), and takes it off
//   env.noteBoxDialog(choice, color, save)   opens Text Anywhere's settings dialog, picks the Box color `choice` (`BOX_CHOICES`; `color` is the Own color) and presses Save or Cancel
//   env.pressNotePanel(what)                 presses a button of Text Anywhere's panel: a color 1 to 9, 'background' or 'hide all', picking the tool only when it is not current, so a selected or open note stays chosen
//   env.setNoteBackground(on)                presses Text Anywhere's Background button when it is not as `on` says
//   env.useArrowPen(color)                   opens the pen tool, turns it to the arrow lines page (page 3) and picks its pen color 1 to 9
//   env.placeNote(text, i)                   a note with `text` at cell `i`, finished with Escape
//   env.noteCentre() -> [x, y] | null        the middle of the first note drawn
//   env.profileEditor(edits, save, fromMenu) opens Color by Digit's settings dialog (from the pad menu's Edit profiles when `fromMenu`, else from the settings), makes each edit (`[op, ...numbers]`, `PROFILE_EDITS`) and presses Save or Cancel
//   env.holdColorMode(drift)                 holds the left button on the Color by Digit button: until its menu opens, then lets go and presses Escape; or, with `drift`, moves off the button past the hold's slop, waits out the hold, lets go and checks no menu opened
//   env.pickProfile(i)                       picks profile `i` (counted from 0, wrapped to the profiles there are) from the pad button's menu
//   env.restartPuzzle()                      restarts the puzzle, as SudokuPad's own Restart does
//   env.noteHandle(corner) -> [x, y] | null  the middle of the resize handle at `corner` (0 to 3) of the one note selected; null when the page shows no four handles
//   env.checkBoxPoint() -> [x, y] | null     the middle of the first check box drawn in a note
//   env.clearNotes(ok)                       presses Text Anywhere's Clear all button, and answers the question it asks (when a note is selected it asks none) with OK or Cancel
//   env.holdFor(ms)                          lets `ms` of the page's time pass while a key stays down
//   env.finishNote()                         finishes the open note with Escape
//   env.stepLineMode()                       opens the pen tool and presses the pen panel's line mode button once
//   env.tickMarks(names)                     opens Pen Tool Extras' settings dialog, ticks exactly the mark boxes `names` (`MARK_BOXES`) and presses Save
//   env.markPoint(i, where) -> [x, y]        the page point at side `where` of target `i`: 0 to 3 an edge (top, right, bottom, left) a click reads as an edge click, 4 to 7 a corner (top left, top right, bottom left, bottom right)
//   env.holdPenColor(color)                  holds the left button on the pen's color button `color` until the nine color pickers show, then lets go
//   env.setPenPicker(color, hex)             sets the open color picker of pen `color` to `hex`
//   env.holdNoteColor(color)                 picks Text Anywhere's tool, holds the left button on its text color button `color` until the nine color pickers show, then lets go
//   env.setNotePicker(color, hex)            sets the open color picker of text color `color` to `hex`
//   env.penPresets(pick, restore, save)      opens Pen Tool Extras' settings dialog, picks the color preset at position `pick` (wrapped to the pulldown's options) or, when `restore`, presses Restore defaults, and presses Save or Cancel
//   env.uiTweaks({ hideSelect, wrapButtons, toggleTab, restore }, save)   opens UI Tweaks' dialog, sets the Hide the Toggle Selection button and Wrap buttons boxes, clicks the Tab box off and on again, presses Restore defaults when `restore`, and presses Save or Cancel
//   env.settingsText(script, text, save)     opens the dialog of `script` (one of `ERROR_LOG_SCRIPTS`' words), presses Copy settings when `text` is null and else puts `text` on the clipboard and presses Paste settings, then presses Save or Cancel
//   env.dragRules(corner, dx, dy)            hovers the rules box, presses its `corner` ('ur' or 'dl') and moves it by (dx, dy), then lets go; does nothing on a page with no rules box
//   env.rulesFont(step, times)               presses the rules box's f+ (step 1) or f- (step -1) `times` times; does nothing on a page with no rules box
//   env.scrollRules(dy)                      hovers the rules box and turns the mouse wheel `dy` pixels over it; does nothing on a page with no rules box
//   env.rulesDialog({ maxWidth, maxHeight, restore }, save)   opens Auto Rules Resizer's dialog, types both limits (text, as a user types them), presses Restore defaults when `restore`, and presses Save or Cancel
//   env.resize({ width, height })  env.blurFocus()  env.reload()
//   env.darkPage(color, save, restore)       opens Dark Page's dialog, picks `color`, presses Restore defaults when `restore`, and presses Save or Cancel
//   env.restoreDefaults(script, save)        opens the dialog of `script` ('color by digit' or 'text anywhere'), presses Restore defaults, and presses Save or Cancel
//   env.errorLogButton(script, clear)        opens the dialog of `script` (`ERROR_LOG_SCRIPTS`) and presses Clear when `clear`, else Copy error log, and waits for its answer
//   env.noteColorPreset(pick, save)          opens Text Anywhere's dialog, picks the Text color preset at position `pick` (wrapped to the pulldown's options), and presses Save or Cancel
//   env.noteDialogFromMenu(save)             opens Text Anywhere's dialog from SudokuPad's settings menu, and presses Save or Cancel
//   env.penDialogFromSettingsButton(save)    opens Pen Tool Extras' dialog from the pen panel's settings button, and presses Save or Cancel
//   env.penShowBoxes({ thickness, opacity }, save)   sets the boxes that show or hide the pen panel's two sliders in Pen Tool Extras' dialog, and presses Save or Cancel
//   env.penSwatchEdit(pick, pen, hex, save)  opens Pen Tool Extras' dialog, picks color preset `pick` and sets the swatch of pen `pen` to `hex` in it, and presses Save or Cancel
import { createRequire } from 'node:module'
import fc from 'fast-check'
import { SETTINGS_SCRIPTS } from '../scripts.mjs'

const require = createRequire(import.meta.url)
const { THICKNESS, DASH, ARROW_SPACING } = require('../../pen-tool-extras.user.js')
const { BOX_LINES, BOX_PRESETS, CORNERS, NUDGE_REPEAT_MS, SPEED_WINDOW_MS } = require('../../text-anywhere.user.js')
const { scriptFiles } = require('../../sync-lib.js')

export const scriptFile = (name) => `${name}.user.js`
export const scriptName = (file) => file.replace(/\.user\.js$/, '')
const AUTO_RULES_RESIZER = scriptFile('auto-rules-resizer')
const COLOR_BY_DIGIT = scriptFile('color-by-digit')
const DARK_PAGE = scriptFile('dark-page')
const PEN_TOOL_EXTRAS = scriptFile('pen-tool-extras')
const TEXT_ANYWHERE = scriptFile('text-anywhere')
const UI_TWEAKS = scriptFile('ui-tweaks')

export const TOOL_KEYS = ['z', 'x', 'c', 'v']
const WINDOW_SIZES = [{ width: 1024, height: 600 }, { width: 1200, height: 900 }, { width: 1400, height: 1000 }]
const NOTE_TEXTS = ['15', 'a->b', 'sum 12', '!= 3', 'x\ny']
// Dark colors only: Dark Page has no off switch, its page color is the setting, and a rule says it stays dark (#590).
export const DARK_COLORS = ['#000000', '#101030', '#002010', '#201010']
// How much likelier a press of Copy settings is than any one text: it is one of the nine, and a 4-minute run drew it too rarely for UI Tweaks (#817).
const COPY_WEIGHT = 3
const textOrCopy = (texts) => fc.oneof({ weight: COPY_WEIGHT, arbitrary: fc.constant(null) }, { weight: texts.length - 1, arbitrary: fc.constantFrom(...texts.filter((t) => t !== null)) })
// The text Copy settings and Paste settings of UI Tweaks and Dark Page work on (#817): null is a press of Copy settings, the rest is put on the clipboard and pasted.
// No text turns UI Tweaks' Tab option off (a rule says Tab never switches to letters), and no valid text gives Dark Page a color that is not dark (the rule of #590);
// a text each script refuses (a wrong type, a color that is no hex, a foreign key, not JSON, empty, not an object) is the other half.
export const UI_TWEAKS_TEXTS = [null, '{"UiTweaks_hideSelect":true}', '{"UiTweaks_wrapButtons":true,"UiTweaks_hideSelect":false}', '{"UiTweaks_tab":true,"UiTweaks_hideSelect":true,"UiTweaks_wrapButtons":true}', '{"UiTweaks_hideSelect":"yes"}', '{"Other_key":1}', '[]', 'not json', '']
export const DARK_PAGE_TEXTS = [null, '{"DarkPage_color":"#101030"}', '{"DarkPage_color":"#002010"}', '{"DarkPage_color":"#000000","Other_key":1}', '{"DarkPage_color":"blue"}', '{"Other_key":1}', '[]', 'not json', '']
// The texts of the other four dialogs (#928), each a Copy press (null), settings its own reader takes (the shapes its Copy writes) and texts it takes none from;
// `actions.test.mjs` checks each against the script's `pastedSettings`. Color by Digit's `ColorByDigit_auto` is the legacy on/off the mode replaced (`withModeFromAuto`),
// a preload mark pasted at its default removes the key (the store's `removeData`), and a limit of null is no limit (`readLimit`).
const PROFILES_TEXT = '{"ColorByDigit_profiles":{"profiles":[{"name":"Mine","groups":[{"key":"1","digits":["1","3","5","7","9"]},{"key":"2","digits":["0","2","4","6","8"]}]}],"active":0}}'
const NOTE_COLORS_TEXT = `{"TextAnywhere_colors":{${Array.from({ length: 9 }, (_, i) => `"${i + 1}":"#${String(i + 1).repeat(2)}33aa"`).join(',')}}}`
export const COLOR_BY_DIGIT_TEXTS = [null, '{"ColorByDigit_mode":"digit"}', '{"ColorByDigit_mode":"off","ColorByDigit_addedPreloads":true}', '{"ColorByDigit_addedPreloads":false,"ColorByDigit_addedEachDigit":false}', '{"ColorByDigit_auto":true}', PROFILES_TEXT, '{"ColorByDigit_mode":"sideways"}', '{"Other_key":1}', '[]', 'not json', '']
export const TEXT_ANYWHERE_TEXTS = [null, '{"TextAnywhere_width":3.5,"TextAnywhere_opacity":50}', '{"TextAnywhere_outline":"thin","TextAnywhere_frame":true,"TextAnywhere_font":"fixed"}', '{"TextAnywhere_box":"yellow"}', NOTE_COLORS_TEXT, '{"TextAnywhere_width":500}', '{"TextAnywhere_colors":{"1":"red"}}', '{"Other_key":1}', '[]', 'not json', '']
export const PEN_TOOL_EXTRAS_TEXTS = [null, '{"PenColor_thickness":9}', '{"PenColor_colors":{"3":"#123456"}}', '{"EdgeMarks_marks":{"x":true,"circle":true}}', '{"PenColor_opacity":7}', '{"PenColor_thickness":"thick"}', '{"Other_key":1}', '[]', 'not json', '']
export const AUTO_RULES_RESIZER_TEXTS = [null, '{"AutoRulesResizer_maxWidth":640,"AutoRulesResizer_maxHeight":480}', '{"AutoRulesResizer_maxWidth":null}', '{"AutoRulesResizer_maxHeight":300}', '{"AutoRulesResizer_maxWidth":"tall"}', '{"AutoRulesResizer_maxHeight":0}', '{"Other_key":1}', '[]', 'not json', '']
// The six scripts with a settings dialog, by the lower-case words of the dialog's entry in SudokuPad's settings menu (`SETTINGS_SCRIPTS` of `live/scripts.mjs`): what `env.settingsText`,
// `env.restoreDefaults` and `env.errorLogButton` take. A step names the dialog by its entry.
export const ERROR_LOG_SCRIPTS = SETTINGS_SCRIPTS.map(({ entry }) => entry.toLowerCase())
const dialogEntry = (words) => SETTINGS_SCRIPTS.find(({ entry }) => entry.toLowerCase() === words).entry
const settingsTextLabel = (name, text, save) => `${name} dialog: ${text === null ? 'Copy settings' : `Paste settings ${jsonWords(text)}`} ${save ? 'Save' : 'Cancel'}`

// The rules box's two drag corners (`CORNERS` of auto-rules-resizer.user.js, which does not export it; the fake-page test checks them against `dragRulesBox`), and how far a drag goes either way:
// far enough to grow the box past the window and to shrink it to its floor, so the script's clamps get reached.
export const RULES_CORNERS = ['ur', 'dl']
export const RULES_DRAG_REACH_PX = 500
const CORNER_NAMES = { ur: 'top-right', dl: 'bottom-left' }
// What is typed into a Max auto width or height box (a number box, which takes digits, a minus sign and an e): blank (no limit), sizes from under the rules box's floor to wider than the window,
// and numbers that are no size (0 and a negative), which keep the limit as it was.
export const RULES_LIMIT_TEXTS = ['', '200', '400', '700', '2000', '0', '-5']
const limitWords = (text) => (text === '' ? 'none' : text)

export const SLIDERS = ['pen thickness', 'pen opacity', 'note size', 'note opacity']
const BOX_CHOICES = [...Object.keys(BOX_PRESETS), 'custom']
const boxLabel = (choice) => BOX_PRESETS[choice] ?? 'Own'
const SLIDER_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Home', 'End']
// The dialog's thickness slider moves in steps of `THICKNESS.step`, so it is drawn as a count of steps.
const THICKNESS_STEPS = { min: THICKNESS.min / THICKNESS.step, max: THICKNESS.max / THICKNESS.step }

// Color by Digit's profile editor (#814): the names a rename types, and the edits a dialog action makes before it saves or cancels. A row, a brush and a profile
// are counted from 0 and wrapped by the env to what the dialog holds (six profiles at the most), so a list replays on a dialog of any size.
// The last name holds the four characters `escapeHtml` replaces (#931).
export const PROFILE_NAMES = ['Mine', 'Tens', 'A B', 'x', 'Twenty four letters long!', 'R&D <b> "q"']
export const MAX_PROFILES = 6
const PROFILE_BRUSHES = 10
export const DIGITS = '0123456789'
export const MAX_PROFILE_EDITS = 4
export const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
// The keys the editor takes from the keyboard (#931): arrows and Enter on a swatch, arrows and a digit on a digit key, arrows, Enter and Space on a profile row.
export const SWATCH_KEYS = [...ARROW_KEYS, 'Enter']
export const DIGIT_KEYS = [...ARROW_KEYS, ...DIGITS]
export const ROW_KEYS = [...ARROW_KEYS, 'Enter', 'Space']

// Notes whose text draws as a list, a check box, a code block, and a note taller than its box (#815), which the wheel scrolls.
// The last one (#930) holds a header, a subtext line, an _italic_, inline code and a snake_case word, whose underscores are no italic.
export const RICH_NOTES = ['- one\n- **two**', '- [ ] buy\n- [x] sold', '```\nsum ->\n  x=1\n```', Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n'), '# Title\n-# small print\n_slow_ and snake_case and `x = 1`']
const CHECK_BOX_NOTE = RICH_NOTES[1]
const TALL_NOTE = RICH_NOTES.find((text) => text.split('\n').length > BOX_LINES)
export const NOTE_SLIDERS = SLIDERS.filter((name) => name.startsWith('note '))
// What a note edit types into a reopened note, and the size keys (`SLIDER_STEP_KEYS` of text-anywhere.user.js and pen-tool-extras.user.js, which do not export it).
export const MORE_TEXT = 'ab'
export const SIZE_KEYS = ['+', '=', '-']
const MAX_SIZE_PRESSES = 3
const RESIZE_CORNERS = Object.keys(CORNERS).length
const RESIZE_REACH_PX = 80
const WHEEL_DELTAS = [-400, -120, 120, 400, 1200]
const MAX_NUDGE_TAPS = 4
// A held arrow key repeats once it has been down NUDGE_REPEAT_MS; this much longer is a few repeats.
const NUDGE_HOLD_EXTRA_MS = 200
const jsonWords = (text) => JSON.stringify(text).replace(/,/g, ';')

// Pen Tool Extras' mark boxes (the checkboxes of its marks table), by the name the dialog's `data-box` path has after `marks.`.
export const MARK_BOXES = ['x', 'directions', 'circle', 'cornerX', 'cornerCircle', 'cellCircle', 'cellCross', 'cellDot']
const MARK_SIDES = 8
const MAX_LINE_MODE_PRESSES = 3
const COLOR_PRESET_PICKS = 6
const PEN_EDIT_ENDS = 5
const NOTE_EDIT_ENDS = 4
// Longer than the pointer's speed window and the slack on top of it (`SETTLE_SLACK_MS` of text-anywhere.user.js, 20, which it does not export): the settle timer has gone off.
export const NOTE_SETTLE_MS = SPEED_WINDOW_MS + 20 + 80

const NOTE_DRAG = [70, 40]
const ownColor = (rgb) => `#${rgb.toString(16).padStart(6, '0')}`
const OUTSIDE = [-5, -5]

// The kinds. `arg(puzzle)` is the arbitrary of an action's numbers (the puzzle's targets and digit keys, `puzzle-set.mjs`); `label(arg, at)` its readable step
// (no comma, which fast-check joins steps with; `at(i)` names a target); `run(env, arg, model)` does it. `check(model)` says whether it can run now.
function buildKinds () {
  const cell = (puzzle) => fc.nat(puzzle.cells.length - 1)
  const digit = (puzzle) => fc.constantFrom(...puzzle.keys)
  const color = fc.integer({ min: 1, max: 9 })
  const toolKey = fc.constantFrom(...TOOL_KEYS)
  const row = fc.nat(MAX_PROFILES - 1)
  // One edit of the profiles dialog: `[op, ...numbers]`. `cell profile` and `digit profile` choose a pulldown's option, counted from 0 and wrapped to the options there are; the digit pulldown lists Same as cell, then the profiles, then None.
  const profileEdit = fc.oneof(
    fc.constant(['new']),
    fc.tuple(fc.constant('rename'), fc.nat(PROFILE_NAMES.length - 1)),
    fc.tuple(fc.constant('delete'), row),
    fc.tuple(fc.constant('move'), row, row),
    fc.tuple(fc.constant('select'), row),
    fc.tuple(fc.constant('paint'), fc.nat(DIGITS.length - 1), fc.nat(PROFILE_BRUSHES - 1)),
    fc.tuple(fc.constant('cell profile'), row),
    fc.tuple(fc.constant('digit profile'), fc.nat(MAX_PROFILES + 1)),
    fc.tuple(fc.constant('swatch key'), fc.nat(PROFILE_BRUSHES - 1), fc.nat(SWATCH_KEYS.length - 1)),
    fc.tuple(fc.constant('digit key'), fc.nat(DIGITS.length - 1), fc.nat(DIGIT_KEYS.length - 1)),
    fc.tuple(fc.constant('row key'), row, fc.nat(ROW_KEYS.length - 1)),
    fc.tuple(fc.constant('paint drag'), fc.nat(DIGITS.length - 1), fc.nat(DIGITS.length - 1), fc.nat(PROFILE_BRUSHES - 1)),
    fc.constant(['clear all'])
  )
  const profileEditWords = ([op, a, b, c]) => ({
    new: () => 'new profile',
    rename: () => `rename to ${PROFILE_NAMES[a]}`,
    delete: () => `delete profile ${a}`,
    move: () => `move profile ${a} to ${b}`,
    select: () => `select profile ${a}`,
    paint: () => `paint digit ${DIGITS[a]} with swatch ${b}`,
    'cell profile': () => `cell profile ${a}`,
    'digit profile': () => `digit profile ${a}`,
    'swatch key': () => `press ${SWATCH_KEYS[b]} on swatch ${a}`,
    'digit key': () => `press ${DIGIT_KEYS[b]} on digit ${DIGITS[a]}`,
    'row key': () => `press ${ROW_KEYS[b]} on profile row ${a}`,
    'paint drag': () => `drag from digit ${DIGITS[a]} to digit ${DIGITS[b]} with swatch ${c}`,
    'clear all': () => 'Clear all'
  })[op]()
  const note = (puzzle) => fc.tuple(fc.nat(NOTE_TEXTS.length - 1), cell(puzzle))

  // A pen drag from cell `a` to cell `b` with the left button still down.
  // `pick` names the env method that opens the pen and picks its color: `usePen` for the page the pen is on, `useArrowPen` for page 3.
  async function penDragStart (env, [a, b, c], pick = 'usePen') {
    const [from, to] = [await env.cellPoint(a), await env.cellPoint(b)]
    await env[pick](c)
    await env.page.mouse.move(...from)
    await env.page.mouse.down()
    await env.page.mouse.move(...to, { steps: 6 })
  }
  const penDrag = (kind, scripts, words, interrupt, extra = fc.constant(null)) => ({
    kind,
    group: 'interruption',
    scripts,
    start: false,
    stroke: true,
    weight: 1,
    arg: (puzzle) => fc.tuple(cell(puzzle), cell(puzzle), color, extra),
    label: ([a, b, c, x], at) => `pen drag ${at(a)} -> ${at(b)} color ${c} then ${words(x)} then release`,
    run: async (env, arg) => {
      await penDragStart(env, arg)
      await interrupt(env, arg)
      await env.page.mouse.up()
    }
  })

  async function eraseHoldStart (env, [a, b]) {
    const [from, to] = [await env.cellPoint(a), await env.cellPoint(b)]
    await env.usePen(1)
    await env.page.mouse.move(...from)
    await env.page.mouse.down({ button: 'right' })
    await env.page.mouse.move(...to, { steps: 4 })
  }
  const eraseHold = (kind, scripts, words, interrupt, extra = fc.constant(null)) => ({
    kind,
    group: 'interruption',
    scripts,
    start: false,
    stroke: false,
    weight: 1,
    arg: (puzzle) => fc.tuple(cell(puzzle), cell(puzzle), extra),
    label: ([a, b, x], at) => `right-click erase held ${at(a)} -> ${at(b)} then ${words(x)} then release`,
    run: async (env, arg) => {
      await eraseHoldStart(env, arg)
      await interrupt(env, arg)
      await env.page.mouse.up({ button: 'right' })
    }
  })

  // A drag of the note whose middle is `centre`, with the left button still down.
  async function pressNote (env, centre) {
    await env.useNotes()
    await env.page.mouse.move(...centre)
    await env.page.mouse.down()
  }
  async function dragNote (env, centre) {
    await pressNote(env, centre)
    await env.page.mouse.move(centre[0] + NOTE_DRAG[0], centre[1] + NOTE_DRAG[1], { steps: 6 })
  }
  async function firstNote (env, text, a) {
    return await env.noteCentre() ?? (await env.placeNote(text, a), await env.noteCentre())
  }
  async function noteDragStart (env, [t, a]) {
    await dragNote(env, await firstNote(env, NOTE_TEXTS[t], a))
  }
  // Selects the first note with a click of the notes tool, and gives its middle; null when placing the note opened none (a click that landed on a note selects it instead), and nothing is clicked.
  async function selectFirstNote (env, text, a) {
    const centre = await firstNote(env, text, a)
    if (!centre) return null
    await env.useNotes()
    await env.page.mouse.click(...centre)
    return centre
  }
  // Opens the first note for typing with a double-click, and gives its middle; null when there is no note.
  async function openFirstNote (env, text, a) {
    const centre = await firstNote(env, text, a)
    if (!centre) return null
    await env.useNotes()
    await env.page.mouse.dblclick(...centre)
    return centre
  }
  const ifNone = (t, a, at) => `(note ${jsonWords(NOTE_TEXTS[t])} at ${at(a)} if none)`
  const noteDrag = (kind, scripts, words, interrupt) => ({
    kind,
    group: 'interruption',
    scripts,
    start: false,
    stroke: false,
    weight: 1,
    arg: note,
    label: ([t, a], at) => `note drag ${ifNone(t, a, at)} then ${words} then release`,
    run: async (env, arg) => {
      await noteDragStart(env, arg)
      await interrupt(env, arg)
      await env.page.mouse.up()
    }
  })
  const press = (key) => (env) => env.page.keyboard.press(key)
  // Copy settings or one text pasted into the dialog of `script` (#928), then Save or Cancel, as UI Tweaks' and Dark Page's kinds do.
  const settingsTextKind = (script, file, texts) => ({
    kind: `${script} settings text`,
    group: 'ordinary',
    scripts: [file],
    start: true,
    stroke: false,
    weight: 1,
    arg: () => fc.tuple(textOrCopy(texts), fc.boolean()),
    label: ([text, save]) => settingsTextLabel(dialogEntry(script), text, save),
    run: (env, [text, save]) => env.settingsText(script, text, save)
  })

  return [
    {
      kind: 'click cell',
      group: 'ordinary',
      scripts: [],
      start: true,
      stroke: false,
      weight: 6,
      arg: cell,
      label: (i, at) => `click ${at(i)}`,
      run: async (env, i, model) => {
        await env.page.mouse.click(...await env.cellPoint(i))
        model.selected = true
      }
    },
    {
      kind: 'type digit',
      group: 'ordinary',
      scripts: [COLOR_BY_DIGIT],
      start: true,
      stroke: false,
      weight: 8,
      arg: digit,
      label: (d) => `type ${d}`,
      check: (model) => model.selected,
      run: (env, d) => env.page.keyboard.press(d)
    },
    {
      kind: 'enter digit',
      group: 'ordinary',
      scripts: [COLOR_BY_DIGIT],
      start: true,
      stroke: false,
      weight: 5,
      arg: (puzzle) => fc.tuple(cell(puzzle), digit(puzzle)),
      label: ([i, d], at) => `enter ${d} in ${at(i)}`,
      run: async (env, [i, d], model) => {
        // The digit tool first: any other tool would turn the same key into a mark or a color.
        await env.page.keyboard.press(TOOL_KEYS[0])
        await env.page.mouse.click(...await env.cellPoint(i))
        await env.page.keyboard.press(d)
        model.selected = true
      }
    },
    { kind: 'undo', group: 'ordinary', scripts: [PEN_TOOL_EXTRAS, TEXT_ANYWHERE], start: false, stroke: false, weight: 3, arg: () => fc.constant(null), label: () => 'undo', run: (env) => env.undo() },
    { kind: 'undo all', group: 'ordinary', scripts: [PEN_TOOL_EXTRAS, TEXT_ANYWHERE], start: false, stroke: false, weight: 1, arg: () => fc.constant(null), label: () => 'undo back to the start', run: (env) => env.undoAll() },
    { kind: 'redo', group: 'ordinary', scripts: [PEN_TOOL_EXTRAS, TEXT_ANYWHERE], start: false, stroke: false, weight: 2, arg: () => fc.constant(null), label: () => 'redo', run: (env) => env.redo() },
    { kind: 'tool key', group: 'ordinary', scripts: [COLOR_BY_DIGIT, UI_TWEAKS], start: true, stroke: false, weight: 3, arg: () => toolKey, label: (k) => `press ${k}`, run: (env, k) => env.page.keyboard.press(k) },
    { kind: 'tab', group: 'ordinary', scripts: [UI_TWEAKS], start: false, stroke: false, weight: 1, arg: () => fc.constant(null), label: () => 'press Tab', run: (env) => env.page.keyboard.press('Tab') },
    {
      kind: 'pen line',
      group: 'ordinary',
      scripts: [PEN_TOOL_EXTRAS],
      start: true,
      stroke: true,
      weight: 4,
      arg: (puzzle) => fc.tuple(cell(puzzle), cell(puzzle), color),
      label: ([a, b, c], at) => `pen line ${at(a)} -> ${at(b)} color ${c}`,
      run: async (env, arg) => {
        await penDragStart(env, arg)
        await env.page.mouse.up()
      }
    },
    {
      kind: 'pen erase',
      group: 'ordinary',
      scripts: [PEN_TOOL_EXTRAS],
      start: false,
      stroke: true,
      weight: 2,
      arg: cell,
      label: (i, at) => `right-click ${at(i)} with the pen`,
      run: async (env, i) => {
        const point = await env.cellPoint(i)
        await env.usePen(1)
        await env.page.mouse.click(...point, { button: 'right' })
      }
    },
    { kind: 'pen page', group: 'ordinary', scripts: [PEN_TOOL_EXTRAS], start: true, stroke: false, weight: 2, arg: () => fc.constant(null), label: () => 'turn the pen page', run: (env) => env.turnPenPage() },
    {
      kind: 'place note',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: true,
      stroke: false,
      weight: 3,
      arg: note,
      label: ([t, a], at) => `note ${jsonWords(NOTE_TEXTS[t])} at ${at(a)}`,
      run: (env, [t, a]) => env.placeNote(NOTE_TEXTS[t], a)
    },
    {
      kind: 'move note',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 2,
      arg: () => fc.constant(null),
      label: () => 'move the first note',
      run: async (env) => {
        const centre = await env.noteCentre()
        if (!centre) return
        await dragNote(env, centre)
        await env.page.mouse.up()
      }
    },
    {
      kind: 'pen line mode',
      group: 'ordinary',
      scripts: [PEN_TOOL_EXTRAS],
      start: true,
      stroke: true,
      weight: 3,
      arg: (puzzle) => fc.tuple(fc.integer({ min: 1, max: MAX_LINE_MODE_PRESSES }), cell(puzzle), cell(puzzle), color),
      label: ([presses, a, b, c], at) => `press the pen line mode button ${presses} time${presses === 1 ? '' : 's'} then pen line ${at(a)} -> ${at(b)} color ${c}`,
      run: async (env, [presses, a, b, c]) => {
        for (let i = 0; i < presses; i++) await env.stepLineMode()
        await penDragStart(env, [a, b, c])
        await env.page.mouse.up()
      }
    },
    {
      kind: 'pen mark',
      group: 'ordinary',
      scripts: [PEN_TOOL_EXTRAS],
      start: true,
      stroke: true,
      weight: 3,
      arg: (puzzle) => fc.tuple(fc.subarray(MARK_BOXES), cell(puzzle), fc.nat(MARK_SIDES - 1), color),
      label: ([boxes, a, side, c], at) => `tick the mark boxes ${boxes.join(' ') || 'none'} then click side ${side} of ${at(a)} with pen ${c}`,
      run: async (env, [boxes, a, side, c]) => {
        await env.tickMarks(boxes)
        await env.usePen(c)
        await env.page.mouse.click(...await env.markPoint(a, side))
      }
    },
    {
      kind: 'pen color edit',
      group: 'ordinary',
      scripts: [PEN_TOOL_EXTRAS],
      start: false,
      stroke: false,
      weight: 2,
      arg: (puzzle) => fc.tuple(color, fc.nat(PEN_EDIT_ENDS - 1), fc.integer({ min: 0, max: 0xffffff }), cell(puzzle), toolKey),
      label: ([c, end, rgb, a, key], at) => `hold pen color ${c} to edit its color then ${['press Escape', `recolor it to ${ownColor(rgb)} and press Escape`, `click ${at(a)}`, `press ${key}`, 'turn the pen page'][end]}`,
      run: async (env, [c, end, rgb, a, key]) => {
        await env.usePen(c)
        await env.holdPenColor(c)
        if (end === 1) await env.setPenPicker(c, ownColor(rgb))
        if (end === 2) await env.page.mouse.click(...await env.cellPoint(a))
        else if (end === 3) await env.page.keyboard.press(key)
        else if (end === 4) await env.turnPenPage()
        else await env.page.keyboard.press('Escape')
      }
    },
    {
      kind: 'pen colors dialog',
      group: 'ordinary',
      scripts: [PEN_TOOL_EXTRAS],
      start: true,
      stroke: false,
      weight: 2,
      arg: () => fc.tuple(fc.nat(COLOR_PRESET_PICKS - 1), fc.boolean(), fc.boolean()),
      label: ([pick, restore, save]) => `Pen Tool Extras colors: ${restore ? 'Restore defaults' : `preset ${pick}`} ${save ? 'Save' : 'Cancel'}`,
      run: (env, [pick, restore, save]) => env.penPresets(pick, restore, save)
    },
    {
      kind: 'pen settings',
      group: 'ordinary',
      scripts: [PEN_TOOL_EXTRAS],
      start: false,
      stroke: false,
      weight: 1,
      arg: () => fc.boolean(),
      label: (save) => `Pen Tool Extras settings dialog ${save ? 'Save' : 'Cancel'}`,
      run: (env, save) => env.extrasSettings({}, save)
    },
    {
      kind: 'slider drag',
      group: 'ordinary',
      scripts: [PEN_TOOL_EXTRAS, TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 4,
      arg: () => fc.tuple(fc.nat(SLIDERS.length - 1), fc.nat(10), fc.nat(10)),
      label: ([s, from, to]) => `drag the ${SLIDERS[s]} slider from ${from * 10}% to ${to * 10}%`,
      run: async (env, [s, from, to]) => {
        const start = await env.sliderPoint(SLIDERS[s], from / 10)
        // A pen slider hidden in Pen Tool Extras' dialog is not on the panel, and a player cannot drag it.
        if (!start) return
        const end = await env.sliderPoint(SLIDERS[s], to / 10)
        await env.page.mouse.move(...start)
        await env.page.mouse.down()
        await env.page.mouse.move(...end, { steps: 8 })
        await env.page.mouse.up()
      }
    },
    {
      kind: 'slider keys',
      group: 'ordinary',
      scripts: [PEN_TOOL_EXTRAS, TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 2,
      arg: () => fc.tuple(fc.nat(SLIDERS.length - 1), fc.nat(SLIDER_KEYS.length - 1), fc.integer({ min: 1, max: 5 })),
      label: ([s, k, times]) => `press ${SLIDER_KEYS[k]} ${times} times on the ${SLIDERS[s]} slider`,
      run: async (env, [s, k, times]) => {
        if (!await env.focusSlider(SLIDERS[s])) return
        for (let i = 0; i < times; i++) await env.page.keyboard.press(SLIDER_KEYS[k])
        await env.leaveSlider(SLIDERS[s])
      }
    },
    {
      kind: 'pen settings values',
      group: 'ordinary',
      scripts: [PEN_TOOL_EXTRAS],
      start: true,
      stroke: false,
      weight: 3,
      arg: () => fc.tuple(fc.integer({ min: ARROW_SPACING.min, max: ARROW_SPACING.max }), fc.integer({ min: DASH.min, max: DASH.max }), fc.integer(THICKNESS_STEPS), fc.boolean()),
      label: ([spacing, dash, steps, save]) => `Pen Tool Extras settings dialog: arrow spacing ${spacing} dash ${dash} thickness ${steps * THICKNESS.step} ${save ? 'Save' : 'Cancel'}`,
      run: (env, [arrowSpacing, dash, steps, save]) => env.extrasSettings({ arrowSpacing, dash, thickness: steps * THICKNESS.step }, save)
    },
    {
      kind: 'note box color',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: true,
      stroke: false,
      weight: 3,
      arg: () => fc.tuple(fc.constantFrom(...BOX_CHOICES), fc.integer({ min: 0, max: 0xffffff }), fc.boolean()),
      label: ([choice, rgb, save]) => `Text Anywhere box color ${boxLabel(choice)}${choice === 'custom' ? ` ${ownColor(rgb)}` : ''} ${save ? 'Save' : 'Cancel'}`,
      run: (env, [choice, rgb, save]) => env.noteBoxDialog(choice, ownColor(rgb), save)
    },
    {
      kind: 'note background',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: true,
      stroke: false,
      weight: 2,
      arg: () => fc.boolean(),
      label: (on) => `turn the Text Anywhere Background button ${on ? 'on' : 'off'}`,
      run: (env, on) => env.setNoteBackground(on)
    },
    {
      kind: 'boxed note',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: true,
      stroke: false,
      weight: 3,
      arg: note,
      label: ([t, a], at) => `note ${jsonWords(NOTE_TEXTS[t])} with a box at ${at(a)}`,
      run: async (env, [t, a]) => {
        await env.setNoteBackground(true)
        await env.placeNote(NOTE_TEXTS[t], a)
      }
    },
    {
      kind: 'arrow line',
      group: 'ordinary',
      scripts: [PEN_TOOL_EXTRAS],
      start: true,
      stroke: true,
      weight: 3,
      arg: (puzzle) => fc.tuple(cell(puzzle), cell(puzzle), color),
      label: ([a, b, c], at) => `arrow line ${at(a)} -> ${at(b)} color ${c}`,
      run: async (env, arg) => {
        await penDragStart(env, arg, 'useArrowPen')
        await env.page.mouse.up()
      }
    },
    {
      kind: 'rich note',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: true,
      stroke: false,
      weight: 2,
      arg: (puzzle) => fc.tuple(fc.nat(RICH_NOTES.length - 1), cell(puzzle)),
      label: ([t, a], at) => `note ${jsonWords(RICH_NOTES[t])} at ${at(a)}`,
      run: (env, [t, a]) => env.placeNote(RICH_NOTES[t], a)
    },
    {
      kind: 'note resize',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 2,
      arg: (puzzle) => fc.tuple(note(puzzle), fc.nat(RESIZE_CORNERS - 1), fc.integer({ min: -RESIZE_REACH_PX, max: RESIZE_REACH_PX }), fc.integer({ min: -RESIZE_REACH_PX, max: RESIZE_REACH_PX })),
      label: ([[t, a], corner, dx, dy], at) => `drag corner ${corner} of the first note ${ifNone(t, a, at)} by ${dx} x ${dy}`,
      run: async (env, [[t, a], corner, dx, dy]) => {
        // With no note, or a click that selected no one note, there are no handles to press.
        const handle = await selectFirstNote(env, NOTE_TEXTS[t], a) && await env.noteHandle(corner)
        if (!handle) return
        await env.page.mouse.move(...handle)
        await env.page.mouse.down()
        await env.page.mouse.move(handle[0] + dx, handle[1] + dy, { steps: 6 })
        await env.page.mouse.up()
      }
    },
    {
      kind: 'note wheel',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 1,
      arg: (puzzle) => fc.tuple(cell(puzzle), fc.constantFrom(...WHEEL_DELTAS)),
      label: ([a, dy], at) => `wheel ${dy} over the first note (a tall note at ${at(a)} if none)`,
      run: async (env, [a, dy]) => {
        const centre = await firstNote(env, TALL_NOTE, a)
        if (!centre) return
        await env.page.mouse.move(...centre)
        await env.page.mouse.wheel(0, dy)
      }
    },
    {
      kind: 'note rectangle',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 2,
      arg: (puzzle) => fc.tuple(cell(puzzle), cell(puzzle), fc.boolean()),
      label: ([a, b, shift], at) => `drag a selection rectangle ${at(a)} -> ${at(b)}${shift ? ' holding Shift' : ''}`,
      run: async (env, [a, b, shift]) => {
        const [from, to] = [await env.cellPoint(a), await env.cellPoint(b)]
        await env.useNotes()
        if (shift) await env.page.keyboard.down('Shift')
        await env.page.mouse.move(...from)
        await env.page.mouse.down()
        await env.page.mouse.move(...to, { steps: 6 })
        await env.page.mouse.up()
        if (shift) await env.page.keyboard.up('Shift')
      }
    },
    {
      kind: 'note nudge',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 2,
      arg: (puzzle) => fc.tuple(note(puzzle), fc.nat(ARROW_KEYS.length - 1), fc.boolean(), fc.option(fc.integer({ min: 1, max: MAX_NUDGE_TAPS }), { nil: 0 })),
      label: ([[t, a], k, shift, taps], at) => `nudge the first note ${ifNone(t, a, at)} with ${shift ? 'Shift+' : ''}${ARROW_KEYS[k]} ${taps ? `${taps} times` : 'held'}`,
      run: async (env, [[t, a], k, shift, taps]) => {
        if (!await selectFirstNote(env, NOTE_TEXTS[t], a)) return
        if (shift) await env.page.keyboard.down('Shift')
        if (taps) {
          for (let i = 0; i < taps; i++) await env.page.keyboard.press(ARROW_KEYS[k])
        } else {
          await env.page.keyboard.down(ARROW_KEYS[k])
          await env.holdFor(NUDGE_REPEAT_MS + NUDGE_HOLD_EXTRA_MS)
          await env.page.keyboard.up(ARROW_KEYS[k])
        }
        if (shift) await env.page.keyboard.up('Shift')
      }
    },
    {
      kind: 'clear notes',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 1,
      arg: (puzzle) => fc.tuple(note(puzzle), fc.boolean(), fc.boolean()),
      label: ([[t, a], selectFirst, ok], at) => `press Clear all${selectFirst ? ` with the first note selected ${ifNone(t, a, at)}` : ''}: ${ok ? 'OK' : 'Cancel'}`,
      run: async (env, [[t, a], selectFirst, ok]) => {
        if (selectFirst) await selectFirstNote(env, NOTE_TEXTS[t], a)
        await env.clearNotes(ok)
      }
    },
    {
      kind: 'tick check box',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 2,
      arg: cell,
      label: (a, at) => `tick the first check box of a note (a check box note at ${at(a)} if none)`,
      run: async (env, a) => {
        await env.useNotes()
        const point = await env.checkBoxPoint() ?? (await env.placeNote(CHECK_BOX_NOTE, a), await env.checkBoxPoint())
        if (point) await env.page.mouse.click(...point)
      }
    },
    {
      kind: 'reopen note',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 1,
      arg: note,
      label: ([t, a], at) => `double-click the first note ${ifNone(t, a, at)} and finish it`,
      run: async (env, [t, a]) => {
        const centre = await firstNote(env, NOTE_TEXTS[t], a)
        if (!centre) return
        await env.useNotes()
        await env.page.mouse.dblclick(...centre)
        await env.finishNote()
      }
    },
    {
      kind: 'note erase',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 2,
      // `click` is a right click on the note; `drag` presses the right button on cell `from`, goes over the note and on to cell `to` (the tool's erase, which a right-drag only extends: AGENTS.md).
      // A note open for typing is finished by any press outside it and a press inside it starts no erase, so there is no erase with a note open.
      arg: (puzzle) => fc.tuple(note(puzzle), cell(puzzle), cell(puzzle), fc.constantFrom('click', 'drag')),
      label: ([[t, a], from, to, how], at) => how === 'click'
        ? `right-click the first note ${ifNone(t, a, at)}`
        : `right-drag from ${at(from)} over the first note ${ifNone(t, a, at)} to ${at(to)}`,
      run: async (env, [[t, a], from, to, how]) => {
        const centre = await firstNote(env, NOTE_TEXTS[t], a)
        if (!centre) return
        await env.useNotes()
        if (how === 'click') {
          await env.page.mouse.click(...centre, { button: 'right' })
          return
        }
        await env.page.mouse.move(...await env.cellPoint(from))
        await env.page.mouse.down({ button: 'right' })
        await env.page.mouse.move(...centre, { steps: 4 })
        await env.page.mouse.move(...await env.cellPoint(to), { steps: 4 })
        await env.page.mouse.up({ button: 'right' })
      }
    },
    {
      kind: 'note restyle',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: true,
      stroke: false,
      weight: 2,
      arg: (puzzle) => fc.tuple(note(puzzle), fc.boolean(), fc.oneof(
        fc.tuple(fc.constant('color'), color),
        fc.constant(['background']),
        fc.tuple(fc.constant('slider'), fc.nat(NOTE_SLIDERS.length - 1), fc.nat(10), fc.nat(10))
      )),
      label: ([[t, a], open, [what, x, from, to]], at) => `${what === 'color' ? `press note color ${x}` : what === 'background' ? 'press the Background button' : `drag the ${NOTE_SLIDERS[x]} slider from ${from * 10}% to ${to * 10}%`} with the first note ${ifNone(t, a, at)} ${open ? 'open' : 'selected'}`,
      run: async (env, [[t, a], open, [what, x, from, to]]) => {
        const chosen = open ? await openFirstNote(env, NOTE_TEXTS[t], a) : await selectFirstNote(env, NOTE_TEXTS[t], a)
        if (!chosen) return
        if (what === 'slider') {
          const [start, end] = [await env.sliderPoint(NOTE_SLIDERS[x], from / 10, true), await env.sliderPoint(NOTE_SLIDERS[x], to / 10, true)]
          await env.page.mouse.move(...start)
          await env.page.mouse.down()
          await env.page.mouse.move(...end, { steps: 8 })
          await env.page.mouse.up()
        } else {
          await env.pressNotePanel(what === 'color' ? x : what)
        }
        if (open) await env.finishNote()
      }
    },
    {
      kind: 'size key',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE, PEN_TOOL_EXTRAS],
      start: true,
      stroke: false,
      weight: 2,
      // With Text Anywhere's tool the keys step the size of the notes selected; with the pen, its thickness.
      arg: (puzzle) => fc.tuple(note(puzzle), fc.boolean(), fc.nat(SIZE_KEYS.length - 1), fc.integer({ min: 1, max: MAX_SIZE_PRESSES })),
      label: ([[t, a], pen, k, times], at) => `press ${SIZE_KEYS[k]} ${times} time${times === 1 ? '' : 's'} with ${pen ? 'the pen' : `the first note selected ${ifNone(t, a, at)}`}`,
      run: async (env, [[t, a], pen, k, times]) => {
        if (pen) await env.usePen(1)
        else if (!await selectFirstNote(env, NOTE_TEXTS[t], a)) return
        for (let i = 0; i < times; i++) await env.page.keyboard.press(SIZE_KEYS[k])
      }
    },
    {
      kind: 'note edit',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 1,
      arg: (puzzle) => fc.tuple(note(puzzle), fc.constantFrom('click and type', 'type more', 'delete all')),
      label: ([[t, a], how], at) => `double-click the first note ${ifNone(t, a, at)} then ${how === 'click and type' ? `click in it and type ${MORE_TEXT}` : how === 'type more' ? `type ${MORE_TEXT}` : 'delete all its text'} and finish it`,
      run: async (env, [[t, a], how]) => {
        const centre = await openFirstNote(env, NOTE_TEXTS[t], a)
        if (!centre) return
        if (how === 'click and type') await env.page.mouse.click(...centre)
        if (how === 'delete all') {
          await env.page.keyboard.press('Control+a')
          await env.page.keyboard.press('Backspace')
        } else {
          await env.page.keyboard.type(MORE_TEXT)
        }
        await env.finishNote()
      }
    },
    {
      kind: 'hide all notes',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 1,
      // Pressed twice, the notes are shown again.
      arg: () => fc.boolean(),
      label: (twice) => `press Hide all${twice ? ' twice' : ''}`,
      run: async (env, twice) => {
        await env.pressNotePanel('hide all')
        if (twice) await env.pressNotePanel('hide all')
      }
    },
    {
      kind: 'note color edit',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 2,
      // The hold of `pen color edit` on Text Anywhere's own text colors; its pickers end on Escape, a press outside the panel or a tool key.
      arg: (puzzle) => fc.tuple(color, fc.nat(NOTE_EDIT_ENDS - 1), fc.integer({ min: 0, max: 0xffffff }), cell(puzzle), toolKey),
      label: ([c, end, rgb, a, key], at) => `hold text color ${c} to edit its color then ${['press Escape', `recolor it to ${ownColor(rgb)} and press Escape`, `click ${at(a)}`, `press ${key}`][end]}`,
      run: async (env, [c, end, rgb, a, key]) => {
        await env.holdNoteColor(c)
        if (end === 1) await env.setNotePicker(c, ownColor(rgb))
        if (end === 2) await env.page.mouse.click(...await env.cellPoint(a))
        else if (end === 3) await env.page.keyboard.press(key)
        else await env.page.keyboard.press('Escape')
      }
    },
    {
      kind: 'note shift drag',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 1,
      // Shift goes down after the press: held at the press, a note is only selected. With it down the drag keeps to one axis (`lockedAxis`).
      arg: (puzzle) => note(puzzle),
      label: ([t, a], at) => `drag the first note ${ifNone(t, a, at)} with Shift held`,
      run: async (env, [t, a]) => {
        const centre = await firstNote(env, NOTE_TEXTS[t], a)
        await pressNote(env, centre)
        await env.page.keyboard.down('Shift')
        await env.page.mouse.move(centre[0] + NOTE_DRAG[0], centre[1] + NOTE_DRAG[1], { steps: 6 })
        await env.page.mouse.up()
        await env.page.keyboard.up('Shift')
      }
    },
    {
      kind: 'note drag held still',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 1,
      // Held past the pointer's speed window, the note is drawn again where it stands (the settle timer).
      arg: (puzzle) => note(puzzle),
      label: ([t, a], at) => `drag the first note ${ifNone(t, a, at)} then hold it still ${NOTE_SETTLE_MS} ms and let go`,
      run: async (env, arg) => {
        await noteDragStart(env, arg)
        await env.holdFor(NOTE_SETTLE_MS)
        await env.page.mouse.up()
      }
    },
    {
      kind: 'note press lost',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 1,
      // A press that never moves and then loses the pointer to a window blur (`endGesture`, on the window's blur): the press ends as a click on its own (`endDrag`'s default), and the later release does nothing.
      arg: (puzzle) => note(puzzle),
      label: ([t, a], at) => `press the first note ${ifNone(t, a, at)} then blur the window and let go`,
      run: async (env, [t, a]) => {
        await pressNote(env, await firstNote(env, NOTE_TEXTS[t], a))
        await env.blurFocus()
        await env.page.mouse.up()
      }
    },
    {
      kind: 'note resize escape',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 1,
      arg: (puzzle) => fc.tuple(note(puzzle), fc.nat(RESIZE_CORNERS - 1), fc.integer({ min: -RESIZE_REACH_PX, max: RESIZE_REACH_PX }), fc.integer({ min: -RESIZE_REACH_PX, max: RESIZE_REACH_PX })),
      label: ([[t, a], corner, dx, dy], at) => `drag corner ${corner} of the first note ${ifNone(t, a, at)} by ${dx} x ${dy} then press Escape and let go`,
      run: async (env, [[t, a], corner, dx, dy]) => {
        const handle = await selectFirstNote(env, NOTE_TEXTS[t], a) && await env.noteHandle(corner)
        if (!handle) return
        await env.page.mouse.move(...handle)
        await env.page.mouse.down()
        await env.page.mouse.move(handle[0] + dx, handle[1] + dy, { steps: 6 })
        await env.page.keyboard.press('Escape')
        await env.page.mouse.up()
      }
    },
    {
      kind: 'note handle reset',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 1,
      // A note resized by its handle and then put back to its own size by a double-click on the handle; selected, a note with no box is not resized by it, so half the draws open the note.
      arg: (puzzle) => fc.tuple(note(puzzle), fc.nat(RESIZE_CORNERS - 1), fc.boolean(), fc.integer({ min: -RESIZE_REACH_PX, max: RESIZE_REACH_PX }), fc.integer({ min: -RESIZE_REACH_PX, max: RESIZE_REACH_PX })),
      label: ([[t, a], corner, open, dx, dy], at) => `drag corner ${corner} of the first note ${open ? 'open' : 'selected'} ${ifNone(t, a, at)} by ${dx} x ${dy} then double-click it`,
      run: async (env, [[t, a], corner, open, dx, dy]) => {
        const chosen = open ? await openFirstNote(env, NOTE_TEXTS[t], a) : await selectFirstNote(env, NOTE_TEXTS[t], a)
        const handle = chosen && await env.noteHandle(corner)
        if (!handle) return
        await env.page.mouse.move(...handle)
        await env.page.mouse.down()
        await env.page.mouse.move(handle[0] + dx, handle[1] + dy, { steps: 6 })
        await env.page.mouse.up()
        // The note stays selected or open after its drag, so its handle is still there: a missing one is a failure, not a step to skip.
        const moved = await env.noteHandle(corner)
        if (!moved) throw new Error(`corner ${corner}'s handle is gone after its drag`)
        await env.page.mouse.dblclick(...moved)
        if (open) await env.finishNote()
      }
    },
    {
      kind: 'profile editor',
      group: 'ordinary',
      scripts: [COLOR_BY_DIGIT],
      start: true,
      stroke: false,
      weight: 1,
      arg: () => fc.tuple(fc.array(profileEdit, { maxLength: MAX_PROFILE_EDITS, size: 'max' }), fc.boolean(), fc.boolean()),
      label: ([edits, save, fromMenu]) => `Color by Digit profiles dialog${fromMenu ? ' from the pad menu' : ''}: ${edits.map(profileEditWords).map((w) => `${w} then `).join('')}${save ? 'Save' : 'Cancel'}`,
      run: (env, [edits, save, fromMenu]) => env.profileEditor(edits, save, fromMenu)
    },
    {
      kind: 'profile switch',
      group: 'ordinary',
      scripts: [COLOR_BY_DIGIT],
      start: true,
      stroke: false,
      weight: 2,
      arg: () => fc.nat(MAX_PROFILES - 1),
      label: (i) => `pick profile ${i} from the pad menu`,
      run: (env, i) => env.pickProfile(i)
    },
    {
      kind: 'color button hold',
      group: 'ordinary',
      scripts: [COLOR_BY_DIGIT],
      start: false,
      stroke: false,
      weight: 1,
      // A press that stays opens the pad menu; one that drifts past the slop is no click, so it opens nothing and changes no mode.
      arg: () => fc.boolean(),
      label: (drift) => drift ? 'hold the Color by Digit button then drift off it and let go' : 'hold the Color by Digit button until its menu opens and press Escape',
      run: (env, drift) => env.holdColorMode(drift)
    },
    {
      kind: 'conflict mark',
      group: 'ordinary',
      scripts: [COLOR_BY_DIGIT],
      start: true,
      stroke: false,
      weight: 2,
      // A digit, then a corner or centre mark of the same digit in another cell of its row: the mark conflicts, and Color by Digit draws a circle round it while digits are colored.
      // A cell alone in its row (the nearly solved puzzle's) takes the mark in another free cell, which conflicts only when they share a column or box.
      arg: (puzzle) => fc.tuple(fc.nat(puzzle.free.length - 1), fc.nat(), digit(puzzle), fc.boolean()).map(([i, n, d, centre]) => {
        const others = puzzle.free.flatMap((_, j) => (j === i ? [] : [j]))
        const mates = others.filter((j) => puzzle.free[j][0] === puzzle.free[i][0])
        const candidates = mates.length > 0 ? mates : others
        return [i, candidates.length > 0 ? candidates[n % candidates.length] : i, d, centre]
      }),
      label: ([i, j, d, centre], at) => `enter ${d} in ${at(i)} then put a ${centre ? 'centre' : 'corner'} mark of it in ${at(j)}`,
      run: async (env, [i, j, d, centre], model) => {
        await env.page.keyboard.press(TOOL_KEYS[0])
        await env.page.mouse.click(...await env.cellPoint(i))
        await env.page.keyboard.press(d)
        await env.page.mouse.click(...await env.cellPoint(j))
        await env.page.keyboard.press(centre ? TOOL_KEYS[2] : TOOL_KEYS[1])
        await env.page.keyboard.press(d)
        model.selected = true
      }
    },
    { kind: 'color mode', group: 'ordinary', scripts: [COLOR_BY_DIGIT], start: true, stroke: false, weight: 2, arg: () => fc.constant(null), label: () => 'press the Color by Digit button', run: (env) => env.clickColorMode() },

    penDrag('pen drag, Escape', [PEN_TOOL_EXTRAS], () => 'Escape', press('Escape')),
    penDrag('pen drag, tool key', [PEN_TOOL_EXTRAS], (k) => `press ${k}`, (env, arg) => env.page.keyboard.press(arg[3]), toolKey),
    penDrag('pen drag, undo', [PEN_TOOL_EXTRAS], () => 'Ctrl+Z', press('Control+z')),
    penDrag('pen drag, resize', [PEN_TOOL_EXTRAS, AUTO_RULES_RESIZER], ({ width, height }) => `resize the window to ${width}x${height}`, (env, arg) => env.resize(arg[3]), fc.constantFrom(...WINDOW_SIZES)),
    penDrag('pen drag, second button', [PEN_TOOL_EXTRAS], () => 'right button down and up', async (env) => {
      await env.page.mouse.down({ button: 'right' })
      await env.page.mouse.up({ button: 'right' })
    }),
    penDrag('pen drag, blur', [PEN_TOOL_EXTRAS], () => 'window blur and focus', (env) => env.blurFocus()),
    {
      kind: 'pen drag, leave window',
      group: 'interruption',
      scripts: [PEN_TOOL_EXTRAS],
      start: false,
      stroke: true,
      weight: 1,
      arg: (puzzle) => fc.tuple(cell(puzzle), cell(puzzle), color, cell(puzzle)),
      label: ([a, b, c, d], at) => `pen drag ${at(a)} -> ${at(b)} color ${c} then leave the window then release outside then click ${at(d)}`,
      run: async (env, arg) => {
        await penDragStart(env, arg)
        await env.page.mouse.move(...OUTSIDE, { steps: 4 })
        await env.page.mouse.up()
        await env.page.mouse.click(...await env.cellPoint(arg[3]))
      }
    },
    eraseHold('erase held, Escape', [PEN_TOOL_EXTRAS], () => 'Escape', press('Escape')),
    eraseHold('erase held, tool key', [PEN_TOOL_EXTRAS], (k) => `press ${k}`, (env, arg) => env.page.keyboard.press(arg[2]), toolKey),
    eraseHold('erase held, left button', [PEN_TOOL_EXTRAS], () => 'left button down and up', async (env) => {
      await env.page.mouse.down({ button: 'left' })
      await env.page.mouse.up({ button: 'left' })
    }),
    noteDrag('note drag, Escape', [TEXT_ANYWHERE], 'Escape', press('Escape')),
    noteDrag('note drag, Delete', [TEXT_ANYWHERE], 'Delete', press('Delete')),
    noteDrag('note drag, undo', [TEXT_ANYWHERE], 'Ctrl+Z', press('Control+z')),
    noteDrag('note drag, resize', [TEXT_ANYWHERE, AUTO_RULES_RESIZER], `resize the window to ${WINDOW_SIZES[0].width}x${WINDOW_SIZES[0].height}`, (env) => env.resize(WINDOW_SIZES[0])),

    { kind: 'blur and focus', group: 'page', scripts: [], start: false, stroke: false, weight: 1, arg: () => fc.constant(null), label: () => 'window blur and focus', run: (env) => env.blurFocus() },
    { kind: 'reload', group: 'page', scripts: [], start: false, stroke: false, weight: 1, arg: () => fc.constant(null), label: () => 'reload the page', run: (env, _, model) => { model.selected = false; return env.reload() } },
    {
      kind: 'restart',
      group: 'page',
      scripts: [COLOR_BY_DIGIT, TEXT_ANYWHERE],
      start: false,
      stroke: false,
      weight: 1,
      // With `thenUndo`, the Undo that follows is the first one after the Restart, which brings back the board from before it (`restoreBeforeRestart`).
      arg: () => fc.boolean(),
      label: (thenUndo) => `restart the puzzle${thenUndo ? ' then undo' : ''}`,
      run: async (env, thenUndo, model) => {
        model.selected = false
        await env.restartPuzzle()
        if (thenUndo) await env.undo()
      }
    },
    { kind: 'resize', group: 'page', scripts: [AUTO_RULES_RESIZER], start: false, stroke: false, weight: 1, arg: () => fc.constantFrom(...WINDOW_SIZES), label: ({ width, height }) => `resize the window to ${width}x${height}`, run: (env, size) => env.resize(size) },
    {
      kind: 'dark page',
      group: 'page',
      scripts: [DARK_PAGE],
      start: true,
      stroke: false,
      weight: 1,
      arg: () => fc.tuple(fc.constantFrom(...DARK_COLORS), fc.boolean()),
      label: ([color, save]) => `Dark Page dialog: ${save ? 'Save' : 'Cancel'} ${color}`,
      run: (env, [color, save]) => env.darkPage(color, save)
    },
    {
      kind: 'rules drag',
      group: 'page',
      scripts: [AUTO_RULES_RESIZER],
      start: true,
      stroke: false,
      weight: 2,
      arg: () => fc.tuple(fc.constantFrom(...RULES_CORNERS), fc.integer({ min: -RULES_DRAG_REACH_PX, max: RULES_DRAG_REACH_PX }), fc.integer({ min: -RULES_DRAG_REACH_PX, max: RULES_DRAG_REACH_PX })),
      label: ([corner, dx, dy]) => `drag the ${CORNER_NAMES[corner]} corner of the rules box by ${dx} x ${dy}`,
      run: (env, [corner, dx, dy]) => env.dragRules(corner, dx, dy)
    },
    {
      kind: 'rules font',
      group: 'page',
      scripts: [AUTO_RULES_RESIZER],
      start: true,
      stroke: false,
      weight: 1,
      arg: () => fc.tuple(fc.constantFrom(1, -1), fc.integer({ min: 1, max: 3 })),
      label: ([step, times]) => `press ${step > 0 ? 'f+' : 'f-'} on the rules box ${times} time${times === 1 ? '' : 's'}`,
      run: (env, [step, times]) => env.rulesFont(step, times)
    },
    // The wheel over the rules box (#932) gives a later drag or f+ a scrolled box, so `readingPlace` has a place to keep across the fit; a rules text that does not scroll takes it as nothing.
    {
      kind: 'rules wheel',
      group: 'page',
      scripts: [AUTO_RULES_RESIZER],
      start: true,
      stroke: false,
      weight: 1,
      arg: () => fc.constantFrom(...WHEEL_DELTAS),
      label: (dy) => `wheel ${dy} over the rules box`,
      run: (env, dy) => env.scrollRules(dy)
    },
    {
      kind: 'rules dialog',
      group: 'page',
      scripts: [AUTO_RULES_RESIZER],
      start: true,
      stroke: false,
      weight: 1,
      arg: () => fc.tuple(fc.constantFrom(...RULES_LIMIT_TEXTS), fc.constantFrom(...RULES_LIMIT_TEXTS), fc.boolean(), fc.boolean()),
      label: ([maxWidth, maxHeight, restore, save]) => `Auto Rules Resizer dialog: max width ${limitWords(maxWidth)} max height ${limitWords(maxHeight)}${restore ? ' Restore defaults' : ''} ${save ? 'Save' : 'Cancel'}`,
      run: (env, [maxWidth, maxHeight, restore, save]) => env.rulesDialog({ maxWidth, maxHeight, restore }, save)
    },
    {
      kind: 'dark page defaults',
      group: 'page',
      scripts: [DARK_PAGE],
      start: true,
      stroke: false,
      weight: 1,
      arg: () => fc.tuple(fc.constantFrom(...DARK_COLORS), fc.boolean()),
      label: ([color, save]) => `Dark Page dialog: ${color} then Restore defaults ${save ? 'Save' : 'Cancel'}`,
      run: (env, [color, save]) => env.darkPage(color, save, true)
    },
    {
      kind: 'dark page settings text',
      group: 'page',
      scripts: [DARK_PAGE],
      start: true,
      stroke: false,
      weight: 1,
      arg: () => fc.tuple(textOrCopy(DARK_PAGE_TEXTS), fc.boolean()),
      label: ([text, save]) => settingsTextLabel('Dark Page', text, save),
      run: (env, [text, save]) => env.settingsText('dark page', text, save)
    },
    settingsTextKind('color by digit', COLOR_BY_DIGIT, COLOR_BY_DIGIT_TEXTS),
    settingsTextKind('text anywhere', TEXT_ANYWHERE, TEXT_ANYWHERE_TEXTS),
    settingsTextKind('pen tool extras', PEN_TOOL_EXTRAS, PEN_TOOL_EXTRAS_TEXTS),
    settingsTextKind('auto rules resizer', AUTO_RULES_RESIZER, AUTO_RULES_RESIZER_TEXTS),
    {
      kind: 'color by digit defaults',
      group: 'ordinary',
      scripts: [COLOR_BY_DIGIT],
      start: true,
      stroke: false,
      weight: 1,
      arg: () => fc.boolean(),
      label: (save) => `Color by Digit dialog: Restore defaults ${save ? 'Save' : 'Cancel'}`,
      run: (env, save) => env.restoreDefaults('color by digit', save)
    },
    {
      kind: 'text anywhere defaults',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: true,
      stroke: false,
      weight: 1,
      arg: () => fc.boolean(),
      label: (save) => `Text Anywhere dialog: Restore defaults ${save ? 'Save' : 'Cancel'}`,
      run: (env, save) => env.restoreDefaults('text anywhere', save)
    },
    {
      kind: 'error log',
      group: 'ordinary',
      scripts: scriptFiles(),
      start: true,
      stroke: false,
      weight: 2,
      arg: () => fc.tuple(fc.nat(ERROR_LOG_SCRIPTS.length - 1), fc.boolean()),
      label: ([i, clear]) => `${dialogEntry(ERROR_LOG_SCRIPTS[i])} dialog: ${clear ? 'Clear error log' : 'Copy error log'}`,
      run: (env, [i, clear]) => env.errorLogButton(ERROR_LOG_SCRIPTS[i], clear)
    },
    {
      kind: 'note color preset',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      start: true,
      stroke: false,
      weight: 1,
      arg: () => fc.tuple(fc.nat(COLOR_PRESET_PICKS - 1), fc.boolean()),
      label: ([pick, save]) => `Text Anywhere text color preset ${pick} ${save ? 'Save' : 'Cancel'}`,
      run: (env, [pick, save]) => env.noteColorPreset(pick, save)
    },
    {
      kind: 'note dialog from menu',
      group: 'ordinary',
      scripts: [TEXT_ANYWHERE],
      // Opens and closes with nothing changed, as 'pen settings' does: a start holds what puts something into the saved data.
      start: false,
      stroke: false,
      weight: 1,
      arg: () => fc.boolean(),
      label: (save) => `Text Anywhere dialog from the settings menu ${save ? 'Save' : 'Cancel'}`,
      run: (env, save) => env.noteDialogFromMenu(save)
    },
    {
      kind: 'pen dialog from settings button',
      group: 'ordinary',
      scripts: [PEN_TOOL_EXTRAS],
      // Like 'pen settings': nothing is changed in it.
      start: false,
      stroke: false,
      weight: 1,
      arg: () => fc.boolean(),
      label: (save) => `Pen Tool Extras dialog from the pen panel settings button ${save ? 'Save' : 'Cancel'}`,
      run: (env, save) => env.penDialogFromSettingsButton(save)
    },
    {
      kind: 'pen show boxes',
      group: 'ordinary',
      scripts: [PEN_TOOL_EXTRAS],
      start: true,
      stroke: false,
      weight: 1,
      arg: () => fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
      label: ([thickness, opacity, save]) => `Pen Tool Extras dialog: Thickness slider ${thickness ? 'shown' : 'hidden'} Opacity slider ${opacity ? 'shown' : 'hidden'} ${save ? 'Save' : 'Cancel'}`,
      run: (env, [thickness, opacity, save]) => env.penShowBoxes({ thickness, opacity }, save)
    },
    {
      kind: 'pen swatch edit',
      group: 'ordinary',
      scripts: [PEN_TOOL_EXTRAS],
      start: true,
      stroke: false,
      weight: 1,
      arg: () => fc.tuple(fc.nat(COLOR_PRESET_PICKS - 1), color, fc.integer({ min: 0, max: 0xffffff }), fc.boolean()),
      label: ([pick, pen, rgb, save]) => `Pen Tool Extras colors: preset ${pick} then pen ${pen} swatch ${ownColor(rgb)} ${save ? 'Save' : 'Cancel'}`,
      run: (env, [pick, pen, rgb, save]) => env.penSwatchEdit(pick, pen, ownColor(rgb), save)
    },
    {
      kind: 'ui tweaks dialog',
      group: 'page',
      scripts: [UI_TWEAKS],
      start: true,
      stroke: false,
      weight: 1,
      arg: () => fc.tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean()),
      label: ([hideSelect, wrapButtons, toggleTab, restore, save]) => `UI Tweaks dialog: select ${hideSelect ? 'hidden' : 'shown'} buttons ${wrapButtons ? 'wrapped' : 'in one row'}${toggleTab ? ' Tab option off and on' : ''}${restore ? ' Restore defaults' : ''} ${save ? 'Save' : 'Cancel'}`,
      run: (env, [hideSelect, wrapButtons, toggleTab, restore, save]) => env.uiTweaks({ hideSelect, wrapButtons, toggleTab, restore }, save)
    },
    {
      kind: 'ui tweaks settings text',
      group: 'page',
      scripts: [UI_TWEAKS],
      start: true,
      stroke: false,
      weight: 1,
      arg: () => fc.tuple(textOrCopy(UI_TWEAKS_TEXTS), fc.boolean()),
      label: ([text, save]) => settingsTextLabel('UI Tweaks', text, save),
      run: (env, [text, save]) => env.settingsText('ui tweaks', text, save)
    }
  ]
}

export const KINDS = buildKinds()
export const KIND_NAMES = KINDS.map((k) => k.kind)
export const KIND_GROUPS = Object.fromEntries(KINDS.map((k) => [k.kind, k.group]))

// The name of target `i` of `puzzle` in a step: `r3c4`, with row 0 and a column 0 for the cells just outside the grid on its top and left.
const nameTarget = (puzzle) => (i) => `r${puzzle.cells[i][0] + 1}c${puzzle.cells[i][1] + 1}`

const commandOf = (k, puzzle, arg) => ({
  kind: k.kind,
  group: k.group,
  stroke: k.stroke,
  check: (model) => k.check ? k.check(model) : true,
  run: async (model, real) => {
    await real.env.clearControls()
    await k.run(real.env, arg, model)
  },
  toString: () => k.label(arg, nameTarget(puzzle))
})

// How much a focused script's kinds weigh over their own weight: a kind is raised, never silenced, so the others still come up.
export const FOCUS_FACTOR = 4

export function focusFiles (names = [], flag = '--focus') {
  const files = scriptFiles()
  return names.map((name) => {
    if (!files.includes(scriptFile(name))) throw new Error(`${flag} ${name} is no script; the scripts are ${files.map(scriptName).join(', ')}`)
    return scriptFile(name)
  })
}

export const kindWeights = (kinds, focus = []) => Object.fromEntries(kinds.map((k) => [k.kind, k.weight * (k.scripts.some((f) => focus.includes(f)) ? FOCUS_FACTOR : 1)]))

function actionArbitrary (puzzle, weights, kinds) {
  return fc.oneof(...kinds.map((k) => ({ weight: weights[k.kind], arbitrary: k.arg(puzzle).map((arg) => commandOf(k, puzzle, arg)) })))
}

// The most steps a busy start has; its length is drawn up to it, so some starts are short and some are empty.
export const MAX_START_STEPS = 30

// A busy start (#726) is built from the kinds that declare `start`: what puts something on the board or into the saved data, and nothing that takes it away (undo, a reload) or holds a gesture open.
// Digits, marks (a tool key, then a digit), colors, pen lines on every pen page, notes with their box settings, and the settings the scripts save.
// The arbitrary of a busy start's steps over `puzzle`: commands like a list's, weighted alike (`--focus` included), run first, each printed with `(start) ` before it.
const startArbitrary = (puzzle, weights, kinds) => fc.array(actionArbitrary(puzzle, weights, kinds.filter((k) => k.start)), { maxLength: MAX_START_STEPS, size: 'max' })

export const DEFAULT_MAX_COMMANDS = 20

// The kinds that save a setting or an index, whose deleted save shows only after a reload (#936): Color by Digit's mode, Pen Tool Extras' line mode, Text Anywhere's note color, background, the
// color presets and restyle, and the two that can remove the last note (they write the notes index). `reloadAfterSettings` draws a reload after them.
export const SETTINGS_KINDS = ['color mode', 'pen line mode', 'note box color', 'note background', 'note color preset', 'note restyle', 'clear notes', 'note erase']

// The replay path fast-check prints after a list of commands (`/*replayPath="..."*/`), which the engine reads back out of a failure's printed list.
export const REPLAY_PATH = /\/\*replayPath="([^"]*)"\*\//

// `commands` (the fast-check list) with a reload after each settings action whose coin is true, and with `lead` true a reload before the first action. The coins are drawn beside the list, so a
// shrink drops them with it and a seed gives the same list. Like fast-check's own list, the printed form names only the steps that ran, then the replay path of `commands`.
function withReloads (commands, coins, lead, puzzle, kinds) {
  const reload = kinds.find((k) => k.kind === 'reload')
  const added = () => {
    const cmd = commandOf(reload, puzzle, null)
    const step = { cmd, hasRan: false, check: (model) => cmd.check(model), run: (model, real) => { step.hasRan = true; return cmd.run(model, real) }, toString: () => String(cmd) }
    return step
  }
  const steps = []
  if (lead) steps.push(added())
  ;[...commands].forEach((step, i) => {
    steps.push(step)
    if (coins[i] && SETTINGS_KINDS.includes(step.cmd.kind)) steps.push(added())
  })
  // The replay path is read when the list is printed: fast-check builds it from the commands that ran.
  const replay = () => String(commands).match(new RegExp(`\\s*${REPLAY_PATH.source}$`))?.[0] ?? ''
  return Object.assign(steps, { toString: () => `${steps.filter((step) => step.hasRan).map(String).join(',')}${replay()}` })
}

// The generator of whole lists, each `{ puzzle, start, commands, waitMs }`: a puzzle of `puzzles`, then (with `busyStart`, #726) a start of up to `MAX_START_STEPS` steps that builds a
// busy board, then at most `maxCommands` actions on it. `replayPath` replays a shrunk list (what `String()` of a failing list prints, which is the start's steps and then the
// actions'); the puzzle is drawn first, so the same path gives the same puzzle. `focus` is script files (`focusFiles`) whose actions weigh more; a path replays only with the
// focus it was found with. A start is an array, so a shrink drops its steps and leaves a list that begins on the empty board when the failure does not need it.
// `waits` (#725) is the milliseconds the engine may wait after each action: each list draws its own, beside its actions, so a path replays it and a shrink moves it
// to the first of the set; with none, `waitMs` is undefined and the engine's own wait stands.
// `nonEmpty` (#730) refuses a list with no action, which fast-check otherwise draws 1 time in `maxCommands + 1`.
// `reloadAfterSettings` (#936) puts a reload after about half the settings actions (`SETTINGS_KINDS`), and before the first action when the start saved a setting; the printed list names the reloads that ran,
// and a replay needs the same option, as with the others, since the coins are part of what the path replays.
export const actionList = (puzzles, { kinds, maxCommands = DEFAULT_MAX_COMMANDS, replayPath, focus = [], waits = [], busyStart = false, nonEmpty = false, reloadAfterSettings = false } = {}) => fc.constantFrom(...puzzles).chain((puzzle) => {
  const weights = kindWeights(kinds, focus)
  const commands = fc.commands([actionArbitrary(puzzle, weights, kinds)], { maxCommands, size: 'max', replayPath })
  const drawn = nonEmpty ? commands.filter((c) => [...c].length > 0) : commands
  // A single wait is a constant, which draws nothing, so its lists are those of no set.
  const waitMs = waits.length > 1 ? fc.constantFrom(...waits) : fc.constant(waits[0])
  const start = busyStart ? startArbitrary(puzzle, weights, kinds) : fc.constant([])
  // One coin for each action and one more for the start (#936); a list with no option draws none, so its lists are those of before the option.
  const coins = reloadAfterSettings ? fc.array(fc.boolean(), { minLength: maxCommands + 1, maxLength: maxCommands + 1 }) : fc.constant([])
  return fc.tuple(waitMs, start, drawn, coins).map(([wait, steps, drawnCommands, [lead, ...after]]) => {
    const commands = reloadAfterSettings ? withReloads(drawnCommands, after, lead && steps.some((step) => SETTINGS_KINDS.includes(step.kind)), puzzle, kinds) : drawnCommands
    return {
      puzzle,
      start: steps,
      commands,
      waitMs: wait,
      toString: () => [...steps.map((step) => `(start) ${step}`), String(commands)].join(',')
    }
  })
})

// A list written out by hand, for a regression that is one known sequence: `steps` are `[kind, arg]` of the kinds above, in the shape fast-check wraps them in.
export function scriptedList (puzzle, steps) {
  return steps.map(([kind, arg]) => {
    const k = KINDS.find((x) => x.kind === kind)
    if (!k) throw new Error(`no action kind "${kind}"`)
    const cmd = commandOf(k, puzzle, arg)
    // fast-check skips a command whose check fails without a word; a hand-written list must run every step, so a step that cannot run fails the run instead.
    const run = async (model, real) => {
      if (!cmd.check(model)) throw new Error(`the scripted step "${cmd}" cannot run here: its precondition does not hold`)
      return cmd.run(model, real)
    }
    return { cmd, check: () => true, run, toString: cmd.toString }
  })
}
