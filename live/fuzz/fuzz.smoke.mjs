// The fuzz's live test (`npm run test:fuzz:smoke`, #593): on real SudokuPad with every script installed, every puzzle of the set opens once and passes a few steps (#679),
// a short run with a fixed seed passes, and a page error planted to fire when Escape interrupts a drag is caught, shrunk to the one interrupted step and replayed
// from the command it prints. Not a
// `*.live.mjs`, so `npm run test:live` skips it, and not in `npm test`: the random run itself is `npm run test:fuzz`.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { useBrowser } from '../session.mjs'
import { rulesWidth } from '../attacks.mjs'
import { penDrawnCount } from '../pen.mjs'
import { ERROR_LOG_SCRIPTS, scriptedList } from './actions.mjs'
import { ownedSettings } from '../settings.mjs'
import { settingsScript } from '../scripts.mjs'
import { COLOR_PICKERS, fuzz, fuzzScripted, openTarget } from './fuzz.mjs'
import { readPageState } from './page-state.mjs'
import { plantById } from './plants.mjs'
import { FUZZ_PUZZLES, puzzleByName } from './puzzle-set.mjs'
import { SELECTED, TEXTS } from '../text-anywhere/text-anywhere-fixtures.mjs'

const run = promisify(execFile)
const PASSING_SEEDS = [2, 3]
const PLANTED_SEED = 3
// A seed the planted Tab bug is caught on: a new action kind changes what each seed makes, so pick another from `npm run test:fuzz -- --seed <n> --runs 150 --plant tab-turns-pad-to-letters` if this one stops reaching Tab.
const TAB_PLANT_SEED = 2
const ROOT = new URL('../../', import.meta.url)
const INTERRUPTED_BY_ESCAPE = /^(?:pen drag|right-click erase held|note drag).* then Escape then release$/

const browser = useBrowser()

