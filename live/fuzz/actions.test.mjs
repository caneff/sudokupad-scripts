import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fc from 'fast-check'
import { createRequire } from 'node:module'
import { actionList, DEFAULT_MAX_COMMANDS, focusFiles, FOCUS_FACTOR, KIND_GROUPS, KIND_NAMES, KIND_SCRIPTS, kindWeights, MAX_PROFILE_EDITS, MAX_PROFILES, RICH_NOTES, scriptedList, START_KINDS } from './actions.mjs'
import { fakeTargets } from './fake-target.mjs'
import { FUZZ_PUZZLES, puzzleByName } from './puzzle-set.mjs'
import { scriptFiles } from '../../sync-lib.js'

// The lists a seed gives (each `{ puzzle, commands }`) over the whole puzzle set, or over `puzzles`.
const sample = (seed, count = 6, puzzles = FUZZ_PUZZLES) => fc.sample(actionList(puzzles, { maxCommands: 20 }), { seed, numRuns: count })
// fast-check wraps each generated command (`.cmd`), and prints a list only once it ran, so the steps are read from the commands.
const actionsOf = (lists) => lists.flatMap((l) => [...l.commands].map((wrapped) => wrapped.cmd))
const stepsOf = (lists) => actionsOf(lists).map(String)

const { THICKNESS, DASH, ARROW_SPACING } = createRequire(import.meta.url)('../../pen-tool-extras.user.js')
const { BOX_LINES, NUDGE_REPEAT_MS } = createRequire(import.meta.url)('../../text-anywhere.user.js')

const runOn = async (action, options) => {
  const target = await fakeTargets(options).openTarget()
  await action.run({ selected: true }, { env: target.env })
  return target
}

