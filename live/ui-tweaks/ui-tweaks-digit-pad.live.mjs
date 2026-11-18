import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { SCRIPT_FILES, addScripts, openWith, reloadWith, useBrowser } from '../session.mjs'
import { closeDialogWith, openScriptDialog } from '../settings.mjs'
import { clickUntil, stable } from '../settle.mjs'

const SCRIPT_FILE = 'ui-tweaks.user.js'
// The recorded puzzle has no rules, so each page is given some through SudokuPad's own showMetaInfoUI, as a loaded puzzle gets them.
const RULES = 'Normal sudoku rules apply. Digits along an arrow sum to the digit in its circle. Cells separated by a white dot contain consecutive digits.'

const DIALOG = '#ui-tweaks-dialog'
const PAD = `${DIALOG} select[data-option="digitPad"]`
const WINDOWS = [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]
// A button, a board or a pane may touch another's edge; "overlap" is more than this many px of both axes.
const OVERLAP_PX = 2

const browser = useBrowser()

// A page in `viewport` with the puzzle started and RULES shown, then `scripts` added.
const showRules = (p) => p.evaluate((rules) => {
  Framework.app.showMetaInfoUI({ title: 'Arrows and dots', author: 'Tester', rules })
  Framework.app.resize()
}, RULES)

async function rulesPage (viewport, scripts) {
  const opened = await openWith(browser(), [], { contextOptions: { viewport } })
  await showRules(opened.p)
  await addScripts(opened.p, scripts)
  return opened
}

// The digit buttons' width and height, the column's scale, and the boxes of the board, the controls column and the rules pane.
const measure = (p) => p.evaluate(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
  const digit = document.querySelector('.controls-input button.digit').getBoundingClientRect()
  const rules = document.querySelector('.puzzle-rules')
  const controls = document.getElementById('controls')
  return {
    digit: Math.round(digit.width * 10) / 10,
    digitHeight: Math.round(digit.height * 10) / 10,
    scale: Math.round(controls.getBoundingClientRect().width / controls.offsetWidth * 1000) / 1000,
    board: box(document.getElementById('board')),
    controls: box(controls),
    buttons: box(document.querySelector('.controls-buttons')),
    rules: rules && rules.getClientRects().length > 0 ? box(rules) : null,
    outside: [...controls.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0).map((b) => ({ id: b.id || b.dataset.control, ...box(b) }))
      .filter((b) => b.left < -0.5 || b.top < -0.5 || b.right > window.innerWidth + 0.5 || b.bottom > window.innerHeight + 0.5).map((b) => b.id),
    windowSize: { width: window.innerWidth, height: window.innerHeight }
  }
})
const measureStable = (p) => stable(() => measure(p))

const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > OVERLAP_PX && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > OVERLAP_PX

async function choose (p, percent, { wrap = false } = {}) {
  await openScriptDialog(p, 'UI Tweaks', DIALOG)
  await p.locator(PAD).selectOption(String(percent))
  if (wrap) await p.locator(`${DIALOG} input[data-option="wrapButtons"]`).check()
  await closeDialogWith(p, 'Save', DIALOG)
}

for (const windowSize of WINDOWS) {
  describe(`the Digit pad size setting with every script installed at ${windowSize.width}x${windowSize.height}`, { concurrency: false }, () => {
    let context, p, errors
    const sizes = {}
    before(async () => {
      ;({ context, p, errors } = await rulesPage(windowSize, SCRIPT_FILES))
      sizes[100] = await measureStable(p)
      for (const percent of [80, 150]) {
        await choose(p, percent, { wrap: true })
        sizes[percent] = await measureStable(p)
      }
    })
    after(async () => { await context.close() })

    it('a smaller pad makes the digit buttons smaller and a larger one makes them larger than at 100%, and they stay square', () => {
      assert.equal(sizes[80].digit < sizes[100].digit, true, `80%: ${sizes[80].digit}px against ${sizes[100].digit}px at 100%`)
      assert.equal(sizes[150].digit > sizes[100].digit, true, `150%: ${sizes[150].digit}px against ${sizes[100].digit}px at 100%`)
      for (const percent of [80, 100, 150]) assert.equal(sizes[percent].digit, sizes[percent].digitHeight, `${percent}% is square`)
    })

    for (const percent of [80, 100, 150]) {
      it(`at ${percent}% the board, the controls and the rules pane overlap nowhere (the pane sits in the column, above its buttons) and every control is inside the window`, () => {
        const s = sizes[percent]
        assert.equal(overlap(s.board, s.controls), false, `board ${JSON.stringify(s.board)} against controls ${JSON.stringify(s.controls)}`)
        assert.notEqual(s.rules, null, 'the rules pane is on the page, so the overlap checks below read it')
        assert.equal(overlap(s.rules, s.buttons), false, `rules ${JSON.stringify(s.rules)} against the buttons ${JSON.stringify(s.buttons)}`)
        assert.equal(overlap(s.rules, s.board), false, `rules ${JSON.stringify(s.rules)} against board ${JSON.stringify(s.board)}`)
        assert.deepEqual(s.outside, [], `controls outside the ${s.windowSize.width}x${s.windowSize.height} window`)
      })
    }

    it('no page error or skip line', () => { assert.deepEqual(errors, []) })
  })
}

