// Live check of auto-rules-resizer.user.js on sudokupad.app, in headless Chromium. The recorded puzzle has no rules,
// so each page is given short rules through SudokuPad's own showMetaInfoUI, as a loaded puzzle gets them, before the
// script is injected.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { scriptSource, useBrowser } from '../session.mjs'
import { openPage, startPuzzle } from '../page.mjs'
import { clickLeftEdge, openPenTool } from '../pen.mjs'
import { settle, stable } from '../settle.mjs'
import { closeDialogWith, headerVersion, openScriptDialog, openSettings } from '../settings.mjs'

const script = scriptSource('auto-rules-resizer.user.js')

// Three lines at SudokuPad's own width in a 1920 x 1080 window, well under its 14rem cap: short rules.
const RULES = 'Normal sudoku rules apply. Digits along an arrow sum to the digit in its circle. Cells separated by a white dot contain consecutive digits.'
const LANDSCAPE = { width: 1920, height: 1080 }
const SMALLER = { width: 1600, height: 900 }
// Eight times as long: too long for SudokuPad's own size at its own width, and for the page's spare height at that width, so the fit widens the pane.
const LONG_RULES = Array(8).fill(RULES).join(' ')
// About 5,600 characters: no width the window allows stops the scroll.
const VERY_LONG_RULES = Array(40).fill(RULES).join(' ')
// Twelve times: needs more than 500 css px of width at SudokuPad's own size.
const WIDE_RULES = Array(12).fill(RULES).join(' ')
// Five times: at SudokuPad's own width the fit takes the pane's spare height with a font between SudokuPad's and the 150% cap.
const FILLING_RULES = Array(5).fill(RULES).join(' ')
const MAX_WIDTH_KEY = 'AutoRulesResizer_maxWidth'
const MAX_HEIGHT_KEY = 'AutoRulesResizer_maxHeight'
const MAX_WIDTH_INPUT = '#auto-rules-resizer-max-width'
const MAX_HEIGHT_INPUT = '#auto-rules-resizer-max-height'
// SudokuPad's own rules font (1.1rem), and the gap the script keeps to the window's right edge.
const SUDOKUPAD_FONT_PX = 17.6
const MIN_FONT_PX = SUDOKUPAD_FONT_PX * 0.7
const MAX_FONT_PX = SUDOKUPAD_FONT_PX * 1.5
const EDGE_PX = 8
const PORTRAIT = { width: 800, height: 1100 }
const STYLE = '#auto-rules-resizer-style'
const FONT_BAR = '#auto-rules-resizer-font'
const WARNING = /^auto-rules-resizer: /
const CORNER = (corner) => `#auto-rules-resizer-drag-${corner}`

const browser = useBrowser()

// A page in a `viewport` window with the puzzle started and RULES shown. `seed()` runs before the script goes in.
async function rulesPage (viewport, seed, rules = RULES, { expectedSkips } = {}) {
  const opened = await openPage(browser(), { contextOptions: { viewport }, expectedSkips })
  await startPuzzle(opened.p)
  await opened.p.evaluate((rules) => {
    Framework.app.showMetaInfoUI({ title: 'Arrows and dots', author: 'Tester', rules })
    Framework.app.resize()
  }, rules)
  if (seed) await seed(opened.p)
  return opened
}

const inject = async (p) => {
  await p.addScriptTag({ content: script })
  await p.locator(STYLE).waitFor({ state: 'attached' })
}

// The rules pane as it lays out now, in visual px, with its computed font in px.
const pane = (p) => p.evaluate(() => {
  const rules = document.querySelector('.puzzle-rules')
  const r = rules.getBoundingClientRect()
  return {
    font: parseFloat(window.getComputedStyle(rules).fontSize),
    inlineFont: rules.style.fontSize,
    left: Math.round(r.left),
    right: Math.round(r.right),
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    height: Math.round(r.height),
    width: Math.round(r.width),
    cssWidth: rules.offsetWidth,
    cssHeight: rules.offsetHeight,
    scrolls: rules.scrollHeight > rules.clientHeight
  }
})
const fontPx = async (p) => (await pane(p)).font
const controlsMoved = (p) => p.evaluate(() => document.getElementById('controls').style.translate)
const column = (p) => p.evaluate(() => {
  const r = document.getElementById('controls').getBoundingClientRect()
  return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
})
const boardRight = (p) => p.evaluate(() => document.getElementById('board').getBoundingClientRect().right)
const hoverPane = async (p) => {
  const now = await pane(p)
  await p.mouse.move((now.left + now.right) / 2, (now.top + now.bottom) / 2)
}
// Hovers the pane first: the font bar shows only then.
async function clickFont (p, label) {
  await hoverPane(p)
  await p.locator(FONT_BAR).waitFor({ state: 'visible' })
  await p.locator(`${FONT_BAR} button`, { hasText: label }).click()
}

// Drags `corner` by (dx, dy) in steps, the way a hand does: over the pane first, so the corner shows.
// `midDrag()` runs once the pointer has made the move, before the release.
async function dragCorner (p, corner, dx, dy, midDrag) {
  const now = await pane(p)
  await p.mouse.move((now.left + now.right) / 2, (now.top + now.bottom) / 2)
  await p.locator(CORNER(corner)).waitFor({ state: 'visible' })
  const box = await p.locator(CORNER(corner)).boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await p.mouse.move(x, y)
  await p.mouse.down()
  await p.mouse.move(x + dx, y + dy, { steps: 8 })
  await midDrag?.()
  await p.mouse.up()
}

