// Live check of text-anywhere.user.js's motion and precision touches on sudokupad.app (#535): the cursor holds during a drag or a resize, the hover outline and the
// handles fade in, a deleted note leaves at once, an empty new note shows a faint box, and a
// note's drawn left and top land on whole device pixels after a move, a nudge or a resize. Reduced motion makes the fade in instant. Real mouse and keyboard input.
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { useBrowser } from '../session.mjs'
import { gridPoint } from '../board.mjs'

const { CLEAR_BUTTON, HANDLES: HANDLE, TEXTS, TEXT_BOX, middleOf, pickTextAnywhere } = textAnywhere
const ITEMS = [
  { kind: 'text', color: 1, size: 20, opacity: 100, text: 'alpha', at: [160, 160] },
  { kind: 'text', color: 2, size: 20, opacity: 100, text: 'bravo', at: [352, 160] },
  { kind: 'text', color: 3, size: 20, opacity: 100, text: 'charlie', at: [160, 352] },
  { kind: 'text', color: 4, size: 20, opacity: 100, text: 'delta', at: [352, 352] }
]
const EMPTY_AT = [7.5, 7.5]
const FADE_IN_S = '0.08s'
const FADE_IN_CURVE = 'cubic-bezier(0, 0, 0, 1)'
const DEVICE_PIXEL_RATIO = 1.25
const WHOLE_DEVICE_PX = 0.02

const browser = useBrowser()

