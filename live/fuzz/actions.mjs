// The fuzz's action vocabulary (#590 Q6 c, #593): what a user does with the six scripts on SudokuPad, weighted so ordinary use is the bulk, then
// interruptions in the middle of a gesture, then page-level events. Each action is one step that leaves the mouse up and no key held, so a shrunk
// list reads as plain steps and replays from the numbers alone. A list names its puzzle (`puzzle-set.mjs`, #679): the puzzle is the first thing a list
// generates, so its path replays on the same puzzle, and an action reads the digit keys and the targets from the puzzle it runs on. Not a check itself.
//
// An action runs on an `env`, never on Playwright directly, so the unit tests drive the same code with a fake one (`fake-target.mjs`). The env is:
//   env.page.mouse {move, down, up, click}   env.page.keyboard {press, type}      Playwright's, used as they are
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
//   env.resize({ width, height })  env.blurFocus()  env.reload()  env.darkPage(color, save)
import { createRequire } from 'node:module'
import fc from 'fast-check'

const require = createRequire(import.meta.url)
const { THICKNESS, DASH, ARROW_SPACING } = require('../../pen-tool-extras.user.js')
const { BOX_PRESETS } = require('../../text-anywhere.user.js')

export const TOOL_KEYS = ['z', 'x', 'c', 'v']
const WINDOW_SIZES = [{ width: 1024, height: 600 }, { width: 1200, height: 900 }, { width: 1400, height: 1000 }]
const NOTE_TEXTS = ['15', 'a->b', 'sum 12', '!= 3', 'x\ny']
// Dark colors only: Dark Page has no off switch, its page color is the setting, and a rule says it stays dark (#590).
const DARK_COLORS = ['#000000', '#101030', '#002010', '#201010']

// The four sliders of the pen panel and the notes panel, by the name a step prints.
export const SLIDERS = ['pen thickness', 'pen opacity', 'note size', 'note transparency']
// Text Anywhere's Box color buttons, in the dialog's order; `custom` is Own.
const BOX_CHOICES = [...Object.keys(BOX_PRESETS), 'custom']
const boxLabel = (choice) => BOX_PRESETS[choice] ?? 'Own'
const SLIDER_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Home', 'End']
// The dialog's thickness slider moves in steps of `THICKNESS.step`, so it is drawn as a count of steps.
const THICKNESS_STEPS = { min: THICKNESS.min / THICKNESS.step, max: THICKNESS.max / THICKNESS.step }

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
  async function noteDragStart (env, [t, a]) {
    await dragNote(env, await env.noteCentre() ?? (await env.placeNote(NOTE_TEXTS[t], a), await env.noteCentre()))
  }
  const noteDrag = (kind, words, interrupt) => ({
    kind,
    group: 'interruption',
    weight: 1,
    arg: note,
    label: ([t, a], at) => `note drag (note ${JSON.stringify(NOTE_TEXTS[t]).replace(/,/g, ';')} at ${at(a)} if none) then ${words} then release`,
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
      label: ([t, a], at) => `note ${JSON.stringify(NOTE_TEXTS[t]).replace(/,/g, ';')} at ${at(a)}`,
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
      label: ([t, a], at) => `note ${JSON.stringify(NOTE_TEXTS[t]).replace(/,/g, ';')} with a box at ${at(a)}`,
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
    { kind: 'resize', group: 'page', weight: 1, arg: () => fc.constantFrom(...WINDOW_SIZES), label: ({ width, height }) => `resize the window to ${width}x${height}`, run: (env, size) => env.resize(size) },
    {
      kind: 'dark page',
      group: 'page',
      weight: 1,
      arg: () => fc.tuple(fc.constantFrom(...DARK_COLORS), fc.boolean()),
      label: ([color, save]) => `Dark Page dialog: ${save ? 'Save' : 'Cancel'} ${color}`,
      run: (env, [color, save]) => env.darkPage(color, save)
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

// The arbitrary of one weighted action over `puzzle` (`puzzle-set.mjs`).
function actionArbitrary (puzzle) {
  return fc.oneof(...KINDS.map((k) => ({ weight: k.weight, arbitrary: k.arg(puzzle).map((arg) => commandOf(k, puzzle, arg)) })))
}

// The generator of whole lists, each `{ puzzle, commands }`: a puzzle of `puzzles`, then at most `maxCommands` actions on it. `replayPath` replays a shrunk list
// (what `String()` of a failing list prints); the puzzle is drawn first, so the same path gives the same puzzle. A list prints as its commands.
export const actionList = (puzzles, { maxCommands = 20, replayPath } = {}) => fc.constantFrom(...puzzles).chain((puzzle) =>
  fc.commands([actionArbitrary(puzzle)], { maxCommands, size: 'max', replayPath }).map((commands) => ({ puzzle, commands, toString: () => String(commands) })))

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
