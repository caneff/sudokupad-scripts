// Live check of draw-tool.user.js's Size and Outline buttons on sudokupad.app in headless Chromium at 1280x720: the row under the controls (no slider),
// each menu's items, a pick with nothing selected (the next note), with notes selected (those only, saved) and with a note open, how a menu closes, where it
// opens, a saved size the menu lacks, and the halo drawn as a round ring with no spike past its radius. Real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'

const { COLOR_KEY, MENU, OUTLINE_BUTTON, OUTLINE_KEY, SIZE_BUTTON, TEXT_BOX, WIDTH_KEY, face, menuCurrent, menuItems, pickMenu } = draw
const SIZES = ['10', '14', '20', '26', '32', '40']
const OUTLINES = ['None', 'Thin', 'Medium', 'Thick']
// How far each outline reaches past the letters, as a share of the text size.
const REACH_EM = { Thin: 0.07, Medium: 0.14, Thick: 0.24 }
const A = [1.5, 1.5]
const B = [1.5, 3.5]
const C = [5.5, 5.5]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Annotation\'s Size and Outline menus', { concurrency: false }, () => {
  let context, p, errors

  const saved = () => draw.saved(p)
  const savedNote = async (text) => (await saved()).find((item) => item.text === text)
  const stored = (name) => p.evaluate((k) => Framework.getData(k) ?? null, name)
  const clickAt = async (at) => p.mouse.click(...await gridPoint(p, at))
  const typeText = async (at, content) => {
    await clickAt(at)
    await p.keyboard.type(content)
    await p.keyboard.press('Escape')
  }
  const reload = async () => {
    await draw.reload(p)
    await draw.pickDraw(p)
  }
  const menuOpen = async () => (await p.locator(MENU).count()) === 1
  const textShadowOf = (text) => p.evaluate(([selector, want]) => window.getComputedStyle([...document.querySelectorAll(selector)].find((e) => e.textContent === want)).textShadow, [draw.TEXTS, text])

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport: { width: 1280, height: 720 } } }))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await p.evaluate((keys) => keys.forEach((k) => Framework.removeData(k)), [COLOR_KEY, WIDTH_KEY, OUTLINE_KEY])
    await reload()
  })
  after(async () => { await context.close() })

  it('the panel shows the Size and Outline buttons and an empty slot under the controls, and no slider', async () => {
    assert.equal(await p.locator('.controls-input input[type=range]').count(), 0)
    const rect = (selector) => p.locator(selector).evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom } })
    const [clear, size, outline, slot, panel] = await Promise.all([draw.CLEAR_BUTTON, SIZE_BUTTON, OUTLINE_BUTTON, '.draw-tool-menu-slot', '.controls-input'].map(rect))
    assert.ok(size.y >= clear.bottom, 'the buttons are under the controls')
    assert.ok(Math.abs(size.y - outline.y) < 1, 'the two buttons share a row')
    assert.ok(size.x < outline.x && outline.x < slot.x, 'Size, Outline, then the empty slot')
    assert.ok(slot.x >= outline.right, 'the empty slot has its own place')
    assert.ok(size.bottom <= panel.bottom && outline.bottom <= panel.bottom, 'the row fits inside the keypad')
    assert.equal(await face(p, SIZE_BUTTON), '20')
    assert.equal(await face(p, OUTLINE_BUTTON), 'Medium')
  })

  it('the Size menu lists six numbered sizes with the current one marked, and the Outline menu None, Thin, Medium and Thick', async () => {
    await p.click(SIZE_BUTTON)
    assert.deepEqual(await menuItems(p), SIZES)
    assert.deepEqual(await menuCurrent(p), ['20'])
    await p.click(OUTLINE_BUTTON)
    assert.equal(await p.locator(MENU).count(), 1, 'opening the other menu closes this one')
    assert.deepEqual(await menuItems(p), OUTLINES)
    assert.deepEqual(await menuCurrent(p), ['Medium'])
    await p.click(OUTLINE_BUTTON)
    assert.equal(await menuOpen(), false, 'a second press on the button closes it')
  })

  it('a menu closes on Escape and on a press elsewhere', async () => {
    await p.click(SIZE_BUTTON)
    await p.keyboard.press('Escape')
    assert.equal(await menuOpen(), false)
    await p.click(SIZE_BUTTON)
    await p.mouse.click(5, 300)
    assert.equal(await menuOpen(), false)
    // The press also began an empty note at the page's edge; Escape drops it.
    await p.keyboard.press('Escape')
  })

  it('a press on the open menu\'s own frame, between its items, is no press on the page: no note opens and the menu stays', async () => {
    await p.click(SIZE_BUTTON)
    const frame = await p.locator(MENU).boundingBox()
    await p.mouse.click(frame.x + frame.width / 2, frame.y + 3)
    assert.equal(await menuOpen(), true, 'the menu is still open')
    assert.equal(await p.locator(TEXT_BOX).count(), 0, 'no note opened behind it')
    await p.keyboard.press('Escape')
  })

  it('a menu opens inside the window and clear of the board', async () => {
    for (const button of [SIZE_BUTTON, OUTLINE_BUTTON]) {
      await p.click(button)
      const { menu, board, win } = await p.evaluate((selector) => {
        const r = document.querySelector(selector).getBoundingClientRect()
        const b = Framework.app.svgRenderer.getElem().getBoundingClientRect()
        return { menu: r.toJSON(), board: b.toJSON(), win: [window.innerWidth, window.innerHeight] }
      }, MENU)
      assert.ok(menu.left >= 0 && menu.top >= 0 && menu.right <= win[0] && menu.bottom <= win[1], `inside the window: ${JSON.stringify(menu)}`)
      assert.ok(menu.right <= board.left + 1 || menu.left >= board.right - 1 || menu.bottom <= board.top + 1 || menu.top >= board.bottom - 1, `clear of the board: ${JSON.stringify([menu, board])}`)
      await p.keyboard.press('Escape')
    }
  })

  it('a pick with nothing selected sets the next note only, is saved, and survives a reload', async () => {
    await typeText(A, 'A')
    assert.equal((await savedNote('A')).size, 20)
    await pickMenu(p, SIZE_BUTTON, '32')
    await pickMenu(p, OUTLINE_BUTTON, 'Thick')
    assert.equal(await face(p, SIZE_BUTTON), '32')
    assert.equal(await face(p, OUTLINE_BUTTON), 'Thick')
    assert.equal((await savedNote('A')).size, 20, 'the earlier note keeps its size')
    assert.equal((await savedNote('A')).outline, undefined, 'and its outline')
    await typeText(B, 'B')
    assert.deepEqual([(await savedNote('B')).size, (await savedNote('B')).outline], [32, 'thick'])
    assert.equal(await stored(WIDTH_KEY), 12)
    assert.equal(await stored(OUTLINE_KEY), 'thick')
    await reload()
    assert.equal(await face(p, SIZE_BUTTON), '32')
    assert.equal(await face(p, OUTLINE_BUTTON), 'Thick')
  })

  it('with notes selected the buttons show the selection\'s values, blank where it is mixed, and a pick changes only those notes and is saved', async () => {
    await clickAt(A)
    assert.equal(await face(p, SIZE_BUTTON), '20')
    assert.equal(await face(p, OUTLINE_BUTTON), 'Medium')
    await p.keyboard.down('Shift')
    await clickAt(B)
    await p.keyboard.up('Shift')
    assert.equal(await face(p, SIZE_BUTTON), '', 'mixed sizes show blank')
    assert.equal(await face(p, OUTLINE_BUTTON), '', 'mixed outlines show blank')
    await p.click(SIZE_BUTTON)
    assert.deepEqual(await menuCurrent(p), [], 'no item is highlighted')
    await p.keyboard.press('Escape')
    await pickMenu(p, SIZE_BUTTON, '14')
    await pickMenu(p, OUTLINE_BUTTON, 'None')
    assert.deepEqual([await face(p, SIZE_BUTTON), await face(p, OUTLINE_BUTTON)], ['14', 'None'])
    // A press on empty space first ends the selection, and the next one starts the note.
    await p.keyboard.press('Escape')
    await typeText(C, 'C')
    assert.deepEqual((await saved()).map((i) => [i.text, i.size, i.outline]), [['A', 14, 'none'], ['B', 14, 'none'], ['C', 32, 'thick']])
    assert.equal(await stored(WIDTH_KEY), 12, 'the next-note size is unchanged')
    assert.equal(await stored(OUTLINE_KEY), 'thick', 'and its outline')
    await reload()
    assert.deepEqual((await saved()).map((i) => [i.size, i.outline]), [[14, 'none'], [14, 'none'], [32, 'thick']])
  })

  it('Outline None draws no halo, Medium the default one, and Thick a visibly wider one', async () => {
    const reach = async (text) => {
      const shadow = await textShadowOf(text)
      if (shadow === 'none') return 0
      const offsets = [...shadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px 0px/g)].map((m) => Math.hypot(Number(m[1]), Number(m[2])))
      assert.equal(offsets.length, 16)
      return Math.max(...offsets)
    }
    assert.equal(await reach('A'), 0)
    const thick = await reach('C')
    assert.ok(thick > 0, 'a ring')
    await clickAt(A)
    await pickMenu(p, OUTLINE_BUTTON, 'Medium')
    const medium = await reach('A')
    assert.ok(medium > 0 && thick > medium * 1.4, `Medium ${medium}px, Thick ${thick}px`)
    assert.equal((await savedNote('A')).outline, undefined, 'Medium is no field at all')
    await p.keyboard.press('Escape')
  })

  it('a note saved with a size the menu lacks keeps it, shows it on the Size button and highlights no item; a note with no outline reads as Medium', async () => {
    await draw.plantDrawing(p, [{ kind: 'text', color: 1, size: 23, opacity: 100, text: 'odd', at: [96, 96] }])
    await reload()
    assert.equal((await savedNote('odd')).size, 23)
    await clickAt([1.5, 1.5])
    assert.equal(await face(p, SIZE_BUTTON), '23')
    assert.equal(await face(p, OUTLINE_BUTTON), 'Medium')
    await p.click(SIZE_BUTTON)
    assert.deepEqual(await menuCurrent(p), [])
    await p.keyboard.press('Escape')
    assert.equal((await savedNote('odd')).size, 23, 'opening the menu changes nothing')
    await p.keyboard.press('Escape')
  })

  it('a next-note size saved off the menu reads as the nearest size in it', async () => {
    await p.evaluate(([key, value]) => Framework.setData(key, value), [WIDTH_KEY, 7.5])
    await reload()
    assert.equal(await face(p, SIZE_BUTTON), '20', '23 is as near 20 as 26, and the smaller wins')
    // The note made next has the menu's size, not the saved one the button's face is read from.
    await typeText([7.5, 1.5], 'snap')
    assert.equal((await savedNote('snap')).size, 20)
    await p.evaluate(([key, value]) => Framework.setData(key, value), [WIDTH_KEY, 9])
    await reload()
    assert.equal(await face(p, SIZE_BUTTON), '26')
    await typeText([7.5, 3.5], 'snap2')
    assert.equal((await savedNote('snap2')).size, 26)
  })

  it('a next-note outline saved as something else reads as Medium, and the note made with it is saved and loads', async () => {
    await p.evaluate(([key, value]) => Framework.setData(key, value), [OUTLINE_KEY, 'huge'])
    await reload()
    assert.equal(await face(p, OUTLINE_BUTTON), 'Medium')
    await typeText([7.5, 5.5], 'fine')
    assert.equal((await savedNote('fine')).outline, undefined)
    await reload()
    assert.ok(await savedNote('fine'), 'the drawing still loads')
  })

  it('a pick while a note is open changes that note only and keeps it open', async () => {
    await p.mouse.dblclick(...await gridPoint(p, [1.5, 1.5]))
    assert.equal(await p.locator(TEXT_BOX).count(), 1)
    await pickMenu(p, SIZE_BUTTON, '40')
    assert.equal(await p.locator(TEXT_BOX).count(), 1, 'the note is still open')
    await p.keyboard.type('x')
    await p.keyboard.press('Escape')
    const note = await savedNote('oddx')
    assert.equal(note?.size, 40)
    assert.equal(await stored(WIDTH_KEY), 9, 'the next-note size is unchanged')
  })

  it('the halo is a round ring: no pixel of "AVWMk4" lies past the ring\'s radius from a letter, at every outline', async () => {
    for (const outline of ['Thin', 'Medium', 'Thick']) {
      await clickAt(A)
      await pickMenu(p, OUTLINE_BUTTON, outline)
      const shadow = await textShadowOf('oddx')
      const fontSize = await p.evaluate(([selector, want]) => parseFloat(window.getComputedStyle([...document.querySelectorAll(selector)].find((e) => e.textContent === want)).fontSize), [draw.TEXTS, 'oddx'])
      // The radius is the outline's reach typed out here, as a share of the text size, and not read back from the shadow it checks.
      const radius = fontSize * REACH_EM[outline]
      await p.keyboard.press('Escape')
      const { beyond, reached } = await ringCheck(p, shadow, radius)
      assert.equal(beyond, 0, `${outline}: ${beyond} ring pixels lie more than 1.5px past ${radius}px from a letter`)
      assert.ok(reached > 0, `${outline}: the ring reaches out to its radius`)
    }
  })

  it('opens no page error', () => {
    assert.deepEqual(errors, [])
  })
})

