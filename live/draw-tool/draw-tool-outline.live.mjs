// Live check of draw-tool.user.js's Outline choice in the settings dialog on sudokupad.app in headless Chromium at 1280x720: None, Thin and Thick (the default) for every
// note at once on Save, Cancel leaving it, a reload keeping it, a note's own saved outline ignored, Copy then Paste carrying it, and the halo drawn as a round ring with no
// spike past its radius. Real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as draw from './draw-tool-fixtures.mjs'
import { closeDialogWith, dialogButton } from '../settings.mjs'
import { useBrowser } from '../session.mjs'
import { typeText } from '../board.mjs'

const { OUTLINE_KEY, SETTINGS_BUTTON, SETTINGS_EDITOR: EDITOR, SETTINGS_STATUS: STATUS, TEXT_BOX } = draw
const PICKS = `${EDITOR} button[data-role="outline-pick"]`
const OUTLINES = ['None', 'Thin', 'Thick']
const pick = (page, name) => page.locator(`${PICKS}[aria-label="${name}"]`)
const pickedLabel = (page) => page.locator(`${PICKS}[aria-pressed="true"]`).getAttribute('aria-label')
// How far each outline reaches past the letters, as a share of the text size.
const REACH_EM = { Thin: 0.07, Thick: 0.14 }
const A = [1.5, 1.5]
const B = [1.5, 3.5]

const browser = useBrowser()

