// Live check of auto-rules-resizer.user.js on sudokupad.app, in headless Chromium. The recorded puzzle has no rules,
// so each page is given short rules through SudokuPad's own showMetaInfoUI, as a loaded puzzle gets them, before the
// script is injected.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from '../page.mjs'
import { clickLeftEdge, openPenTool } from '../pen.mjs'
import { settle, stable } from '../settle.mjs'
import { closeDialogWith, headerVersion, openScriptDialog, openSettings } from '../settings.mjs'

const script = readFileSync(new URL('../../auto-rules-resizer.user.js', import.meta.url), 'utf8')

// Three lines at SudokuPad's own width in a 1920 x 1080 window, well under its 14rem cap: short rules.
const RULES = 'Normal sudoku rules apply. Digits along an arrow sum to the digit in its circle. Cells separated by a white dot contain consecutive digits.'
const LANDSCAPE = { width: 1920, height: 1080 }
const SMALLER = { width: 1600, height: 900 }
// Four times as long: too long for SudokuPad's own size at its own width, so the fit widens the pane.
const LONG_RULES = Array(4).fill(RULES).join(' ')
const MAX_WIDTH_KEY = 'AutoRulesResizer_maxWidth'
const MAX_HEIGHT_KEY = 'AutoRulesResizer_maxHeight'
const MAX_WIDTH_INPUT = '#auto-rules-resizer-max-width'
const MAX_HEIGHT_INPUT = '#auto-rules-resizer-max-height'
// SudokuPad's own rules font (1.1rem), and the gap the script keeps to the window's right edge.
const SUDOKUPAD_FONT_PX = 17.6
const EDGE_PX = 8
const PORTRAIT = { width: 800, height: 1100 }
const STYLE = '#auto-rules-resizer-style'
const FONT_BAR = '#auto-rules-resizer-font'
const CORNER = (corner) => `#auto-rules-resizer-drag-${corner}`

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// A page in a `viewport` window with the puzzle started and RULES shown. `seed()` runs before the script goes in.
async function rulesPage (viewport, seed, rules = RULES) {
  const opened = await openPage(browser, { contextOptions: { viewport } })
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
    width: Math.round(r.width),
    cssWidth: rules.offsetWidth,
    cssHeight: rules.offsetHeight,
    scrolls: rules.scrollHeight > rules.clientHeight
  }
})
const fontPx = async (p) => (await pane(p)).font
const controlsMoved = (p) => p.evaluate(() => document.getElementById('controls').style.translate)
// The controls column's top and bottom, in visual px.
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