describe('the fuzz on SudokuPad', { concurrency: false }, () => {
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

  it('a pick from the profile menu with Text Anywhere\'s tool current opens no note over its button (#829)', async () => {
    await fuzzScripted({ browser: browser(), puzzle: puzzleByName('4x4'), steps: [['note background', false], ['profile switch', 1], ['boxed note', [0, 1]]] })
  })

  it('a click on a button that a moved, resized note covers moves the note off it first, as a player does (#880)', async () => {
    // Seed 270472555's shrink: the corner drag and the move put the note's handle over Dark Page's settings button.
    const steps = [['note resize', [[1, 2], 2, 0, 50]], ['move note', null], ['dark page', ['#002010', false]]]
    await fuzzScripted({ browser: browser(), puzzle: puzzleByName('4x4'), steps })
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

  async function afterSteps (puzzle, steps, read) {
    const target = await openTarget(browser(), puzzle, {})
    try {
      for (const step of scriptedList(puzzle, steps)) await step.run({ selected: true }, { env: target.env })
      return await read(target.env.page)
    } finally {
      await target.close()
    }
  }

  it('Undo back to the start after a Restart ends with an empty undo stack, though the first Undo brings the board from before the Restart back', async () => {
    const puzzle = puzzleByName('4x4')
    assert.equal(await afterSteps(puzzle, [['restart', false], ['undo all', null]], (p) => p.evaluate(() => Framework.app.puzzle.undoStack.length)), 0)
  })

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

    describe('the note edits of #929', () => {
      const FIRST = [0, NOTE_AT]
      const OTHER = at(1, 1)
      const THIRD = at(7, 7)
      const savedLooks = async (steps) => savedFirst((await snapshotAfter(puzzle, [NOTE, ...steps])).page)
      const erased = async (how) => savedTexts((await snapshotAfter(puzzle, [NOTE, ['note erase', [FIRST, OTHER, THIRD, how]]])).page)

      it('a right click, a right-drag over the note and the same with it open each erase it', async () => {
        for (const how of ['click', 'drag', 'open']) assert.deepEqual(await erased(how), [], how)
      })

      it('a color pressed with the note selected recolors it, and with it open as well', async () => {
        const before = (await savedLooks([])).color
        for (const open of [false, true]) {
          const after = (await savedLooks([['note restyle', [FIRST, open, ['color', before === 4 ? 5 : 4]]]])).color
          assert.notEqual(after, before, `open ${open}`)
        }
      })

      it('Background gives the selected note a box, and a size slider resizes it', async () => {
        assert.equal((await savedLooks([['note restyle', [FIRST, false, ['background']]]])).bg, true)
        const start = (await savedLooks([])).size
        assert.notEqual((await savedLooks([['note restyle', [FIRST, false, ['slider', 0, 5, 10]]]])).size, start)
      })

      it('+ makes the selected note bigger and - smaller, and with the pen they change the thickness', async () => {
        const size = async (key) => (await savedLooks([['size key', [FIRST, false, key, 1]]])).size
        const start = (await savedLooks([])).size
        assert.ok(await size(0) > start, '+')
        assert.ok(await size(2) < start, '-')
        const thickness = (key) => afterSteps(puzzle, [['size key', [FIRST, true, key, 2]]], (p) => p.evaluate(() => Framework.getData('PenColor_thickness')))
        assert.notEqual(await thickness(0), await thickness(2))
      })

      it('typing in a reopened note adds to its text, and deleting all of it removes the note', async () => {
        const typed = await savedTexts((await snapshotAfter(puzzle, [NOTE, ['note edit', [FIRST, 'type more']]])).page)
        assert.equal(typed.length, 1)
        assert.match(typed[0], /ab/)
        const clicked = await savedTexts((await snapshotAfter(puzzle, [NOTE, ['note edit', [FIRST, 'click and type']]])).page)
        assert.match(clicked[0], /ab/)
        assert.deepEqual(await savedTexts((await snapshotAfter(puzzle, [NOTE, ['note edit', [FIRST, 'delete all']]])).page), [])
      })

      it('Hide all hides the notes and a second press shows them', async () => {
        const shown = (twice) => afterSteps(puzzle, [NOTE, ['hide all notes', twice]], (p) => p.locator(TEXTS).first().isVisible())
        assert.equal(await shown(false), false)
        assert.equal(await shown(true), true)
      })

      it('a double-click on a handle puts a resized note back to its own size', async () => {
        const resized = savedFirst((await snapshotAfter(puzzle, [NOTE, ['note resize', [FIRST, 3, 40, 30]]])).page)
        assert.ok(Array.isArray(resized.box))
        const reset = await savedLooks([['note handle reset', [FIRST, 3, false, 40, 30]]])
        assert.equal(reset.box, undefined, JSON.stringify(reset))
      })
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

  describe('the settings dialogs of UI Tweaks and Dark Page (#817)', () => {
    const puzzle = puzzleByName('4x4')
    // Each option's saved value; an option at its default is saved as no key, which reads null.
    const tweaks = (p) => p.evaluate(() => ['tab', 'hideSelect', 'wrapButtons'].map((id) => Framework.getData(`UiTweaks_${id}`)))
    const colorOf = (p) => p.evaluate(() => Framework.getData('DarkPage_color'))

    it('Save keeps the two options and a Tab option clicked off and on again, and Cancel keeps none', async () => {
      assert.deepEqual(await afterSteps(puzzle, [['ui tweaks dialog', [true, true, true, false, true]]], tweaks), [null, true, true], 'the Tab option, back on, is at its default and saves no key')
      assert.deepEqual(await afterSteps(puzzle, [['ui tweaks dialog', [true, true, true, false, false]]], tweaks), [null, null, null])
    })

    it('Restore defaults then Save puts the options back to the defaults, saved as no key', async () => {
      const first = ['ui tweaks dialog', [true, true, false, false, true]]
      assert.deepEqual(await afterSteps(puzzle, [first], tweaks), [null, true, true], 'the first Save leaves two options off their defaults')
      assert.deepEqual(await afterSteps(puzzle, [first, ['ui tweaks dialog', [true, true, false, true, true]]], tweaks), [null, null, null])
    })

    it('a pasted UI Tweaks text is applied on the spot, and a refused one changes nothing', async () => {
      const after = (text) => afterSteps(puzzle, [['ui tweaks settings text', [text, false]]], tweaks)
      const seeded = ['ui tweaks settings text', ['{"UiTweaks_tab":false,"UiTweaks_hideSelect":true}', false]]
      assert.deepEqual(await afterSteps(puzzle, [seeded], tweaks), [false, true, null], 'the first paste leaves Tab and Select off their defaults')
      assert.deepEqual(await afterSteps(puzzle, [seeded, ['ui tweaks settings text', ['{"UiTweaks_wrapButtons":true,"UiTweaks_hideSelect":false}', false]]], tweaks), [false, null, true], 'a second paste changes only its keys: the pasted false goes back to its default (no key), the unpasted Tab stays')
      assert.deepEqual(await after('{"UiTweaks_hideSelect":"yes"}'), [null, null, null])
      assert.deepEqual(await after(null), [null, null, null], 'Copy settings saves nothing')
    })

    it('a pasted Dark Page color is saved even on Cancel, a color it refuses is not, and Restore defaults then Save saves the default as no key', async () => {
      const after = (...steps) => afterSteps(puzzle, steps, colorOf)
      assert.equal(await after(['dark page settings text', ['{"DarkPage_color":"#101030"}', false]]), '#101030')
      assert.equal(await after(['dark page settings text', ['{"DarkPage_color":"blue"}', false]]), null)
      assert.equal(await after(['dark page settings text', ['{"DarkPage_color":"#101030"}', true]], ['dark page defaults', ['#002010', true]]), null)
      assert.equal(await after(['dark page defaults', ['#002010', false]]), null, 'Cancel after Restore defaults saves nothing')
    })
  })

  describe('the rules box of Auto Rules Resizer (#818)', () => {
    const puzzle = puzzleByName('recorded 9x9')
    const script = settingsScript('auto-rules-resizer.user.js')
    // What the script saved, by key without the prefix: the limits are plain, a puzzle's sizing is the one key that starts with `sizing_`.
    const saved = async (p) => Object.fromEntries(Object.entries(await ownedSettings(p, script)).map(([k, v]) => [k.replace(/^(?:svencodes_)?AutoRulesResizer_/, '').replace(/^sizing_.*/, 'sizing'), JSON.parse(v).data]))
    const sizing = async (p) => (await saved(p)).sizing

    it('each corner saves its own box: the bottom-left one grows the box left and down, the top-right one right and up', async () => {
      const box = (...steps) => afterSteps(puzzle, steps, async (p) => (await sizing(p)).box)
      const left = await box(['rules drag', ['dl', -150, 0]])
      assert.ok(left.w > 0 && left.x < 0, `dl sideways: ${JSON.stringify(left)}`)
      const down = await box(['rules drag', ['dl', 0, 80]])
      assert.ok(down.h > 0 && down.y === 0, `dl down: ${JSON.stringify(down)}`)
      const up = await box(['rules drag', ['ur', 0, -60]])
      assert.ok(up.h > 0 && up.y < 0 && up.x === 0, `ur up: ${JSON.stringify(up)}`)
      const right = await box(['rules drag', ['ur', 100, 0]])
      assert.ok(right.w > 0 && right.x === 0, `ur right: ${JSON.stringify(right)}`)
    })

    it('f+ saves a font offset of the number of presses, f- the same below zero', async () => {
      const offset = (...steps) => afterSteps(puzzle, steps, async (p) => (await sizing(p)).nudgePx)
      assert.equal(await offset(['rules font', [1, 2]]), 2)
      assert.equal(await offset(['rules font', [-1, 2]]), -2)
      assert.equal(await offset(['rules font', [1, 3]], ['rules font', [-1, 1]]), 2)
    })

    it('the page state carries the font offset f+ and f- saved, 0 for a puzzle never resized, and one f+ on the 16x16 puzzle passes every rule (#828)', async () => {
      const offsetOf = (p) => readPageState(p, { expectRules: true }).then((page) => page.rulesPane.fontOffsetPx)
      assert.equal(await afterSteps(puzzle, [], offsetOf), 0)
      assert.equal(await afterSteps(puzzle, [['rules font', [1, 2]]], offsetOf), 2)
      assert.equal(await afterSteps(puzzle, [['rules font', [-1, 1]]], offsetOf), -1)
      await fuzzScripted({ browser: browser(), puzzle: puzzleByName('16x16'), steps: [['rules font', [1, 1]]] })
    })

    it('Restore defaults saves no sizing at all', async () => {
      assert.equal(await afterSteps(puzzle, [['rules drag', ['dl', -150, 0]], ['rules font', [-1, 1]], ['rules dialog', ['', '', true, false]]], sizing), undefined)
    })

    it('a saved box is read back when the page loads again: the pane is as wide as after the drag, and wider than undragged', async () => {
      const dragged = await afterSteps(puzzle, [['rules drag', ['dl', -150, 0]]], rulesWidth)
      const reloaded = await afterSteps(puzzle, [['rules drag', ['dl', -150, 0]], ['reload', null]], rulesWidth)
      const undragged = await afterSteps(puzzle, [], rulesWidth)
      assert.equal(reloaded, dragged)
      assert.ok(dragged > undragged, `${dragged} > ${undragged}`)
    })

    it('a puzzle with no rules text has no box to drag, and the actions do nothing', async () => {
      assert.deepEqual(await afterSteps(puzzleByName('4x4'), [['rules drag', ['ur', 100, -100]], ['rules font', [1, 3]]], saved), {})
    })

    it('Save keeps both limits, a blank clears one, a number that is no size keeps the one before, and Cancel keeps none', async () => {
      assert.deepEqual(await afterSteps(puzzle, [['rules dialog', ['400', '300', false, true]]], saved), { maxWidth: 400, maxHeight: 300 })
      assert.deepEqual(await afterSteps(puzzle, [['rules dialog', ['400', '300', false, true]], ['rules dialog', ['', '0', false, true]]], saved), { maxHeight: 300 })
      assert.deepEqual(await afterSteps(puzzle, [['rules dialog', ['400', '300', false, false]]], saved), {})
    })
  })

  describe('the Copy, Paste, Restore defaults and error log of every settings dialog (#928)', () => {
    const puzzle = puzzleByName('4x4')
    const data = (...keys) => (p) => p.evaluate((names) => names.map((key) => Framework.getData(key)), keys)
    const paste = (script, text, save = false) => [`${script} settings text`, [text, save]]

    it('a pasted text is applied on the spot in each of the four dialogs, and Copy settings changes nothing', async () => {
      const after = (script, text, ...keys) => afterSteps(puzzle, [paste(script, text)], data(...keys))
      assert.deepEqual(await after('color by digit', '{"ColorByDigit_mode":"digit"}', 'ColorByDigit_mode'), ['digit'])
      assert.deepEqual(await after('text anywhere', '{"TextAnywhere_width":3.5,"TextAnywhere_frame":true}', 'TextAnywhere_width', 'TextAnywhere_frame'), [3.5, true])
      assert.deepEqual(await after('pen tool extras', '{"PenColor_thickness":9}', 'PenColor_thickness'), [9])
      assert.deepEqual((await after('auto rules resizer', '{"AutoRulesResizer_maxWidth":640,"AutoRulesResizer_maxHeight":480}', 'AutoRulesResizer_maxWidth', 'AutoRulesResizer_maxHeight')).map((v) => v.data), [640, 480])
      assert.deepEqual(await after('pen tool extras', '{"PenColor_thickness":"thick"}', 'PenColor_thickness'), [null], 'a refused text saves nothing')
      assert.deepEqual(await after('text anywhere', null, 'TextAnywhere_width'), [null], 'Copy settings saves nothing')
    })

    it('Restore defaults then Save puts Color by Digit\'s profiles back to the preloaded ones, and Text Anywhere\'s frame back to off', async () => {
      const profileCount = async (p) => (await data('ColorByDigit_profiles')(p))[0]?.data?.profiles?.length ?? null
      // The preloaded profiles are the default, so a page that never saved them reads null and a Save of one more makes the count.
      const added = await afterSteps(puzzle, [['profile editor', [[['new']], true, false]]], profileCount)
      assert.ok(added > 1, `a new profile saved, with the preloaded ones (${added})`)
      const restored = await afterSteps(puzzle, [['profile editor', [[['new']], true, false]], ['color by digit defaults', true]], profileCount)
      assert.ok(restored === null || restored === added - 1, `Restore defaults then Save took the new profile away (${restored})`)
      assert.equal(await afterSteps(puzzle, [['profile editor', [[['new']], true, false]], ['color by digit defaults', false]], profileCount), added, 'Cancel kept it')
      const frame = [paste('text anywhere', '{"TextAnywhere_frame":true}')]
      assert.deepEqual(await afterSteps(puzzle, [...frame, ['text anywhere defaults', true]], data('TextAnywhere_frame')), [false], 'the frame is off again')
      assert.deepEqual(await afterSteps(puzzle, [...frame, ['text anywhere defaults', false]], data('TextAnywhere_frame')), [true], 'Cancel after Restore defaults keeps the pasted frame')
    })

    it('Copy error log and Clear answer in all six dialogs, and Clear empties a log that has a record', async () => {
      const log = (p) => p.evaluate(() => window.localStorage.getItem('sudokupad-scripts-error-log'))
      const seeded = (p) => p.evaluate(() => window.localStorage.setItem('sudokupad-scripts-error-log', JSON.stringify([{ script: 'dark-page', feature: 'saved color', name: 'TypeError', message: 'seeded', stack: 'TypeError: seeded', version: '1.0.0', sudokupad: '1.0', url: 'https://sudokupad.app/' }])))
      for (let i = 0; i < ERROR_LOG_SCRIPTS.length; i++) {
        await afterSteps(puzzle, [['error log', [i, false]], ['error log', [i, true]]], async () => {})
      }
      const target = await openTarget(browser(), puzzle, {})
      try {
        await seeded(target.env.page)
        const [copy, clear] = scriptedList(puzzle, [['error log', [1, false]], ['error log', [1, true]]])
        await copy.run({ selected: true }, { env: target.env })
        assert.notEqual(await log(target.env.page), null, 'Copy leaves the log')
        await clear.run({ selected: true }, { env: target.env })
        assert.equal(await log(target.env.page), null, 'Clear emptied it')
      } finally {
        await target.close()
      }
    })

    it('a Text color preset is saved on Save and not on Cancel', async () => {
      const colors = data('TextAnywhere_colors')
      assert.notDeepEqual(await afterSteps(puzzle, [['note color preset', [0, true]]], colors), [null], 'Save saved a preset')
      assert.deepEqual(await afterSteps(puzzle, [['note color preset', [0, false]]], colors), [null])
    })

    it('Pen Tool Extras\' Show boxes are saved each for its own slider on Save and not on Cancel, and a slider hidden there is skipped by the slider actions', async () => {
      const sliders = data('PenColor_sliders')
      assert.deepEqual(await afterSteps(puzzle, [['pen show boxes', [false, true, true]]], sliders), [{ thickness: false, opacity: true }])
      assert.deepEqual(await afterSteps(puzzle, [['pen show boxes', [true, false, true]]], sliders), [{ thickness: true, opacity: false }])
      assert.deepEqual(await afterSteps(puzzle, [['pen show boxes', [false, true, false]]], sliders), [null], 'Cancel saved none')
      // The list the correctness review found failing: a hidden slider is no lost control.
      await fuzzScripted({ browser: browser(), puzzle, steps: [['pen show boxes', [false, false, true]], ['slider drag', [0, 5, 5]], ['slider drag', [1, 0, 10]], ['slider keys', [0, 1, 2]], ['slider keys', [1, 1, 2]]] })
    })

    it('a swatch edit after a preset is saved for its pen on Save, and Cancel drops the preset and the swatch together', async () => {
      const colors = data('PenColor_colors')
      const [saved] = await afterSteps(puzzle, [['pen swatch edit', [2, 4, 0x123456, true]]], colors)
      assert.equal(saved[4], '#123456')
      const [cancelled] = await afterSteps(puzzle, [['pen swatch edit', [2, 4, 0x123456, false]]], colors)
      assert.notEqual(cancelled[4], '#123456', 'Cancel kept the swatch')
      const [first] = await afterSteps(puzzle, [['pen colors dialog', [0, false, false]]], colors)
      assert.deepEqual(cancelled, first, 'Cancel kept the preset: the colors are those of an install')
    })

    it('the dialog of Text Anywhere opens from the settings menu and the dialog of Pen Tool Extras from the pen panel settings button, and each closes on Save or Cancel', async () => {
      const dialogsOpen = (p) => p.locator('.dialog').count()
      for (const kind of ['note dialog from menu', 'pen dialog from settings button']) {
        for (const save of [true, false]) assert.equal(await afterSteps(puzzle, [[kind, save]], dialogsOpen), 0, `${kind} ${save ? 'Save' : 'Cancel'} leaves no dialog`)
      }
    })

    it('a Copy error log that cannot write the clipboard is a failure, not an answer', async () => {
      const target = await openTarget(browser(), puzzle, {})
      try {
        const p = target.env.page
        await p.evaluate(() => {
          window.localStorage.setItem('sudokupad-scripts-error-log', JSON.stringify([{ script: 'dark-page', feature: 'saved color', name: 'TypeError', message: 'seeded', stack: 'TypeError: seeded', version: '1.0.0', sudokupad: '1.0', url: 'https://sudokupad.app/' }]))
          navigator.clipboard.writeText = () => Promise.reject(new Error('planted clipboard refusal'))
        })
        const [copy] = scriptedList(puzzle, [['error log', [1, false]]])
        await assert.rejects(copy.run({ selected: true }, { env: target.env }), /dark page's Copy error log answered "Could not copy the error log/)
      } finally {
        await target.close()
      }
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
