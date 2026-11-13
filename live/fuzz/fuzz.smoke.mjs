// The fuzz's live test (`npm run test:fuzz:smoke`, #593): on real SudokuPad with every script installed, every puzzle of the set opens once and passes a few steps (#679),
// a short run with a fixed seed passes, and a page error planted to fire when Escape interrupts a drag is caught, shrunk to the one interrupted step and replayed
// from the command it prints. Not a
// `*.live.mjs`, so `npm run test:live` skips it, and not in `npm test`: the random run itself is `npm run test:fuzz`.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { useBrowser } from '../session.mjs'
import { penDrawnCount } from '../pen.mjs'
import { scriptedList } from './actions.mjs'
import { COLOR_PICKERS, fuzz, fuzzScripted, openTarget } from './fuzz.mjs'
import { readPageState } from './page-state.mjs'
import { plantById } from './plants.mjs'
import { FUZZ_PUZZLES, puzzleByName } from './puzzle-set.mjs'
import { SELECTED, TEXTS } from '../text-anywhere/text-anywhere-fixtures.mjs'

const run = promisify(execFile)
const PASSING_SEEDS = [2, 3]
const PLANTED_SEED = 3
// The seed the planted Tab bug is caught on.
const TAB_PLANT_SEED = 4
const ROOT = new URL('../../', import.meta.url)
const INTERRUPTED_BY_ESCAPE = /^(?:pen drag|right-click erase held|note drag).* then Escape then release$/

const browser = useBrowser()