describe('a landscape window, short rules', { concurrency: false }, () => {
  let context, p, errors, own

  before(async () => {
    ;({ context, p, errors } = await rulesPage(LANDSCAPE))
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
    await p.mouse.move(200, 500) // over the board
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
    await p.mouse.move(200, 500) // over the board
    assert.deepEqual(await settle(shown, [false, false]), [false, false], 'pointer on the board')
    const now = await pane(p)
    await p.mouse.move((now.left + now.right) / 2, (now.top + now.bottom) / 2)
    assert.deepEqual(await settle(shown, [true, true]), [true, true], 'pointer on the pane')
  })

  it('the top-right corner grows the pane up and moves the controls up with it', async () => {
    const start = await pane(p)
    await dragCorner(p, 'ur', 0, -60)
    assert.equal(await settle(() => controlsMoved(p), '0px -60px'), '0px -60px')
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
    assert.equal(now.font >= SUDOKUPAD_FONT_PX, true, `font ${now.font}, never under SudokuPad's own`)
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

describe('the max auto width and height', { concurrency: false }, () => {
  const saved = (width, height) => (page) => page.evaluate(([w, h, wKey, hKey]) => {
    if (w) Framework.setData(wKey, w)
    if (h) Framework.setData(hKey, h)
  }, [width, height, MAX_WIDTH_KEY, MAX_HEIGHT_KEY])

  describe('saved before the script starts, as after a reload', { concurrency: false }, () => {
    let context, p, errors

    // Saved as the script saves it, so a start that skipped the envelope would read no limit.
    before(async () => {
      ;({ context, p, errors } = await rulesPage(LANDSCAPE, saved({ v: 0, data: 500 }, null), LONG_RULES))
      await inject(p)
    })
    after(async () => { await context.close() })

    it('the automatic width stops at the max, with the rules still scrolling', async () => {
      assert.equal(await settle(async () => (await pane(p)).cssWidth, 500), 500)
      assert.equal((await pane(p)).scrolls, true)
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

    it('leaves the font at SudokuPad\'s own, never under it, and holds the pane to the max', async () => {
      assert.equal(await settle(() => p.locator(FONT_BAR).count(), 1), 1)
      const now = await stable(() => pane(p))
      assert.equal(now.font, SUDOKUPAD_FONT_PX)
      assert.equal(now.cssHeight <= 50, true, `pane ${now.cssHeight} css px tall under a max of 50`)
    })

    it('the page raised no error', () => {
      assert.deepEqual(errors, [])
    })
  })

  describe('set in the Rules Resizer dialog', { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ;({ context, p, errors } = await rulesPage(LANDSCAPE, null, LONG_RULES))
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
      await p.locator(MAX_WIDTH_INPUT).click()
      await p.keyboard.type('500')
      assert.equal(await p.inputValue(MAX_WIDTH_INPUT), '500')
      const cell = await p.evaluate(() => Framework.app.grid.getCell(0, 2).value)
      assert.equal(cell === undefined || cell === null || cell === 0 || cell === '', true, `cell holds ${cell}`)
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

// About 5,600 characters: no width the window allows stops the scroll.
const VERY_LONG_RULES = Array(40).fill(RULES).join(' ')
const READABLE_CHARS = 90
const COPY_ICON = '.rules-copy'

// Characters a line on average and the line height in css px, from the pane's text and its laid-out height.
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
    const before = (await pane(p)).cssWidth
    await p.evaluate((extra) => {
      document.querySelector('.puzzle-rules').insertAdjacentHTML('afterbegin', `<a href="#">Support</a> ${extra} `)
    }, RULES.repeat(3))
    const wider = await settle(async () => (await pane(p)).cssWidth > before, true)
    assert.equal(wider, true, `width ${(await pane(p)).cssWidth}, was ${before}`)
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
  let classic
  before(async () => { classic = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] }) })
  after(async () => { await classic?.close() })

  const trackWidth = (p) => p.evaluate(() => {
    const rules = document.querySelector('.puzzle-rules')
    return { track: rules.offsetWidth - rules.clientWidth, overflowY: window.getComputedStyle(rules).overflowY }
  })

  async function classicPage (rules) {
    const opened = await openPage(classic, { contextOptions: { viewport: LANDSCAPE } })
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
  let context, p, errors

  before(async () => {
    ;({ context, p, errors } = await rulesPage(LANDSCAPE, null, VERY_LONG_RULES))
    await inject(p)
    await stable(() => pane(p))
  })
  after(async () => { await context.close() })

  it('are widened to 90 characters a line or fewer, and still scroll', async () => {
    const now = await pane(p)
    assert.equal(now.scrolls, true)
    assert.equal(now.font, SUDOKUPAD_FONT_PX)
    const { charsPerLine } = await lineStats(p)
    assert.equal(charsPerLine <= READABLE_CHARS, true, `${charsPerLine} characters a line`)
    assert.equal(charsPerLine > READABLE_CHARS - 20, true, `${charsPerLine} characters a line: widened to the measure, not left narrow`)
  })

  it('f- keeps them at 90 characters a line or fewer: the width follows the smaller font', async () => {
    for (let i = 0; i < 3; i++) await clickFont(p, 'f-')
    assert.equal(await settle(() => fontPx(p), 14.6), 14.6, 'f- three times, from SudokuPad\'s 17.6')
    const { charsPerLine } = await lineStats(p)
    assert.equal(charsPerLine <= READABLE_CHARS, true, `${charsPerLine} characters a line at ${await fontPx(p)} px`)
    assert.equal(charsPerLine > READABLE_CHARS - 20, true, `${charsPerLine} characters a line: narrowed with the font, not left wide`)
    for (let i = 0; i < 3; i++) await clickFont(p, 'f+')
    assert.equal(await settle(() => fontPx(p), SUDOKUPAD_FONT_PX), SUDOKUPAD_FONT_PX, 'f+ back')
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
    await p.evaluate(() => {
      const rules = document.querySelector('.puzzle-rules')
      rules.scrollTop = (rules.scrollHeight - rules.clientHeight) * 0.4
    })
    const heldAt = await topOffset()
    assert.equal(heldAt > 1000, true, `scrolled to text offset ${heldAt}`)
    // Read once the offset has held through the window's trailing refit.
    const refitTo = async (viewport) => {
      await p.setViewportSize(viewport)
      return stable(topOffset)
    }
    assert.equal(Math.abs((await refitTo(SMALLER)) - heldAt) <= 10, true, `smaller window: the top line was at text offset ${heldAt}`)
    assert.equal(Math.abs((await refitTo(LANDSCAPE)) - heldAt) <= 10, true, `back in the first window: the top line was at text offset ${heldAt}`)
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
    const { context, p, errors } = await openPage(browser, { contextOptions: { viewport: LANDSCAPE } })
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
// puts the internal back after it, so SudokuPad's own layout, which calls resizeBoard, still runs.
const MISSING = [
  { name: 'resizeBoard', internal: 'Framework.app.resizeBoard', off: 'rules refit', entry: true },
  { name: 'addSetting', internal: 'Framework.addSetting', off: 'max size settings', entry: false }
]
for (const kase of MISSING) {
  describe(`SudokuPad has no ${kase.internal}`, { concurrency: false }, () => {
    let context, p, errors
    const warned = []

    before(async () => {
      ;({ context, p, errors } = await rulesPage(LANDSCAPE, (page) => {
        page.on('console', (m) => { if (m.type() === 'warning' && /^auto-rules-resizer: /.test(m.text())) warned.push(m.text()) })
      }))
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
