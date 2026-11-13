// The fuzz's action vocabulary (#590 Q6 c, #593): what a user does with the six scripts on SudokuPad, weighted so ordinary use is the bulk, then
// interruptions in the middle of a gesture, then page-level events. Each action is one step that leaves the mouse up and no key held, so a shrunk
// list reads as plain steps and replays from the numbers alone. A list names its puzzle (`puzzle-set.mjs`, #679): the puzzle is the first thing a list
// generates, so its path replays on the same puzzle, and an action reads the digit keys and the targets from the puzzle it runs on. Not a check itself.
//
// An action runs on an `env`, never on Playwright directly, so the unit tests drive the same code with a fake one (`fake-target.mjs`). The env is:
//   env.page.mouse {move, down, up, click, dblclick, wheel}   env.page.keyboard {press, type, down, up}      Playwright's, used as they are
//   env.cellPoint(i) -> [x, y]               the page point at the centre of target `i` of the puzzle (a free cell, or a cell just outside the grid)
//   env.usePen(color)                        opens the pen tool and picks its pen color 1 to 9
//   env.useNotes()                           picks Text Anywhere's tool
//   env.turnPenPage()  env.undo()  env.redo()  env.clickColorMode()
//   env.undoAll()                            presses Undo until the undo stack is empty
//   env.extrasSettings({ arrowSpacing, dash, thickness }, save)   opens Pen Tool Extras' settings dialog, sets the values it is given and presses Save or Cancel
//   env.sliderPoint(name, fraction) -> [x, y]   the page point `fraction` (0 to 1) along the track of slider `name` (`SLIDERS`), opening the tool that shows it
//   env.focusSlider(name)  env.leaveSlider(name)   puts the keyboard focus on a slider, and takes it off
//   env.noteBoxDialog(choice, color, save)   opens Text Anywhere's settings dialog, picks the Box color `choice` (`BOX_CHOICES`; `color` is the Own color) and presses Save or Cancel
//   env.setNoteBackground(on)                presses Text Anywhere's Background button when it is not as `on` says
//   env.useArrowPen(color)                   opens the pen tool, turns it to the arrow lines page (page 3) and picks its pen color 1 to 9
//   env.placeNote(text, i)                   a note with `text` at cell `i`, finished with Escape
//   env.noteCentre() -> [x, y] | null        the middle of the first note drawn
//   env.profileEditor(edits, save, fromMenu) opens Color by Digit's settings dialog (from the pad menu's Edit profiles when `fromMenu`, else from the settings), makes each edit (`[op, ...numbers]`, `PROFILE_EDITS`) and presses Save or Cancel
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
//   env.penPresets(pick, restore, save)      opens Pen Tool Extras' settings dialog, picks the color preset at position `pick` (wrapped to the pulldown's options) or, when `restore`, presses Restore defaults, and presses Save or Cancel
//   env.uiTweaks({ hideSelect, wrapButtons, toggleTab, restore }, save)   opens UI Tweaks' dialog, sets the Hide the Toggle Selection button and Wrap buttons boxes, clicks the Tab box off and on again, presses Restore defaults when `restore`, and presses Save or Cancel
//   env.settingsText(script, text, save)     opens the dialog of `script` ('ui tweaks' or 'dark page'), presses Copy settings when `text` is null and else puts `text` on the clipboard and presses Paste settings, then presses Save or Cancel
//   env.dragRules(corner, dx, dy)            hovers the rules box, presses its `corner` ('ur' or 'dl') and moves it by (dx, dy), then lets go; does nothing on a page with no rules box
//   env.rulesFont(step, times)               presses the rules box's f+ (step 1) or f- (step -1) `times` times; does nothing on a page with no rules box
//   env.rulesDialog({ maxWidth, maxHeight, restore }, save)   opens Auto Rules Resizer's dialog, types both limits (text, as a user types them), presses Restore defaults when `restore`, and presses Save or Cancel
//   env.resize({ width, height })  env.blurFocus()  env.reload()
//   env.darkPage(color, save, restore)       opens Dark Page's dialog, picks `color`, presses Restore defaults when `restore`, and presses Save or Cancel
import { createRequire } from 'node:module'
import fc from 'fast-check'