describe('the fuzz on SudokuPad', { concurrency: false }, () => {
  // Every puzzle opens once, on the page the fuzz uses, with the puzzle set's free cells matching the page's, and takes a click, a digit and an undo with no rule
  // broken and no crash signal.
  for (const puzzle of FUZZ_PUZZLES) {
    it(`the ${puzzle.name} puzzle opens and takes a click, a digit key and an undo`, async () => {
      await fuzzScripted({ browser: browser(), puzzle, steps: [['click cell', 0], ['type digit', puzzle.keys[0]], ['undo', null]] })
    })
  }

  it('a click on every cell around the outside-clues grid stays on the page, though SudokuPad\'s own links sit over a corner of it', async () => {
    const puzzle = puzzleByName('outside clues 9x9')
    const steps = puzzle.cells.flatMap(([r, c], i) => (r < 0 || c < 0 || r >= puzzle.rows || c >= puzzle.cols ? [['enter digit', [i, '1']]] : []))
    assert.ok(steps.length > 30, `${steps.length} margin targets`)
    await fuzzScripted({ browser: browser(), puzzle, steps })
  })

  it('a page that does not show the puzzle set\'s free cells is refused, not fuzzed on the wrong cells', async () => {
    const wrong = { ...puzzleByName('4x4'), free: [[0, 1]] }
    await assert.rejects(openTarget(browser(), wrong, {}), /opened with \d+ free cells that are not the 1 of puzzle-set\.mjs/)
  })

  it('a puzzle that has rules text but shows no pane is a failure, and one with no rules text is read with no pane', async () => {
    const target = await openTarget(browser(), puzzleByName('4x4'), {})
    try {
      await assert.rejects(readPageState(target.env.page, { expectRules: true }), /rules pane is not shown/)
      assert.equal((await readPageState(target.env.page, { expectRules: false })).rulesPane, null)
    } finally {
      await target.close()
    }
  })

  for (const seed of PASSING_SEEDS) {
    it(`a short run with seed ${seed} passes, each list on the puzzle it names`, async () => {
      const result = await fuzz({ browser: browser(), seed, runs: 6 })
      assert.equal(result.failed, false, `${result.error}\n${result.sequence?.join('\n')}`)
      assert.equal(result.runs, 6)
      assert.equal(Object.values(result.puzzleRuns).reduce((a, b) => a + b, 0), 6)
    })
  }

  it('a bug planted in a script is injected in its place: caught, shrunk to the Tab and printed with the plant to replay', async () => {
    const plant = plantById('tab-turns-pad-to-letters')
    const result = await fuzz({ browser: browser(), seed: TAB_PLANT_SEED, runs: 150, plant, shrinkMinutes: 5 })
    assert.equal(result.failed, true, 'the planted bug failed the run')
    assert.match(result.error, plant.expect)
    assert.deepEqual(result.sequence, ['press Tab'])
    assert.match(result.replayCommand, / --plant tab-turns-pad-to-letters$/)
    assert.equal((await fuzz({ browser: browser(), seed: TAB_PLANT_SEED, runs: 20 })).failed, false, 'the same seed on the shipped script passes')
  })

  it('a note open for typing at a reload is kept (#668): the recorded failing list passes', async () => {
    // note "15" at r1c3, click r1c4, type 1, reload: the note typed in is open when the page reloads, and save-as-you-type brings it back.
    const puzzle = puzzleByName('recorded 9x9')
    const at = (row, col) => puzzle.cells.findIndex(([r, c]) => r === row && c === col)
    await fuzzScripted({ browser: browser(), puzzle, steps: [['place note', [0, at(0, 2)]], ['click cell', at(0, 3)], ['type digit', '1'], ['reload', null]] })
  })

  // Runs `steps` (`[kind, arg]`) on a fresh page of `puzzle` and returns the snapshot after the last, with no plant in.
  async function snapshotAfter (puzzle, steps) {
    const target = await openTarget(browser(), puzzle, {})
    try {
      for (const step of scriptedList(puzzle, steps)) await step.run({ selected: true }, { env: target.env })
      await target.wait(300)
      return await target.snapshot()
    } finally {
      await target.close()
    }
  }

  // Runs `steps` on a fresh page of `puzzle` and gives `read` the page.
  async function afterSteps (puzzle, steps, read) {
    const target = await openTarget(browser(), puzzle, {})
    try {
      for (const step of scriptedList(puzzle, steps)) await step.run({ selected: true }, { env: target.env })
      return await read(target.env.page)
    } finally {
      await target.close()
    }
  }

  it('the box color rule reads real notes (#713): a note with a box, then Yellow saved, is read as one boxed note filled with the yellow it should have', async () => {
    const puzzle = puzzleByName('recorded 9x9')
    const { page } = await snapshotAfter(puzzle, [['boxed note', [0, 0]], ['note box color', ['yellow', 0, true]]])
    assert.deepEqual(page.noteBoxes.map(({ fill, expected }) => [fill, expected]), [['rgb(255, 244, 176)', 'rgb(255, 244, 176)']])
  })

  it('an arrow line is drawn with a page 3 pen and a thickness slider drag after it raises nothing (#713)', async () => {
    const puzzle = puzzleByName('recorded 9x9')
    const { page, errors } = await snapshotAfter(puzzle, [['arrow line', [0, 5, 1]], ['slider drag', [0, 0, 10]]])
    assert.ok(page.penState.length > 0, 'the line is on the board')
    assert.ok(page.penState.every((stroke) => /pencolor-[jlnprtvxz]$/.test(stroke)), page.penState.join(' | '))
    assert.deepEqual(errors, [])
  })

  describe("Text Anywhere's resize, selection, nudge, clear and rich notes (#815)", () => {
    const puzzle = puzzleByName('recorded 9x9')
    const at = (row, col) => {
      const i = puzzle.cells.findIndex(([r, c]) => r === row && c === col)
      assert.notEqual(i, -1, `r${row + 1}c${col + 1} is no cell of the ${puzzle.name} puzzle`)
      return i
    }
    const NOTE_AT = at(4, 4)
    const NOTE = ['place note', [0, NOTE_AT]]
    const savedTexts = (page) => (page.notesSaved ?? []).filter((item) => item.kind === 'text').map((item) => item.text)
    const savedFirst = (page) => page.notesSaved.find((item) => item.kind === 'text')

    it('a nudge moves the saved note, and a held arrow key moves it further than the taps do', async () => {
      const start = savedFirst((await snapshotAfter(puzzle, [NOTE])).page)
      const tapped = savedFirst((await snapshotAfter(puzzle, [NOTE, ['note nudge', [[0, NOTE_AT], 1, false, 3]]])).page)
      const held = savedFirst((await snapshotAfter(puzzle, [NOTE, ['note nudge', [[0, NOTE_AT], 1, false, 0]]])).page)
      const farther = (item) => Math.hypot(...[0, 1].map((i) => item.at[i] - start.at[i]))
      assert.ok(farther(tapped) > 0, 'the taps moved it')
      assert.ok(farther(held) > farther(tapped), `held ${farther(held)} past taps ${farther(tapped)}`)
    })

    it('a resize drag gives the saved note a box of its own', async () => {
      assert.equal(savedFirst((await snapshotAfter(puzzle, [NOTE])).page).box, undefined)
      const resized = savedFirst((await snapshotAfter(puzzle, [NOTE, ['note resize', [[0, NOTE_AT], 3, 40, 30]]])).page)
      assert.ok(Array.isArray(resized.box), JSON.stringify(resized))
    })

    it('Clear all with OK removes every note, Cancel keeps them, and with a note selected it deletes just that one with no question', async () => {
      const two = [NOTE, ['place note', [1, at(1, 1)]]]
      assert.deepEqual(savedTexts((await snapshotAfter(puzzle, [...two, ['clear notes', [[0, NOTE_AT], false, true]]])).page), [])
      assert.equal(savedTexts((await snapshotAfter(puzzle, [...two, ['clear notes', [[0, NOTE_AT], false, false]]])).page).length, 2)
      assert.equal(savedTexts((await snapshotAfter(puzzle, [...two, ['clear notes', [[0, NOTE_AT], true, true]]])).page).length, 1)
    })

    it('a tick on a rich note\'s check box is saved', async () => {
      assert.deepEqual(savedTexts((await snapshotAfter(puzzle, [['rich note', [1, NOTE_AT]], ['tick check box', NOTE_AT]])).page), ['- [x] buy\n- [x] sold'])
    })

    it('the tick places a check box note when the board has none, and ticks it', async () => {
      assert.deepEqual(savedTexts((await snapshotAfter(puzzle, [['tick check box', NOTE_AT]])).page), ['- [x] buy\n- [x] sold'])
    })

    it('a rectangle over the board selects the note it covers, and one clear of it selects none', async () => {
      const selectedAfter = (rectangle) => afterSteps(puzzle, [NOTE, ['note rectangle', rectangle]], (p) => p.locator(SELECTED).count())
      assert.equal(await selectedAfter([at(2, 3), at(6, 5), false]), 1)
      assert.equal(await selectedAfter([at(0, 2), at(1, 6), false]), 0)
    })

    it('a wheel over a tall note scrolls it', async () => {
      const scrolled = await afterSteps(puzzle, [['rich note', [3, NOTE_AT]], ['note wheel', [NOTE_AT, 400]]], (p) => p.locator(TEXTS).first().evaluate((e) => e.scrollTop))
      assert.ok(scrolled > 0, `scrollTop ${scrolled}`)
    })

    it('reopening a note leaves it saved and no box open', async () => {
      const { page, errors } = await snapshotAfter(puzzle, [NOTE, ['reopen note', [0, NOTE_AT]]])
      assert.deepEqual(savedTexts(page), ['15'])
      assert.deepEqual(page.notesSeen, ['15'], 'the note is drawn and nothing is open for typing')
      assert.deepEqual(errors, [])
    })

    it('rich notes and a restart raise no page error', async () => {
      const { errors } = await snapshotAfter(puzzle, [['rich note', [0, at(1, 1)]], ['rich note', [2, at(6, 5)]], ['restart', false]])
      assert.deepEqual(errors, [])
    })
  })

  describe("Pen Tool Extras' line modes, marks, color editing and presets (#816)", () => {
    const puzzle = puzzleByName('recorded 9x9')
    const at = (row, col) => puzzle.cells.findIndex(([r, c]) => r === row && c === col)
    const saved = (key) => (p) => p.evaluate((k) => Framework.getData(k), key)
    const penStrokes = (p) => p.evaluate(() => Framework.app.puzzle.cells.flatMap((c) => c.pen).length)

    it('the line mode button steps the saved mode: both, then center only, then edge only, then both again, and a line is drawn in it', async () => {
      const modeAfter = (presses) => afterSteps(puzzle, [['pen line mode', [presses, at(2, 3), at(6, 5), 1]]], async (p) => [await saved('ToolPen_linemode')(p), (await penDrawnCount(p)) > 0])
      assert.deepEqual(await modeAfter(1), ['centeronly', true])
      assert.deepEqual(await modeAfter(2), ['edgeonly', true])
      assert.deepEqual((await modeAfter(3))[0], 'both')
    })

    it('ticked mark boxes are saved, and a click on a cell edge then adds a mark to the cell', async () => {
      const after = await afterSteps(puzzle, [['pen mark', [['x'], at(3, 3), 1, 1]]], async (p) => ({ marks: await saved('EdgeMarks_marks')(p), strokes: await penStrokes(p) }))
      assert.equal(after.marks.x, true)
      assert.equal(after.marks.cornerX, false)
      assert.equal(after.strokes, 1, 'the edge click marked the cell')
    })

    it('a click on a grid corner with a corner X mark ticked adds a mark', async () => {
      const strokes = await afterSteps(puzzle, [['pen mark', [['cornerX'], at(3, 3), 7, 1]]], penStrokes)
      assert.equal(strokes, 1)
    })

    it('a hold on a pen color opens the pickers, a recolor there is saved for that pen, and the hold ends clean on Escape, a cell click, a tool key or a page turn', async () => {
      const colorAfter = (edit) => afterSteps(puzzle, [['pen color edit', edit]], async (p) => ({ colors: await saved('PenColor_colors')(p), pickers: await p.locator(COLOR_PICKERS).count() }))
      const recolored = await colorAfter([3, 1, 0x123456, at(1, 1), 'z'])
      assert.equal(recolored.colors[3], '#123456')
      assert.equal(recolored.pickers, 0, 'the pickers are gone')
      for (const end of [0, 2, 3, 4]) assert.equal((await colorAfter([3, end, 0x123456, at(1, 1), 'z'])).pickers, 0, `end ${end} leaves no pickers`)
    })

    it('a colors dialog after a recolor (when the Custom option is disabled and selected) still picks a preset', async () => {
      const preset = await afterSteps(puzzle, [['pen color edit', [3, 1, 0x123456, at(1, 1), 'z']], ['pen colors dialog', [0, false, true]]], async (p) => (await saved('PenColor_colors')(p)).preset)
      assert.equal(preset, 'page-1')
    })

    it('a color preset is saved on Save and not on Cancel, and Restore defaults saves the first preset again', async () => {
      const presetAfter = (...dialogs) => afterSteps(puzzle, dialogs.map((d) => ['pen colors dialog', d]), async (p) => (await saved('PenColor_colors')(p)).preset)
      const first = await presetAfter([0, false, false])
      assert.equal(first, 'page-1', 'the install save starts on the first preset')
      const picked = await presetAfter([3, false, true])
      assert.notEqual(picked, first, 'a pick saved')
      assert.equal(await presetAfter([3, false, false]), first, 'Cancel left the colors')
      assert.equal(await presetAfter([3, false, true], [0, true, true]), first, 'Restore defaults went back to the first preset')
    })
  })

  describe('a page error planted on Escape during a drag', () => {
    let found

    it('is caught, shrunk to the one interrupted step, and printed with the seed and a replay command', async () => {
      found = await fuzz({ browser: browser(), seed: PLANTED_SEED, runs: 150, planted: true, shrinkMinutes: 5 })
      assert.equal(found.failed, true, 'the planted error failed the run')
      assert.match(found.error, /crash signal after .*Escape.*: page error or console error: .*planted page error/)
      assert.equal(found.sequence.length, 1, found.sequence.join(' | '))
      assert.match(found.sequence[0], INTERRUPTED_BY_ESCAPE)
      assert.equal(found.seed, PLANTED_SEED)
      assert.match(found.replayCommand, new RegExp(`^npm run test:fuzz -- --seed ${PLANTED_SEED} --path \\S+ --plant-escape-error$`))
    })

    it('the printed replay command reproduces the same step and error', async () => {
      const [bin, ...args] = found.replayCommand.split(' ')
      const { stdout } = await run(bin, args, { cwd: ROOT, timeout: 120000 }).catch((e) => e.code === 1 ? e : Promise.reject(e))
      assert.match(stdout, /^fuzz FAILED /m)
      assert.ok(stdout.includes(`error: ${found.error}`), stdout)
      assert.ok(stdout.includes(`  1. ${found.sequence[0]}\n`), stdout)
    })

    it('the exact shrunk list, replayed without the planted error, passes', async () => {
      const replayed = await fuzz({ browser: browser(), seed: found.seed, path: found.path })
      assert.equal(replayed.failed, false, `${replayed.error}\n${replayed.sequence?.join('\n')}`)
    })
  })
})