// "AVWMk4" is drawn twice on a white overlay at 60px: as black letters, then as the ring alone (transparent letters with the given text-shadow). `beyond` counts the
// ring's pixels more than 1.5px past `radius` from any letter pixel; `reached` those at least 0.7 of the radius from every letter pixel.
async function ringCheck (p, shadow, radius) {
  const shot = async (style) => {
    const box = await p.evaluate((css) => {
      document.getElementById('ring-check')?.remove()
      const overlay = document.createElement('div')
      overlay.id = 'ring-check'
      overlay.style.cssText = 'position: fixed; left: 0; top: 0; width: 600px; height: 250px; z-index: 99999; background: #fff;'
      const element = document.createElement('div')
      element.textContent = 'AVWMk4'
      element.style.cssText = `position: absolute; left: 60px; top: 60px; font: 700 60px sans-serif; ${css}`
      overlay.append(element)
      document.body.append(overlay)
      return { x: 0, y: 0, width: 600, height: 250 }
    }, style)
    return (await p.screenshot({ clip: box })).toString('base64')
  }
  const letters = await shot('color: #000;')
  const ring = await shot(`color: transparent; text-shadow: ${shadow.replace(/rgba?\([^)]*\)/g, '#000')};`)
  await p.evaluate(() => document.getElementById('ring-check').remove())
  return p.evaluate(async ([lettersPng, ringPng, r]) => {
    const pixels = async (base64) => {
      const bitmap = await window.createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
      const canvas = new window.OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')
      context.drawImage(bitmap, 0, 0)
      return context.getImageData(0, 0, bitmap.width, bitmap.height)
    }
    const [lettersData, ringData] = await Promise.all([pixels(lettersPng), pixels(ringPng)])
    const { width, height } = lettersData
    const dark = (data, x, y) => data.data[(y * width + x) * 4] < 160
    const reach = Math.ceil(r) + 3
    const nearest = (x, y) => {
      let best = Infinity
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const [nx, ny] = [x + dx, y + dy]
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && dark(lettersData, nx, ny)) best = Math.min(best, Math.hypot(dx, dy))
        }
      }
      return best
    }
    let beyond = 0
    let reached = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!dark(ringData, x, y)) continue
        const distance = nearest(x, y)
        if (distance > r + 1.5) beyond++
        if (distance >= r * 0.7) reached++
      }
    }
    return { beyond, reached }
  }, [letters, ring, radius])
}