describe('the action vocabulary', () => {
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
    assert.ok(share('interruption') > 0.1 && share('page') > 0.02, 'interruptions and page events are there too')
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
    const editorCalls = async () => {
      const seen = []
      for (const a of kindOf('profile editor').slice(0, 200)) seen.push({ step: String(a), call: calls((await runOn(a)).log, 'profileEditor')[0] })
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
      assert.deepEqual([...ops].sort(), ['cell profile', 'delete', 'digit profile', 'move', 'new', 'paint', 'rename', 'select'])
      assert.deepEqual([...saves].sort(), [false, true])
      assert.deepEqual([...menus].sort(), [false, true], 'opened from the settings and from the pad menu')
    })

    it('its steps name each edit and Save or Cancel, as plain words', async () => {
      const steps = (await editorCalls()).map(({ step }) => step)
      for (const step of steps) assert.match(step, /^Color by Digit profiles dialog(?: from the pad menu)?: .*(?:Save|Cancel)$/)
      const all = steps.join(' | ')
      for (const word of ['new profile', 'rename to ', 'delete profile ', 'move profile ', 'select profile ', 'paint digit ', 'cell profile ', 'digit profile ']) assert.ok(all.includes(word), word)
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
    for (const a of actionsOf(fc.sample(actionList(FUZZ_PUZZLES, { maxCommands: 20, focus }), { seed: 11, numRuns: 300 }))) seen[a.kind]++
    return seen
  }
  const share = (seen, kinds) => kinds.reduce((sum, k) => sum + seen[k], 0) / Object.values(seen).reduce((a, b) => a + b, 0)

  it('names only real kinds and real scripts, and every script has a kind', () => {
    assert.deepEqual(Object.keys(KIND_SCRIPTS).sort(), [...KIND_NAMES].sort())
    const files = new Set(scriptFiles())
    for (const [kind, scripts] of Object.entries(KIND_SCRIPTS)) for (const f of scripts) assert.ok(files.has(f), `${kind}: ${f} is no script`)
    for (const f of files) assert.ok(kindsOf(f).length > 0, `${f} has no action that exercises it`)
  })

  it('a focused script\'s kinds weigh FOCUS_FACTOR times their own weight and every other kind keeps it', () => {
    const plain = kindWeights([])
    const focused = kindWeights([PEN])
    for (const k of KIND_NAMES) assert.equal(focused[k], kindsOf(PEN).includes(k) ? plain[k] * FOCUS_FACTOR : plain[k], k)
    assert.ok(FOCUS_FACTOR > 1)
  })

  it('a kind of two focused scripts is raised once, not twice', () => {
    const both = KIND_NAMES.find((k) => KIND_SCRIPTS[k].length > 1)
    assert.ok(both, 'some kind exercises two scripts')
    const weights = kindWeights(KIND_SCRIPTS[both])
    assert.equal(weights[both], kindWeights([])[both] * FOCUS_FACTOR)
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
})

describe('swarm lists (#728)', () => {
  const swarm = (seed, count = 150, options = {}) => fc.sample(actionList(FUZZ_PUZZLES, { swarm: true, ...options }), { seed, numRuns: count })
  const kindsOfList = (list) => new Set([...list.commands].map((w) => w.cmd.kind))

  it('a list holds only the kinds of its own subset, and the subset is never empty', () => {
    for (const list of swarm(21)) {
      assert.ok(list.kinds.length > 0, 'a non-empty subset')
      assert.deepEqual([...kindsOfList(list)].filter((k) => !list.kinds.includes(k)), [], 'no kind outside the subset')
      assert.deepEqual(list.kinds.filter((k) => !KIND_NAMES.includes(k)), [], 'the subset names real kinds')
    }
  })

  it('the subsets differ from list to list, and across lists every kind still comes up', () => {
    const lists = swarm(22, 300)
    assert.ok(new Set(lists.map((l) => l.kinds.join('|'))).size > 100, 'the subsets differ')
    assert.ok(lists.some((l) => l.kinds.length < KIND_NAMES.length / 2), 'some list has under half the kinds')
    const seen = new Set(lists.flatMap((l) => [...kindsOfList(l)]))
    assert.deepEqual(KIND_NAMES.filter((k) => !seen.has(k)), [])
  })

  it('some lists leave out the kinds that wipe the board, so a deeper state survives', () => {
    const lists = swarm(23, 300)
    const wipes = (l) => l.kinds.includes('undo all') || l.kinds.includes('reload')
    assert.ok(lists.some((l) => !wipes(l) && [...l.commands].length > 10), 'a long list with neither undo all nor reload')
  })

  it('a list with no swarm draws from every kind', () => {
    for (const list of fc.sample(actionList(FUZZ_PUZZLES), { seed: 24, numRuns: 20 })) assert.deepEqual(list.kinds, KIND_NAMES)
  })

  it('a start of a busy-start list is still drawn from the start kinds, whatever the subset', () => {
    for (const list of swarm(25, 100, { busyStart: true })) assert.ok(list.start.length <= 30)
  })
})

describe('longer lists and no empty list (#730)', () => {
  const lengths = (options, count = 300) => fc.sample(actionList(FUZZ_PUZZLES, options), { seed: 31, numRuns: count }).map((l) => [...l.commands].length)

  it('with no nonEmpty, some lists are empty, as fast-check draws the length from 0', () => {
    assert.ok(lengths({ maxCommands: 20 }).includes(0))
  })

  it('with nonEmpty, no generated list is empty', () => {
    assert.equal(Math.min(...lengths({ maxCommands: 20, nonEmpty: true })), 1)
    assert.equal(Math.min(...lengths({ maxCommands: 50, nonEmpty: true, swarm: true })), 1)
  })

  it('maxCommands sets the longest list, and the default is the old 20', () => {
    assert.equal(DEFAULT_MAX_COMMANDS, 20)
    assert.equal(Math.max(...lengths({})), 20)
    const long = lengths({ maxCommands: 50, nonEmpty: true })
    assert.equal(Math.max(...long), 50)
    assert.ok(long.filter((n) => n > 20).length > 100, 'most lists are past the old limit')
  })
})
