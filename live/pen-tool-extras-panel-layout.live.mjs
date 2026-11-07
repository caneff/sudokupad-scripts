// Live check of pen-tool-extras.user.js's pen panel layout (#254) at 1200x900 on sudokupad.app in headless Chromium: the panel's outer size,
// the shorter color buttons, the row of three controls and the tray under them, the three control icons' ink measured from a screenshot, and the edit mode pickers (#275).
// A real touch screen stays untested. Pages 2 and 3 of the color buttons and the tray on Dark Page are judged by sight in the PR.
/* global Framework, getComputedStyle, Image, document */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { openPenTool } from './pen.mjs'
import { dialogButton, openExtrasEditor } from './settings.mjs'

const { HOLD_TO_EDIT_MS } = createRequire(import.meta.url)('../pen-tool-extras.user.js')
// The pickers appear only when the hold timer fires.
const HOLD_WAIT_MS = HOLD_TO_EDIT_MS + 5000
const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')

// The panel's outer rectangle that SudokuPad gives it, measured on this recording at 1200x900: x, y, width, height of `.controls-input`.
const OUTER = { x: 724, y: 412.9, width: 212.76, height: 283.65 }
const KEY_PX = 65.98
const NEAR_PX = 0.5
const ICON_INK_PX = 34
// The ink of an icon is read at this device scale, so a screenshot pixel is a quarter of a layout pixel.
const SHOT_SCALE = 4

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('the pen panel layout', { concurrency: false }, () => {
  let context, p

  const rect = (selector) => p.locator(selector).evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } })
  const key = (n) => rect(`.tool-pen button[data-key="${n}"]`)
  const near = (actual, wanted, what) => assert.equal(Math.abs(actual - wanted) <= NEAR_PX, true, `${what}: ${actual} vs ${wanted}`)

  before(async () => {
    ;({ context, p } = await openPage(browser, { contextOptions: { deviceScaleFactor: SHOT_SCALE } }))
    await startPuzzle(p, { beforeStart: () => p.evaluate(() => Framework.setSetting('toolpen', true)) })
    await p.addScriptTag({ content: script })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
    await openPenTool(p)
    await p.locator('.pen-tool-extras-settings').waitFor({ state: 'visible' })
  })
  after(async () => { await context.close() })

  it('the panel keeps its outer rectangle, 3 columns at the keys\' width, 284 px tall, within half a pixel', async () => {
    const panel = await rect('.tool-pen .controls-input')
    for (const side of ['x', 'y', 'width', 'height']) near(panel[side], OUTER[side], side)
  })

  it('the nine color buttons are 2.5rem tall, 4rem wide, three to a row, with 2.4 px margins and position relative', async () => {
    for (let n = 1; n <= 9; n++) {
      const style = await p.locator(`.tool-pen button[data-key="${n}"]`).evaluate((el) => { const s = getComputedStyle(el); return { position: s.position, margin: [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft] } })
      assert.equal(style.position, 'relative', `key ${n}`)
      assert.deepEqual(style.margin, ['2.4px', '2.4px', '2.4px', '2.4px'], `key ${n}`)
      const r = await key(n)
      near(r.width, KEY_PX, `key ${n} width`)
      near(r.height, KEY_PX * 2.5 / 4, `key ${n} height`)
    }
    const [k1, k2, k3, k4, k7] = await Promise.all([1, 2, 3, 4, 7].map(key))
    assert.deepEqual([k1.y, k3.y], [k2.y, k2.y], 'keys 1 to 3 share a row')
    assert.equal(k4.x, k1.x, 'key 4 starts under key 1')
    assert.equal(k4.y > k1.y, true, 'key 4 is in the next row')
    near(k7.y - k4.y, k4.y - k1.y, 'rows are evenly spaced')
  })

  it('SudokuPad\'s key 0 and Delete take no room in the panel', async () => {
    for (const selector of ['.tool-pen button[data-key="0"]', '.tool-pen button[data-control="delete"]']) {
      assert.equal(await p.locator(selector).evaluate((el) => { const r = el.getBoundingClientRect(); return r.width * r.height }), 0, selector)
    }
  })

  it('under the colors, after a 0.75rem gap, the line mode, line type and settings buttons are 4rem squares on the columns of keys 7, 8 and 9', async () => {
    const [k7, k8, k9] = await Promise.all([7, 8, 9].map(key))
    const controls = await Promise.all(['.pen-tool-extras-mode', '.pen-tool-extras-page', '.pen-tool-extras-settings'].map(rect))
    controls.forEach((c, i) => {
      const k = [k7, k8, k9][i]
      near(c.x, k.x, `control ${i} left`)
      near(c.right, k.right, `control ${i} right`)
      near(c.width, KEY_PX, `control ${i} width`)
      near(c.height, KEY_PX, `control ${i} height`)
      near(c.y, controls[0].y, `control ${i} top`)
      // 0.75rem of gap, and the buttons' own 2.4 px margins, below key 9's margin box
      near(c.y - k9.bottom, (0.75 * 16 + 2.4 * 2) * KEY_PX / 64, `control ${i} gap below the colors`)
    })
  })

  it('the controls and the sliders sit on a #efeaf4 tray with 14 px corners, 4 px past the color block on each side, with an even 6.6 px of padding on all four sides', async () => {
    const style = await p.locator('.pen-tool-extras-tray').evaluate((el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.borderTopLeftRadius] })
    assert.deepEqual(style, ['rgb(239, 234, 244)', '14px'])
    const [tray, k7, k9, mode, settings, sliders] = await Promise.all([rect('.pen-tool-extras-tray'), key(7), key(9), rect('.pen-tool-extras-mode'), rect('.pen-tool-extras-settings'), rect('.pen-tool-extras-sliders')])
    // The color block ends at the buttons' margins.
    const margin = 2.4 * KEY_PX / 64
    near(k7.x - margin - tray.x, 4, 'tray reaches past the color block on the left')
    near(tray.right - (k9.right + margin), 4, 'tray reaches past the color block on the right')
    const padding = { top: mode.y - tray.y, left: mode.x - tray.x, right: tray.right - settings.right, bottom: tray.bottom - sliders.bottom }
    for (const [side, value] of Object.entries(padding)) near(value, 6.6, `padding ${side}`)
    const values = Object.values(padding)
    near(Math.max(...values), Math.min(...values), 'padding is even')
  })

  it('the sliders are across the full width of the controls, under them, and end at the bottom of the panel less the padding', async () => {
    const [sliders, panel, mode, settings] = await Promise.all([rect('.pen-tool-extras-sliders'), rect('.tool-pen .controls-input'), rect('.pen-tool-extras-mode'), rect('.pen-tool-extras-settings')])
    near(sliders.x, mode.x, 'sliders left')
    near(sliders.right, settings.right, 'sliders right')
    assert.equal(sliders.y >= mode.bottom, true, 'under the controls')
    assert.equal(panel.bottom - sliders.bottom > 5 && panel.bottom - sliders.bottom < 8, true, 'inside the panel')
    assert.equal(await p.locator('.pen-tool-extras-sliders-box').count(), 0, 'no box behind the sliders')
  })

  // The ink of an icon: the bounding box of the screenshot's pixels that differ from the corner pixel's color, in layout pixels from the clip's top left.
  const ink = async (selector) => {
    const svg = p.locator(`${selector} > svg`)
    const box = await svg.boundingBox()
    const shot = (await svg.screenshot()).toString('base64')
    return p.evaluate(async ([png, scale]) => {
      const img = new Image()
      img.src = `data:image/png;base64,${png}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.width; canvas.height = img.height
      const g = canvas.getContext('2d')
      g.drawImage(img, 0, 0)
      const { data } = g.getImageData(0, 0, img.width, img.height)
      const bg = [data[0], data[1], data[2]]
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4
          if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 60) {
            x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1)
          }
        }
      }
      return { x0: x0 / scale, y0: y0 / scale, x1: x1 / scale, y1: y1 / scale }
    }, [shot, SHOT_SCALE]).then((r) => ({ ...r, left: box.x, top: box.y }))
  }
  const checkInk = async (selector, what) => {
    const i = await ink(selector)
    const button = await rect(selector)
    const [w, h] = [i.x1 - i.x0, i.y1 - i.y0]
    near(Math.max(w, h), ICON_INK_PX, `${what}: longest side of the ink`)
    near(i.left + (i.x0 + i.x1) / 2, button.x + button.width / 2, `${what}: ink centre across`)
    near(i.top + (i.y0 + i.y1) / 2, button.y + button.height / 2, `${what}: ink centre down`)
  }

  it('the line mode icon is 34 px on its longest side and centred on its ink, in each of the three modes', async () => {
    assert.equal(await p.locator('.pen-tool-extras-mode').getAttribute('title'), 'Center & Edge')
    for (let n = 0; n < 3; n++) {
      await checkInk('.pen-tool-extras-mode', `mode ${await p.locator('.pen-tool-extras-mode').getAttribute('title')}`)
      await p.locator('.pen-tool-extras-mode').click()
    }
  })

  it('the settings icon is 34 px on its longest side and centred on its ink', async () => {
    await checkInk('.pen-tool-extras-settings', 'settings')
  })

  it('the line type icon is 34 px on its longest side and centred on its ink, for the icon of each page it turns to', async () => {
    const shown = []
    for (let n = 0; n < 3; n++) {
      shown.push(await p.locator('.pen-tool-extras-page [data-page-sample]').getAttribute('data-page-sample'))
      await checkInk('.pen-tool-extras-page', `line type icon showing page ${shown[n]}`)
      await p.locator('.pen-tool-extras-page').click()
    }
    assert.deepEqual([...shown].sort(), ['1', '2', '3'])
  })

  const setSliderBoxes = async (shown) => {
    await openExtrasEditor(p)
    for (const key of ['thickness', 'opacity']) await p.locator(`#pen-tool-extras-editor input[data-box="show.${key}"]`).setChecked(shown)
    await dialogButton(p, 'Save').click()
    await p.locator('#pen-tool-extras-editor').waitFor({ state: 'detached' })
  }

  it('with both sliders hidden, the tray ends under the controls with the same 6.6 px of padding on every side', async () => {
    await setSliderBoxes(false)
    try {
      await p.locator('.pen-tool-extras-sliders').waitFor({ state: 'detached' })
      const [tray, mode, settings] = await Promise.all([rect('.pen-tool-extras-tray'), rect('.pen-tool-extras-mode'), rect('.pen-tool-extras-settings')])
      const padding = { top: mode.y - tray.y, left: mode.x - tray.x, right: tray.right - settings.right, bottom: tray.bottom - mode.bottom }
      for (const [side, value] of Object.entries(padding)) near(value, 6.6, `padding ${side}`)
    } finally {
      await setSliderBoxes(true)
    }
  })

  // SudokuPad's Keypad Flipped setting swaps the first and third rows of colors.
  it('with Keypad Flipped on, keys 7 to 9 are the top row and keys 1 to 3 the third, and the controls and the sliders stay where they were', async () => {
    const before = await Promise.all(['.pen-tool-extras-mode', '.pen-tool-extras-sliders'].map(rect))
    await p.evaluate(() => Framework.setSetting('flipkeypad', true))
    try {
      await p.locator('body.setting-flipkeypad').waitFor()
      const [k1, k4, k7] = await Promise.all([1, 4, 7].map(key))
      assert.equal(k7.y < k4.y && k4.y < k1.y, true, JSON.stringify({ k7: k7.y, k4: k4.y, k1: k1.y }))
      assert.deepEqual(await Promise.all(['.pen-tool-extras-mode', '.pen-tool-extras-sliders'].map(rect)), before)
    } finally {
      await p.evaluate(() => Framework.setSetting('flipkeypad', false))
    }
  })

  // Hold a color button and the pickers appear: they must leave the grid alone and follow their buttons (#275). A hold on a picker ends edit mode, as in live/pen-tool-extras.live.mjs.
  it('in edit mode every color button keeps its box, and each picker sits over its own button, also with Keypad Flipped on', async () => {
    const boxes = () => Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9].map(key))
    const pickers = (n) => p.locator(`.pen-tool-extras-picker input[data-pen="${n}"]`)
    const hold = async (selector) => {
      const box = await p.locator(selector).boundingBox()
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await p.mouse.down()
    }
    const overOwnButton = async (buttons, what) => {
      for (let n = 1; n <= 9; n++) {
        const picker = await rect(`.pen-tool-extras-picker input[data-pen="${n}"]`)
        const button = buttons[n - 1]
        const inside = picker.x >= button.x - NEAR_PX && picker.y >= button.y - NEAR_PX && picker.right <= button.right + NEAR_PX && picker.bottom <= button.bottom + NEAR_PX
        assert.equal(inside, true, `${what}: picker ${n} ${JSON.stringify(picker)} over button ${JSON.stringify(button)}`)
        near(picker.x + picker.width / 2, button.x + button.width / 2, `${what}: picker ${n} centre x`)
        near(picker.y + picker.height / 2, button.y + button.height / 2, `${what}: picker ${n} centre y`)
      }
    }
    const before = await boxes()
    const panelBefore = await rect('.tool-pen .controls-input')
    await hold('.tool-pen button[data-key="1"]')
    try {
      await pickers(9).waitFor({ state: 'attached', timeout: HOLD_WAIT_MS })
    } finally {
      await p.mouse.up()
    }
    try {
      assert.deepEqual(await boxes(), before, 'the color buttons')
      assert.deepEqual(await rect('.tool-pen .controls-input'), panelBefore, 'the panel')
      await overOwnButton(before, 'unflipped')
      await p.evaluate(() => Framework.setSetting('flipkeypad', true))
      try {
        await p.locator('body.setting-flipkeypad').waitFor()
        await overOwnButton(await boxes(), 'flipped')
      } finally {
        await p.evaluate(() => Framework.setSetting('flipkeypad', false))
      }
    } finally {
      await hold('.pen-tool-extras-picker input[data-pen="4"]')
      await p.locator('.pen-tool-extras-picker').first().waitFor({ state: 'detached', timeout: HOLD_WAIT_MS })
      await p.mouse.up()
    }
  })
})
