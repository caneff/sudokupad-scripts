import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fc from 'fast-check'
import { createRequire } from 'node:module'
import { actionList, KIND_GROUPS, KIND_NAMES, scriptedList } from './actions.mjs'
import { fakeTargets } from './fake-target.mjs'
import { FUZZ_PUZZLES, puzzleByName } from './puzzle-set.mjs'

// The lists a seed gives (each `{ puzzle, commands }`) over the whole puzzle set, or over `puzzles`.
const sample = (seed, count = 6, puzzles = FUZZ_PUZZLES) => fc.sample(actionList(puzzles, { maxCommands: 20 }), { seed, numRuns: count })
// fast-check wraps each generated command (`.cmd`), and prints a list only once it ran, so the steps are read from the commands.
const actionsOf = (lists) => lists.flatMap((l) => [...l.commands].map((wrapped) => wrapped.cmd))
const stepsOf = (lists) => actionsOf(lists).map(String)

const { THICKNESS, DASH, ARROW_SPACING } = createRequire(import.meta.url)('../../pen-tool-extras.user.js')

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
      assert.deepEqual([...seen].sort(), ['note size', 'note transparency', 'pen opacity', 'pen thickness'])
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