const require = createRequire(import.meta.url)
const { THICKNESS, DASH, ARROW_SPACING } = require('../../pen-tool-extras.user.js')
const { BOX_PRESETS, CORNERS, NUDGE_REPEAT_MS } = require('../../text-anywhere.user.js')
const { scriptFiles } = require('../../sync-lib.js')

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

// The four sliders of the pen panel and the notes panel, by the name a step prints.
export const SLIDERS = ['pen thickness', 'pen opacity', 'note size', 'note opacity']
// Text Anywhere's Box color buttons, in the dialog's order; `custom` is Own.
const BOX_CHOICES = [...Object.keys(BOX_PRESETS), 'custom']
const boxLabel = (choice) => BOX_PRESETS[choice] ?? 'Own'
const SLIDER_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Home', 'End']
// The dialog's thickness slider moves in steps of `THICKNESS.step`, so it is drawn as a count of steps.
const THICKNESS_STEPS = { min: THICKNESS.min / THICKNESS.step, max: THICKNESS.max / THICKNESS.step }

// Color by Digit's profile editor (#814): the names a rename types, and the edits a dialog action makes before it saves or cancels. A row, a brush and a profile
// are counted from 0 and wrapped by the env to what the dialog holds (six profiles at the most), so a list replays on a dialog of any size.
export const PROFILE_NAMES = ['Mine', 'Tens', 'A B', 'x', 'Twenty four letters long!']
export const MAX_PROFILES = 6
const PROFILE_BRUSHES = 10
const DIGITS = '0123456789'
export const MAX_PROFILE_EDITS = 4