describe('Text Anywhere\'s motion and precision touches', { concurrency: false }, () => {
  let context, p

  const noteMiddle = async (text) => middleOf(await p.locator(TEXTS, { hasText: text }).boundingBox())
  const reset = async () => {
    await textAnywhere.forgetNotes(p)
    await textAnywhere.plantNotes(p, ITEMS)
    await textAnywhere.reload(p)
    await pickTextAnywhere(p)
  }
  const cursorsAt = ([x, y]) => p.evaluate(([px, py]) => [document.elementFromPoint(px, py), document.body].map((e) => window.getComputedStyle(e).cursor), [x, y])
  const durationOf = (selector) => p.evaluate((s) => window.getComputedStyle(document.querySelector(s)).transitionDuration, selector)
  const drawnLeftTop = (text) => p.evaluate(([selector, want, ratio]) => {
    const { left, top } = [...document.querySelectorAll(selector)].find((e) => e.textContent === want).getBoundingClientRect()
    return [left * ratio, top * ratio]
  }, [TEXTS, text, DEVICE_PIXEL_RATIO])
  const isWhole = ([x, y]) => [x, y].every((v) => Math.abs(v - Math.round(v)) < WHOLE_DEVICE_PX)
  const savedTexts = async () => (await textAnywhere.saved(p)).map((item) => item.text)

  before(async () => {
    ;({ context, p } = await textAnywhere.open(browser(), { contextOptions: { viewport: { width: 1200, height: 900 }, deviceScaleFactor: DEVICE_PIXEL_RATIO } }))
  })
  after(async () => { await context.close() })

  describe('the cursor', () => {
    before(reset)

    it('is move everywhere on the page while a note is dragged, with the pointer off the note, and goes with the release', async () => {
      const [x, y] = await noteMiddle('alpha')
      const far = await gridPoint(p, [8.5, 2.5])
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.move(...far, { steps: 6 })
      assert.deepEqual(await cursorsAt(far), ['move', 'move'])
      await p.mouse.up()
      assert.notDeepEqual(await cursorsAt(far), ['move', 'move'])
    })

    it('stays the handle\'s resize cursor while a handle is dragged with the pointer off the handle', async () => {
      await p.mouse.click(...await noteMiddle('delta'))
      const [hx, hy] = middleOf(await p.locator(HANDLE).nth(3).boundingBox())
      const handleCursor = await p.evaluate(([px, py]) => window.getComputedStyle(document.elementFromPoint(px, py)).cursor, [hx, hy])
      assert.match(handleCursor, /resize$/)
      const far = await gridPoint(p, [4.5, 8.5])
      await p.mouse.move(hx, hy)
      await p.mouse.down()
      await p.mouse.move(...far, { steps: 6 })
      assert.deepEqual(await cursorsAt(far), [handleCursor, handleCursor])
      await p.mouse.up()
      assert.notDeepEqual(await cursorsAt(far), [handleCursor, handleCursor])
    })
  })

  describe('the fade in', () => {
    before(reset)

    const hoverTiming = () => p.evaluate(() => {
      const style = window.getComputedStyle(document.querySelector('#text-anywhere-layer .text-anywhere-text:hover'))
      return [style.transitionDuration, style.transitionTimingFunction]
    })
    // Watches the layer for the next handle added and reads its opacity in the same task, as the page's own script leaves it.
    const watchHandleOpacity = () => p.evaluate((selector) => {
      window.handleOpacity = new Promise((resolve) => {
        new window.MutationObserver((_, observer) => {
          const handle = document.querySelector(selector)
          if (!handle) return
          observer.disconnect()
          resolve(Number(window.getComputedStyle(handle).opacity))
        }).observe(document.querySelector('#text-anywhere-layer'), { childList: true })
      })
    }, HANDLE)

    it('the hover outline takes 80 ms to appear, and the handles start clear and take 80 ms to appear, on the decelerate curve', async () => {
      await p.mouse.move(...await noteMiddle('bravo'))
      assert.deepEqual(await hoverTiming(), [FADE_IN_S, FADE_IN_CURVE])
      await watchHandleOpacity()
      await p.mouse.click(...await noteMiddle('bravo'))
      await p.locator(HANDLE).first().waitFor()
      assert.equal(await p.evaluate(() => window.handleOpacity) < 0.5, true, 'a new handle is clear when it appears')
      assert.equal(await durationOf(HANDLE), FADE_IN_S)
      assert.equal(await p.evaluate((selector) => window.getComputedStyle(document.querySelector(selector)).transitionTimingFunction, HANDLE), FADE_IN_CURVE)
    })

    it('with reduced motion they are instant', async () => {
      await p.emulateMedia({ reducedMotion: 'reduce' })
      try {
        await p.mouse.move(...await noteMiddle('charlie'))
        assert.equal((await hoverTiming())[0], '0s')
        assert.equal(await durationOf(HANDLE), '0s')
      } finally {
        await p.emulateMedia({ reducedMotion: 'no-preference' })
      }
    })
  })

  describe('a deleted note', () => {
    beforeEach(reset)

    const lingersAfter = async (text, act) => {
      await act()
      return p.evaluate(([selector, want]) => [...document.querySelectorAll(selector)].some((e) => e.textContent === want), [TEXTS, text])
    }

    it('goes at once on a right click', async () => {
      const [x, y] = await noteMiddle('alpha')
      await p.mouse.move(x, y)
      assert.equal(await lingersAfter('alpha', () => p.mouse.click(x, y, { button: 'right' })), false)
      assert.equal((await savedTexts()).includes('alpha'), false)
    })

    it('goes at once on the trash button', async () => {
      await p.mouse.click(...await noteMiddle('bravo'))
      assert.equal(await lingersAfter('bravo', () => p.click(CLEAR_BUTTON)), false)
      assert.equal((await savedTexts()).includes('bravo'), false)
    })

    it('goes at once on the Delete key', async () => {
      await p.mouse.click(...await noteMiddle('charlie'))
      assert.equal(await lingersAfter('charlie', () => p.keyboard.press('Delete')), false)
      assert.equal((await savedTexts()).includes('charlie'), false)
    })
  })

  describe('a new, empty note', () => {
    before(reset)

    const faintBox = () => p.evaluate((selector) => {
      const style = window.getComputedStyle(document.querySelector(selector))
      return { width: style.outlineWidth, style: style.outlineStyle, minWidth: parseFloat(style.minWidth), em: parseFloat(style.fontSize), color: style.outlineColor }
    }, TEXT_BOX)

    it('shows a 1 px box in its color at about 30%, at least 1 em wide, which the first key takes away and emptying it brings back', async () => {
      await p.mouse.click(...await gridPoint(p, EMPTY_AT))
      await p.locator(TEXT_BOX).waitFor()
      const empty = await faintBox()
      assert.equal(empty.style, 'solid')
      assert.equal(empty.width, '1px')
      assert.equal(empty.minWidth >= empty.em, true, `min-width ${empty.minWidth} is at least 1 em, ${empty.em}`)
      assert.match(empty.color, /0\.3\)?$/, `the box color ${empty.color} is at 30%`)
      await p.keyboard.type('x')
      assert.notEqual((await faintBox()).style, 'solid')
      await p.keyboard.press('Backspace')
      assert.equal((await faintBox()).style, 'solid')
      await p.keyboard.press('Escape')
    })
  })

  describe('whole device pixels', () => {
    before(reset)

    it('a note dragged to a fractional point lands with its left and top on whole device pixels', async () => {
      const [x, y] = await noteMiddle('alpha')
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.move(x + 123.37, y + 87.61, { steps: 7 })
      await p.mouse.up()
      assert.equal(isWhole(await drawnLeftTop('alpha')), true, `${await drawnLeftTop('alpha')} device pixels`)
    })

    it('stays on whole device pixels after a nudge', async () => {
      await p.keyboard.press('ArrowRight')
      await p.keyboard.up('ArrowRight')
      assert.equal(isWhole(await drawnLeftTop('alpha')), true, `${await drawnLeftTop('alpha')} device pixels`)
    })

    it('stays on whole device pixels after a resize', async () => {
      const [hx, hy] = middleOf(await p.locator(HANDLE).nth(3).boundingBox())
      await p.mouse.move(hx, hy)
      await p.mouse.down()
      await p.mouse.move(hx + 41.3, hy + 23.7, { steps: 5 })
      await p.mouse.up()
      assert.equal(isWhole(await drawnLeftTop('alpha')), true, `${await drawnLeftTop('alpha')} device pixels`)
    })

    it('stays on whole device pixels after a double-click on a handle sends the note back to auto size', async () => {
      await p.mouse.dblclick(...middleOf(await p.locator(HANDLE).nth(3).boundingBox()))
      assert.equal(isWhole(await drawnLeftTop('alpha')), true, `${await drawnLeftTop('alpha')} device pixels`)
    })

    it('stays on whole device pixels after a resize while the note is open, once it closes', async () => {
      await p.mouse.dblclick(...await noteMiddle('bravo'))
      await p.locator(TEXT_BOX).waitFor()
      const [hx, hy] = middleOf(await p.locator(HANDLE).nth(3).boundingBox())
      await p.mouse.move(hx, hy)
      await p.mouse.down()
      await p.mouse.move(hx + 37.3, hy + 19.7, { steps: 5 })
      await p.mouse.up()
      await p.keyboard.press('Escape')
      await p.locator(TEXT_BOX).waitFor({ state: 'detached' })
      assert.equal(isWhole(await drawnLeftTop('bravo')), true, `${await drawnLeftTop('bravo')} device pixels`)
    })
  })

  describe('a nudge where a device pixel is wider than a screen pixel', () => {
    let halfContext, half

    before(async () => {
      ;({ context: halfContext, p: half } = await textAnywhere.open(browser(), { contextOptions: { viewport: { width: 1200, height: 900 }, deviceScaleFactor: 0.5 } }))
      await textAnywhere.forgetNotes(half)
      await textAnywhere.plantNotes(half, ITEMS)
      await textAnywhere.reload(half)
      await pickTextAnywhere(half)
    })
    after(async () => { await halfContext.close() })

    it('moves the note by one screen pixel for each tap, in either direction', async () => {
      const leftOf = async () => (await half.locator(TEXTS, { hasText: 'alpha' }).boundingBox()).x
      await half.mouse.click(...middleOf(await half.locator(TEXTS, { hasText: 'alpha' }).boundingBox()))
      const start = await leftOf()
      for (const [key, expected] of [['ArrowLeft', -1], ['ArrowLeft', -2], ['ArrowRight', -1]]) {
        await half.keyboard.press(key)
        await half.keyboard.up(key)
        assert.equal(Math.abs(await leftOf() - start - expected) < 0.1, true, `after ${key}, ${await leftOf() - start} px from the start, not ${expected}`)
      }
    })
  })
})
