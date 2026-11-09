// The fuzz's action vocabulary (#590 Q6 c, #593): what a user does with the six scripts on SudokuPad, weighted so ordinary use is the bulk, then
// interruptions in the middle of a gesture, then page-level events. Each action is one step that leaves the mouse up and no key held, so a shrunk
// list reads as plain steps and replays from the numbers alone. Not a check itself.
//
// An action runs on an `env`, never on Playwright directly, so the unit tests drive the same code with a fake one (`fake-target.mjs`). The env is:
//   env.page.mouse {move, down, up, click}   env.page.keyboard {press, type}      Playwright's, used as they are
//   env.cellPoint(i) -> [x, y]               the page point at the centre of free cell `i`
//   env.usePen(color)                        opens the pen tool and picks its pen color 1 to 9
//   env.useNotes()                           picks Text Anywhere's tool
//   env.turnPenPage()  env.undo()  env.redo()  env.clickColorMode()
//   env.extrasDialog(save)                   opens Pen Tool Extras' settings dialog and presses Save or Cancel
//   env.placeNote(text, i)                   a note with `text` at cell `i`, finished with Escape
//   env.noteCentre() -> [x, y] | null        the middle of the first note drawn
//   env.resize({ width, height })  env.blurFocus()  env.reload()  env.darkPage(color, save)
import fc from 'fast-check'

export const TOOL_KEYS = ['z', 'x', 'c', 'v']
export const WINDOW_SIZES = [{ width: 1024, height: 600 }, { width: 1200, height: 900 }, { width: 1400, height: 1000 }]
export const NOTE_TEXTS = ['15', 'a->b', 'sum 12', '!= 3', 'x\ny']
// Dark colors only: Dark Page has no off switch, its page color is the setting, and a rule says it stays dark (#590).
export const DARK_COLORS = ['#000000', '#101030', '#002010', '#201010']

// How far (page pixels) a note is dragged.
const NOTE_DRAG = [70, 40]
const OUTSIDE = [-5, -5]

// The kinds. `arg(n)` is the arbitrary of an action's numbers (`n` free cells); `label(arg, at)` its readable step (no comma, which fast-check
// joins steps with; `at(i)` names a cell); `run(env, arg, model)` does it. `check(model)` says whether it can run now.
function buildKinds () {
  const cell = (n) => fc.nat(n - 1)
  const color = fc.integer({ min: 1, max: 9 })
  const toolKey = fc.constantFrom(...TOOL_KEYS)
  const note = (n) => fc.tuple(fc.nat(NOTE_TEXTS.length - 1), cell(n))

  // A pen drag from cell `a` to cell `b` with the left button still down.
  async function penDragStart (env, [a, b, c]) {
    const [from, to] = [await env.cellPoint(a), await env.cellPoint(b)]
    await env.usePen(c)
    await env.page.mouse.move(...from)
    await env.page.mouse.down()
    await env.page.mouse.move(...to, { steps: 6 })
  }
  const penDrag = (kind, words, interrupt, extra = fc.constant(null)) => ({
    kind,
    group: 'interruption',
    weight: 1,
    arg: (n) => fc.tuple(cell(n), cell(n), color, extra),
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
    arg: (n) => fc.tuple(cell(n), cell(n), extra),
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
  // The same on the first note, placed first when there is none.
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
      arg: () => fc.integer({ min: 1, max: 9 }),
      label: (d) => `type ${d}`,
      check: (model) => model.selected,
      run: (env, d) => env.page.keyboard.press(String(d))
    },
    { kind: 'undo', group: 'ordinary', weight: 3, arg: () => fc.constant(null), label: () => 'undo', run: (env) => env.undo() },
    { kind: 'redo', group: 'ordinary', weight: 2, arg: () => fc.constant(null), label: () => 'redo', run: (env) => env.redo() },
    { kind: 'tool key', group: 'ordinary', weight: 3, arg: () => toolKey, label: (k) => `press ${k}`, run: (env, k) => env.page.keyboard.press(k) },
    { kind: 'tab', group: 'ordinary', weight: 1, arg: () => fc.constant(null), label: () => 'press Tab', run: (env) => env.page.keyboard.press('Tab') },
    {
      kind: 'pen line',
      group: 'ordinary',
      weight: 4,
      arg: (n) => fc.tuple(cell(n), cell(n), color),
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
    { kind: 'pen page', group: 'ordinary', weight: 1, arg: () => fc.constant(null), label: () => 'turn the pen page', run: (env) => env.turnPenPage() },
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
      run: (env, save) => env.extrasDialog(save)
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
      arg: (n) => fc.tuple(cell(n), cell(n), color, cell(n)),
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
// Every kind's name, in the order above.
export const KIND_NAMES = KINDS.map((k) => k.kind)
export const KIND_GROUPS = Object.fromEntries(KINDS.map((k) => [k.kind, k.group]))

// The arbitrary of one weighted action over a puzzle with free cells `cells` (`[row, col]`, 0-based): a command fast-check can run, shrink and print.
export function actionArbitrary (cells) {
  const at = (i) => `r${cells[i][0] + 1}c${cells[i][1] + 1}`
  return fc.oneof(...KINDS.map((k) => ({
    weight: k.weight,
    arbitrary: k.arg(cells.length).map((arg) => ({
      kind: k.kind,
      group: k.group,
      check: (model) => k.check ? k.check(model) : true,
      run: async (model, real) => { await k.run(real.env, arg, model) },
      toString: () => k.label(arg, at)
    }))
  })))
}

// The generator of whole action lists, at most `maxCommands` long; `replayPath` replays a shrunk list (what `String()` of a failing list prints).
export const actionList = (cells, { maxCommands = 20, replayPath } = {}) => fc.commands([actionArbitrary(cells)], { maxCommands, size: 'max', replayPath })
