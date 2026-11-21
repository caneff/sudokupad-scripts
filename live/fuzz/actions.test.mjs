import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fc from 'fast-check'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { actionList, MORE_TEXT, NOTE_SLIDERS, SIZE_KEYS, AUTO_RULES_RESIZER_TEXTS, COLOR_BY_DIGIT_TEXTS, DARK_COLORS, DARK_PAGE_TEXTS, ERROR_LOG_SCRIPTS, PEN_TOOL_EXTRAS_TEXTS, TEXT_ANYWHERE_TEXTS, DEFAULT_MAX_COMMANDS, focusFiles, FOCUS_FACTOR, REPLAY_PATH, SETTINGS_KINDS, KIND_GROUPS, KIND_NAMES, KINDS, kindWeights, MARK_BOXES, MAX_PROFILE_EDITS, MAX_PROFILES, ARROW_KEYS, PROFILE_NAMES, ROW_KEYS, SWATCH_KEYS, NOTE_SETTLE_MS, RICH_NOTES, RULES_CORNERS, RULES_DRAG_REACH_PX, RULES_LIMIT_TEXTS, scriptedList, UI_TWEAKS_TEXTS } from './actions.mjs'
import { fakeTargets } from './fake-target.mjs'
import { SETTINGS_SCRIPTS } from '../scripts.mjs'
import { FUZZ_PUZZLES, puzzleByName } from './puzzle-set.mjs'
import { scriptFiles } from '../../sync-lib.js'

// What each real kind declares, by name.
const KIND_SCRIPTS = Object.fromEntries(KINDS.map((k) => [k.kind, k.scripts]))
const START_KINDS = KINDS.filter((k) => k.start).map((k) => k.kind)

const sample = (seed, count = 6, puzzles = FUZZ_PUZZLES) => fc.sample(actionList(puzzles, { kinds: KINDS, maxCommands: 20 }), { seed, numRuns: count })
// fast-check wraps each generated command (`.cmd`), and prints a list only once it ran, so the steps are read from the commands.
const actionsOf = (lists) => lists.flatMap((l) => [...l.commands].map((wrapped) => wrapped.cmd))
const stepsOf = (lists) => actionsOf(lists).map(String)

const { THICKNESS, DASH, ARROW_SPACING } = createRequire(import.meta.url)('../../pen-tool-extras.user.js')
const UI_TWEAKS = createRequire(import.meta.url)('../../ui-tweaks.user.js')
const DARK_PAGE = createRequire(import.meta.url)('../../dark-page.user.js')
const AUTO_RULES_RESIZER = createRequire(import.meta.url)('../../auto-rules-resizer.user.js')
const { BOX_LINES, NUDGE_REPEAT_MS, SPEED_WINDOW_MS } = createRequire(import.meta.url)('../../text-anywhere.user.js')

const runOn = async (action, options) => {
  const target = await fakeTargets(options).openTarget()
  await action.run({ selected: true }, { env: target.env })
  return target
}