describe('a sideways corner drag keeps the pane\'s height and never raises its font', { concurrency: false }, () => {
  const SIDEWAYS = [
    { corner: 'ur', name: 'wider', dx: 120 },
    { corner: 'ur', name: 'narrower', dx: -120 },
    { corner: 'dl', name: 'wider', dx: -200 },
    { corner: 'dl', name: 'narrower', dx: 120 }
  ]
  // The pointer's vertical drift on the way: none, then 3 px, under the script's 4 px dead zone.
  const DRIFTS = [0, 3, -3]
  const ROOMS = [['spare room below', RULES], ['no spare room below', LONG_RULES]]
  for (const [roomName, rules] of ROOMS) {
    for (const { corner, name, dx } of SIDEWAYS) {
      for (const drift of DRIFTS) {
        it(`${corner} ${name} by ${dx} px with ${drift} px of drift, ${roomName}`, async () => {
          const { context, p, errors } = await rulesPage(LANDSCAPE, undefined, rules)
          try {
            await inject(p)
            await settle(async () => (await fontPx(p)) > 0, true)
            const start = await stable(() => pane(p))
            await dragCorner(p, corner, dx, drift)
            const now = await stable(() => pane(p))
            assert.equal(now.width !== start.width, true, `the drag moved the width ${start.width} -> ${now.width}`)
            assert.equal(Math.abs(now.cssHeight - start.cssHeight) <= 1, true, `height ${start.cssHeight} -> ${now.cssHeight} px, font ${start.font} -> ${now.font} px`)
            assert.equal(now.font <= start.font, true, `font ${start.font} -> ${now.font} px, height ${start.cssHeight} -> ${now.cssHeight} px`)
            assert.deepEqual(errors, [])
          } finally {
            await context.close()
          }
        })
      }
    }
  }
  it('dl wider after an f- press still holds the smaller font\'s pane height and font', async () => {
    const { context, p, errors } = await rulesPage(LANDSCAPE)
    try {
      await inject(p)
      await settle(async () => (await fontPx(p)) > 0, true)
      await clickFont(p, 'f-')
      const start = await stable(() => pane(p))
      await dragCorner(p, 'dl', -200, 0)
      const now = await stable(() => pane(p))
      assert.equal(now.width > start.width, true, `width ${start.width} -> ${now.width}`)
      assert.equal(Math.abs(now.cssHeight - start.cssHeight) <= 1, true, `height ${start.cssHeight} -> ${now.cssHeight} px`)
      assert.equal(now.font <= start.font, true, `font ${start.font} -> ${now.font} px`)
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })
  // A max auto height of 200 px holds the fitted pane under what the page has room for, so a drag has height to add.
  const cappedAt200 = (page) => page.evaluate((key) => Framework.setData(key, { v: 0, data: 200 }), MAX_HEIGHT_KEY)
  for (const { corner, dy } of [{ corner: 'ur', dy: -80 }, { corner: 'dl', dy: 80 }]) {
    it(`${corner} dragged ${dy} px vertically still grows the pane`, async () => {
      const { context, p, errors } = await rulesPage(LANDSCAPE, cappedAt200, FILLING_RULES)
      try {
        await inject(p)
        await settle(async () => (await fontPx(p)) > 0, true)
        const start = await stable(() => pane(p))
        await dragCorner(p, corner, 0, dy)
        const now = await stable(() => pane(p))
        assert.equal(now.cssHeight > start.cssHeight + 1, true, `height ${start.cssHeight} -> ${now.cssHeight} px`)
        assert.deepEqual(errors, [])
      } finally {
        await context.close()
      }
    })
  }
})

describe('a landscape window, rules that fill the pane at SudokuPad\'s width', { concurrency: false }, () => {
  let context, p, errors, own

  before(async () => {
    ;({ context, p, errors } = await rulesPage(LANDSCAPE, null, FILLING_RULES))
    own = await pane(p)
    await inject(p)
  })
  after(async () => { await context.close() })

  it('the rules keep SudokuPad\'s width and get a larger font, with no scrolling', async () => {
    assert.equal(own.font, SUDOKUPAD_FONT_PX, 'SudokuPad\'s own font, before the script')
    const fitted = await settle(async () => (await fontPx(p)) > own.font, true)
    assert.equal(fitted, true, `font ${await fontPx(p)} after the fit`)
    const now = await pane(p)
    assert.equal(now.width, own.width, 'SudokuPad\'s width')
    assert.equal(now.font <= MAX_FONT_PX, true, `font ${now.font}, at most 150% of SudokuPad's`)
    assert.equal(now.scrolls, false)
  })

  it('f+ widens the pane when the bigger font would scroll, and f- back to the fit narrows it again', async () => {
    const auto = await fontPx(p)
    await clickFont(p, 'f+')
    assert.equal(await settle(() => fontPx(p), auto + 1), auto + 1, 'f+')
    const wider = await pane(p)
    assert.equal(wider.width > own.width, true, `width ${own.width} -> ${wider.width}`)
    assert.equal(wider.scrolls, false)
    assert.equal(await p.locator(FONT_BAR).isVisible(), true, 'the bar stays under the pointer while the pane widens')
    await clickFont(p, 'f-')
    await clickFont(p, 'f-')
    assert.equal(await settle(() => fontPx(p), auto - 1), auto - 1, 'f- twice')
    assert.equal(await settle(async () => (await pane(p)).width, own.width), own.width, 'no longer wider than SudokuPad\'s own')
    await clickFont(p, 'f+')
  })

  it('f+ and f- move the font one px a press from the automatic size, and f- goes below SudokuPad\'s own', async () => {
    const auto = await fontPx(p)
    await clickFont(p, 'f+')
    assert.equal(await settle(() => fontPx(p), auto + 1), auto + 1, 'f+')
    const downs = Math.ceil(auto - own.font) + 2
    for (let i = 0; i < downs; i++) await clickFont(p, 'f-')
    const low = auto + 1 - downs
    assert.equal(await settle(() => fontPx(p), low), low, `f- ${downs} times`)
    assert.equal(low < own.font, true, `${low} is below SudokuPad's ${own.font}`)
    for (let i = 0; i < downs - 1; i++) await clickFont(p, 'f+')
    assert.equal(await settle(() => fontPx(p), auto), auto, 'back to the automatic size')
  })

  it('the font bar shows only while the pointer is over the pane or the bar, and stays shown on the way up to it', async () => {
    await p.mouse.move(200, 500)
    assert.equal(await settle(() => p.locator(FONT_BAR).isVisible(), false), false, 'pointer on the board')
    await hoverPane(p)
    assert.equal(await settle(() => p.locator(FONT_BAR).isVisible(), true), true, 'pointer on the pane')
    const bar = await p.locator(FONT_BAR).boundingBox()
    const seen = []
    // From the pane up onto the bar in steps, and on within it.
    await p.mouse.move(bar.x + 4, bar.y + bar.height / 2, { steps: 12 })
    seen.push(await p.locator(FONT_BAR).isVisible())
    await p.mouse.move(bar.x + 4, bar.y + 2)
    seen.push(await p.locator(FONT_BAR).isVisible())
    assert.deepEqual(seen, [true, true], 'pointer moved onto the bar')
    await p.mouse.move(200, 500)
    assert.equal(await settle(() => p.locator(FONT_BAR).isVisible(), false), false, 'pointer back on the board')
  })

  it('the drag corners show only while the pointer is over the rules pane', async () => {
    const shown = () => Promise.all(['ur', 'dl'].map((c) => p.locator(CORNER(c)).isVisible()))
    await p.mouse.move(200, 500)
    assert.deepEqual(await settle(shown, [false, false]), [false, false], 'pointer on the board')
    const now = await pane(p)
    await p.mouse.move((now.left + now.right) / 2, (now.top + now.bottom) / 2)
    assert.deepEqual(await settle(shown, [true, true]), [true, true], 'pointer on the pane')
  })

  it('the top-right corner grows the pane up and moves the controls up with it', async () => {
    const start = await pane(p)
    // The fit lifts the column so the grown pane stays on the page; the drag adds to the lift.
    const lift = parseFloat((await controlsMoved(p)).split(' ')[1]) || 0
    await dragCorner(p, 'ur', 0, -60)
    assert.equal(await settle(() => controlsMoved(p), `0px ${lift - 60}px`), `0px ${lift - 60}px`)
    const now = await pane(p)
    assert.equal(now.top, start.top - 60)
    assert.equal(now.right, start.right, 'a top-right drag straight up grows no wider')
  })

  it('the bottom-left corner grows the pane left, and stops at the board', async () => {
    const start = await pane(p)
    const edge = await boardRight(p)
    await dragCorner(p, 'dl', -400, 0)
    const now = await stable(() => pane(p))
    assert.equal(now.left < start.left, true, `left ${start.left} -> ${now.left}`)
    assert.equal(now.left >= Math.floor(edge), true, `left ${now.left} is clear of the board's right edge ${edge}`)
    assert.equal(now.width > start.width, true, `width ${start.width} -> ${now.width}`)
    assert.equal(now.scrolls, false)
  })

  it('a corner dragged far past the window stops with the controls column inside it', async () => {
    await dragCorner(p, 'dl', 0, 900)
    const down = await stable(() => column(p))
    assert.equal(down.bottom <= LANDSCAPE.height, true, `column bottom ${down.bottom} in a ${LANDSCAPE.height} px window`)
    await dragCorner(p, 'dl', 0, -900)
    await dragCorner(p, 'ur', 0, -2000)
    const up = await stable(() => column(p))
    assert.equal(up.top, 0, 'the column stops at the window\'s top')
  })

  it('a drag made in a larger window is cut back to a smaller one', async () => {
    await p.setViewportSize(SMALLER)
    await settle(() => p.evaluate(() => window.innerHeight), SMALLER.height)
    const now = await stable(() => column(p))
    assert.equal(now.top >= 0, true, `column top ${now.top}`)
    assert.equal(now.bottom <= SMALLER.height, true, `column bottom ${now.bottom} in a ${SMALLER.height} px window`)
    const rect = await stable(() => pane(p))
    assert.equal(rect.left >= Math.floor(await boardRight(p)), true, `pane left ${rect.left} clear of the board`)
  })

  it('the corners and the bar stay shown during a corner drag with the pointer off the pane, and hide once it ends there (last: the drag resizes the pane)', async () => {
    const shown = () => Promise.all([FONT_BAR, CORNER('ur'), CORNER('dl')].map((s) => p.locator(s).isVisible()))
    await hoverPane(p)
    assert.deepEqual(await settle(shown, [true, true, true]), [true, true, true], 'pointer on the pane')
    // Far off the pane, over the board.
    await dragCorner(p, 'ur', -1100, 300, async () => {
      assert.deepEqual(await shown(), [true, true, true], 'mid-drag, pointer off the pane')
    })
    assert.deepEqual(await settle(shown, [false, false, false]), [false, false, false], 'drag ended off the pane')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

describe('a press on the left of a font button (#521)', { concurrency: false }, () => {
  let context, p

  before(async () => {
    ;({ context, p } = await rulesPage(LANDSCAPE, (p) => p.evaluate(() => Framework.setSetting('toolpen', true))))
    await openPenTool(p)
    await p.locator('.tool-pen button[data-key="1"]').click()
    await inject(p)
  })
  after(async () => { await context.close() })

  it('adds no pen mark: the pen tool used to draw an X on the grid\'s right edge', async () => {
    await hoverPane(p)
    await p.locator(FONT_BAR).waitFor({ state: 'visible' })
    const { added } = await clickLeftEdge(p, `${FONT_BAR} button:first-child`)
    assert.deepEqual(added, [])
  })
})

describe('rules too long for SudokuPad\'s size', { concurrency: false }, () => {
  let context, p, errors, own

  before(async () => {
    ;({ context, p, errors } = await rulesPage(LANDSCAPE, null, LONG_RULES))
    own = await pane(p)
    await inject(p)
  })
  after(async () => { await context.close() })

  it('widen the pane just enough to stop scrolling at SudokuPad\'s font size, short of the right edge', async () => {
    assert.equal(own.scrolls, true, 'scrolls in SudokuPad\'s own layout')
    const fitted = await settle(async () => (await pane(p)).scrolls, false)
    assert.equal(fitted, false, 'stopped scrolling')
    const now = await pane(p)
    assert.equal(now.font >= SUDOKUPAD_FONT_PX, true, `font ${now.font}, not under SudokuPad's own: widened before it shrank`)
    assert.equal(now.width > own.width, true, `width ${own.width} -> ${now.width}`)
    assert.equal(now.right < LANDSCAPE.width - EDGE_PX - 10, true, `right ${now.right}, short of the window's edge`)
    // Two css px narrower scrolls again.
    const scrollsNarrower = await p.evaluate((px) => {
      const rules = document.querySelector('.puzzle-rules')
      rules.style.width = `${px - 2}px`
      return rules.scrollHeight > rules.clientHeight
    }, now.cssWidth)
    assert.equal(scrollsNarrower, true)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

// Too long for SudokuPad's size even at the widest pane, short enough for 70% of it.
const MID_RULES = Array(24).fill(RULES).join(' ')

describe('rules that need the smaller text', { concurrency: false }, () => {
  let context, p, errors, own

  before(async () => {
    ;({ context, p, errors } = await rulesPage(LANDSCAPE, null, MID_RULES))
    own = await pane(p)
    await inject(p)
  })
  after(async () => { await context.close() })

  it('fill the height, then the width, and only then shrink the text, with no scroll bar', async () => {
    const fitted = await settle(async () => (await pane(p)).font < SUDOKUPAD_FONT_PX, true)
    assert.equal(fitted, true, `font ${(await pane(p)).font}`)
    const now = await stable(() => pane(p))
    assert.equal(now.scrolls, false, 'no scroll bar')
    assert.equal(now.font >= MIN_FONT_PX, true, `font ${now.font}, not under 70%`)
    assert.equal(now.width > own.width, true, `width ${own.width} -> ${now.width}`)
    assert.equal(now.right >= LANDSCAPE.width - EDGE_PX - 10, true, `right ${now.right}: as wide as the window allows`)
    assert.equal(now.cssHeight >= 0.85 * own.cssHeight, true, `pane ${now.cssHeight} css px tall, SudokuPad's own ${own.cssHeight}: the room is used, not given up for width`)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

describe('the max auto width and height', { concurrency: false }, () => {
  const saved = (width, height) => (page) => page.evaluate(([w, h, wKey, hKey]) => {
    if (w) Framework.setData(wKey, w)
    if (h) Framework.setData(hKey, h)
  }, [width, height, MAX_WIDTH_KEY, MAX_HEIGHT_KEY])

  describe('saved before the script starts, as after a reload', { concurrency: false }, () => {
    let context, p, errors

    // Saved as the script saves it, so a start that skipped the envelope would read no limit.
    before(async () => {
      ;({ context, p, errors } = await rulesPage(LANDSCAPE, saved({ v: 0, data: 500 }, null), WIDE_RULES))
      await inject(p)
    })
    after(async () => { await context.close() })

    it('the automatic width stops at the max, and the text shrinks to stop the scroll', async () => {
      assert.equal(await settle(async () => (await pane(p)).cssWidth, 500), 500)
      const capped = await settle(async () => (await pane(p)).font < SUDOKUPAD_FONT_PX, true)
      assert.equal(capped, true, `font ${(await pane(p)).font}: shrunk at the capped width`)
      assert.equal((await pane(p)).scrolls, false)
    })

    it('a corner drag goes past the max width', async () => {
      await dragCorner(p, 'ur', 120, 0)
      const wider = await settle(async () => (await pane(p)).cssWidth > 500, true)
      assert.equal(wider, true, `width ${(await pane(p)).cssWidth} after the drag`)
    })

    it('the page raised no error', () => {
      assert.deepEqual(errors, [])
    })
  })

  describe('a max height under what the rules need', { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ;({ context, p, errors } = await rulesPage(LANDSCAPE, saved(null, 50)))
      await inject(p)
    })
    after(async () => { await context.close() })

    it('shrinks the font to 70% of SudokuPad\'s, no further, and holds the pane to the max', async () => {
      assert.equal(await settle(() => p.locator(FONT_BAR).count(), 1), 1)
      const now = await stable(() => pane(p))
      assert.equal(now.font, MIN_FONT_PX)
      assert.equal(now.cssHeight <= 50, true, `pane ${now.cssHeight} css px tall under a max of 50`)
    })

    it('the page raised no error', () => {
      assert.deepEqual(errors, [])
    })
  })

  describe('set in the Rules Resizer dialog', { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ;({ context, p, errors } = await rulesPage(LANDSCAPE, null, WIDE_RULES))
      await inject(p)
    })
    after(async () => { await context.close() })

    // A saved limit is the data of its `{ v, data }` envelope; a limit saved bare would read undefined here.
    const data = (key) => p.evaluate((k) => { const saved = Framework.getData(k); return saved === null ? null : saved.data }, key)

    it('opens from the settings entry with both boxes empty, and typing in a box enters no digit on the board', async () => {
      await p.evaluate(() => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(0, 2)) })
      const entry = (await openSettings(p)).locator('button').filter({ hasText: 'Rules Resizer' })
      assert.equal((await entry.textContent()).trim(), 'Rules Resizer')
      await entry.click()
      await p.locator(MAX_WIDTH_INPUT).waitFor({ state: 'visible' })
      assert.equal((await p.locator('.dialog b').first().textContent()).trim(), 'Rules Resizer')
      assert.equal(await p.inputValue(MAX_WIDTH_INPUT), '')
      assert.equal(await p.inputValue(MAX_HEIGHT_INPUT), '')
      assert.equal((await p.locator('.dialog small').textContent()).trim(), `v${headerVersion(script)}`)
      const undoDepth = () => p.evaluate(() => Framework.app.puzzle.undoStack.length)
      const depthBefore = await undoDepth()
      await p.locator(MAX_WIDTH_INPUT).click()
      await p.keyboard.type('500')
      assert.equal(await p.inputValue(MAX_WIDTH_INPUT), '500')
      // A leaked 5-0-0 could leave the cell empty again (a repeated digit toggles off), so the board's undo history is what shows an entry.
      assert.equal(await undoDepth(), depthBefore, 'typing in the box entered nothing on the board')
    })

    it('Save keeps the limits and applies them at once', async () => {
      await p.locator(MAX_HEIGHT_INPUT).fill('50')
      await closeDialogWith(p, 'Save', MAX_WIDTH_INPUT)
      assert.equal(await data(MAX_WIDTH_KEY), 500)
      assert.equal(await data(MAX_HEIGHT_KEY), 50)
      assert.equal(await settle(async () => (await pane(p)).cssWidth, 500), 500)
    })

    it('a box holding no usable number keeps the saved limit', async () => {
      await openScriptDialog(p, 'Rules Resizer', MAX_WIDTH_INPUT)
      await p.locator(MAX_WIDTH_INPUT).evaluate((el) => { el.value = '0' })
      await closeDialogWith(p, 'Save', MAX_WIDTH_INPUT)
      assert.equal(await data(MAX_WIDTH_KEY), 500)
      assert.equal(await data(MAX_HEIGHT_KEY), 50)
    })

    it('shows the saved values on reopening, and clearing both and saving removes the keys and lifts the cap', async () => {
      await openScriptDialog(p, 'Rules Resizer', MAX_WIDTH_INPUT)
      assert.equal(await p.inputValue(MAX_WIDTH_INPUT), '500')
      assert.equal(await p.inputValue(MAX_HEIGHT_INPUT), '50')
      await p.locator(MAX_WIDTH_INPUT).fill('')
      await p.locator(MAX_HEIGHT_INPUT).fill('')
      await closeDialogWith(p, 'Save', MAX_WIDTH_INPUT)
      assert.equal(await data(MAX_WIDTH_KEY), null)
      assert.equal(await data(MAX_HEIGHT_KEY), null)
      assert.equal(await settle(async () => (await pane(p)).scrolls, false), false, 'uncapped: widened until it stops scrolling')
      assert.equal((await pane(p)).cssWidth > 500, true)
    })

    it('Cancel saves nothing', async () => {
      await openScriptDialog(p, 'Rules Resizer', MAX_WIDTH_INPUT)
      await p.locator(MAX_WIDTH_INPUT).fill('300')
      await closeDialogWith(p, 'Cancel', MAX_WIDTH_INPUT)
      assert.equal(await data(MAX_WIDTH_KEY), null)
    })

    it('the page raised no error', () => {
      assert.deepEqual(errors, [])
    })
  })
})

const READABLE_CHARS = 90
const COPY_ICON = '.rules-copy'

const lineStats = (p) => p.evaluate(() => {
  const rules = document.querySelector('.puzzle-rules')
  const style = window.getComputedStyle(rules)
  const lineHeight = parseFloat(style.lineHeight)
  const content = rules.scrollHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
  const lines = Math.round(content / lineHeight)
  return { lineHeight, font: parseFloat(style.fontSize), charsPerLine: rules.textContent.length / lines }
})

describe('the text of the fitted pane', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ;({ context, p, errors } = await rulesPage(LANDSCAPE))
    await inject(p)
    await settle(async () => (await fontPx(p)) > SUDOKUPAD_FONT_PX, true)
  })
  after(async () => { await context.close() })

  it('has a line height of 1.3 from the stylesheet, and the fit still leaves nothing to scroll', async () => {
    const text = await p.evaluate(() => {
      const rules = document.querySelector('.puzzle-rules')
      const style = window.getComputedStyle(rules)
      return { inline: rules.style.lineHeight, lineHeight: parseFloat(style.lineHeight), font: parseFloat(style.fontSize) }
    })
    assert.equal(text.inline, '', 'not an inline style, so a reader\'s own override can win')
    assert.equal(Math.abs(text.lineHeight - 1.3 * text.font) < 0.01, true, `line height ${text.lineHeight} at font ${text.font}`)
    assert.equal((await pane(p)).scrolls, false)
  })

  it('sets the text with pretty wrapping and automatic hyphens', async () => {
    const style = await p.evaluate(() => {
      const s = window.getComputedStyle(document.querySelector('.puzzle-rules'))
      return { wrap: s.textWrapStyle, hyphens: s.hyphens }
    })
    assert.deepEqual(style, { wrap: 'pretty', hyphens: 'auto' })
  })

  it('keeps the font bar off SudokuPad\'s copy icon', async () => {
    const boxes = await p.evaluate(([icon, bar]) => {
      const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }
      return { icon: rect(document.querySelector(icon)), bar: rect(document.querySelector(bar)) }
    }, [COPY_ICON, FONT_BAR])
    const apart = boxes.bar.left >= boxes.icon.right || boxes.bar.right <= boxes.icon.left || boxes.bar.top >= boxes.icon.bottom || boxes.bar.bottom <= boxes.icon.top
    assert.equal(apart, true, JSON.stringify(boxes))
  })

  it('refits when the rules change with no resize, as a support link or emoji images do', async () => {
    const before = await pane(p)
    await p.evaluate((extra) => {
      document.querySelector('.puzzle-rules').insertAdjacentHTML('afterbegin', `<a href="#">Support</a> ${extra} `)
    }, RULES.repeat(3))
    // The refit shrinks the font to hold the longer rules; the pane alone grows at once, scrolling, before it.
    const refitted = await settle(async () => (await pane(p)).font < before.font, true)
    assert.equal(refitted, true, `font ${(await pane(p)).font}, was ${before.font}`)
    assert.equal((await pane(p)).scrolls, false)
  })

  it('leaves a reader\'s own line height the last word, and the fit follows it', async () => {
    await p.addStyleTag({ content: '.puzzle-rules { line-height: 1.5 !important }' })
    await clickFont(p, 'f-')
    const spacing = await settle(async () => {
      const { lineHeight, font } = await lineStats(p)
      return Math.round((lineHeight / font) * 100) / 100
    }, 1.5)
    assert.equal(spacing, 1.5)
    assert.equal((await pane(p)).scrolls, false, 'the fit measured the larger line height')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

describe('the scrollbar track (a classic scrollbar, as Windows Chrome draws)', { concurrency: false }, () => {
  const classic = useBrowser({ ignoreDefaultArgs: ['--hide-scrollbars'] })

  const trackWidth = (p) => p.evaluate(() => {
    const rules = document.querySelector('.puzzle-rules')
    return { track: rules.offsetWidth - rules.clientWidth, overflowY: window.getComputedStyle(rules).overflowY }
  })

  async function classicPage (rules) {
    const opened = await openPage(classic(), { contextOptions: { viewport: LANDSCAPE } })
    await startPuzzle(opened.p)
    await opened.p.evaluate((text) => {
      Framework.app.showMetaInfoUI({ title: 'Arrows and dots', author: 'Tester', rules: text })
      Framework.app.resize()
    }, rules)
    return opened
  }

  it('is gone when the rules fit, and SudokuPad\'s scroll stays when they still scroll', async () => {
    const short = await classicPage(RULES)
    const longer = await classicPage(VERY_LONG_RULES)
    try {
      assert.equal((await trackWidth(short.p)).track > 0, true, 'SudokuPad\'s own pane draws a track')
      await inject(short.p)
      assert.deepEqual(await settle(() => trackWidth(short.p), { track: 0, overflowY: 'auto' }), { track: 0, overflowY: 'auto' })
      await inject(longer.p)
      const scrolling = await settle(async () => (await trackWidth(longer.p)).overflowY, 'scroll')
      assert.equal(scrolling, 'scroll')
      assert.equal((await trackWidth(longer.p)).track > 0, true)
    } finally {
      await short.context.close()
      await longer.context.close()
    }
  })
})

describe('very long rules (about 5,600 characters)', { concurrency: false }, () => {
  let context, p, errors, own

  before(async () => {
    ;({ context, p, errors } = await rulesPage(LANDSCAPE, null, VERY_LONG_RULES))
    own = await pane(p)
    await inject(p)
    await stable(() => pane(p))
  })
  after(async () => { await context.close() })

  it('are widened to 90 characters a line or fewer, and still scroll', async () => {
    const now = await pane(p)
    assert.equal(now.scrolls, true)
    assert.equal(now.font, MIN_FONT_PX, '70% of SudokuPad\'s size and it still scrolls')
    assert.equal(now.cssHeight >= own.cssHeight, true, `pane ${now.cssHeight} css px tall, SudokuPad's own ${own.cssHeight}: all the room`)
    const { charsPerLine } = await lineStats(p)
    assert.equal(charsPerLine <= READABLE_CHARS, true, `${charsPerLine} characters a line`)
    assert.equal(charsPerLine > READABLE_CHARS - 20, true, `${charsPerLine} characters a line: widened to the measure, not left narrow`)
  })

  it('f- goes no lower and f+ keeps them at 90 characters a line or fewer: the width follows the larger font', async () => {
    for (let i = 0; i < 3; i++) await clickFont(p, 'f-') // at the floor already: these presses are not kept
    for (let i = 0; i < 3; i++) await clickFont(p, 'f+')
    assert.equal(await settle(() => fontPx(p), MIN_FONT_PX + 3), MIN_FONT_PX + 3, 'f+ three times')
    const { charsPerLine } = await lineStats(p)
    assert.equal(charsPerLine <= READABLE_CHARS, true, `${charsPerLine} characters a line at ${await fontPx(p)} px`)
    assert.equal(charsPerLine > READABLE_CHARS - 20, true, `${charsPerLine} characters a line: widened with the font`)
    for (let i = 0; i < 3; i++) await clickFont(p, 'f-')
    assert.equal(await settle(() => fontPx(p), MIN_FONT_PX), MIN_FONT_PX, 'f- back')
  })

  it('keep the line at the top at the top after a resize', async () => {
    // The text offset of the line under the pane's top-left content corner; the width holds across both windows, so the lines break alike and the offset holds to a character or two. A pixel offset kept instead drifts a whole line (about 90).
    const topOffset = () => p.evaluate(() => {
      const rules = document.querySelector('.puzzle-rules')
      const r = rules.getBoundingClientRect()
      const style = window.getComputedStyle(rules)
      const at = document.caretPositionFromPoint(r.left + parseFloat(style.paddingLeft) + 2, r.top + parseFloat(style.paddingTop) + 2)
      return at.offset
    })
    // A line and a half down: the probe lands in the middle of a line, not on the border of two.
    const { lineHeight } = await lineStats(p)
    await p.evaluate((lh) => {
      const rules = document.querySelector('.puzzle-rules')
      rules.scrollTop = Math.round((rules.scrollHeight - rules.clientHeight) * 0.4 / lh) * lh + lh / 2
    }, lineHeight)
    const heldAt = await topOffset()
    assert.equal(heldAt > 500, true, `scrolled to text offset ${heldAt}`)
    // Read once the offset has held through the window's trailing refit.
    const refitTo = async (viewport) => {
      await p.setViewportSize(viewport)
      return stable(topOffset)
    }
    const smaller = await refitTo(SMALLER)
    assert.equal(Math.abs(smaller - heldAt) <= 10, true, `smaller window: text offset ${smaller}, the top line was at ${heldAt}`)
    const back = await refitTo(LANDSCAPE)
    assert.equal(Math.abs(back - heldAt) <= 10, true, `back in the first window: text offset ${back}, the top line was at ${heldAt}`)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

describe('rules with blank lines (SudokuPad sets each newline as a break)', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ;({ context, p, errors } = await rulesPage(LANDSCAPE, null, `Top.${'\n'.repeat(150)}Bottom.`))
    await inject(p)
    await stable(() => pane(p))
  })
  after(async () => { await context.close() })

  it('keep the blank line at the top at the top after resizes', async () => {
    const topIndex = () => p.evaluate(() => {
      const rules = document.querySelector('.puzzle-rules')
      const r = rules.getBoundingClientRect()
      const style = window.getComputedStyle(rules)
      const at = document.caretPositionFromPoint(r.left + parseFloat(style.paddingLeft) + 2, r.top + parseFloat(style.paddingTop) + 2)
      return { inRules: at.offsetNode === rules, offset: at.offset }
    })
    assert.equal((await pane(p)).scrolls, true, 'the blank lines scroll')
    await p.evaluate(() => {
      const rules = document.querySelector('.puzzle-rules')
      rules.scrollTop = (rules.scrollHeight - rules.clientHeight) * 0.5
    })
    const held = await topIndex()
    assert.deepEqual(held.inRules, true, 'the top of the pane is on a break of the pane itself')
    // A bigger font moves every blank line, so a kept pixel offset would put another one at the top.
    for (let i = 0; i < 4; i++) {
      await clickFont(p, 'f+')
      await stable(topIndex)
    }
    assert.deepEqual(await topIndex(), held, 'the same blank line is at the top after four larger fonts')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

describe('the first paint of the fit (#542, row 10)', { concurrency: false }, () => {
  it('never shows SudokuPad\'s size once the script is in: the fit runs in the same task as the layout', async () => {
    const { context, p, errors } = await openPage(browser(), { contextOptions: { viewport: LANDSCAPE } })
    try {
      await startPuzzle(p)
      await inject(p)
      await p.evaluate(() => {
        window.__frames = []
        const tick = () => {
          const rules = document.querySelector('.puzzle-rules')
          if (rules && rules.offsetWidth > 0) window.__frames.push(parseFloat(window.getComputedStyle(rules).fontSize))
          window.requestAnimationFrame(tick)
        }
        window.requestAnimationFrame(tick)
      })
      await p.evaluate((rules) => {
        Framework.app.showMetaInfoUI({ title: 'Arrows and dots', author: 'Tester', rules })
        Framework.app.resize()
      }, RULES)
      await settle(async () => (await p.evaluate(() => window.__frames.length)) >= 10, true)
      const frames = await p.evaluate(() => window.__frames)
      assert.equal(frames.length >= 10, true, `${frames.length} frames with the pane shown`)
      assert.deepEqual(frames.filter((font) => font === SUDOKUPAD_FONT_PX), [], 'frames at SudokuPad\'s own size')
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })
})

describe('a portrait window', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ;({ context, p, errors } = await rulesPage(PORTRAIT))
    await inject(p)
  })
  after(async () => { await context.close() })

  it('leaves the rules pane as SudokuPad has it, with no font buttons', async () => {
    assert.equal((await pane(p)).inlineFont, '')
    assert.equal(await p.locator(FONT_BAR).isVisible(), false)
  })

  it('fits the pane once the window turns landscape, and takes the fit off when it turns back', async () => {
    await p.setViewportSize(LANDSCAPE)
    assert.equal(await settle(async () => (await fontPx(p)) > SUDOKUPAD_FONT_PX, true), true, 'fitted in landscape')
    await hoverPane(p)
    assert.equal(await settle(() => p.locator(FONT_BAR).isVisible(), true), true, 'font buttons in landscape')
    await p.setViewportSize(PORTRAIT)
    assert.equal(await settle(async () => (await pane(p)).inlineFont, ''), '', 'the fit taken off in portrait')
    assert.equal(await fontPx(p), SUDOKUPAD_FONT_PX)
    assert.equal(await p.locator(FONT_BAR).isVisible(), false, 'no font buttons in portrait')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

describe('beside twitch-rules-scroller\'s sync script', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    // A page that still carries the sync script's font bar id must not stop the fit.
    ;({ context, p, errors } = await rulesPage(LANDSCAPE, (page) => page.evaluate(() => {
      const bar = document.createElement('div')
      bar.id = 'sudokupad-sync-nudge'
      document.body.appendChild(bar)
    })))
    await inject(p)
  })
  after(async () => { await context.close() })

  it('fits the rules pane and shows its font buttons with the sync script\'s bar id on the page', async () => {
    assert.equal(await settle(async () => (await fontPx(p)) > SUDOKUPAD_FONT_PX, true), true, 'fitted')
    await hoverPane(p)
    assert.equal(await settle(() => p.locator(FONT_BAR).isVisible(), true), true, 'font buttons')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

// A SudokuPad internal missing before the script loads turns off that feature alone: the console names it once, the bar at the bottom of
// the page names it with a Report link, and the rest of the script works. The snippet runs ahead of the script's own startup check and
// puts the internal back after it, so SudokuPad's own layout, which calls resize, still runs.
const MISSING = [
  { name: 'resize', internal: 'Framework.app.resize', off: 'rules refit', entry: true },
  { name: 'addSetting', internal: 'Framework.addSetting', off: 'max size settings', entry: false }
]
for (const kase of MISSING) {
  describe(`SudokuPad has no ${kase.internal}`, { concurrency: false }, () => {
    let context, p, errors
    const warned = []

    before(async () => {
      ;({ context, p, errors } = await rulesPage(LANDSCAPE, (page) => {
        page.on('console', (m) => { if (m.type() === 'warning' && WARNING.test(m.text())) warned.push(m.text()) })
      }, RULES, { expectedSkips: [WARNING] }))
      const breaks = `const owner = ${kase.internal.replace(/\.[^.]+$/, '')}
        const original = owner.${kase.name}
        owner.${kase.name} = undefined
        Framework.getApp().then(() => { owner.${kase.name} = original })`
      await p.addScriptTag({ content: `;Framework.getApp().then(() => { ${breaks} });\n${script}` })
      await p.locator(STYLE).waitFor({ state: 'attached' })
    })
    after(async () => { await context.close() })

    it('one console warning names the feature', async () => {
      assert.equal(await settle(async () => warned.length, 1), 1, warned.join('\n'))
      assert.equal(warned[0], `auto-rules-resizer: ${kase.off} skipped because SudokuPad has no ${kase.internal}`)
    })

    it('the bar names the feature with a Report link, and goes when dismissed', async () => {
      const bar = p.locator('#sudokupad-scripts-notices [data-script="auto-rules-resizer"]')
      assert.match(await bar.textContent(), new RegExp(`^Auto Rules Resizer: ${kase.off} is off — SudokuPad changed\\.Report`))
      assert.match(await bar.locator('a').getAttribute('href'), /^https:\/\/github\.com\/caneff\/sudokupad-scripts\/issues\/new\?title=/)
      await bar.locator('button[aria-label="Dismiss"]').click()
      assert.equal(await bar.count(), 0)
    })

    it('the other features still work: the rules are fitted, and the settings entry is there only when its feature is on', async () => {
      assert.equal(await settle(async () => (await fontPx(p)) > SUDOKUPAD_FONT_PX, true), true, 'fitted')
      await hoverPane(p)
      assert.equal(await settle(() => p.locator(FONT_BAR).isVisible(), true), true, 'font buttons')
      const group = await openSettings(p)
      assert.equal(await group.locator('button, [role=button]').filter({ hasText: /^\s*Rules Resizer\s*$/ }).count(), kase.entry ? 1 : 0, 'the Rules Resizer entry')
    })

    it('the page raised no error, and no further warning came', () => {
      assert.deepEqual(errors, [])
      assert.equal(warned.length, 1, warned.join('\n'))
    })
  })
}

// The controls column's scale: SudokuPad fits the column to the page, so a taller pane that SudokuPad measured would shrink it.
const columnScale = (p) => p.evaluate(() => {
  const controls = document.getElementById('controls')
  return controls.getBoundingClientRect().width / controls.offsetWidth
})
const logFrames = (p) => p.evaluate(() => {
  window.__frames = []
  const sample = () => {
    const controls = document.getElementById('controls')
    const rules = document.querySelector('.puzzle-rules')
    window.__frames.push({
      width: window.innerWidth,
      height: window.innerHeight,
      scale: controls.getBoundingClientRect().width / controls.offsetWidth,
      bottom: controls.getBoundingClientRect().bottom,
      pane: rules.getBoundingClientRect().height
    })
    window.requestAnimationFrame(sample)
  }
  window.requestAnimationFrame(sample)
})
const frames = (p) => p.evaluate(() => window.__frames)
const near = (a, b, within) => Math.abs(a - b) <= within

describe('the pane takes the page\'s spare height without SudokuPad shrinking the controls', { concurrency: false }, () => {
  let context, p, errors, own, off
  const WINDOWS = [LANDSCAPE, SMALLER]

  before(async () => {
    // The same page with the script off, for the scale and the pane SudokuPad lays out by itself at each window size.
    const bare = await rulesPage(LANDSCAPE, null, VERY_LONG_RULES)
    off = {}
    for (const size of WINDOWS) {
      await bare.p.setViewportSize(size)
      off[size.width] = await stable(async () => ({ scale: await columnScale(bare.p), pane: (await pane(bare.p)).cssHeight }))
    }
    await bare.context.close()
    ;({ context, p, errors } = await rulesPage(LANDSCAPE, null, VERY_LONG_RULES))
    own = await pane(p)
    await inject(p)
    await stable(() => pane(p))
  })
  after(async () => { await context.close() })

  it('the pane grows past SudokuPad\'s 14rem and the column ends at the window\'s bottom', async () => {
    const now = await stable(() => pane(p))
    assert.equal(now.cssHeight > 1.5 * own.cssHeight, true, `pane ${own.cssHeight} -> ${now.cssHeight} css px`)
    const { bottom } = await column(p)
    assert.equal(near(bottom, LANDSCAPE.height, 3), true, `column bottom ${bottom} in a ${LANDSCAPE.height} px window`)
  })

  it('the column keeps the scale it has with the script off', async () => {
    const scale = await columnScale(p)
    assert.equal(near(scale, off[LANDSCAPE.width].scale, 0.01), true, `scale ${scale}, script off ${off[LANDSCAPE.width].scale}`)
  })

  it('a window resize and a SudokuPad resize leave the same scale and pane height, and no frame between has the column rescaled', async () => {
    const heights = { [LANDSCAPE.width]: (await stable(() => pane(p))).height }
    await logFrames(p)
    for (const size of [SMALLER, LANDSCAPE]) {
      await p.setViewportSize(size)
      const want = off[size.width]
      const now = await settle(async () => {
        const { cssHeight } = await pane(p)
        return near(await columnScale(p), want.scale, 0.01) && cssHeight > want.pane
      }, true)
      assert.equal(now, true, `at ${size.width} px: scale ${await columnScale(p)}, script off ${want.scale}`)
      const settled = await stable(() => pane(p))
      if (size.width in heights) assert.equal(near(settled.height, heights[size.width], 1), true, `back at ${size.width} px the pane is ${settled.height} px tall, was ${heights[size.width]}`)
      heights[size.width] = settled.height
    }
    await p.evaluate(() => Framework.app.resize())
    await stable(() => pane(p))
    const seen = await frames(p)
    assert.equal(seen.length > 10, true, `${seen.length} frames sampled`)
    for (const f of seen) {
      assert.equal(near(f.scale, off[f.width].scale, 0.01), true, `a frame at ${f.width} px had the column at scale ${f.scale}, script off ${off[f.width].scale}`)
      assert.equal(f.bottom <= f.height + 1, true, `a frame at ${f.width} px had the column's bottom at ${f.bottom} in a ${f.height} px window`)
      assert.equal(near(f.pane, heights[f.width], 1), true, `a frame at ${f.width} px had the pane ${f.pane} px tall, settled at ${heights[f.width]}`)
    }
    assert.equal(near(await columnScale(p), off[LANDSCAPE.width].scale, 0.01), true)
  })

  it('a reload fits to the same pane height and scale, with no frame between the page\'s own layout and the fit', async () => {
    const first = await stable(() => pane(p))
    const again = await rulesPage(LANDSCAPE, null, VERY_LONG_RULES)
    try {
      await logFrames(again.p)
      await inject(again.p)
      const now = await stable(() => pane(again.p))
      assert.equal(near(now.cssHeight, first.cssHeight, 1), true, `pane ${first.cssHeight} -> ${now.cssHeight} css px`)
      assert.equal(near(await columnScale(again.p), off[LANDSCAPE.width].scale, 0.01), true)
      const seen = await frames(again.p)
      assert.equal(seen.length > 10, true, `${seen.length} frames sampled`)
      for (const f of seen) {
        assert.equal(near(f.scale, off[LANDSCAPE.width].scale, 0.01), true, `a frame had the column at scale ${f.scale}`)
        assert.equal(near(f.pane, now.height, 1) || near(f.pane, own.height, 1), true, `a frame had the pane ${f.pane} px tall: neither SudokuPad's ${own.height} nor the fit's ${now.height}`)
      }
      assert.deepEqual(again.errors, [])
    } finally {
      await again.context.close()
    }
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

// A puzzle's sizing (its font offset from f+ and f-, and its dragged pane) is kept under its own key and read back when the script starts, as
// after a reload, or when the puzzle is opened again. It is stored as `{ nudgePx, box }`.
describe('sizing kept per puzzle', { concurrency: false }, () => {
  const sizingKey = (p) => p.evaluate(() => 'AutoRulesResizer_sizing_' + String(Framework.app.puzzle.puzzleId || window.location.href))
  const savedSizing = async (p) => p.evaluate((key) => Framework.getData(key), await sizingKey(p))
  const seedSizing = (value) => async (p) => {
    const key = await sizingKey(p)
    await p.evaluate(([key, value]) => Framework.setData(key, value), [key, value])
  }
  const startedFont = async (seed, rules = FILLING_RULES) => {
    const opened = await rulesPage(LANDSCAPE, seed, rules)
    try {
      await inject(opened.p)
      const font = await settle(async () => (await pane(opened.p)).inlineFont !== '', true).then(() => fontPx(opened.p))
      return { ...opened, font }
    } catch (error) {
      await opened.context.close()
      throw error
    }
  }
  // The puzzle at `source` (the page's first path, which a load in place changes) loaded in place as a puzzle with `id`, the way SudokuPad's
  // own loadRemoteCTCPuzzle does it (the id first, then the puzzle), and FILLING_RULES shown on it: another puzzle in the same tab, with no
  // reload. SudokuPad loads Tag Manager again on a second puzzle in a tab; it is answered with an empty script, as `live/puzzles.mjs` does.
  const openInPlace = async (p, source, id) => {
    await p.route(/googletagmanager/, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
    await p.addScriptTag({ content: 'window.pageLoader = PuzzleLoader' })
    await p.evaluate(async ([key, as]) => {
      const { parsePuzzleData, fetchPuzzle } = window.pageLoader
      const data = await parsePuzzleData(await fetchPuzzle(key))
      Framework.app.puzzle.puzzleId = as
      await Framework.app.loadCTCPuzzle(data)
    }, [source, id])
    await p.evaluate((rules) => {
      Framework.app.showMetaInfoUI({ title: 'Arrows and dots', author: 'Tester', rules })
      Framework.app.resize()
    }, FILLING_RULES)
    await settle(async () => (await pane(p)).inlineFont !== '', true)
    return stable(() => pane(p))
  }
  const geometry = ({ left, right, top, bottom, font }) => ({ left, right, top, bottom, font })

  it('f+ saves the font offset under the puzzle\'s key, and a page that starts with it saved fits one px larger', async () => {
    const plain = await startedFont(null)
    try {
      assert.equal(await savedSizing(plain.p), null, 'a puzzle never resized saves nothing')
      await clickFont(plain.p, 'f+')
      assert.equal(await settle(() => fontPx(plain.p), plain.font + 1), plain.font + 1, 'f+')
      const saved = await savedSizing(plain.p)
      assert.deepEqual(saved, { v: 0, data: { nudgePx: 1, box: { w: 0, h: 0, x: 0, y: 0 } } })
      const again = await startedFont(seedSizing(saved))
      try {
        assert.equal(again.font, plain.font + 1, 'the reloaded puzzle keeps its font offset')
        assert.deepEqual(again.errors, [])
      } finally {
        await again.context.close()
      }
    } finally {
      await plain.context.close()
    }
  })

  it('a dragged pane is saved, and a page that starts with it saved shows the pane and the controls where the drag left them', async () => {
    const plain = await startedFont(null)
    try {
      await stable(() => pane(plain.p))
      await dragCorner(plain.p, 'ur', 0, -60)
      await dragCorner(plain.p, 'dl', -120, 0)
      const dragged = await stable(() => pane(plain.p))
      const moved = await controlsMoved(plain.p)
      const saved = await savedSizing(plain.p)
      assert.equal(saved.data.box.w > 0 && saved.data.box.h > 0, true, `a drag up and left is saved: ${JSON.stringify(saved)}`)
      const again = await startedFont(seedSizing(saved))
      try {
        assert.deepEqual(geometry(await stable(() => pane(again.p))), geometry(dragged))
        assert.equal(await controlsMoved(again.p), moved)
        assert.deepEqual(await savedSizing(again.p), saved, 'the start wrote nothing over it')
        assert.deepEqual(again.errors, [])
      } finally {
        await again.context.close()
      }
    } finally {
      await plain.context.close()
    }
  })

  // Saved in a larger window: the drag runs past the board here, and the automatic font of short rules is at the 150% cap, so neither
  // the drag nor the font offset applies in full.
  it('a fit that applies less of a saved sizing than was saved leaves the saved sizing as it was', async () => {
    const saved = { v: 0, data: { nudgePx: 2, box: { w: 900, h: 0, x: -900, y: 0 } } }
    const opened = await startedFont(seedSizing(saved), RULES)
    try {
      const now = await stable(() => pane(opened.p))
      assert.equal(now.left >= Math.floor(await boardRight(opened.p)), true, `the drag stopped at the board: pane left ${now.left}`)
      assert.equal(Math.abs(now.font - MAX_FONT_PX) < 0.01, true, `the font stopped at the cap: ${now.font}`)
      assert.deepEqual(await savedSizing(opened.p), saved)
      assert.deepEqual(opened.errors, [])
    } finally {
      await opened.context.close()
    }
  })

  it('a puzzle resized, then another opened in the same tab: the other starts at the default, and the first gets its sizing back', async () => {
    const opened = await startedFont(null)
    const { p } = opened
    try {
      const source = new URL(p.url()).pathname.slice(1)
      const fitted = await openInPlace(p, source, 'resizer-sizing-a')
      await clickFont(p, 'f+')
      assert.equal(await settle(() => fontPx(p), fitted.font + 1), fitted.font + 1, 'f+ on A')
      await dragCorner(p, 'dl', -120, 0)
      const resized = await stable(() => pane(p))
      assert.equal(resized.left < fitted.left, true, `A dragged wider: left ${fitted.left} -> ${resized.left}`)
      assert.deepEqual(geometry(await openInPlace(p, source, 'resizer-sizing-b')), geometry(fitted), 'B at the default')
      assert.equal(await savedSizing(p), null, 'nothing is saved under B')
      assert.deepEqual(geometry(await openInPlace(p, source, 'resizer-sizing-a')), geometry(resized), 'A as it was resized')
      assert.deepEqual(opened.errors, [])
    } finally {
      await opened.context.close()
    }
  })

  it('an unreadable saved sizing is kept aside and the puzzle starts at the default', async () => {
    const plain = await startedFont(null)
    const bad = { v: 0, data: { nudgePx: 'big' } }
    const opened = await startedFont(seedSizing(bad))
    try {
      assert.equal(opened.font, plain.font)
      const key = await sizingKey(opened.p)
      assert.deepEqual(await opened.p.evaluate((key) => Framework.getData(key + '_unreadable'), key), bad)
    } finally {
      await plain.context.close()
      await opened.context.close()
    }
  })

  it('Restore defaults in the dialog clears the puzzle\'s sizing', async () => {
    const opened = await startedFont(null)
    const { p } = opened
    try {
      await clickFont(p, 'f+')
      await settle(async () => (await savedSizing(p)) !== null, true)
      await openScriptDialog(p, 'Rules Resizer', MAX_WIDTH_INPUT)
      await p.getByRole('button', { name: 'Restore defaults' }).click()
      assert.equal(await settle(async () => (await savedSizing(p)) === null, true), true, 'the key is gone')
      assert.equal(await settle(() => fontPx(p), opened.font), opened.font, 'back at the automatic size')
    } finally {
      await opened.context.close()
    }
  })
})