describe('Save, Cancel and Restore defaults for the Digit pad size', { concurrency: false }, () => {
  let context, p
  before(async () => { ;({ context, p } = await rulesPage(WINDOWS[1], SCRIPT_FILES)) })
  after(async () => { await context.close() })

  it('Cancel puts back the size the dialog opened on, and Restore defaults sets the draft to 100% and Save keeps it', async () => {
    const at100 = (await measureStable(p)).digit
    await choose(p, 130)
    const at130 = (await measureStable(p)).digit
    assert.equal(at130 > at100, true)

    await openScriptDialog(p, 'UI Tweaks', DIALOG)
    await p.locator(PAD).selectOption('80')
    await closeDialogWith(p, 'Cancel', DIALOG)
    assert.equal((await measureStable(p)).digit, at130, 'Cancel leaves 130% in force')

    await openScriptDialog(p, 'UI Tweaks', DIALOG)
    assert.equal(await p.locator(PAD).inputValue(), '130', 'the dialog opens on the saved size')
    await p.locator('.dialog button', { hasText: 'Restore defaults' }).click()
    assert.equal(await p.locator(PAD).inputValue(), '100', 'the draft is back at 100%')
    assert.equal((await measureStable(p)).digit, at130, 'nothing changes before Save')
    await closeDialogWith(p, 'Save', DIALOG)
    const without = await rulesPage(WINDOWS[1], SCRIPT_FILES.filter((file) => file !== SCRIPT_FILE))
    try {
      const { windowSize, ...bare } = await measureStable(without.p)
      const { windowSize: sameWindow, ...saved } = await measureStable(p)
      assert.deepEqual(saved, bare, 'Save at 100% leaves the page as it is with UI Tweaks not installed')
      assert.deepEqual(sameWindow, windowSize)
    } finally {
      await without.context.close()
    }
    assert.equal((await measureStable(p)).digit, at100)
  })

  it('a saved size comes back on reload', async () => {
    await choose(p, 90)
    const at90 = (await measureStable(p)).digit
    await reloadWith(p, SCRIPT_FILES)
    await showRules(p)
    assert.equal((await measureStable(p)).digit, at90)
  })
})

describe('SudokuPad\'s own pen tool at 150%, with UI Tweaks alone', { concurrency: false }, () => {
  let context, p
  before(async () => {
    ;({ context, p } = await openWith(browser(), [SCRIPT_FILE], { contextOptions: { viewport: WINDOWS[1] } }))
    await choose(p, 150)
    await p.evaluate(() => Framework.setSetting('toolpen', true))
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    const penOn = await clickUntil(() => p.locator('#control-pen').click(), () => p.evaluate(() => document.querySelector('.controls-main').classList.contains('tool-pen')), true, 10000)
    assert.equal(penOn, true, 'the pen tool is on')
    await p.locator('.penlinemode').waitFor({ state: 'visible' })
  })
  after(async () => { await context.close() })

  it('the line-mode box sits over the 0 and Delete row and covers none of the nine pen buttons', async () => {
    const found = await stable(() => p.evaluate(() => {
      const box = (e) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
      return {
        mode: box(document.querySelector('.penlinemode')),
        pens: [...document.querySelectorAll('.controls-input button.digit')].filter((b) => b.dataset.value !== '0' && b.getClientRects().length > 0).map(box)
      }
    }))
    assert.equal(found.pens.length > 0, true, 'the pen buttons are on the page')
    assert.deepEqual(found.pens.filter((pen) => overlap(pen, found.mode)), [], `line-mode box ${JSON.stringify(found.mode)}`)
  })
})