describe('Text Anywhere\'s Outline setting', { concurrency: false }, () => {
  let context, p, errors

  const stored = (page, name) => page.evaluate((k) => Framework.getData(k) ?? null, name)
  const reload = () => draw.reloadOnDraw(p)
  const textShadowOf = (text) => p.evaluate(([selector, want]) => window.getComputedStyle([...document.querySelectorAll(selector)].find((e) => e.textContent === want)).textShadow, [draw.TEXTS, text])
  const fontSizeOf = (text) => p.evaluate(([selector, want]) => parseFloat(window.getComputedStyle([...document.querySelectorAll(selector)].find((e) => e.textContent === want)).fontSize), [draw.TEXTS, text])
  const reach = async (text) => {
    const shadow = await textShadowOf(text)
    if (shadow === 'none') return 0
    const offsets = [...shadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px 0px/g)].map((m) => Math.hypot(Number(m[1]), Number(m[2])))
    assert.equal(offsets.length, 16)
    return Math.max(...offsets) / await fontSizeOf(text)
  }
  async function chooseOutline (name, how = 'Save') {
    await p.click(SETTINGS_BUTTON)
    await pick(p, name).click()
    await closeDialogWith(p, how, EDITOR)
  }

  before(async () => {
    ;({ context, p, errors } = await draw.open(browser(), { contextOptions: { viewport: { width: 1280, height: 720 }, permissions: ['clipboard-read', 'clipboard-write'] } }))
    await draw.forgetDrawings(p)
    await p.evaluate((key) => Framework.removeData(key), OUTLINE_KEY)
    await reload()
  })
  after(async () => { await context.close() })

  it('the panel has no Outline button, and the dialog\'s Outline choice has the None, Thin and Thick samples with Thick pressed', async () => {
    assert.equal(await p.locator('.controls-input button[title*="Outline" i], .controls-input button[aria-label*="Outline" i]').count(), 0, 'no Outline button on the panel')
    await p.click(SETTINGS_BUTTON)
    assert.deepEqual(await p.locator(PICKS).evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label'))), OUTLINES)
    assert.equal(await pickedLabel(p), 'Thick')
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('Save applies the choice to every note, old and new, and a note saved with its own outline field is read as Thick until then', async () => {
    await draw.plantDrawing(p, [{ kind: 'text', color: 1, size: 20, opacity: 100, outline: 'none', text: 'old', at: [224, 224] }])
    await reload()
    await typeText(p, A, 'A')
    await typeText(p, B, 'B')
    assert.ok(await reach('old') > 0, 'the note\'s own "none" is ignored')
    await chooseOutline('None')
    assert.deepEqual([await reach('A'), await reach('B'), await reach('old')], [0, 0, 0])
    assert.equal(await stored(p, OUTLINE_KEY), 'none')
    await typeText(p, [5.5, 5.5], 'C')
    assert.equal(await reach('C'), 0, 'a note made after it too')
    assert.equal((await draw.saved(p)).find((item) => item.text === 'C').outline, undefined, 'and no note gets an outline field of its own')
    await chooseOutline('Thin')
    const thin = await reach('A')
    assert.ok(thin > 0, 'a ring')
    await chooseOutline('Thick')
    const medium = await reach('A')
    assert.ok(medium > thin * 1.4, `Thin ${thin} em, Thick ${medium} em`)
    assert.equal(await reach('old'), medium, 'the old note follows')
  })

  it('Cancel leaves the outline as it was, and a choice survives a reload', async () => {
    await p.click(SETTINGS_BUTTON)
    await pick(p, 'None').click()
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.ok(await reach('A') > 0)
    assert.equal(await stored(p, OUTLINE_KEY), 'medium')
    await chooseOutline('Thin')
    await reload()
    await p.click(SETTINGS_BUTTON)
    assert.equal(await pickedLabel(p), 'Thin')
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.ok(await reach('A') < REACH_EM.Thick * 0.7, 'drawn Thin')
  })

  it('a saved outline that is something else reads as Thick, and the drawing still loads', async () => {
    await p.evaluate(([key, value]) => Framework.setData(key, value), [OUTLINE_KEY, 'huge'])
    await reload()
    await p.click(SETTINGS_BUTTON)
    assert.equal(await pickedLabel(p), 'Thick')
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.ok(await reach('A') > 0)
  })

  it('Copy then Paste in a fresh page carries the outline, and an invalid pasted one reads as Thick', async () => {
    await chooseOutline('None')
    await p.click(SETTINGS_BUTTON)
    await p.locator('.dialog button[data-act="copy-settings"]').click()
    await p.locator(STATUS).filter({ hasText: 'Settings copied.' }).waitFor()
    const copied = await p.evaluate(() => navigator.clipboard.readText())
    assert.equal(JSON.parse(copied)[OUTLINE_KEY], 'none')
    await closeDialogWith(p, 'Cancel', EDITOR)
    const other = await draw.open(browser(), { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } })
    try {
      await draw.pickDraw(other.p)
      for (const [text, outline] of [[copied, 'none'], [JSON.stringify({ [OUTLINE_KEY]: 'plaid' }), 'medium']]) {
        await other.p.evaluate((t) => navigator.clipboard.writeText(t), text)
        await other.p.click(SETTINGS_BUTTON)
        await other.p.locator('.dialog button[data-act="paste-settings"]').click()
        await other.p.locator(STATUS).filter({ hasText: /Pasted \d+ settings?\./ }).waitFor()
        assert.equal(await stored(other.p, OUTLINE_KEY), outline)
        assert.equal(await other.p.locator(`${PICKS}[aria-pressed="true"]`).getAttribute('data-value'), outline, 'the dialog shows it')
        assert.equal(await dialogButton(other.p, 'Save').count(), 1)
        await closeDialogWith(other.p, 'Cancel', EDITOR)
      }
      assert.deepEqual(other.errors, [])
    } finally {
      await other.context.close()
    }
  })

  it('the halo is a round ring: no pixel of "AVWMk4" lies past the ring\'s radius from a letter, at every outline', async () => {
    for (const outline of ['Thin', 'Thick']) {
      await chooseOutline(outline)
      const shadow = await textShadowOf('A')
      const fontSize = await fontSizeOf('A')
      // The radius is the outline's reach typed out here, as a share of the text size, and not read back from the shadow it checks.
      const radius = fontSize * REACH_EM[outline]
      const { beyond, reached } = await ringCheck(p, shadow, radius)
      assert.equal(beyond, 0, `${outline}: ${beyond} ring pixels lie more than 1.5px past ${radius}px from a letter`)
      assert.ok(reached > 0, `${outline}: the ring reaches out to its radius`)
    }
  })

  it('opens no page error, and no note stays open', async () => {
    assert.equal(await p.locator(TEXT_BOX).count(), 0)
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
