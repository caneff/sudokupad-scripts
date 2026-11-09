// Unit tests of the fuzz's action vocabulary with a fake page: a seed always gives the same actions, every kind is generated, every kind runs.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fc from 'fast-check'
import { actionList, KIND_GROUPS, KIND_NAMES, scriptedList } from './actions.mjs'
import { fakeTargets } from './fake-target.mjs'
import { FUZZ_PUZZLES, puzzleByName } from './puzzle-set.mjs'

// The lists a seed gives (each `{ puzzle, commands }`) over the whole puzzle set, or over `puzzles`.
const sample = (seed, count = 6, puzzles = FUZZ_PUZZLES) => fc.sample(actionList(puzzles, { maxCommands: 20 }), { seed, numRuns: count })
// fast-check wraps each generated command (`.cmd`), and prints a list only once it ran, so the steps are read from the commands.
const actionsOf = (lists) => lists.flatMap((l) => [...l.commands].map((wrapped) => wrapped.cmd))
const stepsOf = (lists) => actionsOf(lists).map(String)

// Runs `action` on a fresh fake page and returns it.
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
      assert.doesNotMatch(plain, /\br0c|\bc0\b|\br7c|\bc7\b/, 'a 6x6 names no cell outside its 6 by 6')
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