describe('the action vocabulary', () => {
  it('an action clears the buttons a note covers before it acts, three kinds of it checked (#880)', async () => {
    const cases = [['click cell', 0], ['dark page', ['#000000', false]], ['move note', null]]
    for (const [kind, arg] of cases) {
      const target = await fakeTargets().openTarget()
      const seenBefore = []
      const env = { ...target.env, clearControls: async () => { seenBefore.push(target.log.length) } }
      const [step] = scriptedList(puzzleByName('4x4'), [[kind, arg]])
      await step.run({ selected: true }, { env })
      assert.deepEqual(seenBefore, [0], `${kind} cleared once, before any call of its own`)
    }
  })

  it('a seed always gives the same actions, and another seed gives others', () => {
    assert.deepEqual(stepsOf(sample(7)), stepsOf(sample(7)))
    assert.notDeepEqual(stepsOf(sample(7)), stepsOf(sample(8)))
  })

  it('generates every kind, in all three groups', () => {
    const seen = new Set(actionsOf(sample(1, 150)).map((a) => a.kind))
    assert.deepEqual(KIND_NAMES.filter((k) => !seen.has(k)), [], 'every kind appears')
    assert.deepEqual([...new Set(Object.values(KIND_GROUPS))].sort(), ['interruption', 'ordinary', 'page'])
  })

  it('ordinary use is the bulk', () => {
    const groups = actionsOf(sample(2, 150)).map((a) => a.group)
    const share = (g) => groups.filter((x) => x === g).length / groups.length
    assert.ok(share('ordinary') > 0.5, `ordinary share ${share('ordinary')}`)
    assert.ok(share('interruption') > 0.08 && share('page') > 0.02, 'interruptions and page events are there too')
  })

  it('every step reads as plain words with no comma, which the report joins steps by', () => {
    for (const a of actionsOf(sample(3, 100))) assert.doesNotMatch(String(a), /,/, `${a.kind}: ${a}`)
  })

  const firstOfEachKind = () => {
    const byKind = new Map()
    for (const a of actionsOf(sample(4, 300))) if (!byKind.has(a.kind)) byKind.set(a.kind, a)
    assert.equal(byKind.size, KIND_NAMES.length)
    return byKind
  }

  it('every kind runs on the fake page, calls it, and leaves no mouse button down', async () => {
    for (const [kind, action] of firstOfEachKind()) {
      const target = await fakeTargets().openTarget()
      await action.run({ selected: true }, { env: target.env })
      assert.ok(target.log.length > 0, `${kind} made a call`)
      const downs = target.log.filter(([n]) => n === 'mouse.down').length
      const ups = target.log.filter(([n]) => n === 'mouse.up').length
      assert.equal(downs, ups, `${kind} leaves no button down`)
      const keysDown = target.log.filter(([n]) => n === 'keyboard.down').map(([, k]) => k).sort()
      const keysUp = target.log.filter(([n]) => n === 'keyboard.up').map(([, k]) => k).sort()
      assert.deepEqual(keysDown, keysUp, `${kind} leaves no key held`)
    }
  })

  it('an interruption does something between the first button down and the last up: a key, a resize, a blur, a second button or a move out of the window', async () => {
    for (const [kind, action] of firstOfEachKind()) {
      if (action.group !== 'interruption') continue
      const { log } = await runOn(action)
      const inside = log.slice(log.findIndex(([n]) => n === 'mouse.down') + 1, log.map(([n]) => n).lastIndexOf('mouse.up'))
      const interrupts = inside.filter(([n, ...args]) => n !== 'mouse.move' || args[0] < 0)
      assert.ok(interrupts.length > 0, `${kind}: ${JSON.stringify(inside)}`)
    }
  })

  it('a note drag places a note first when there is none, and only then', async () => {
    const drag = firstOfEachKind().get('note drag, Escape')
    assert.ok((await runOn(drag, { withNote: false })).log.some(([n]) => n === 'placeNote'), 'placed one')
    assert.ok(!(await runOn(drag, { withNote: true })).log.some(([n]) => n === 'placeNote'), 'used the note there')
  })

  it('a digit can be typed only after a cell was clicked', () => {
    const type = actionsOf(sample(5, 100)).find((a) => a.kind === 'type digit')
    assert.equal(type.check({ selected: false }), false)
    assert.equal(type.check({ selected: true }), true)
  })

  it('an interruption shows its interruption in the step: Escape, a tool key, undo, a resize, a second button, leaving the window', () => {
    const steps = actionsOf(sample(6, 200)).filter((a) => a.group === 'interruption').map(String).join('\n')
    for (const word of ['Escape', 'Ctrl+Z', 'resize the window', 'right button', 'leave the window', 'blur and focus', 'Delete']) assert.ok(steps.includes(word), word)
  })

  describe('the sliders, the settings values and the box color (#713)', () => {
    const kindsNamed = (pattern) => [...firstOfEachKind()].filter(([kind]) => pattern.test(kind))
    const calls = (log, name) => log.filter(([n]) => n === name)

    it('a slider drag presses the track, drags it and lets go, on each of the four sliders in turn', async () => {
      const seen = new Set()
      for (const a of actionsOf(sample(12, 400)).filter((x) => x.kind === 'slider drag')) {
        const { log } = await runOn(a)
        const points = calls(log, 'sliderPoint')
        assert.equal(points.length, 2, `${a}: one point to press, one to drag to`)
        seen.add(points[0][1])
        assert.deepEqual(log.filter(([n]) => /^mouse\.(?:down|up)$/.test(n)).map(([n]) => n), ['mouse.down', 'mouse.up'])
        // The fake puts a point at 100 + 200 * fraction: the button goes down at the first point and the drag ends on the second.
        const moves = calls(log, 'mouse.move')
        assert.deepEqual(moves[0].slice(1, 3), [100 + points[0][2] * 200, 300], `${a}: the press point`)
        assert.deepEqual(moves.at(-1).slice(1, 3), [100 + points[1][2] * 200, 300], `${a}: the drag ends on the second point`)
      }
      assert.deepEqual([...seen].sort(), ['note opacity', 'note size', 'pen opacity', 'pen thickness'])
    })

    it('a slider key action focuses the slider, presses its keys and leaves the slider', async () => {
      const [[, action]] = kindsNamed(/^slider keys$/)
      const { log } = await runOn(action)
      const names = log.map(([n]) => n)
      assert.equal(names[0], 'focusSlider')
      assert.equal(names.at(-1), 'leaveSlider')
      assert.ok(calls(log, 'keyboard.press').length >= 1)
      assert.ok(calls(log, 'keyboard.press').every(([, key]) => /^(?:Arrow(?:Left|Right|Up|Down)|Home|End)$/.test(key)))
    })

    it('the dialog action sets an arrow spacing, a dash length and a thickness inside the script\'s ranges, and saves or cancels', async () => {
      const sets = []
      const saves = new Set()
      for (const a of actionsOf(sample(13, 300)).filter((x) => x.kind === 'pen settings values')) {
        const { log } = await runOn(a)
        const [[, values, save]] = calls(log, 'extrasSettings')
        sets.push(values)
        saves.add(save)
        const onRange = (v, { min, max, step }) => v >= min && v <= max && Number.isInteger((v - min) / step)
        assert.ok(onRange(values.arrowSpacing, ARROW_SPACING), `arrow spacing ${values.arrowSpacing}`)
        assert.ok(onRange(values.dash, DASH), `dash ${values.dash}`)
        assert.ok(onRange(values.thickness, THICKNESS), `thickness ${values.thickness}`)
      }
      assert.deepEqual([...saves].sort(), [false, true])
      assert.ok(new Set(sets.map((v) => v.arrowSpacing)).size > 3, 'the spacing varies')
    })

    it('the box color action picks a preset or an own color, and saves or cancels', async () => {
      const picks = new Set()
      const saves = new Set()
      for (const a of actionsOf(sample(14, 400)).filter((x) => x.kind === 'note box color')) {
        const { log } = await runOn(a)
        const [[, choice, color, save]] = calls(log, 'noteBoxDialog')
        picks.add(choice)
        saves.add(save)
        if (choice === 'custom') assert.match(color, /^#[0-9a-f]{6}$/)
      }
      assert.deepEqual([...picks].sort(), ['custom', 'page', 'tint', 'white', 'yellow'])
      assert.deepEqual([...saves].sort(), [false, true])
    })

    it('the background action sets the Background button on or off', async () => {
      const wants = new Set()
      for (const a of actionsOf(sample(16, 300)).filter((x) => x.kind === 'note background')) wants.add(calls((await runOn(a)).log, 'setNoteBackground')[0][1])
      assert.deepEqual([...wants].sort(), [false, true])
    })

    it('a boxed note turns Background on first and then places the note', async () => {
      const [[, action]] = kindsNamed(/^boxed note$/)
      const { log } = await runOn(action)
      assert.deepEqual(log.filter(([n]) => /^(?:setNoteBackground|placeNote)$/.test(n)).map(([n]) => n), ['setNoteBackground', 'placeNote'])
      assert.equal(calls(log, 'setNoteBackground')[0][1], true)
    })

    it('an arrow line picks an arrow pen, then drags a line with the button up at the end', async () => {
      const [[, action]] = kindsNamed(/^arrow line$/)
      const { log } = await runOn(action)
      const names = log.map(([n]) => n)
      assert.equal(names.filter((n) => n === 'useArrowPen').length, 1, 'the arrow pen is picked')
      assert.ok(names.indexOf('useArrowPen') < names.indexOf('mouse.down'), 'before the button goes down')
      assert.deepEqual(names.filter((n) => /^mouse\.(?:down|up)$/.test(n)), ['mouse.down', 'mouse.up'])
    })

    it('their steps read as plain words naming what they set', () => {
      const steps = stepsOf(sample(15, 400))
      assert.ok(steps.some((s) => /^drag the pen thickness slider from \d+% to \d+%$/.test(s)), 'drag')
      assert.ok(steps.some((s) => /^press \w+ \d times on the \w+ \w+ slider$/.test(s)), 'keys')
      assert.ok(steps.some((s) => /^Pen Tool Extras settings dialog: arrow spacing \d+ dash \d thickness [\d.]+ (?:Save|Cancel)$/.test(s)), 'values')
      assert.ok(steps.some((s) => /^Text Anywhere box color (?:Page|White|Yellow|Tint) (?:Save|Cancel)$/.test(s)), 'preset')
      assert.ok(steps.some((s) => /^note ".*" with a box at r\d+c\d+$/.test(s)), 'boxed note')
      assert.ok(steps.some((s) => /^arrow line r\d+c\d+ -> r\d+c\d+ color \d$/.test(s)), 'arrow line')
      assert.ok(steps.some((s) => /^Text Anywhere box color Own #[0-9a-f]{6} (?:Save|Cancel)$/.test(s)), 'own')
    })
  })

  describe("Color by Digit's profile editor, menu and Restart (#814)", () => {
    const calls = (log, name) => log.filter(([n]) => n === name)
    const kindOf = (kind) => actionsOf(sample(21, 600)).filter((x) => x.kind === kind)
    const editorCalls = async (pool = kindOf('profile editor').slice(0, 200)) => {
      const seen = []
      for (const a of pool) seen.push({ step: String(a), call: calls((await runOn(a)).log, 'profileEditor')[0] })
      return seen
    }

    it('the editor action opens the dialog, makes up to four edits, and saves or cancels', async () => {
      const seen = await editorCalls()
      assert.ok(seen.length > 20)
      const ops = new Set()
      const saves = new Set()
      const menus = new Set()
      for (const { step, call: [, edits, save, fromMenu] } of seen) {
        assert.equal(edits.length, (step.match(/ then /g) ?? []).length, `every drawn edit reaches the page: ${step}`)
        menus.add(fromMenu)
        assert.ok(edits.length <= MAX_PROFILE_EDITS)
        for (const [op] of edits) ops.add(op)
        saves.add(save)
      }
      assert.deepEqual([...ops].sort(), ['cell profile', 'clear all', 'delete', 'digit key', 'digit profile', 'move', 'new', 'paint', 'paint drag', 'rename', 'row key', 'select', 'swatch key'])
      assert.deepEqual([...saves].sort(), [false, true])
      assert.deepEqual([...menus].sort(), [false, true], 'opened from the settings and from the pad menu')
    })

    it('its steps name each edit and Save or Cancel, as plain words', async () => {
      const steps = (await editorCalls()).map(({ step }) => step)
      for (const step of steps) assert.match(step, /^Color by Digit profiles dialog(?: from the pad menu)?: .*(?:Save|Cancel)$/)
      const all = steps.join(' | ')
      for (const word of ['new profile', 'rename to ', 'delete profile ', 'move profile ', 'select profile ', 'paint digit ', 'cell profile ', 'digit profile ', 'press ', ' on profile row ', ' on swatch ', ' on digit ', 'drag from digit ', 'Clear all']) assert.ok(all.includes(word), word)
    })

    it('the edits of the keyboard, the paint drag and Clear all, and a name with & < > and a quote, are drawn (#931)', async () => {
      const seen = await editorCalls(actionsOf(sample(23, 3000)).filter((x) => x.kind === 'profile editor'))
      const edits = seen.flatMap(({ call: [, e] }) => e)
      const keys = (op) => new Set(edits.filter(([o]) => o === op).map(([, , k]) => k))
      const enter = SWATCH_KEYS.indexOf('Enter')
      assert.ok(keys('swatch key').has(enter), 'Enter on a swatch is drawn')
      assert.ok(keys('row key').has(ROW_KEYS.indexOf('Enter')) && keys('row key').has(ROW_KEYS.indexOf('Space')), 'Enter and Space on a profile row are drawn')
      assert.ok([...keys('digit key')].some((k) => k < ARROW_KEYS.length), 'an arrow on a digit key is drawn')
      assert.ok([...keys('digit key')].some((k) => k >= ARROW_KEYS.length), 'a digit on a digit key is drawn')
      assert.ok(edits.some(([o, i]) => o === 'rename' && /[&<>"]/.test(PROFILE_NAMES[i])), 'a name with the four characters escapeHtml replaces is typed')
    })

    it('the switch action picks a profile from the pad menu, and the restart action restarts the puzzle', async () => {
      const picks = new Set()
      for (const pick of kindOf('profile switch')) {
        const picked = calls((await runOn(pick)).log, 'pickProfile')
        assert.equal(picked.length, 1)
        assert.match(String(pick), /^pick profile \d from the pad menu$/)
        picks.add(picked[0][1])
      }
      assert.deepEqual([...picks].sort(), Array.from({ length: MAX_PROFILES }, (_, i) => i), 'every profile row of a full dialog, and none past it')
      const restarts = kindOf('restart')
      for (const restart of restarts) {
        const { log } = await runOn(restart)
        assert.equal(calls(log, 'restartPuzzle').length, 1)
        assert.equal(calls(log, 'undo').length, String(restart).endsWith(' then undo') ? 1 : 0)
        if (calls(log, 'undo').length) assert.ok(log.findIndex(([n]) => n === 'undo') > log.findIndex(([n]) => n === 'restartPuzzle'), 'the undo follows the restart')
      }
      assert.deepEqual([...new Set(restarts.map(String))].sort(), ['restart the puzzle', 'restart the puzzle then undo'])
    })

    it('a restart clears the selected cell, so a digit is not typed into nothing', async () => {
      const [restart] = kindOf('restart')
      const model = { selected: true }
      await restart.run(model, { env: (await fakeTargets().openTarget()).env })
      assert.equal(model.selected, false)
    })

    it('all three kinds exercise Color by Digit, and a restart also clears Text Anywhere\'s notes (#815)', () => {
      for (const kind of ['profile editor', 'profile switch']) assert.deepEqual(KIND_SCRIPTS[kind], ['color-by-digit.user.js'])
      assert.deepEqual(KIND_SCRIPTS.restart, ['color-by-digit.user.js', 'text-anywhere.user.js'])
    })
  })

  describe("Text Anywhere's resize, rectangle select, nudge, clear and rich notes (#815)", () => {
    const calls = (log, name) => log.filter(([n]) => n === name)
    const names = (log) => log.map(([n]) => n)
    const kindOf = (kind) => actionsOf(sample(31, 800)).filter((x) => x.kind === kind)
    const NEW_KINDS = ['rich note', 'note resize', 'note wheel', 'note rectangle', 'note nudge', 'clear notes', 'tick check box', 'reopen note']

    it('all eight kinds exercise Text Anywhere, are generated, and are ordinary use', () => {
      for (const kind of NEW_KINDS) {
        assert.deepEqual(KIND_SCRIPTS[kind], ['text-anywhere.user.js'], kind)
        assert.equal(KIND_GROUPS[kind], 'ordinary', kind)
        assert.ok(kindOf(kind).length > 3, `${kind} is drawn`)
      }
    })

    it('the rich notes hold a list, a check box, a code block and a note taller than its box, and the rich note action places them', async () => {
      assert.ok(RICH_NOTES.some((t) => /^- \w/m.test(t)), 'a list')
      assert.ok(RICH_NOTES.some((t) => /^- \[[ x]\] /m.test(t)), 'a check box')
      assert.ok(RICH_NOTES.some((t) => /^```$/m.test(t)), 'a code block')
      assert.ok(RICH_NOTES.some((t) => t.split('\n').length > BOX_LINES), 'a note whose text scrolls')
      const placed = new Set()
      for (const a of kindOf('rich note')) {
        const [call] = calls((await runOn(a)).log, 'placeNote')
        assert.ok(RICH_NOTES.includes(call[1]), String(a))
        placed.add(call[1])
      }
      assert.deepEqual([...placed].sort(), [...RICH_NOTES].sort())
      assert.ok(START_KINDS.includes('rich note'), 'a busy start can hold one')
    })

    it('a resize drag selects the first note, takes a corner handle to a point and lets go, on every corner', async () => {
      const corners = new Set()
      for (const a of kindOf('note resize')) {
        const { log } = await runOn(a)
        const [, corner] = calls(log, 'noteHandle')[0]
        corners.add(corner)
        assert.match(String(a), new RegExp(`corner ${corner}\\b`))
        assert.ok(names(log).indexOf('mouse.click') < names(log).indexOf('noteHandle'), 'the note is selected first')
        assert.equal(calls(log, 'mouse.down').length, 1)
        const moves = calls(log, 'mouse.move')
        assert.notDeepEqual(moves[moves.length - 1].slice(1, 3), [300, 320], 'the handle is dragged away from where it was pressed')
        assert.equal(calls(log, 'mouse.up').length, 1)
      }
      assert.deepEqual([...corners].sort(), [0, 1, 2, 3])
    })

    it('a resize drag with no handle on the page (the click selected no single note) presses nothing', async () => {
      const [a] = kindOf('note resize')
      const target = await fakeTargets().openTarget()
      target.env.noteHandle = async () => null
      await a.run({ selected: true }, { env: target.env })
      assert.equal(calls(target.log, 'mouse.down').length, 0)
    })

    it('a resize, a wheel and a nudge place a note first when there is none, and only then', async () => {
      for (const kind of ['note resize', 'note wheel', 'note nudge']) {
        const [a] = kindOf(kind)
        assert.ok((await runOn(a, { withNote: false })).log.some(([n]) => n === 'placeNote'), `${kind} placed one`)
        assert.ok(!(await runOn(a, { withNote: true })).log.some(([n]) => n === 'placeNote'), `${kind} used the note there`)
      }
    })

    it('a wheel turns over the first note by a signed number of pixels, up and down', async () => {
      const signs = new Set()
      for (const a of kindOf('note wheel')) {
        const { log } = await runOn(a)
        const [wheel] = calls(log, 'mouse.wheel')
        assert.equal(wheel[1], 0)
        assert.notEqual(wheel[2], 0)
        signs.add(Math.sign(wheel[2]))
        assert.ok(names(log).indexOf('mouse.move') < names(log).indexOf('mouse.wheel'), 'the pointer is over the note first')
      }
      assert.deepEqual([...signs].sort(), [-1, 1])
    })

    it('a rectangle drag presses at one cell, drags to another with the notes tool and lets go, holding Shift for some', async () => {
      const shifts = new Set()
      for (const a of kindOf('note rectangle')) {
        const { log } = await runOn(a)
        const shift = calls(log, 'keyboard.down').some(([, k]) => k === 'Shift')
        shifts.add(shift)
        assert.equal(String(a).includes('holding Shift'), shift)
        assert.ok(names(log).includes('useNotes'))
        assert.equal(calls(log, 'mouse.down').length, 1)
        assert.equal(calls(log, 'mouse.up').length, 1)
        if (shift) assert.ok(names(log).indexOf('keyboard.down') < names(log).indexOf('mouse.down') && names(log).lastIndexOf('keyboard.up') > names(log).lastIndexOf('mouse.up'), 'Shift is held across the whole drag')
      }
      assert.deepEqual([...shifts].sort(), [false, true])
    })

    it('a nudge selects the first note and presses an arrow key (Shift for some) a few times, or holds it past the repeat delay', async () => {
      const seen = { keys: new Set(), held: new Set(), shift: new Set() }
      for (const a of kindOf('note nudge')) {
        const { log } = await runOn(a)
        const held = calls(log, 'holdFor')
        seen.held.add(held.length)
        const keyCalls = calls(log, held.length ? 'keyboard.down' : 'keyboard.press').filter(([, k]) => k !== 'Shift')
        assert.ok(keyCalls.length >= 1)
        for (const [, k] of keyCalls) seen.keys.add(k)
        for (const [, k] of keyCalls) assert.match(k, /^Arrow(?:Left|Right|Up|Down)$/)
        if (held.length) {
          assert.ok(held[0][1] > NUDGE_REPEAT_MS, 'held past the delay before repeating')
          assert.equal(keyCalls.length, 1)
        }
        seen.shift.add(calls(log, 'keyboard.down').some(([, k]) => k === 'Shift'))
        for (const [i, [n, k]] of log.entries()) if (n === 'keyboard.down') assert.ok(log.slice(i + 1).some(([m, j]) => m === 'keyboard.up' && j === k), `${k} is let go`)
        assert.ok(names(log).includes('mouse.click'), 'the note is selected first')
      }
      assert.deepEqual([...seen.keys].sort(), ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'])
      assert.deepEqual([...seen.held].sort(), [0, 1])
      assert.deepEqual([...seen.shift].sort(), [false, true])
    })

    it('a clear selects the first note for some, presses Clear all and answers its question with OK or Cancel', async () => {
      const seen = new Set()
      for (const a of kindOf('clear notes')) {
        const { log } = await runOn(a)
        const [clear] = calls(log, 'clearNotes')
        assert.equal(typeof clear[1], 'boolean')
        seen.add(`${names(log).includes('mouse.click')} ${clear[1]}`)
        assert.match(String(a), clear[1] ? /OK$/ : /Cancel$/)
      }
      assert.deepEqual([...seen].sort(), ['false false', 'false true', 'true false', 'true true'])
    })

    it('a check box tick clicks the first check box under the notes tool, and places a check box note first when there is none', async () => {
      const [a] = kindOf('tick check box')
      const withBox = await runOn(a)
      assert.deepEqual(calls(withBox.log, 'mouse.click'), [['mouse.click', 250, 260]])
      assert.ok(names(withBox.log).includes('useNotes'))
      assert.ok(!names(withBox.log).includes('placeNote'), 'used the box there')
      const target = await fakeTargets().openTarget()
      let placed = false
      target.env.placeNote = async (text) => { target.log.push(['placeNote', text]); placed = true }
      target.env.checkBoxPoint = async () => placed ? [250, 260] : null
      await a.run({ selected: true }, { env: target.env })
      const [place] = calls(target.log, 'placeNote')
      assert.match(place[1], /^- \[ \] /m, 'a note with a check box')
      assert.deepEqual(calls(target.log, 'mouse.click'), [['mouse.click', 250, 260]])
      const nothing = await fakeTargets().openTarget()
      nothing.env.checkBoxPoint = async () => null
      await a.run({ selected: true }, { env: nothing.env })
      assert.deepEqual(calls(nothing.log, 'mouse.click'), [], 'no box even after placing a note: nothing is clicked')
    })

    it('a note action whose note could not be placed does nothing more, rather than click at nothing', async () => {
      for (const kind of ['note resize', 'note wheel', 'note nudge', 'reopen note']) {
        const [a] = kindOf(kind)
        const target = await fakeTargets({ withNote: false }).openTarget()
        target.env.placeNote = async () => {}
        await a.run({ selected: true }, { env: target.env })
        assert.deepEqual(calls(target.log, 'mouse.click').concat(calls(target.log, 'mouse.down'), calls(target.log, 'mouse.wheel'), calls(target.log, 'mouse.dblclick'), calls(target.log, 'keyboard.press')), [], kind)
      }
    })

    it('reopening a note double-clicks the first note under the notes tool, places one when there is none, and finishes it', async () => {
      const [a] = kindOf('reopen note')
      const { log } = await runOn(a, { withNote: false })
      assert.ok(names(log).includes('placeNote'))
      assert.ok(names(log).includes('useNotes'))
      assert.deepEqual(calls(log, 'mouse.dblclick')[0].slice(1), [200, 200])
      assert.deepEqual(calls(log, 'finishNote').length, 1)
    })

    describe('the Text Anywhere note edits of #929', () => {
      const pressed = (log) => calls(log, 'pressNotePanel').map(([, what]) => what)

      it('an erase right-clicks the first note, or drags the right button across it, and lets go; a click moves nowhere', async () => {
        const modes = new Set()
        for (const a of kindOf('note erase')) {
          const { log } = await runOn(a)
          const downs = calls(log, 'mouse.down')
          const ups = calls(log, 'mouse.up')
          const clicks = calls(log, 'mouse.click')
          assert.ok(!names(log).includes('placeNote'), 'a note is there')
          if (clicks.length) {
            modes.add('click')
            assert.deepEqual(clicks[0], ['mouse.click', 200, 200, { button: 'right' }])
            assert.equal(downs.length, 0)
          } else {
            modes.add('drag')
            assert.deepEqual([downs.length, ups.length], [1, 1])
            assert.equal(downs[0][1].button, 'right')
            assert.equal(ups[0][1].button, 'right')
            const moves = calls(log, 'mouse.move').map(([, x, y]) => [x, y])
            assert.ok(moves.some(([x, y]) => x === 200 && y === 200), 'the drag goes over the note')
          }
        }
        assert.deepEqual([...modes].sort(), ['click', 'drag'])
      })

      it('an erase places a note first when there is none, and only then; with none placed it does nothing', async () => {
        const [a] = kindOf('note erase')
        assert.ok((await runOn(a, { withNote: false })).log.some(([n]) => n === 'placeNote'))
        assert.ok(!(await runOn(a, { withNote: true })).log.some(([n]) => n === 'placeNote'))
      })

      it('a restyle selects or opens the first note, then presses a color, Background or a slider with the tool kept, so the note stays chosen', async () => {
        const seen = new Set()
        for (const a of kindOf('note restyle')) {
          const { log } = await runOn(a)
          const ns = names(log)
          const press = pressed(log)
          const slides = calls(log, 'sliderPoint')
          assert.equal(press.length + (slides.length ? 1 : 0), 1, String(a))
          if (press.length) seen.add(typeof press[0] === 'number' ? 'color' : press[0])
          if (slides.length) {
            seen.add('slider')
            assert.equal(slides[0][3], true, 'the slider is reached with the notes tool kept')
            assert.ok(NOTE_SLIDERS.includes(slides[0][1]), 'a note slider')
            assert.equal(calls(log, 'mouse.down').length, 1)
            assert.equal(calls(log, 'mouse.up').length, 1)
          }
          if (ns.includes('mouse.dblclick')) assert.equal(calls(log, 'finishNote').length, 1, 'opened and finished')
          else assert.ok(ns.includes('mouse.click'), 'selected by a click')
          const first = ns.findIndex((n) => n === 'pressNotePanel' || n === 'sliderPoint')
          assert.ok(first > ns.findIndex((n) => n === 'mouse.click' || n === 'mouse.dblclick'), 'after the note is chosen')
        }
        assert.deepEqual([...seen].sort(), ['background', 'color', 'slider'])
      })

      it('the colors a restyle presses are the nine', async () => {
        const colors = new Set()
        for (const a of kindOf('note restyle')) for (const c of pressed((await runOn(a)).log)) if (typeof c === 'number') colors.add(c)
        assert.deepEqual([...colors].sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9])
      })

      it('a size key press is +, = or -, with Text Anywhere\'s tool (a note selected) or with the pen, and never a chord', async () => {
        const keys = new Set()
        const tools = new Set()
        for (const a of kindOf('size key')) {
          const { log } = await runOn(a)
          const presses = calls(log, 'keyboard.press').map(([, k]) => k)
          assert.ok(presses.length >= 1)
          for (const k of presses) keys.add(k)
          tools.add(names(log).includes('usePen') ? 'pen' : 'notes')
          assert.ok(presses.every((k) => SIZE_KEYS.includes(k)), String(a))
        }
        assert.deepEqual([...keys].sort(), [...SIZE_KEYS].sort())
        assert.deepEqual([...tools].sort(), ['notes', 'pen'])
      })

      it('a note edit double-clicks the first note, then clicks in it, types more, or deletes all its text, and finishes it', async () => {
        const seen = new Set()
        for (const a of kindOf('note edit')) {
          const { log } = await runOn(a)
          assert.deepEqual(calls(log, 'mouse.dblclick')[0].slice(1), [200, 200])
          assert.equal(calls(log, 'finishNote').length, 1)
          const typed = calls(log, 'keyboard.type').length > 0
          const presses = calls(log, 'keyboard.press').map(([, k]) => k)
          const deleted = presses.includes('Backspace')
          if (deleted) assert.deepEqual(presses.slice(-2), ['Control+a', 'Backspace'], 'all the text is selected before it is deleted')
          else assert.deepEqual(calls(log, 'keyboard.type').map(([, text]) => text), [MORE_TEXT])
          const clicked = calls(log, 'mouse.click').length > 0
          assert.ok(typed || deleted, String(a))
          seen.add(deleted ? 'delete all' : clicked ? 'click and type' : 'type more')
        }
        assert.deepEqual([...seen].sort(), ['click and type', 'delete all', 'type more'])
      })

      it('Hide all is pressed once or twice, so the notes are hidden and then shown again', async () => {
        const counts = new Set()
        for (const a of kindOf('hide all notes')) counts.add(pressed((await runOn(a)).log).filter((w) => w === 'hide all').length)
        assert.deepEqual([...counts].sort(), [1, 2])
      })

      it('a handle reset double-clicks a handle of the first note, selected or open, after dragging it', async () => {
        const seen = new Set()
        for (const a of kindOf('note handle reset')) {
          const { log } = await runOn(a)
          const ns = names(log)
          const dbl = calls(log, 'mouse.dblclick')
          assert.equal(dbl.length, ns.includes('finishNote') ? 2 : 1, 'the handle, after the note when it is opened')
          assert.deepEqual(dbl.at(-1).slice(1), [300, 320], 'the handle')
          assert.ok(ns.lastIndexOf('mouse.up') < ns.lastIndexOf('mouse.dblclick'), 'after the drag')
          assert.equal(calls(log, 'mouse.down').length, 1)
          seen.add(ns.includes('finishNote') ? 'open' : 'selected')
        }
        assert.deepEqual([...seen].sort(), ['open', 'selected'])
      })

      it('a handle reset whose handle is gone after the drag fails instead of skipping the double-click', async () => {
        const [a] = kindOf('note handle reset')
        const target = await fakeTargets().openTarget()
        let handles = 0
        target.env.noteHandle = async () => (++handles === 1 ? [300, 320] : null)
        await assert.rejects(a.run({ selected: true }, { env: target.env }), /handle is gone/)
      })

      it('a handle reset whose handle lies wholly outside the window after the drag double-clicks nothing, since no player can, and still finishes an open note', async () => {
        const seen = new Set()
        for (const a of kindOf('note handle reset')) {
          const target = await fakeTargets().openTarget()
          target.env.visibleHandlePoint = async () => null
          await a.run({ selected: true }, { env: target.env })
          const open = names(target.log).includes('finishNote')
          assert.equal(calls(target.log, 'mouse.dblclick').length, open ? 1 : 0, `${String(a)}: only the double-click that opens the note`)
          assert.equal(calls(target.log, 'mouse.up').length, 1, 'the drag still ran')
          seen.add(open ? 'open' : 'selected')
        }
        assert.deepEqual([...seen].sort(), ['open', 'selected'])
      })

      it('a handle reset double-clicks the part of a handle that is in the window, not its middle', async () => {
        const a = kindOf('note handle reset').find((x) => !/ open /.test(String(x)))
        const target = await fakeTargets().openTarget()
        target.env.noteHandle = async () => [126, 900.5]
        target.env.visibleHandlePoint = async () => [126, 897.5]
        await a.run({ selected: true }, { env: target.env })
        assert.deepEqual(calls(target.log, 'mouse.dblclick').map((c) => c.slice(1)), [[126, 897.5]])
      })

      it('the note edits run only when a note can be placed: with none it presses nothing', async () => {
        for (const kind of ['note erase', 'note restyle', 'note edit', 'note handle reset']) {
          const [a] = kindOf(kind)
          const target = await fakeTargets({ withNote: false }).openTarget()
          target.env.placeNote = async () => {}
          await a.run({ selected: true }, { env: target.env })
          assert.deepEqual(calls(target.log, 'mouse.click').concat(calls(target.log, 'mouse.down'), calls(target.log, 'mouse.dblclick'), calls(target.log, 'keyboard.press'), calls(target.log, 'pressNotePanel')), [], kind)
        }
      })

      it('a busy start can hold the restyles and the size keys, which set a look, and no erase, edit, hide or handle reset', () => {
        for (const kind of ['note restyle', 'size key']) assert.ok(START_KINDS.includes(kind), kind)
        for (const kind of ['note erase', 'note edit', 'hide all notes', 'note handle reset']) assert.ok(!START_KINDS.includes(kind), kind)
      })
    })
  })

  describe('the puzzle of a list (#679)', () => {
    it('every puzzle of the set is generated', () => {
      const names = new Set(sample(8, 200).map((l) => l.puzzle.name))
      assert.deepEqual(FUZZ_PUZZLES.map((p) => p.name).filter((n) => !names.has(n)), [])
    })

    it('a list over one puzzle holds only digit keys that puzzle takes: a 4x4 never types a 5, a 12x12 types the 0', () => {
      const typed = (name) => {
        const lists = sample(9, 80, [puzzleByName(name)])
        return new Set(actionsOf(lists).filter((a) => /^(?:type|enter) /.test(String(a))).map((a) => /^type (\w)$|^enter (\w) in /.exec(String(a)).slice(1).find(Boolean)))
      }
      assert.deepEqual([...typed('4x4')].sort(), ['1', '2', '3', '4'])
      assert.deepEqual([...typed('12x12')].sort(), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
      assert.deepEqual([...typed('6x8')].sort(), ['1', '2', '3', '4', '5', '6', '7', '8'])
    })

    it('a target is a cell of the puzzle, named by its row and column, and a puzzle with clues outside the grid has targets out there', () => {
      const outside = puzzleByName('outside clues 9x9')
      const steps = actionsOf(sample(10, 120, [outside])).map(String).join('\n')
      assert.match(steps, /\br0c\d\b|\br\d+c0\b|\br10c\d\b|\br\d+c10\b/, 'a step names a cell outside the grid')
      const plain = actionsOf(sample(10, 120, [puzzleByName('6x6')])).map(String).join('\n')
      assert.doesNotMatch(plain, /\br(?:0|7)c\d|\br\d+c(?:0|7)\b/, 'a 6x6 names no cell outside its 6 by 6')
      assert.match(plain, /\br6c\d|\br\d+c6\b/, 'and the regex reads the last row and column')
    })

    it('the actions of a list are drawn over its own puzzle: every cell and digit key a step names belongs to the puzzle the list names', () => {
      for (const { puzzle, commands } of sample(11, 120)) {
        for (const wrapped of commands) {
          const step = String(wrapped.cmd)
          for (const [, row, col] of step.matchAll(/\br(\d+)c(\d+)\b/g)) {
            assert.ok(puzzle.cells.some(([r, c]) => r === Number(row) - 1 && c === Number(col) - 1), `${puzzle.name}: "${step}" names r${row}c${col}`)
          }
          const typed = /^type (\w)$|^enter (\w) in /.exec(step)?.slice(1).find(Boolean)
          if (typed) assert.ok(puzzle.keys.includes(typed), `${puzzle.name}: "${step}" types a key the puzzle does not take`)
        }
      }
    })

    it('a scripted step that cannot run fails the run, not skipped: a digit before any cell is selected', async () => {
      const puzzle = puzzleByName('recorded 9x9')
      const [type] = scriptedList(puzzle, [['type digit', '5']])
      const target = await fakeTargets().openTarget(puzzle)
      await assert.rejects(type.run({ selected: false }, { env: target.env }), /cannot run here/)
      assert.deepEqual(target.log, [])
    })

    it('a scripted list runs the kinds it names with the numbers given, and refuses a kind that does not exist', async () => {
      const puzzle = puzzleByName('recorded 9x9')
      const list = scriptedList(puzzle, [['click cell', 0], ['type digit', '5']])
      assert.deepEqual(list.map(String), ['click r1c3', 'type 5'])
      assert.deepEqual(list.map((w) => w.cmd.kind), ['click cell', 'type digit'])
      const target = await fakeTargets().openTarget(puzzle)
      for (const w of list) await w.run({ selected: true }, { env: target.env })
      assert.deepEqual(target.log.filter(([n]) => n === 'keyboard.press'), [['keyboard.press', '5']])
      assert.throws(() => scriptedList(puzzle, [['no such kind', 0]]), /no action kind "no such kind"/)
    })
  })
})

describe('focusing the actions on a script (#724)', () => {
  const PEN = 'pen-tool-extras.user.js'
  const kindsOf = (file) => KIND_NAMES.filter((k) => KIND_SCRIPTS[k].includes(file))
  const counts = (focus) => {
    const seen = Object.fromEntries(KIND_NAMES.map((k) => [k, 0]))
    for (const a of actionsOf(fc.sample(actionList(FUZZ_PUZZLES, { kinds: KINDS, maxCommands: 20, focus }), { seed: 11, numRuns: 300 }))) seen[a.kind]++
    return seen
  }
  const share = (seen, kinds) => kinds.reduce((sum, k) => sum + seen[k], 0) / Object.values(seen).reduce((a, b) => a + b, 0)

  it('every real kind declares its facts: its scripts (real ones), whether it draws a stroke and whether a list may start with it', () => {
    const files = new Set(scriptFiles())
    for (const k of KINDS) {
      assert.ok(Array.isArray(k.scripts), `${k.kind}: scripts is no array`)
      for (const f of k.scripts) assert.ok(files.has(f), `${k.kind}: ${f} is no script`)
      assert.equal(typeof k.start, 'boolean', `${k.kind}: start`)
      assert.equal(typeof k.stroke, 'boolean', `${k.kind}: stroke`)
    }
  })

  it('a kind that draws a stroke is one of the pen\'s, and a command carries the fact the engine reads', () => {
    const strokes = KINDS.filter((k) => k.stroke).map((k) => k.kind)
    assert.deepEqual(strokes, ['pen line', 'pen erase', 'pen line mode', 'pen mark', 'arrow line', 'pen drag, Escape', 'pen drag, tool key', 'pen drag, undo', 'pen drag, resize', 'pen drag, second button', 'pen drag, blur', 'pen drag, leave window'])
    const commands = actionsOf(sample(5, 20))
    assert.ok(commands.length > 0)
    for (const c of commands) assert.equal(c.stroke, strokes.includes(c.kind), c.kind)
  })

  it('names every script a kind exercises, and every script has a kind', () => {
    const files = new Set(scriptFiles())
    for (const f of files) assert.ok(kindsOf(f).length > 0, `${f} has no action that exercises it`)
  })

  it('a focused script\'s kinds weigh FOCUS_FACTOR times their own weight and every other kind keeps it', () => {
    const plain = kindWeights(KINDS, [])
    const focused = kindWeights(KINDS, [PEN])
    for (const k of KIND_NAMES) assert.equal(focused[k], kindsOf(PEN).includes(k) ? plain[k] * FOCUS_FACTOR : plain[k], k)
    assert.ok(FOCUS_FACTOR > 1)
  })

  it('a kind of two focused scripts is raised once, not twice', () => {
    const both = KIND_NAMES.find((k) => KIND_SCRIPTS[k].length > 1)
    assert.ok(both, 'some kind exercises two scripts')
    const weights = kindWeights(KINDS, KIND_SCRIPTS[both])
    assert.equal(weights[both], kindWeights(KINDS, [])[both] * FOCUS_FACTOR)
  })

  it('a focused run draws the focused script\'s actions more often, and still draws every kind', () => {
    const [plain, focused] = [counts([]), counts([PEN])]
    assert.ok(share(focused, kindsOf(PEN)) > share(plain, kindsOf(PEN)) * 1.5, `${share(plain, kindsOf(PEN))} -> ${share(focused, kindsOf(PEN))}`)
    assert.deepEqual(KIND_NAMES.filter((k) => !focused[k]), [], 'every kind appears')
  })

  it('a script is named by its short name, and any other name is refused', () => {
    assert.deepEqual(focusFiles(['pen-tool-extras', 'text-anywhere']), [PEN, 'text-anywhere.user.js'])
    assert.deepEqual(focusFiles(undefined), [])
    assert.throws(() => focusFiles(['pen-tool']), /pen-tool.*pen-tool-extras/)
    assert.throws(() => focusFiles(['nonesuch']), /nonesuch/)
    assert.throws(() => focusFiles(['pen-tool-extras.user.js']), /is no script/)
  })
  describe("Pen Tool Extras' line modes, marks, color editing and presets (#816)", () => {
    const calls = (log, name) => log.filter(([n]) => n === name)
    const names = (log) => log.map(([n]) => n)
    const kindOf = (kind) => actionsOf(sample(41, 800)).filter((x) => x.kind === kind)
    const NEW_KINDS = ['pen line mode', 'pen mark', 'pen color edit', 'pen colors dialog']

    it('all four kinds exercise Pen Tool Extras, are generated, and are ordinary use', () => {
      for (const kind of NEW_KINDS) {
        assert.deepEqual(KIND_SCRIPTS[kind], ['pen-tool-extras.user.js'], kind)
        assert.equal(KIND_GROUPS[kind], 'ordinary', kind)
        assert.ok(kindOf(kind).length > 3, `${kind} is drawn`)
      }
    })

    it('a line mode action presses the line mode button one to three times, then draws a line with the pen', async () => {
      const presses = new Set()
      for (const a of kindOf('pen line mode')) {
        const { log } = await runOn(a)
        const n = calls(log, 'stepLineMode').length
        presses.add(n)
        assert.match(String(a), new RegExp(`^press the pen line mode button ${n} times? then pen line r\\d+c\\d+ -> r\\d+c\\d+ color \\d$`))
        assert.ok(names(log).lastIndexOf('stepLineMode') < names(log).indexOf('usePen'), 'the presses come before the line')
        assert.equal(calls(log, 'mouse.down').length, 1)
        assert.equal(calls(log, 'mouse.up').length, 1)
      }
      assert.deepEqual([...presses].sort(), [1, 2, 3])
    })

    it('a mark action ticks a set of the eight mark boxes in the dialog, then clicks a cell edge or corner with the pen', async () => {
      const seen = { boxes: new Set(), where: new Set() }
      for (const a of kindOf('pen mark')) {
        const { log } = await runOn(a)
        const [, boxes] = calls(log, 'tickMarks')[0]
        const [, , where] = calls(log, 'markPoint')[0]
        for (const b of boxes) seen.boxes.add(b)
        seen.where.add(where)
        assert.ok(boxes.every((b) => MARK_BOXES.includes(b)), String(a))
        assert.ok(names(log).indexOf('tickMarks') < names(log).indexOf('usePen') && names(log).indexOf('usePen') < names(log).indexOf('mouse.click'), 'ticked, then the pen, then the click')
        assert.equal(calls(log, 'mouse.click').length, 1)
      }
      assert.deepEqual([...seen.boxes].sort(), [...MARK_BOXES].sort())
      assert.deepEqual([...seen.where].sort(), [0, 1, 2, 3, 4, 5, 6, 7], 'four edges and four corners')
    })

    it('a color edit holds a pen color to open the pickers, then recolors one, presses Escape, clicks a cell, presses a tool key or turns the pen page', async () => {
      const ends = new Set()
      for (const a of kindOf('pen color edit')) {
        const { log } = await runOn(a)
        assert.equal(calls(log, 'holdPenColor').length, 1)
        const picked = calls(log, 'setPenPicker')
        const step = String(a)
        assert.match(step, /^hold pen color \d to edit its color then /)
        ends.add(step.replace(/^.* then /, '').replace(/ to #[0-9a-f]{6}/, '').replace(/^click r\d+c\d+$/, 'click a cell').replace(/^press [cvxz]$/, 'press a tool key'))
        if (/recolor/.test(step)) {
          assert.equal(picked.length, 1)
          assert.match(picked[0][2], /^#[0-9a-f]{6}$/)
          assert.equal(picked[0][1], calls(log, 'holdPenColor')[0][1], 'the held color is the one recolored')
          assert.ok(step.includes(picked[0][2]))
        } else {
          assert.equal(picked.length, 0)
        }
        const [, key] = calls(log, 'keyboard.press').at(-1) ?? []
        if (/ press Escape$/.test(step)) assert.deepEqual([key, calls(log, 'mouse.click').length, calls(log, 'turnPenPage').length], ['Escape', 0, 0], step)
        if (/ click r\d+c\d+$/.test(step)) assert.deepEqual([calls(log, 'keyboard.press').length, calls(log, 'mouse.click').length, calls(log, 'turnPenPage').length], [0, 1, 0], step)
        if (/ press [cvxz]$/.test(step)) assert.deepEqual([key, calls(log, 'mouse.click').length], [step.slice(-1), 0], step)
        if (/ turn the pen page$/.test(step)) assert.deepEqual([calls(log, 'keyboard.press').length, calls(log, 'mouse.click').length, calls(log, 'turnPenPage').length], [0, 0, 1], step)
        assert.ok(names(log).indexOf('holdPenColor') < Math.max(names(log).indexOf('setPenPicker'), names(log).indexOf('keyboard.press'), names(log).indexOf('mouse.click'), names(log).indexOf('turnPenPage')), 'the hold comes first')
      }
      assert.deepEqual([...ends].sort(), ['click a cell', 'press a tool key', 'press Escape', 'recolor it and press Escape', 'turn the pen page'].sort())
    })

    it('the colors dialog action picks a preset or presses Restore defaults, then Save or Cancel', async () => {
      const seen = { restore: new Set(), save: new Set(), picks: new Set() }
      for (const a of kindOf('pen colors dialog')) {
        const [, pick, restore, save] = calls((await runOn(a)).log, 'penPresets')[0]
        seen.restore.add(restore)
        seen.save.add(save)
        seen.picks.add(pick)
        assert.match(String(a), new RegExp(`^Pen Tool Extras colors: ${restore ? 'Restore defaults' : `preset ${pick}`} ${save ? 'Save' : 'Cancel'}$`))
      }
      assert.deepEqual([...seen.restore].sort(), [false, true])
      assert.deepEqual([...seen.save].sort(), [false, true])
      assert.ok(seen.picks.size >= 3, 'several presets are picked')
    })

    it('busy starts can hold a line mode, a mark and a colors dialog, so a saved line mode or palette is there to restore', () => {
      for (const kind of ['pen line mode', 'pen mark', 'pen colors dialog']) assert.ok(START_KINDS.includes(kind), kind)
      assert.ok(!START_KINDS.includes('pen color edit'), 'a hold is a gesture a busy start leaves out')
    })
  })

  describe('the settings dialogs of UI Tweaks and Dark Page (#817)', () => {
    const calls = (log, name) => log.filter(([n]) => n === name)
    const kindOf = (kind) => actionsOf(sample(41, 800)).filter((x) => x.kind === kind)
    const NEW_KINDS = { 'ui tweaks dialog': 'ui-tweaks.user.js', 'ui tweaks settings text': 'ui-tweaks.user.js', 'dark page settings text': 'dark-page.user.js', 'dark page defaults': 'dark-page.user.js' }

    it('each kind exercises its script, is generated, and is page use', () => {
      for (const [kind, file] of Object.entries(NEW_KINDS)) {
        assert.deepEqual(KIND_SCRIPTS[kind], [file], kind)
        assert.equal(KIND_GROUPS[kind], 'page', kind)
        assert.ok(kindOf(kind).length > 3, `${kind} is drawn`)
      }
    })

    it('a UI Tweaks dialog action sets the two options, clicks the Tab option off and on, may press Restore defaults, and presses Save or Cancel', async () => {
      const seen = { hide: new Set(), wrap: new Set(), tab: new Set(), restore: new Set(), save: new Set() }
      for (const a of kindOf('ui tweaks dialog')) {
        const [, options, save] = calls((await runOn(a)).log, 'uiTweaks')[0]
        assert.deepEqual(Object.keys(options).sort(), ['hideSelect', 'restore', 'toggleTab', 'wrapButtons'])
        seen.hide.add(options.hideSelect); seen.wrap.add(options.wrapButtons); seen.tab.add(options.toggleTab); seen.restore.add(options.restore); seen.save.add(save)
      }
      for (const [name, set] of Object.entries(seen)) assert.deepEqual([...set].sort(), [false, true], name)
      const step = (arg) => String(scriptedList(puzzleByName('4x4'), [['ui tweaks dialog', arg]])[0])
      assert.equal(step([true, false, true, true, false]), 'UI Tweaks dialog: select hidden buttons in one row Tab option off and on Restore defaults Cancel')
      assert.equal(step([false, true, false, false, true]), 'UI Tweaks dialog: select shown buttons wrapped Save')
    })

    // The dialog action clicks the Tab box back (`fuzz.smoke.mjs` checks it saves on); the texts are the other way the option could be turned off.
    it('no pasted text turns the Tab option off, since a rule says Tab never switches to letters', () => {
      for (const text of UI_TWEAKS_TEXTS.filter((t) => t !== null)) {
        try {
          assert.notEqual(UI_TWEAKS.pastedSettings(text, UI_TWEAKS.READERS).values.UiTweaks_tab, false, text)
        } catch (error) {
          if (!/^the clipboard text is not/.test(error.message)) throw error
        }
      }
    })

    // What each script takes is its own reader's say, so a "valid" text is one its `pastedSettings` takes a setting from, and a refused one is no text it takes any from.
    const taken = (script, text) => {
      try { return Object.keys(script.pastedSettings(text, script.READERS, script.withModeFromAuto ?? script.withNewKeys).values).length } catch (error) {
        if (!/^the clipboard text is not/.test(error.message)) throw error
        return 0
      }
    }
    const SCRIPTS = [['UI Tweaks', UI_TWEAKS, UI_TWEAKS_TEXTS], ['Dark Page', DARK_PAGE, DARK_PAGE_TEXTS]]

    it('the texts hold Copy, texts each script takes a setting from, and texts it takes none from', () => {
      for (const [name, script, texts] of SCRIPTS) {
        const pastes = texts.filter((t) => t !== null)
        assert.ok(texts.includes(null), `${name}: Copy`)
        assert.ok(pastes.filter((t) => taken(script, t) > 0).length >= 2, `${name}: texts it takes`)
        for (const refused of ['', 'not json', '[]']) assert.ok(pastes.includes(refused), `${name}: ${JSON.stringify(refused)}`)
        assert.ok(pastes.filter((t) => taken(script, t) === 0).length >= 5, `${name}: texts it refuses`)
      }
      assert.equal(taken(UI_TWEAKS, '{"UiTweaks_hideSelect":"yes"}'), 0)
      assert.equal(taken(DARK_PAGE, '{"DarkPage_color":"blue"}'), 0)
      assert.ok(DARK_PAGE_TEXTS.includes('{"DarkPage_color":"blue"}'), 'a color the reader refuses')
    })

    it('a reader that throws anything but the clipboard refusal fails the check with that error', () => {
      const broken = { READERS: {}, pastedSettings: () => { throw new TypeError('reader crashed') } }
      assert.throws(() => taken(broken, '{}'), TypeError)
      const refusing = { READERS: {}, pastedSettings: () => { throw new Error('the clipboard text is not a settings object') } }
      assert.equal(taken(refusing, '[]'), 0)
    })

    it('every color Dark Page can be pasted is one of the dark colors', () => {
      for (const t of DARK_PAGE_TEXTS.filter((x) => taken(DARK_PAGE, x ?? '') > 0)) assert.ok(DARK_COLORS.includes(DARK_PAGE.READERS.DarkPage_color(JSON.parse(t).DarkPage_color)), t)
    })

    it('a settings text action opens the script\'s dialog and copies or pastes one text, then Save or Cancel', async () => {
      const pasted = { 'ui tweaks settings text': new Set(), 'dark page settings text': new Set() }
      const saves = new Set()
      for (const kind of Object.keys(pasted)) {
        for (const a of kindOf(kind)) {
          const [, script, text, save] = calls((await runOn(a)).log, 'settingsText')[0]
          assert.equal(script, kind === 'ui tweaks settings text' ? 'ui tweaks' : 'dark page')
          pasted[kind].add(text)
          saves.add(save)
        }
      }
      assert.deepEqual([...pasted['ui tweaks settings text']].sort(), [...UI_TWEAKS_TEXTS].sort())
      assert.deepEqual([...pasted['dark page settings text']].sort(), [...DARK_PAGE_TEXTS].sort())
      assert.deepEqual([...saves].sort(), [false, true])
      const step = (kind, arg) => String(scriptedList(puzzleByName('4x4'), [[kind, arg]])[0])
      assert.equal(step('ui tweaks settings text', [null, true]), 'UI Tweaks dialog: Copy settings Save')
      assert.equal(step('dark page settings text', ['{"DarkPage_color":"#101030"}', false]), 'Dark Page dialog: Paste settings "{\\"DarkPage_color\\":\\"#101030\\"}" Cancel')
    })

    it('Copy settings is drawn about as often as three other texts together', () => {
      const texts = actionsOf(sample(41, 800)).filter((x) => x.kind === 'ui tweaks settings text').map((x) => /Copy/.test(String(x)))
      const share = texts.filter(Boolean).length / texts.length
      assert.ok(share > 0.15 && share < 0.45, `Copy settings share ${share}`)
    })

    it('a Dark Page defaults action picks a dark color, presses Restore defaults, and presses Save or Cancel', async () => {
      const saves = new Set()
      for (const a of kindOf('dark page defaults')) {
        const [, color, save, restore] = calls((await runOn(a)).log, 'darkPage')[0]
        saves.add(save)
        assert.ok(DARK_COLORS.includes(color), color)
        assert.equal(restore, true)
        assert.equal(String(a), `Dark Page dialog: ${color} then Restore defaults ${save ? 'Save' : 'Cancel'}`)
      }
      assert.deepEqual([...saves].sort(), [false, true])
    })

    it('busy starts can hold the saved settings of both scripts, so a saved option or color is there to restore', () => {
      for (const kind of Object.keys(NEW_KINDS)) assert.ok(START_KINDS.includes(kind), kind)
    })
  })

  describe('the rules box of Auto Rules Resizer (#818)', () => {
    const calls = (log, name) => log.filter(([n]) => n === name)
    const kindOf = (kind) => actionsOf(sample(41, 800)).filter((x) => x.kind === kind)
    const NEW_KINDS = ['rules drag', 'rules font', 'rules dialog', 'rules wheel']
    const AUTO = 'auto-rules-resizer.user.js'

    it('each kind exercises Auto Rules Resizer, is generated, is page use and can sit in a busy start', () => {
      for (const kind of NEW_KINDS) {
        assert.deepEqual(KIND_SCRIPTS[kind], [AUTO], kind)
        assert.equal(KIND_GROUPS[kind], 'page', kind)
        assert.ok(kindOf(kind).length > 3, `${kind} is drawn`)
        assert.ok(START_KINDS.includes(kind), kind)
      }
    })

    it('a drag action presses either corner and moves it up to the reach in every direction', async () => {
      const corners = new Set()
      const moves = []
      for (const a of kindOf('rules drag')) {
        const [, corner, dx, dy] = calls((await runOn(a)).log, 'dragRules')[0]
        corners.add(corner)
        moves.push(dx, dy)
        assert.ok(Math.abs(dx) <= RULES_DRAG_REACH_PX && Math.abs(dy) <= RULES_DRAG_REACH_PX, `${dx} x ${dy}`)
      }
      assert.deepEqual([...corners].sort(), [...RULES_CORNERS].sort())
      assert.ok(moves.some((n) => n < 0) && moves.some((n) => n > 0), 'both directions')
      const step = (arg) => String(scriptedList(puzzleByName('4x4'), [['rules drag', arg]])[0])
      assert.equal(step(['ur', 120, -40]), 'drag the top-right corner of the rules box by 120 x -40')
      assert.equal(step(['dl', -200, 80]), 'drag the bottom-left corner of the rules box by -200 x 80')
    })

    it('the corners are the script\'s own: it takes each and refuses any other', () => {
      const drag = (corner) => AUTO_RULES_RESIZER.dragRulesBox({ w: 0, h: 0, x: 0, y: 0 }, corner, 10, 10, { width: 400, height: 300 }, { width: 240, height: 112 })
      for (const corner of RULES_CORNERS) assert.doesNotThrow(() => drag(corner), corner)
      assert.throws(() => drag('ul'), /no corner/)
    })

    it('a font action presses f+ or f- one to three times', async () => {
      const seen = new Set()
      for (const a of kindOf('rules font')) {
        const [, step, times] = calls((await runOn(a)).log, 'rulesFont')[0]
        assert.equal(Math.abs(step), 1)
        assert.ok(times >= 1 && times <= 3, `${times} presses`)
        seen.add(`${step} x ${times}`)
      }
      assert.equal(seen.size, 6)
      const step = (arg) => String(scriptedList(puzzleByName('4x4'), [['rules font', arg]])[0])
      assert.equal(step([1, 2]), 'press f+ on the rules box 2 times')
      assert.equal(step([-1, 1]), 'press f- on the rules box 1 time')
    })

    it('a wheel action turns the rules box by a signed number of pixels, up and down, and says so (#932)', async () => {
      const signs = new Set()
      for (const a of kindOf('rules wheel')) {
        const [, dy] = calls((await runOn(a)).log, 'scrollRules')[0]
        assert.notEqual(dy, 0)
        signs.add(Math.sign(dy))
      }
      assert.deepEqual([...signs].sort(), [-1, 1])
      const step = (arg) => String(scriptedList(puzzleByName('4x4'), [['rules wheel', arg]])[0])
      assert.equal(step(400), 'wheel 400 over the rules box')
      assert.equal(step(-120), 'wheel -120 over the rules box')
    })

    // What the script makes of a typed limit is its own `limitFromBox`: the texts hold a blank, numbers, and text it refuses.
    it('the limit texts hold a blank, plain sizes and numbers that are no size', () => {
      const parsed = RULES_LIMIT_TEXTS.map((t) => {
        try {
          return AUTO_RULES_RESIZER.limitFromBox(t, 'maxHeight')
        } catch (error) {
          return error.message // the refusal is what the test counts
        }
      })
      assert.ok(parsed.includes(null), 'a blank clears the limit')
      assert.ok(parsed.filter((n) => Number.isInteger(n)).length >= 3, 'sizes')
      assert.ok(parsed.some((n) => typeof n === 'string'), 'a text that is no size is refused')
    })

    it('a dialog action types both limits, may press Restore defaults, and presses Save or Cancel', async () => {
      const seen = { width: new Set(), height: new Set(), restore: new Set(), save: new Set() }
      for (const a of kindOf('rules dialog')) {
        const [, limits, save] = calls((await runOn(a)).log, 'rulesDialog')[0]
        assert.deepEqual(Object.keys(limits).sort(), ['maxHeight', 'maxWidth', 'restore'])
        seen.width.add(limits.maxWidth); seen.height.add(limits.maxHeight); seen.restore.add(limits.restore); seen.save.add(save)
      }
      assert.deepEqual([...seen.width].sort(), [...RULES_LIMIT_TEXTS].sort())
      assert.deepEqual([...seen.height].sort(), [...RULES_LIMIT_TEXTS].sort())
      assert.deepEqual([...seen.restore].sort(), [false, true])
      assert.deepEqual([...seen.save].sort(), [false, true])
      const step = (arg) => String(scriptedList(puzzleByName('4x4'), [['rules dialog', arg]])[0])
      assert.equal(step(['400', '', true, false]), 'Auto Rules Resizer dialog: max width 400 max height none Restore defaults Cancel')
      assert.equal(step(['', '0', false, true]), 'Auto Rules Resizer dialog: max width none max height 0 Save')
    })
  })
})

describe('the settings dialogs\' Copy, Paste, Restore defaults and error log (#928)', () => {
  const calls = (log, name) => log.filter(([n]) => n === name)
  const kindOf = (kind) => actionsOf(sample(43, 1500)).filter((x) => x.kind === kind)
  const stepOf = (kind, arg) => String(scriptedList(puzzleByName('4x4'), [[kind, arg]])[0])
  const requireScript = (file) => createRequire(import.meta.url)(`../../${file}`)
  // The kinds that only open a dialog and close it, as 'pen settings' does, so a busy start leaves them out.
  const OPEN_ONLY = ['note dialog from menu', 'pen dialog from settings button']
  const NEW_KINDS = {
    'color by digit settings text': 'color-by-digit.user.js',
    'text anywhere settings text': 'text-anywhere.user.js',
    'pen tool extras settings text': 'pen-tool-extras.user.js',
    'auto rules resizer settings text': 'auto-rules-resizer.user.js',
    'color by digit defaults': 'color-by-digit.user.js',
    'text anywhere defaults': 'text-anywhere.user.js',
    'note color preset': 'text-anywhere.user.js',
    'note dialog from menu': 'text-anywhere.user.js',
    'pen dialog from settings button': 'pen-tool-extras.user.js',
    'pen show boxes': 'pen-tool-extras.user.js',
    'pen swatch edit': 'pen-tool-extras.user.js'
  }

  it('each new kind exercises its script, is generated, is ordinary use and can sit in a busy start', () => {
    for (const [kind, file] of Object.entries(NEW_KINDS)) {
      assert.deepEqual(KIND_SCRIPTS[kind], [file], kind)
      assert.equal(KIND_GROUPS[kind], 'ordinary', kind)
      assert.equal(START_KINDS.includes(kind), !OPEN_ONLY.includes(kind), `${kind} in a busy start`)
      assert.ok(kindOf(kind).length > 3, `${kind} is drawn`)
    }
  })

  // A "valid" text is one the script's own `pastedSettings` takes a setting from, through the `upgrade` its Paste passes; a refused one is a text it takes none from.
  const taken = (script, text) => {
    try { return Object.keys(script.pastedSettings(text, script.READERS).values).length } catch (error) {
      if (!/^the clipboard text is not/.test(error.message)) throw error
      return 0
    }
  }
  const TEXT_SCRIPTS = [
    ['Color by Digit', 'color-by-digit.user.js', COLOR_BY_DIGIT_TEXTS, 'color by digit'],
    ['Text Anywhere', 'text-anywhere.user.js', TEXT_ANYWHERE_TEXTS, 'text anywhere'],
    ['Pen Tool Extras', 'pen-tool-extras.user.js', PEN_TOOL_EXTRAS_TEXTS, 'pen tool extras'],
    ['Auto Rules Resizer', 'auto-rules-resizer.user.js', AUTO_RULES_RESIZER_TEXTS, 'auto rules resizer']
  ]

  it('each script\'s texts hold Copy, texts it takes a setting from, and texts it takes none from', () => {
    for (const [name, file, texts] of TEXT_SCRIPTS) {
      const script = requireScript(file)
      const pastes = texts.filter((t) => t !== null)
      assert.ok(texts.includes(null), `${name}: Copy`)
      assert.ok(pastes.filter((t) => taken(script, t) > 0).length >= 3, `${name}: texts it takes`)
      for (const refused of ['', 'not json', '[]']) assert.ok(pastes.includes(refused), `${name}: ${JSON.stringify(refused)}`)
      assert.ok(pastes.filter((t) => taken(script, t) === 0).length >= 4, `${name}: texts it refuses`)
    }
  })

  it('the texts reach what the ticket names: a legacy auto mode, a pasted limit of none, a pasted palette and a foreign key', () => {
    assert.ok(COLOR_BY_DIGIT_TEXTS.some((t) => t && /ColorByDigit_auto/.test(t)), 'withModeFromAuto')
    assert.ok(COLOR_BY_DIGIT_TEXTS.some((t) => t && /addedPreloads":false/.test(t)), 'a preload mark at its default')
    assert.ok(AUTO_RULES_RESIZER_TEXTS.some((t) => t && /maxWidth":null/.test(t)), 'readLimit on none')
    assert.ok(TEXT_ANYWHERE_TEXTS.some((t) => t && /TextAnywhere_colors/.test(t)), 'readPastedColors')
    assert.ok(PEN_TOOL_EXTRAS_TEXTS.some((t) => t && /PenColor_colors/.test(t)), 'the pen palette')
    for (const [name, , texts] of TEXT_SCRIPTS) assert.ok(texts.some((t) => t && /Other_key/.test(t)), `${name}: a foreign key`)
  })

  it('a settings text action copies or pastes one text of its own script, then Save or Cancel', async () => {
    const saves = new Set()
    for (const [name, , texts, script] of TEXT_SCRIPTS) {
      const pasted = new Set()
      for (const a of kindOf(`${script} settings text`)) {
        const [, who, text, save] = calls((await runOn(a)).log, 'settingsText')[0]
        assert.equal(who, script)
        pasted.add(text)
        saves.add(save)
      }
      assert.deepEqual([...pasted].sort(), [...texts].sort(), name)
    }
    assert.deepEqual([...saves].sort(), [false, true])
    assert.equal(stepOf('color by digit settings text', [null, true]), 'Color by Digit dialog: Copy settings Save')
    assert.equal(stepOf('auto rules resizer settings text', ['{"AutoRulesResizer_maxWidth":null}', false]), 'Auto Rules Resizer dialog: Paste settings "{\\"AutoRulesResizer_maxWidth\\":null}" Cancel')
  })

  it('a defaults action presses Restore defaults in Color by Digit\'s or Text Anywhere\'s dialog, then Save or Cancel', async () => {
    for (const [kind, script] of [['color by digit defaults', 'color by digit'], ['text anywhere defaults', 'text anywhere']]) {
      const saves = new Set()
      for (const a of kindOf(kind)) {
        const [, who, save] = calls((await runOn(a)).log, 'restoreDefaults')[0]
        assert.equal(who, script)
        saves.add(save)
      }
      assert.deepEqual([...saves].sort(), [false, true], kind)
    }
    assert.equal(stepOf('color by digit defaults', true), 'Color by Digit dialog: Restore defaults Save')
    assert.equal(stepOf('text anywhere defaults', false), 'Text Anywhere dialog: Restore defaults Cancel')
  })

  it('an error log action presses Copy error log or Clear in the dialog of each of the six scripts', async () => {
    const seen = new Set()
    for (const a of kindOf('error log')) {
      const [, script, clear] = calls((await runOn(a)).log, 'errorLogButton')[0]
      seen.add(`${script}/${clear}`)
    }
    assert.deepEqual([...seen].sort(), ERROR_LOG_SCRIPTS.flatMap((s) => [`${s}/false`, `${s}/true`]).sort())
    assert.equal(stepOf('error log', [1, false]), 'Dark Page dialog: Copy error log')
    assert.equal(stepOf('error log', [0, true]), 'Color by Digit dialog: Clear error log')
  })

  it('every script word an action hands the env names a settings dialog of live/scripts.mjs, and the six dialogs are the six scripts', async () => {
    const words = new Set()
    for (const kind of ['error log', 'color by digit defaults', 'text anywhere defaults', ...TEXT_SCRIPTS.map(([, , , script]) => `${script} settings text`)]) {
      for (const a of kindOf(kind)) {
        const { log } = await runOn(a)
        for (const [name, word] of log) if (['settingsText', 'restoreDefaults', 'errorLogButton'].includes(name)) words.add(word)
      }
    }
    const dialogs = SETTINGS_SCRIPTS.map(({ entry }) => entry.toLowerCase())
    assert.deepEqual([...words].filter((w) => !dialogs.includes(w)), [], 'a word that is no dialog\'s entry')
    assert.deepEqual([...words].sort(), [...dialogs].sort(), 'every dialog is named by some action')
    assert.deepEqual(SETTINGS_SCRIPTS.map(({ file }) => file).sort(), scriptFiles().sort())
  })

  it('a note color preset action picks a preset of the Text color pulldown, then Save or Cancel', async () => {
    const picks = new Set()
    const saves = new Set()
    for (const a of kindOf('note color preset')) {
      const [, pick, save] = calls((await runOn(a)).log, 'noteColorPreset')[0]
      picks.add(pick); saves.add(save)
    }
    assert.ok(picks.size >= 4, `${picks.size} presets`)
    assert.deepEqual([...saves].sort(), [false, true])
    assert.equal(stepOf('note color preset', [2, true]), 'Text Anywhere text color preset 2 Save')
  })

  it('the other ways in: Text Anywhere\'s dialog from the settings menu, Pen Tool Extras\' from the pen panel settings button', async () => {
    for (const [kind, call, words] of [['note dialog from menu', 'noteDialogFromMenu', 'Text Anywhere dialog from the settings menu'], ['pen dialog from settings button', 'penDialogFromSettingsButton', 'Pen Tool Extras dialog from the pen panel settings button']]) {
      const saves = new Set()
      for (const a of kindOf(kind)) saves.add(calls((await runOn(a)).log, call)[0][1])
      assert.deepEqual([...saves].sort(), [false, true], kind)
      assert.equal(stepOf(kind, true), `${words} Save`)
      assert.equal(stepOf(kind, false), `${words} Cancel`)
    }
  })

  it('a Show boxes action sets the Thickness and Opacity boxes, then Save or Cancel', async () => {
    const seen = { thickness: new Set(), opacity: new Set(), save: new Set() }
    for (const a of kindOf('pen show boxes')) {
      const [, boxes, save] = calls((await runOn(a)).log, 'penShowBoxes')[0]
      assert.deepEqual(Object.keys(boxes).sort(), ['opacity', 'thickness'])
      seen.thickness.add(boxes.thickness); seen.opacity.add(boxes.opacity); seen.save.add(save)
    }
    for (const [name, set] of Object.entries(seen)) assert.deepEqual([...set].sort(), [false, true], name)
    assert.equal(stepOf('pen show boxes', [true, false, true]), 'Pen Tool Extras dialog: Thickness slider shown Opacity slider hidden Save')
  })

  it('a slider drag or key press on a pen slider the player hid does nothing, instead of failing for a lost control', async () => {
    for (const kind of ['slider drag', 'slider keys']) {
      const a = kindOf(kind)[0]
      const target = await fakeTargets().openTarget()
      const env = { ...target.env, sliderPoint: async () => null, focusSlider: async () => false }
      await a.run({ selected: true }, { env })
      assert.deepEqual(target.log.filter(([n]) => /^mouse\.|^keyboard\./.test(n)), [], kind)
    }
  })

  it('a swatch edit action picks a color preset, recolors one pen swatch, then Save or Cancel', async () => {
    const pens = new Set()
    for (const a of kindOf('pen swatch edit')) {
      const [, pick, pen, hex, save] = calls((await runOn(a)).log, 'penSwatchEdit')[0]
      assert.match(hex, /^#[0-9a-f]{6}$/)
      assert.ok(pen >= 1 && pen <= 9, `pen ${pen}`)
      assert.equal(typeof save, 'boolean')
      assert.equal(typeof pick, 'number')
      pens.add(pen)
    }
    assert.equal(pens.size, 9)
    assert.equal(stepOf('pen swatch edit', [3, 4, 0x123456, true]), 'Pen Tool Extras colors: preset 3 then pen 4 swatch #123456 Save')
  })
})

describe('longer lists and no empty list (#730)', () => {
  const lengths = (options, count = 300) => fc.sample(actionList(FUZZ_PUZZLES, { kinds: KINDS, ...options }), { seed: 31, numRuns: count }).map((l) => [...l.commands].length)

  it('with no nonEmpty, some lists are empty, as fast-check draws the length from 0', () => {
    assert.ok(lengths({ maxCommands: 20 }).includes(0))
  })

  it('with nonEmpty, no generated list is empty', () => {
    assert.equal(Math.min(...lengths({ maxCommands: 20, nonEmpty: true })), 1)
    assert.equal(Math.min(...lengths({ maxCommands: 50, nonEmpty: true })), 1)
  })

  it('maxCommands sets the longest list, and the default is the old 20', () => {
    assert.equal(DEFAULT_MAX_COMMANDS, 20)
    assert.equal(Math.max(...lengths({})), 20)
    const long = lengths({ maxCommands: 50, nonEmpty: true })
    assert.equal(Math.max(...long), 50)
    assert.ok(long.filter((n) => n > 20).length > 100, 'most lists are past the old limit')
  })
})

describe("Text Anywhere's color hold and note gestures (#930)", () => {
  const calls = (log, name) => log.filter(([n]) => n === name)
  const names = (log) => log.map(([n]) => n)
  const kindOf = (kind) => actionsOf(sample(41, 800)).filter((x) => x.kind === kind)
  const NEW_KINDS = ['note color edit', 'note shift drag', 'note drag held still', 'note press lost', 'note resize escape']

  it('each kind exercises Text Anywhere, is generated, is ordinary use, and is left out of a busy start', () => {
    for (const kind of NEW_KINDS) {
      assert.deepEqual(KIND_SCRIPTS[kind], ['text-anywhere.user.js'], kind)
      assert.equal(KIND_GROUPS[kind], 'ordinary', kind)
      assert.ok(kindOf(kind).length > 3, `${kind} is drawn`)
      assert.ok(!START_KINDS.includes(kind), `${kind} is a gesture a busy start leaves out`)
    }
  })

  it('a color edit holds a text color to open the pickers, then recolors one, presses Escape, clicks a cell or presses a tool key', async () => {
    const ends = new Set()
    for (const a of kindOf('note color edit')) {
      const { log } = await runOn(a)
      assert.equal(calls(log, 'holdNoteColor').length, 1)
      const picked = calls(log, 'setNotePicker')
      const step = String(a)
      assert.match(step, /^hold text color \d to edit its color then /)
      ends.add(step.replace(/^.* then /, '').replace(/ to #[0-9a-f]{6}/, '').replace(/^click r\d+c\d+$/, 'click a cell').replace(/^press [cvxz]$/, 'press a tool key'))
      if (/recolor/.test(step)) {
        assert.equal(picked.length, 1)
        assert.match(picked[0][2], /^#[0-9a-f]{6}$/)
        assert.equal(picked[0][1], calls(log, 'holdNoteColor')[0][1], 'the held color is the one recolored')
      } else {
        assert.equal(picked.length, 0)
      }
      const [, key] = calls(log, 'keyboard.press').at(-1) ?? []
      if (/ press Escape$/.test(step)) assert.deepEqual([key, calls(log, 'mouse.click').length], ['Escape', 0], step)
      if (/ click r\d+c\d+$/.test(step)) assert.deepEqual([calls(log, 'keyboard.press').length, calls(log, 'mouse.click').length], [0, 1], step)
      if (/ press [cvxz]$/.test(step)) assert.deepEqual([key, calls(log, 'mouse.click').length], [step.slice(-1), 0], step)
      assert.ok(names(log).indexOf('holdNoteColor') < Math.max(names(log).indexOf('setNotePicker'), names(log).indexOf('keyboard.press'), names(log).indexOf('mouse.click')), 'the hold comes first')
    }
    assert.deepEqual([...ends].sort(), ['click a cell', 'press a tool key', 'press Escape', 'recolor it and press Escape'].sort())
  })

  it('a shift drag presses the note, then holds Shift while it moves, and lets go of both', async () => {
    for (const a of kindOf('note shift drag')) {
      const { log } = await runOn(a)
      const ns = names(log)
      assert.equal(calls(log, 'mouse.down').length, 1)
      assert.deepEqual([calls(log, 'keyboard.down')[0]?.slice(1), calls(log, 'keyboard.up')[0]?.slice(1)], [['Shift'], ['Shift']])
      assert.ok(ns.indexOf('mouse.down') < ns.indexOf('keyboard.down'), 'Shift goes down after the press: with it at the press a note is only selected')
      assert.ok(ns.indexOf('keyboard.down') < ns.indexOf('mouse.move', ns.indexOf('keyboard.down')), 'the move comes with Shift held')
      assert.ok(ns.indexOf('mouse.up') < ns.indexOf('keyboard.up'), 'Shift is let go after the button')
    }
  })

  it('a drag held still waits past the settle time with the button down, then releases', async () => {
    for (const a of kindOf('note drag held still')) {
      const { log } = await runOn(a)
      const ns = names(log)
      const [, ms] = calls(log, 'holdFor')[0]
      assert.equal(ms, NOTE_SETTLE_MS)
      assert.ok(ms > SPEED_WINDOW_MS + 20, 'longer than the pointer window and the 20 ms of slack the settle timer adds')
      assert.ok(ns.lastIndexOf('mouse.move') < ns.indexOf('holdFor') && ns.indexOf('holdFor') < ns.indexOf('mouse.up'), 'move, wait, release')
    }
  })

  it('a press that loses the pointer presses a note, blurs the window, and only then lets go, with no move and no key', async () => {
    for (const a of kindOf('note press lost')) {
      const { log } = await runOn(a)
      const ns = names(log)
      assert.equal(calls(log, 'mouse.move').length, 1, 'the pointer never drags')
      assert.equal(calls(log, 'keyboard.press').length, 0)
      assert.ok(ns.indexOf('mouse.down') > -1 && ns.indexOf('mouse.down') < ns.indexOf('blurFocus') && ns.indexOf('blurFocus') < ns.indexOf('mouse.up'), String(a))
    }
  })

  it('a resize escape drags a handle, presses Escape with the button still down, then lets go', async () => {
    const corners = new Set()
    for (const a of kindOf('note resize escape')) {
      const { log } = await runOn(a)
      const ns = names(log)
      corners.add(calls(log, 'noteHandle')[0][1])
      assert.deepEqual(calls(log, 'keyboard.press').map(([, k]) => k), ['Escape'])
      assert.ok(ns.indexOf('mouse.down') < ns.indexOf('keyboard.press') && ns.indexOf('keyboard.press') < ns.indexOf('mouse.up'), String(a))
      const moved = ns.indexOf('mouse.move', ns.indexOf('mouse.down'))
      assert.ok(moved > -1 && moved < ns.indexOf('keyboard.press'), 'the handle has moved before Escape')
    }
    assert.deepEqual([...corners].sort(), [0, 1, 2, 3])
  })

  it('the rich notes hold a header, a subtext line, an italic and inline code, and a snake_case word that is no italic', () => {
    const markdown = RICH_NOTES.find((t) => /^# \w/m.test(t))
    assert.ok(markdown, 'a header')
    assert.match(markdown, /^-# \w/m, 'a subtext line')
    assert.match(markdown, /(^|\s)_\w+_(\s|$)/m, 'an italic')
    assert.match(markdown, /`[^`\n]+`/, 'inline code')
    assert.match(markdown, /[a-z]_[a-z]/, 'an underscore inside a word')
  })
})

describe('Color by Digit: a held button and a conflicting mark (#931)', () => {
  const calls = (log, name) => log.filter(([n]) => n === name)
  const kindOf = (kind) => actionsOf(sample(51, 1500)).filter((x) => x.kind === kind)

  it('the hold and the conflict mark exercise Color by Digit, are generated and are ordinary use; the hold is a gesture a busy start leaves out and the mark can sit in one', () => {
    for (const kind of ['color button hold', 'conflict mark']) {
      assert.deepEqual(KIND_SCRIPTS[kind], ['color-by-digit.user.js'], kind)
      assert.equal(KIND_GROUPS[kind], 'ordinary', kind)
      assert.ok(kindOf(kind).length > 3, `${kind} is drawn`)
    }
    assert.ok(!START_KINDS.includes('color button hold'))
    assert.ok(START_KINDS.includes('conflict mark'))
  })

  it('a hold presses the button and lets go on it, or drifts off it first, and says which', async () => {
    const drifts = new Set()
    for (const a of kindOf('color button hold')) {
      const { log } = await runOn(a)
      const held = calls(log, 'holdColorMode')
      assert.equal(held.length, 1)
      drifts.add(held[0][1])
      assert.equal(String(a), held[0][1] ? 'hold the Color by Digit button then drift off it and let go' : 'hold the Color by Digit button until its menu opens and press Escape')
    }
    assert.deepEqual([...drifts].sort(), [false, true])
  })

  it('a conflict mark enters a digit in one cell, then puts a corner or centre mark of it in another cell of the same row, or in another cell where the cell is alone in its row', async () => {
    const tools = new Set()
    const nearlySolved = puzzleByName('nearly solved 9x9')
    const marks = FUZZ_PUZZLES.flatMap((puzzle) => actionsOf(sample(52, 150, [puzzle])).filter((x) => x.kind === 'conflict mark').map((action) => ({ action, puzzle })))
    for (const { action: a, puzzle } of marks) {
      const { log } = await runOn(a)
      const keys = calls(log, 'keyboard.press').map(([, k]) => k)
      assert.equal(calls(log, 'mouse.click').length, 2)
      assert.equal(keys.length, 4, 'digit tool, the digit, the mark tool, the digit')
      assert.equal(keys[0], 'z')
      assert.equal(keys[1], keys[3], 'the same digit')
      tools.add(keys[2])
      const [, from, to] = String(a).match(/^enter \d in r(\d+)c\d+ then put a (?:corner|centre) mark of it in r(\d+)c\d+$/) ?? []
      assert.ok(from !== undefined, String(a))
      // Every cell of the nearly solved puzzle is alone in its row, so its mark goes in another free cell.
      if (puzzle === nearlySolved) assert.notEqual(String(a).match(/ in (r\d+c\d+) then/)[1], String(a).match(/ it in (r\d+c\d+)$/)[1], 'another cell')
      else assert.equal(to, from, 'same row')
    }
    assert.deepEqual([...tools].sort(), ['c', 'x'])
  })
})

describe('a reload drawn after the settings actions (#936)', () => {
  const lists = (options, count = 300) => fc.sample(actionList(FUZZ_PUZZLES, { kinds: KINDS, maxCommands: 20, ...options }), { seed: 936, numRuns: count })
  // Every action but the last of each list, with whether a reload is the very next action.
  const pairs = (drawn) => drawn.flatMap((l) => {
    const kinds = [...l.commands].map((w) => w.cmd.kind)
    return kinds.slice(0, -1).map((kind, i) => [kind, kinds[i + 1] === 'reload'])
  })
  const rate = (flags) => flags.filter(Boolean).length / flags.length
  const afterSettings = (drawn) => rate(pairs(drawn).filter(([kind]) => SETTINGS_KINDS.includes(kind)).map(([, reload]) => reload))
  const afterOthers = (drawn) => rate(pairs(drawn).filter(([kind]) => kind !== 'reload' && !SETTINGS_KINDS.includes(kind)).map(([, reload]) => reload))
  const digest = (drawn) => createHash('sha1').update(drawn.map((l) => JSON.stringify([l.puzzle.name, l.waitMs, l.start.map(String), [...l.commands].map((w) => String(w.cmd))])).join('\n')).digest('hex')

  it('the settings kinds are real kinds, and the ones the five missed mutants save through', () => {
    for (const kind of ['color mode', 'pen line mode', 'note box color', 'note background']) assert.ok(SETTINGS_KINDS.includes(kind), kind)
    for (const kind of SETTINGS_KINDS) assert.ok(KIND_NAMES.includes(kind), kind)
    assert.ok(!SETTINGS_KINDS.includes('reload'))
  })

  it('without the option a reload is drawn after a settings action no more than after any other', () => {
    const drawn = lists({})
    assert.ok(afterSettings(drawn) < 0.15)
    assert.ok(afterOthers(drawn) < 0.15)
  })

  it('with the option, a reload follows about half the settings actions and no other action more than before', () => {
    const drawn = lists({ reloadAfterSettings: true })
    const r = afterSettings(drawn)
    assert.ok(r > 0.35 && r < 0.65, `rate ${r}`)
    assert.ok(afterOthers(drawn) < 0.15, `rate ${afterOthers(drawn)}`)
  })

  it('without the option the lists are the ones origin/main drew (the digests were taken there)', () => {
    assert.equal(digest(fc.sample(actionList(FUZZ_PUZZLES, { kinds: KINDS }), { seed: 936, numRuns: 30 })), '4cf41d46238aee4d86583085f731ebb9f91d28e2')
    assert.equal(digest(fc.sample(actionList(FUZZ_PUZZLES, { kinds: KINDS, busyStart: true }), { seed: 936, numRuns: 30 })), '6b7a39319437519019365b060ef5c10ecb87e719')
    assert.equal(digest(fc.sample(actionList(FUZZ_PUZZLES, { kinds: KINDS, reloadAfterSettings: false }), { seed: 936, numRuns: 30 })), '4cf41d46238aee4d86583085f731ebb9f91d28e2')
  })

  it('without the option a failure shrinks along the path it did on origin/main, so a printed path still replays', () => {
    const shrunk = fc.check(fc.property(actionList(FUZZ_PUZZLES, { kinds: KINDS, busyStart: true }), (l) => [...l.commands].length < 5 || l.start.length < 3), { seed: 936, numRuns: 100, endOnFailure: false })
    assert.equal(shrunk.counterexamplePath, '0:0:1:0:0:1:1:1:1:1:3:4')
  })

  it('a seed gives the same lists, and a list prints the steps that ran, the reloads among them, then the replay path', async () => {
    const [a, b] = [lists({ reloadAfterSettings: true, nonEmpty: true }, 40), lists({ reloadAfterSettings: true, nonEmpty: true }, 40)]
    assert.deepEqual(a.map((l) => [...l.commands].map((w) => String(w.cmd))), b.map((l) => [...l.commands].map((w) => String(w.cmd))))
    const list = a.find((l) => [...l.commands].some((w) => w.cmd.kind === 'reload' && SETTINGS_KINDS.includes([...l.commands][[...l.commands].indexOf(w) - 1]?.cmd.kind)))
    assert.ok(list, 'a list with a reload after a settings action')
    assert.equal(String(list).replace(REPLAY_PATH, '').trim(), '', 'nothing ran, so nothing is printed')
    const steps = [...list.commands]
    const target = await fakeTargets().openTarget()
    // The first two steps run; the rest never do, as when a failure ends a list.
    await fc.asyncModelRun(() => ({ model: { selected: false }, real: { env: target.env } }), steps.slice(0, 2))
    const shown = String(list)
    assert.equal(shown.replace(REPLAY_PATH, '').trim(), steps.slice(0, 2).map(String).join(','))
    assert.match(shown, REPLAY_PATH)
  })

  it('a busy start that saved a setting may be followed by a reload before the first action', () => {
    const drawn = lists({ busyStart: true, reloadAfterSettings: true, nonEmpty: true }, 300)
    const savedAtStart = drawn.filter((l) => l.start.some((s) => SETTINGS_KINDS.includes(s.kind)))
    assert.ok(savedAtStart.length > 30)
    const reloaded = savedAtStart.filter((l) => [...l.commands][0].cmd.kind === 'reload').length / savedAtStart.length
    assert.ok(reloaded > 0.3 && reloaded < 0.7, `rate ${reloaded}`)
    const others = drawn.filter((l) => !l.start.some((s) => SETTINGS_KINDS.includes(s.kind)))
    assert.ok(others.filter((l) => [...l.commands][0].cmd.kind === 'reload').length / others.length < 0.15)
  })
})