// Notes whose text draws as a list, a check box, a code block, and a note taller than its box (#815), which the wheel scrolls.
export const RICH_NOTES = ['- one\n- **two**', '- [ ] buy\n- [x] sold', '```\nsum ->\n  x=1\n```', Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n')]
const CHECK_BOX_NOTE = RICH_NOTES[1]
const TALL_NOTE = RICH_NOTES[RICH_NOTES.length - 1]
const RESIZE_CORNERS = Object.keys(CORNERS).length
const RESIZE_REACH_PX = 80
const WHEEL_DELTAS = [-400, -120, 120, 400, 1200]
const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
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
    fc.tuple(fc.constant('digit profile'), fc.nat(MAX_PROFILES + 1))
  )
  const profileEditWords = ([op, a, b]) => ({
    new: () => 'new profile',
    rename: () => `rename to ${PROFILE_NAMES[a]}`,
    delete: () => `delete profile ${a}`,
    move: () => `move profile ${a} to ${b}`,
    select: () => `select profile ${a}`,
    paint: () => `paint digit ${DIGITS[a]} with swatch ${b}`,
    'cell profile': () => `cell profile ${a}`,
    'digit profile': () => `digit profile ${a}`
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
  const penDrag = (kind, words, interrupt, extra = fc.constant(null)) => ({
    kind,
    group: 'interruption',
    weight: 1,
    arg: (puzzle) => fc.tuple(cell(puzzle), cell(puzzle), color, extra),
    label: ([a, b, c, x], at) => `pen drag ${at(a)} -> ${at(b)} color ${c} then ${words(x)} then release`,
    run: async (env, arg) => {
      await penDragStart(env, arg)
      await interrupt(env, arg)
      await env.page.mouse.up()
    }
  })

  // A right-button erase held down from cell `a` to cell `b`.
  async function eraseHoldStart (env, [a, b]) {
    const [from, to] = [await env.cellPoint(a), await env.cellPoint(b)]
    await env.usePen(1)
    await env.page.mouse.move(...from)
    await env.page.mouse.down({ button: 'right' })
    await env.page.mouse.move(...to, { steps: 4 })
  }
  const eraseHold = (kind, words, interrupt, extra = fc.constant(null)) => ({
    kind,
    group: 'interruption',
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
  async function dragNote (env, centre) {
    await env.useNotes()
    await env.page.mouse.move(...centre)
    await env.page.mouse.down()
    await env.page.mouse.move(centre[0] + NOTE_DRAG[0], centre[1] + NOTE_DRAG[1], { steps: 6 })
  }
  // The middle of the first note drawn; with none, one with `text` is placed at cell `a` first.
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
  const ifNone = (t, a, at) => `(note ${jsonWords(NOTE_TEXTS[t])} at ${at(a)} if none)`
  const noteDrag = (kind, words, interrupt) => ({
    kind,
    group: 'interruption',
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

  return [
    // Ordinary use of SudokuPad and of every script.
    {
      kind: 'click cell',
      group: 'ordinary',
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
      weight: 8,
      arg: digit,
      label: (d) => `type ${d}`,
      check: (model) => model.selected,
      run: (env, d) => env.page.keyboard.press(d)
    },
    {
      kind: 'enter digit',
      group: 'ordinary',
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
    { kind: 'undo', group: 'ordinary', weight: 3, arg: () => fc.constant(null), label: () => 'undo', run: (env) => env.undo() },
    { kind: 'undo all', group: 'ordinary', weight: 1, arg: () => fc.constant(null), label: () => 'undo back to the start', run: (env) => env.undoAll() },
    { kind: 'redo', group: 'ordinary', weight: 2, arg: () => fc.constant(null), label: () => 'redo', run: (env) => env.redo() },
    { kind: 'tool key', group: 'ordinary', weight: 3, arg: () => toolKey, label: (k) => `press ${k}`, run: (env, k) => env.page.keyboard.press(k) },
    { kind: 'tab', group: 'ordinary', weight: 1, arg: () => fc.constant(null), label: () => 'press Tab', run: (env) => env.page.keyboard.press('Tab') },
    {
      kind: 'pen line',
      group: 'ordinary',
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
      weight: 2,
      arg: cell,
      label: (i, at) => `right-click ${at(i)} with the pen`,
      run: async (env, i) => {
        const point = await env.cellPoint(i)
        await env.usePen(1)
        await env.page.mouse.click(...point, { button: 'right' })
      }
    },
    { kind: 'pen page', group: 'ordinary', weight: 2, arg: () => fc.constant(null), label: () => 'turn the pen page', run: (env) => env.turnPenPage() },
    {
      kind: 'place note',
      group: 'ordinary',
      weight: 3,
      arg: note,
      label: ([t, a], at) => `note ${jsonWords(NOTE_TEXTS[t])} at ${at(a)}`,
      run: (env, [t, a]) => env.placeNote(NOTE_TEXTS[t], a)
    },
    {
      kind: 'move note',
      group: 'ordinary',
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
      weight: 2,
      arg: () => fc.tuple(fc.nat(COLOR_PRESET_PICKS - 1), fc.boolean(), fc.boolean()),
      label: ([pick, restore, save]) => `Pen Tool Extras colors: ${restore ? 'Restore defaults' : `preset ${pick}`} ${save ? 'Save' : 'Cancel'}`,
      run: (env, [pick, restore, save]) => env.penPresets(pick, restore, save)
    },
    {
      kind: 'pen settings',
      group: 'ordinary',
      weight: 1,
      arg: () => fc.boolean(),
      label: (save) => `Pen Tool Extras settings dialog ${save ? 'Save' : 'Cancel'}`,
      run: (env, save) => env.extrasSettings({}, save)
    },
    {
      kind: 'slider drag',
      group: 'ordinary',
      weight: 4,
      arg: () => fc.tuple(fc.nat(SLIDERS.length - 1), fc.nat(10), fc.nat(10)),
      label: ([s, from, to]) => `drag the ${SLIDERS[s]} slider from ${from * 10}% to ${to * 10}%`,
      run: async (env, [s, from, to]) => {
        const start = await env.sliderPoint(SLIDERS[s], from / 10)
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
      weight: 2,
      arg: () => fc.tuple(fc.nat(SLIDERS.length - 1), fc.nat(SLIDER_KEYS.length - 1), fc.integer({ min: 1, max: 5 })),
      label: ([s, k, times]) => `press ${SLIDER_KEYS[k]} ${times} times on the ${SLIDERS[s]} slider`,
      run: async (env, [s, k, times]) => {
        await env.focusSlider(SLIDERS[s])
        for (let i = 0; i < times; i++) await env.page.keyboard.press(SLIDER_KEYS[k])
        await env.leaveSlider(SLIDERS[s])
      }
    },
    {
      kind: 'pen settings values',
      group: 'ordinary',
      weight: 3,
      arg: () => fc.tuple(fc.integer({ min: ARROW_SPACING.min, max: ARROW_SPACING.max }), fc.integer({ min: DASH.min, max: DASH.max }), fc.integer(THICKNESS_STEPS), fc.boolean()),
      label: ([spacing, dash, steps, save]) => `Pen Tool Extras settings dialog: arrow spacing ${spacing} dash ${dash} thickness ${steps * THICKNESS.step} ${save ? 'Save' : 'Cancel'}`,
      run: (env, [arrowSpacing, dash, steps, save]) => env.extrasSettings({ arrowSpacing, dash, thickness: steps * THICKNESS.step }, save)
    },
    {
      kind: 'note box color',
      group: 'ordinary',
      weight: 3,
      arg: () => fc.tuple(fc.constantFrom(...BOX_CHOICES), fc.integer({ min: 0, max: 0xffffff }), fc.boolean()),
      label: ([choice, rgb, save]) => `Text Anywhere box color ${boxLabel(choice)}${choice === 'custom' ? ` ${ownColor(rgb)}` : ''} ${save ? 'Save' : 'Cancel'}`,
      run: (env, [choice, rgb, save]) => env.noteBoxDialog(choice, ownColor(rgb), save)
    },
    {
      kind: 'note background',
      group: 'ordinary',
      weight: 2,
      arg: () => fc.boolean(),
      label: (on) => `turn the Text Anywhere Background button ${on ? 'on' : 'off'}`,
      run: (env, on) => env.setNoteBackground(on)
    },
    {
      kind: 'boxed note',
      group: 'ordinary',
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
      weight: 2,
      arg: (puzzle) => fc.tuple(fc.nat(RICH_NOTES.length - 1), cell(puzzle)),
      label: ([t, a], at) => `note ${jsonWords(RICH_NOTES[t])} at ${at(a)}`,
      run: (env, [t, a]) => env.placeNote(RICH_NOTES[t], a)
    },
    {
      kind: 'note resize',
      group: 'ordinary',
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
      kind: 'profile editor',
      group: 'ordinary',
      weight: 1,
      arg: () => fc.tuple(fc.array(profileEdit, { maxLength: MAX_PROFILE_EDITS, size: 'max' }), fc.boolean(), fc.boolean()),
      label: ([edits, save, fromMenu]) => `Color by Digit profiles dialog${fromMenu ? ' from the pad menu' : ''}: ${edits.map(profileEditWords).map((w) => `${w} then `).join('')}${save ? 'Save' : 'Cancel'}`,
      run: (env, [edits, save, fromMenu]) => env.profileEditor(edits, save, fromMenu)
    },
    {
      kind: 'profile switch',
      group: 'ordinary',
      weight: 2,
      arg: () => fc.nat(MAX_PROFILES - 1),
      label: (i) => `pick profile ${i} from the pad menu`,
      run: (env, i) => env.pickProfile(i)
    },
    { kind: 'color mode', group: 'ordinary', weight: 2, arg: () => fc.constant(null), label: () => 'press the Color by Digit button', run: (env) => env.clickColorMode() },

    // Interruptions in the middle of a gesture: a key, Escape, a tool switch, undo, a window resize, a second button, the pointer leaving the window.
    penDrag('pen drag, Escape', () => 'Escape', press('Escape')),
    penDrag('pen drag, tool key', (k) => `press ${k}`, (env, arg) => env.page.keyboard.press(arg[3]), toolKey),
    penDrag('pen drag, undo', () => 'Ctrl+Z', press('Control+z')),
    penDrag('pen drag, resize', ({ width, height }) => `resize the window to ${width}x${height}`, (env, arg) => env.resize(arg[3]), fc.constantFrom(...WINDOW_SIZES)),
    penDrag('pen drag, second button', () => 'right button down and up', async (env) => {
      await env.page.mouse.down({ button: 'right' })
      await env.page.mouse.up({ button: 'right' })
    }),
    penDrag('pen drag, blur', () => 'window blur and focus', (env) => env.blurFocus()),
    {
      kind: 'pen drag, leave window',
      group: 'interruption',
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
    eraseHold('erase held, Escape', () => 'Escape', press('Escape')),
    eraseHold('erase held, tool key', (k) => `press ${k}`, (env, arg) => env.page.keyboard.press(arg[2]), toolKey),
    eraseHold('erase held, left button', () => 'left button down and up', async (env) => {
      await env.page.mouse.down({ button: 'left' })
      await env.page.mouse.up({ button: 'left' })
    }),
    noteDrag('note drag, Escape', 'Escape', press('Escape')),
    noteDrag('note drag, Delete', 'Delete', press('Delete')),
    noteDrag('note drag, undo', 'Ctrl+Z', press('Control+z')),
    noteDrag('note drag, resize', `resize the window to ${WINDOW_SIZES[0].width}x${WINDOW_SIZES[0].height}`, (env) => env.resize(WINDOW_SIZES[0])),

    // Page-level events.
    { kind: 'blur and focus', group: 'page', weight: 1, arg: () => fc.constant(null), label: () => 'window blur and focus', run: (env) => env.blurFocus() },
    { kind: 'reload', group: 'page', weight: 1, arg: () => fc.constant(null), label: () => 'reload the page', run: (env, _, model) => { model.selected = false; return env.reload() } },
    {
      kind: 'restart',
      group: 'page',
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
    { kind: 'resize', group: 'page', weight: 1, arg: () => fc.constantFrom(...WINDOW_SIZES), label: ({ width, height }) => `resize the window to ${width}x${height}`, run: (env, size) => env.resize(size) },
    {
      kind: 'dark page',
      group: 'page',
      weight: 1,
      arg: () => fc.tuple(fc.constantFrom(...DARK_COLORS), fc.boolean()),
      label: ([color, save]) => `Dark Page dialog: ${save ? 'Save' : 'Cancel'} ${color}`,
      run: (env, [color, save]) => env.darkPage(color, save)
    },
    {
      kind: 'rules drag',
      group: 'page',
      weight: 2,
      arg: () => fc.tuple(fc.constantFrom(...RULES_CORNERS), fc.integer({ min: -RULES_DRAG_REACH_PX, max: RULES_DRAG_REACH_PX }), fc.integer({ min: -RULES_DRAG_REACH_PX, max: RULES_DRAG_REACH_PX })),
      label: ([corner, dx, dy]) => `drag the ${CORNER_NAMES[corner]} corner of the rules box by ${dx} x ${dy}`,
      run: (env, [corner, dx, dy]) => env.dragRules(corner, dx, dy)
    },
    {
      kind: 'rules font',
      group: 'page',
      weight: 1,
      arg: () => fc.tuple(fc.constantFrom(1, -1), fc.integer({ min: 1, max: 3 })),
      label: ([step, times]) => `press ${step > 0 ? 'f+' : 'f-'} on the rules box ${times} time${times === 1 ? '' : 's'}`,
      run: (env, [step, times]) => env.rulesFont(step, times)
    },
    {
      kind: 'rules dialog',
      group: 'page',
      weight: 1,
      arg: () => fc.tuple(fc.constantFrom(...RULES_LIMIT_TEXTS), fc.constantFrom(...RULES_LIMIT_TEXTS), fc.boolean(), fc.boolean()),
      label: ([maxWidth, maxHeight, restore, save]) => `Auto Rules Resizer dialog: max width ${limitWords(maxWidth)} max height ${limitWords(maxHeight)}${restore ? ' Restore defaults' : ''} ${save ? 'Save' : 'Cancel'}`,
      run: (env, [maxWidth, maxHeight, restore, save]) => env.rulesDialog({ maxWidth, maxHeight, restore }, save)
    },
    {
      kind: 'dark page defaults',
      group: 'page',
      weight: 1,
      arg: () => fc.tuple(fc.constantFrom(...DARK_COLORS), fc.boolean()),
      label: ([color, save]) => `Dark Page dialog: ${color} then Restore defaults ${save ? 'Save' : 'Cancel'}`,
      run: (env, [color, save]) => env.darkPage(color, save, true)
    },
    {
      kind: 'dark page settings text',
      group: 'page',
      weight: 1,
      arg: () => fc.tuple(textOrCopy(DARK_PAGE_TEXTS), fc.boolean()),
      label: ([text, save]) => settingsTextLabel('Dark Page', text, save),
      run: (env, [text, save]) => env.settingsText('dark page', text, save)
    },
    {
      kind: 'ui tweaks dialog',
      group: 'page',
      weight: 1,
      arg: () => fc.tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean()),
      label: ([hideSelect, wrapButtons, toggleTab, restore, save]) => `UI Tweaks dialog: select ${hideSelect ? 'hidden' : 'shown'} buttons ${wrapButtons ? 'wrapped' : 'in one row'}${toggleTab ? ' Tab option off and on' : ''}${restore ? ' Restore defaults' : ''} ${save ? 'Save' : 'Cancel'}`,
      run: (env, [hideSelect, wrapButtons, toggleTab, restore, save]) => env.uiTweaks({ hideSelect, wrapButtons, toggleTab, restore }, save)
    },
    {
      kind: 'ui tweaks settings text',
      group: 'page',
      weight: 1,
      arg: () => fc.tuple(textOrCopy(UI_TWEAKS_TEXTS), fc.boolean()),
      label: ([text, save]) => settingsTextLabel('UI Tweaks', text, save),
      run: (env, [text, save]) => env.settingsText('ui tweaks', text, save)
    }
  ]
}

const KINDS = buildKinds()
export const KIND_NAMES = KINDS.map((k) => k.kind)
export const KIND_GROUPS = Object.fromEntries(KINDS.map((k) => [k.kind, k.group]))

// The name of target `i` of `puzzle` in a step: `r3c4`, with row 0 and a column 0 for the cells just outside the grid on its top and left.
const nameTarget = (puzzle) => (i) => `r${puzzle.cells[i][0] + 1}c${puzzle.cells[i][1] + 1}`

// One action of kind `k` with its numbers `arg`: a command fast-check can run, shrink and print.
const commandOf = (k, puzzle, arg) => ({
  kind: k.kind,
  group: k.group,
  check: (model) => k.check ? k.check(model) : true,
  run: async (model, real) => { await k.run(real.env, arg, model) },
  toString: () => k.label(arg, nameTarget(puzzle))
})

// A script's file name from its short name, which is what `--focus` takes and a replay command prints.
export const scriptFile = (name) => `${name}.user.js`
export const scriptName = (file) => file.replace(/\.user\.js$/, '')
const AUTO_RULES_RESIZER = scriptFile('auto-rules-resizer')
const COLOR_BY_DIGIT = scriptFile('color-by-digit')
const DARK_PAGE = scriptFile('dark-page')
const PEN_TOOL_EXTRAS = scriptFile('pen-tool-extras')
const TEXT_ANYWHERE = scriptFile('text-anywhere')
const UI_TWEAKS = scriptFile('ui-tweaks')

// The scripts each kind exercises, by file name: what `--focus` raises. A kind that reaches a script only through SudokuPad (a click on a cell, a window blur) names none.
export const KIND_SCRIPTS = {
  'click cell': [],
  'type digit': [COLOR_BY_DIGIT],
  'enter digit': [COLOR_BY_DIGIT],
  undo: [PEN_TOOL_EXTRAS, TEXT_ANYWHERE],
  'undo all': [PEN_TOOL_EXTRAS, TEXT_ANYWHERE],
  redo: [PEN_TOOL_EXTRAS, TEXT_ANYWHERE],
  'tool key': [COLOR_BY_DIGIT, UI_TWEAKS],
  tab: [UI_TWEAKS],
  'pen line': [PEN_TOOL_EXTRAS],
  'pen erase': [PEN_TOOL_EXTRAS],
  'pen page': [PEN_TOOL_EXTRAS],
  'place note': [TEXT_ANYWHERE],
  'move note': [TEXT_ANYWHERE],
  'pen settings': [PEN_TOOL_EXTRAS],
  'slider drag': [PEN_TOOL_EXTRAS, TEXT_ANYWHERE],
  'slider keys': [PEN_TOOL_EXTRAS, TEXT_ANYWHERE],
  'pen settings values': [PEN_TOOL_EXTRAS],
  'pen line mode': [PEN_TOOL_EXTRAS],
  'pen mark': [PEN_TOOL_EXTRAS],
  'pen color edit': [PEN_TOOL_EXTRAS],
  'pen colors dialog': [PEN_TOOL_EXTRAS],
  'note box color': [TEXT_ANYWHERE],
  'note background': [TEXT_ANYWHERE],
  'boxed note': [TEXT_ANYWHERE],
  'arrow line': [PEN_TOOL_EXTRAS],
  'rich note': [TEXT_ANYWHERE],
  'note resize': [TEXT_ANYWHERE],
  'note wheel': [TEXT_ANYWHERE],
  'note rectangle': [TEXT_ANYWHERE],
  'note nudge': [TEXT_ANYWHERE],
  'clear notes': [TEXT_ANYWHERE],
  'tick check box': [TEXT_ANYWHERE],
  'reopen note': [TEXT_ANYWHERE],
  'color mode': [COLOR_BY_DIGIT],
  'profile editor': [COLOR_BY_DIGIT],
  'profile switch': [COLOR_BY_DIGIT],
  'pen drag, Escape': [PEN_TOOL_EXTRAS],
  'pen drag, tool key': [PEN_TOOL_EXTRAS],
  'pen drag, undo': [PEN_TOOL_EXTRAS],
  'pen drag, resize': [PEN_TOOL_EXTRAS, AUTO_RULES_RESIZER],
  'pen drag, second button': [PEN_TOOL_EXTRAS],
  'pen drag, blur': [PEN_TOOL_EXTRAS],
  'pen drag, leave window': [PEN_TOOL_EXTRAS],
  'erase held, Escape': [PEN_TOOL_EXTRAS],
  'erase held, tool key': [PEN_TOOL_EXTRAS],
  'erase held, left button': [PEN_TOOL_EXTRAS],
  'note drag, Escape': [TEXT_ANYWHERE],
  'note drag, Delete': [TEXT_ANYWHERE],
  'note drag, undo': [TEXT_ANYWHERE],
  'note drag, resize': [TEXT_ANYWHERE, AUTO_RULES_RESIZER],
  'blur and focus': [],
  reload: [],
  restart: [COLOR_BY_DIGIT, TEXT_ANYWHERE],
  resize: [AUTO_RULES_RESIZER],
  'rules drag': [AUTO_RULES_RESIZER],
  'rules font': [AUTO_RULES_RESIZER],
  'rules dialog': [AUTO_RULES_RESIZER],
  'dark page': [DARK_PAGE],
  'dark page defaults': [DARK_PAGE],
  'dark page settings text': [DARK_PAGE],
  'ui tweaks dialog': [UI_TWEAKS],
  'ui tweaks settings text': [UI_TWEAKS]
}

// How much a focused script's kinds weigh over their own weight: a kind is raised, never silenced, so the others still come up.
export const FOCUS_FACTOR = 4

// The script files `flag` (`--focus`, `--file`) names (short names); a name that is no script is refused, naming the ones that are.
export function focusFiles (names = [], flag = '--focus') {
  const files = scriptFiles()
  return names.map((name) => {
    if (!files.includes(scriptFile(name))) throw new Error(`${flag} ${name} is no script; the scripts are ${files.map(scriptName).join(', ')}`)
    return scriptFile(name)
  })
}

// The weight of every kind, by name, when the actions are focused on the script files `focus`.
export const kindWeights = (focus = []) => Object.fromEntries(KINDS.map((k) => [k.kind, k.weight * (KIND_SCRIPTS[k.kind].some((f) => focus.includes(f)) ? FOCUS_FACTOR : 1)]))

// The arbitrary of one action of `kinds` over `puzzle` (`puzzle-set.mjs`), weighted by `weights` (`kindWeights`).
function actionArbitrary (puzzle, weights, kinds = KINDS) {
  return fc.oneof(...kinds.map((k) => ({ weight: weights[k.kind], arbitrary: k.arg(puzzle).map((arg) => commandOf(k, puzzle, arg)) })))
}

// The kinds a busy start (#726) is built from: what puts something on the board or into the saved data, and nothing that takes it away (undo, a reload) or holds a gesture open.
// Digits, marks (a tool key, then a digit), colors, pen lines on every pen page, notes with their box settings, and the settings the scripts save.
export const START_KINDS = ['click cell', 'type digit', 'enter digit', 'tool key', 'pen line', 'pen page', 'arrow line', 'pen line mode', 'pen mark', 'pen colors dialog', 'place note', 'rich note', 'boxed note', 'note box color', 'note background', 'pen settings values', 'color mode', 'profile editor', 'profile switch', 'dark page', 'dark page defaults', 'dark page settings text', 'ui tweaks dialog', 'ui tweaks settings text', 'rules drag', 'rules font', 'rules dialog']
// The most steps a busy start has; its length is drawn up to it, so some starts are short and some are empty.
export const MAX_START_STEPS = 30

// The arbitrary of a busy start's steps over `puzzle`: commands like a list's, weighted alike (`--focus` included), run first, each printed with `(start) ` before it.
const startArbitrary = (puzzle, weights) => fc.array(actionArbitrary(puzzle, weights, KINDS.filter((k) => START_KINDS.includes(k.kind))), { maxLength: MAX_START_STEPS, size: 'max' })

// The generator of whole lists, each `{ puzzle, start, commands, waitMs }`: a puzzle of `puzzles`, then (with `busyStart`, #726) a start of up to `MAX_START_STEPS` steps that builds a
// busy board, then at most `maxCommands` actions on it. `replayPath` replays a shrunk list (what `String()` of a failing list prints, which is the start's steps and then the
// actions'); the puzzle is drawn first, so the same path gives the same puzzle. `focus` is script files (`focusFiles`) whose actions weigh more; a path replays only with the
// focus it was found with. A start is an array, so a shrink drops its steps and leaves a list that begins on the empty board when the failure does not need it.
// `waits` (#725) is the milliseconds the engine may wait after each action: each list draws its own, beside its actions, so a path replays it and a shrink moves it
// to the first of the set; with none, `waitMs` is undefined and the engine's own wait stands.
export const actionList = (puzzles, { maxCommands = 20, replayPath, focus = [], waits = [], busyStart = false } = {}) => fc.constantFrom(...puzzles).chain((puzzle) => {
  const weights = kindWeights(focus)
  const commands = fc.commands([actionArbitrary(puzzle, weights)], { maxCommands, size: 'max', replayPath })
  // A single wait is a constant, which draws nothing, so its lists are those of no set.
  const waitMs = waits.length > 1 ? fc.constantFrom(...waits) : fc.constant(waits[0])
  const start = busyStart ? startArbitrary(puzzle, weights) : fc.constant([])
  return fc.tuple(waitMs, start, commands).map(([wait, steps, c]) => ({
    puzzle,
    start: steps,
    commands: c,
    waitMs: wait,
    toString: () => [...steps.map((step) => `(start) ${step}`), String(c)].join(',')
  }))
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
