// Live check of site/slides.js on the homepage, opened from disk: Next and Previous step the Draw Tool slideshow's picture,
// caption and counter, both ends wrap, and the rows with one picture get no pager. The page's raw.githubusercontent.com
// pictures are served from this checkout, since a branch is not on main yet.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const RAW = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/'
const ROOT = new URL('../', import.meta.url)
// Draw Tool's is the only slideshow on the homepage.
const DRAW_ROW = '.slideshow'
const SLIDES = 8

let browser, page
before(async () => {
  browser = await chromium.launch()
  page = await (await browser.newContext()).newPage()
  await page.route(RAW + '**', (r) => r.fulfill({ body: readFileSync(new URL(r.request().url().slice(RAW.length).replace(/\?.*$/, ''), ROOT)), contentType: 'image/png' }))
  await page.goto(new URL('site/index.html', ROOT).href, { waitUntil: 'load' })
})
after(async () => { await browser?.close() })

// What the slideshow shows now: the counter, the caption and the file name of the one visible picture.
const shown = () => page.evaluate((root) => {
  const show = document.querySelector(root)
  const current = [...show.querySelectorAll('.slide.current')]
  return {
    count: show.querySelector('.slide-count').textContent,
    captions: [...show.querySelectorAll('.slide-caption.current')].map((c) => c.textContent),
    pictures: current.map((i) => i.src.replace(/^.*\/|\?.*$/g, '')),
    visible: [...show.querySelectorAll('.slide')].filter((i) => window.getComputedStyle(i).visibility === 'visible').length
  }
}, DRAW_ROW)

describe('the homepage slideshow', { concurrency: false }, () => {
  it('starts on slide 1 with its caption, and the buttons are labelled', async () => {
    assert.deepEqual(await shown(), { count: `1 / ${SLIDES}`, captions: ['Draw a line'], pictures: ['draw-tool-slide-1-line.png'], visible: 1 })
    assert.equal(await page.locator(`${DRAW_ROW} button`).evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')).join()), 'Previous,Next')
  })

  it('Next steps picture, caption and counter forward, and wraps from the last slide to the first', async () => {
    await page.click(`${DRAW_ROW} .next`)
    assert.deepEqual(await shown(), { count: `2 / ${SLIDES}`, captions: ['Hold Shift for a straight line'], pictures: ['draw-tool-slide-2-straight.png'], visible: 1 })
    for (let i = 3; i <= SLIDES; i++) await page.click(`${DRAW_ROW} .next`)
    assert.deepEqual(await shown(), { count: `${SLIDES} / ${SLIDES}`, captions: ['Erase: right-drag across a line'], pictures: ['draw-tool-slide-8-erase.png'], visible: 1 })
    await page.click(`${DRAW_ROW} .next`)
    assert.deepEqual(await shown(), { count: `1 / ${SLIDES}`, captions: ['Draw a line'], pictures: ['draw-tool-slide-1-line.png'], visible: 1 })
  })

  it('Previous wraps from the first slide to the last, and steps back from there', async () => {
    await page.click(`${DRAW_ROW} .prev`)
    assert.deepEqual(await shown(), { count: `${SLIDES} / ${SLIDES}`, captions: ['Erase: right-drag across a line'], pictures: ['draw-tool-slide-8-erase.png'], visible: 1 })
    await page.click(`${DRAW_ROW} .prev`)
    assert.deepEqual(await shown(), { count: `${SLIDES - 1} / ${SLIDES}`, captions: ['Your own colors: hold a color button'], pictures: ['draw-tool-slide-7-colors.png'], visible: 1 })
  })

  it('the other rows have one picture and no pager', async () => {
    assert.equal(await page.locator('.slide-pager').count(), 1)
    assert.equal(await page.locator('.row').count(), 5)
  })
})
