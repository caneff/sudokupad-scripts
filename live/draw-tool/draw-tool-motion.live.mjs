// Live check of draw-tool.user.js's motion and precision touches on sudokupad.app (#535): the cursor holds during a drag or a resize, the hover outline and the
// handles fade in, a note erased by the right button or the trash button fades out while the Delete key deletes at once, an empty new note shows a faint box, and a
// note's drawn left and top land on whole device pixels after a move, a nudge or a resize. Reduced motion makes every fade instant. Real mouse and keyboard input.
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'

const { CLEAR_BUTTON, TEXTS, TEXT_BOX, pickDraw } = draw
const HANDLE = '#draw-tool-layer .draw-tool-resize'
const ITEMS = [
  { kind: 'text', color: 1, size: 20, opacity: 100, text: 'alpha', at: [160, 160] },
  { kind: 'text', color: 2, size: 20, opacity: 100, text: 'bravo', at: [352, 160] },
  { kind: 'text', color: 3, size: 20, opacity: 100, text: 'charlie', at: [160, 352] },
  { kind: 'text', color: 4, size: 20, opacity: 100, text: 'delta', at: [352, 352] }
]
const EMPTY_AT = [7.5, 7.5]
const FADE_IN_S = '0.08s'
// Well past the 120 ms fade out, so a note's element that has not left the page by then never will.
const GONE_MS = 500
const DEVICE_PIXEL_RATIO = 1.25
const WHOLE_DEVICE_PX = 0.02

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s motion and precision touches', { concurrency: false }, () => {
  let context, p

  const noteMiddle = async (text) => {
    const { x, y, width, height } = await p.locator(TEXTS, { hasText: text }).boundingBox()
    return [x + width / 2, y + height / 2]
  }
  const reset = async () => {
    await draw.forgetDrawings(p)
    await draw.plantDrawing(p, ITEMS)
    await draw.reload(p)
    await pickDraw(p)
  }
  // The computed cursor of the element under the page point `[x, y]` and of the body.
  const cursorsAt = ([x, y]) => p.evaluate(([px, py]) => [document.elementFromPoint(px, py), document.body].map((e) => window.getComputedStyle(e).cursor), [x, y])
  const durationOf = (selector) => p.evaluate((s) => window.getComputedStyle(document.querySelector(s)).transitionDuration, selector)
  const drawnLeftTop = (text) => p.evaluate(([selector, want, ratio]) => {
    const { left, top } = [...document.querySelectorAll(selector)].find((e) => e.textContent === want).getBoundingClientRect()
    return [left * ratio, top * ratio]
  }, [TEXTS, text, DEVICE_PIXEL_RATIO])
  const isWhole = ([x, y]) => [x, y].every((v) => Math.abs(v - Math.round(v)) < WHOLE_DEVICE_PX)
  const savedTexts = async () => (await draw.saved(p)).map((item) => item.text)

  before(async () => {
    ;({ context, p } = await openPage(browser, { contextOptions: { viewport: { width: 1200, height: 900 }, deviceScaleFactor: DEVICE_PIXEL_RATIO } }))
    await draw.boot(p)
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
      const handle = await p.locator(HANDLE).nth(3).boundingBox()
      const [hx, hy] = [handle.x + handle.width / 2, handle.y + handle.height / 2]
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

    it('the hover outline and the resize handles take 80 ms to appear', async () => {
      await p.mouse.move(...await noteMiddle('bravo'))
      assert.equal(await p.evaluate(() => window.getComputedStyle(document.querySelector('#draw-tool-layer .draw-tool-text:hover')).transitionDuration), FADE_IN_S)
      await p.mouse.click(...await noteMiddle('bravo'))
      await p.locator(HANDLE).first().waitFor()
      assert.equal(await durationOf(HANDLE), FADE_IN_S)
    })

    it('with reduced motion they are instant', async () => {
      await p.emulateMedia({ reducedMotion: 'reduce' })
      try {
        await p.mouse.move(...await noteMiddle('charlie'))
        assert.equal(await p.evaluate(() => window.getComputedStyle(document.querySelector('#draw-tool-layer .draw-tool-text:hover')).transitionDuration), '0s')
        assert.equal(await durationOf(HANDLE), '0s')
      } finally {
        await p.emulateMedia({ reducedMotion: 'no-preference' })
      }
    })
  })

  describe('a deleted note', () => {
    beforeEach(reset)

    // Whether the note's element is still in the page, and if so whether it takes the pointer, right after `act`.
    const afterDelete = async (text, act) => {
      await act()
      return p.evaluate(([selector, want]) => {
        const element = [...document.querySelectorAll(selector)].find((e) => e.textContent === want)
        return element ? { lingers: true, pointer: window.getComputedStyle(element).pointerEvents, fade: window.getComputedStyle(element).transitionDuration } : { lingers: false }
      }, [TEXTS, text])
    }

    // Starts timing the removal of the note that reads `text` from the page: how long after the next press its element leaves the page.
    const timeRemoval = (text) => p.evaluate(([selector, want]) => {
      const element = [...document.querySelectorAll(selector)].find((e) => e.textContent === want)
      window.removal = new Promise((resolve) => {
        let pressed = null
        window.addEventListener('mousedown', () => { pressed = performance.now() }, { capture: true, once: true })
        new window.MutationObserver((_, observer) => {
          if (element.isConnected) return
          observer.disconnect()
          resolve(performance.now() - pressed)
        }).observe(element.parentElement, { childList: true })
      })
    }, [TEXTS, text])
    const removalMs = () => p.evaluate(() => window.removal)

    it('lingers about 120 ms on a right click, takes no pointer meanwhile, and the drawing lacks it at once', async () => {
      const [x, y] = await noteMiddle('alpha')
      await p.mouse.move(x, y)
      await timeRemoval('alpha')
      await p.mouse.click(x, y, { button: 'right' })
      assert.equal((await savedTexts()).includes('alpha'), false)
      const ms = await removalMs()
      assert.equal(ms >= 100 && ms < GONE_MS, true, `the element left the page ${ms} ms after the press`)
    })

    it('lingers the same way on the trash button', async () => {
      await p.mouse.click(...await noteMiddle('bravo'))
      await timeRemoval('bravo')
      await p.click(CLEAR_BUTTON)
      assert.equal((await savedTexts()).includes('bravo'), false)
      const ms = await removalMs()
      assert.equal(ms >= 100 && ms < GONE_MS, true, `the element left the page ${ms} ms after the press`)
    })

    it('takes no pointer while it fades', async () => {
      const [x, y] = await noteMiddle('alpha')
      await p.mouse.move(x, y)
      await p.mouse.click(x, y, { button: 'right' })
      const state = await p.evaluate(([selector, want]) => {
        const element = [...document.querySelectorAll(selector)].find((e) => e.textContent === want)
        return element ? window.getComputedStyle(element).pointerEvents : 'gone'
      }, ['#draw-tool-layer .draw-tool-text', 'alpha'])
      assert.equal(['none', 'gone'].includes(state), true, `pointer-events was ${state}`)
    })

    it('goes at once on the Delete key, with no fade', async () => {
      await p.mouse.click(...await noteMiddle('charlie'))
      const state = await afterDelete('charlie', () => p.keyboard.press('Delete'))
      assert.deepEqual(state, { lingers: false })
      assert.equal((await savedTexts()).includes('charlie'), false)
    })

    it('with reduced motion goes at once on a right click too', async () => {
      await p.emulateMedia({ reducedMotion: 'reduce' })
      try {
        const [x, y] = await noteMiddle('delta')
        await p.mouse.move(x, y)
        assert.deepEqual(await afterDelete('delta', () => p.mouse.click(x, y, { button: 'right' })), { lingers: false })
      } finally {
        await p.emulateMedia({ reducedMotion: 'no-preference' })
      }
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

    it('a note dragged to a fractional point lands with its left and top on whole device pixels, and is saved there', async () => {
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
      const handle = await p.locator(HANDLE).nth(3).boundingBox()
      const [hx, hy] = [handle.x + handle.width / 2, handle.y + handle.height / 2]
      await p.mouse.move(hx, hy)
      await p.mouse.down()
      await p.mouse.move(hx + 41.3, hy + 23.7, { steps: 5 })
      await p.mouse.up()
      assert.equal(isWhole(await drawnLeftTop('alpha')), true, `${await drawnLeftTop('alpha')} device pixels`)
    })
  })
})
