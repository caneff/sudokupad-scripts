// Live check of site/slides.js on the homepage and on each details page with a slideshow (Color by Digit, Pen Tool Extras, Text Anywhere), opened from disk: Next and Previous step
// the slideshow's picture, caption and counter, and both ends wrap. Each details page's slides also fill their frame to its inset and are never shown wider than their own width, at 1280x720 and 1600x900. The page's raw.githubusercontent.com
// pictures are served from this checkout, since a branch is not on main yet.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const RAW = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/'
const ROOT = new URL('../', import.meta.url)
// The slideshows: the homepage row heading and its place among the rows, the details page and the slideshow's id in site/slideshows.json, which holds the slide count and each picture and caption.
const SOURCE = JSON.parse(readFileSync(new URL('site/slideshows.json', ROOT), 'utf8'))
const slideOf = ({ slides }, i) => [slides.at(i).picture, slides.at(i).caption]
const SHOWS = [
  { heading: 'Color by Digit', row: 3, details: 'color-by-digit.html', id: 'color-by-digit' },
  { heading: 'Pen Tool Extras', row: 1, details: 'pen-tool-extras.html', id: 'pen-tool-extras' },
  { heading: 'Text Anywhere', row: 2, details: 'text-anywhere.html', id: 'text-anywhere' }
].map((show) => ({
  ...show,
  slides: SOURCE[show.id].slides.length,
  first: slideOf(SOURCE[show.id], 0),
  second: slideOf(SOURCE[show.id], 1),
  last: slideOf(SOURCE[show.id], -1),
  beforeLast: slideOf(SOURCE[show.id], -2)
}))

let browser, page
before(async () => {
  browser = await chromium.launch()
  page = await (await browser.newContext()).newPage()
  await page.route(RAW + '**', (r) => r.fulfill({ body: readFileSync(new URL(r.request().url().slice(RAW.length).replace(/\?.*$/, ''), ROOT)), contentType: 'image/png' }))
})
after(async () => { await browser?.close() })

// What the slideshow under `root` shows now: the counter, the caption and the file name of the one visible picture.
const shown = (root) => page.evaluate((root) => {
  const show = document.querySelector(root)
  const current = [...show.querySelectorAll('.slide.current')]
  return {
    count: show.querySelector('.slide-count').textContent,
    captions: [...show.querySelectorAll('.slide-caption.current')].map((c) => c.textContent),
    pictures: current.map((i) => i.src.replace(/^.*\/|\?.*$/g, '')),
    visible: [...show.querySelectorAll('.slide')].filter((i) => window.getComputedStyle(i).visibility === 'visible').length
  }
}, root)
const at = (n, [picture, caption], slides) => ({ count: `${n} / ${slides}`, captions: [caption], pictures: [picture], visible: 1 })

// Each slide's gap to the frame's inside edge on all four sides, and the frame's inset (.6rem) in px. All slides stack in one cell, so each is measured though only one shows.
const gaps = (root) => page.evaluate((root) => {
  const frame = document.querySelector(`${root} .slide-frame`)
  const f = frame.getBoundingClientRect()
  const gap = (img) => {
    const i = img.getBoundingClientRect()
    return { left: i.left - f.left - frame.clientLeft, right: f.right - i.right - frame.clientLeft, top: i.top - f.top - frame.clientTop, bottom: f.bottom - i.bottom - frame.clientTop }
  }
  return { inset: 0.6 * parseFloat(window.getComputedStyle(document.documentElement).fontSize), gaps: [...frame.querySelectorAll('.slide')].map(gap) }
}, root)
const sizes = () => page.evaluate(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, width: r.width } }
  return {
    slides: [...document.querySelectorAll('.slideshow .slide')].map((i) => ({ shown: i.getBoundingClientRect().width, own: Number(i.getAttribute('width')) })),
    lede: box(document.querySelector('.lede')),
    frame: box(document.querySelector('.slide-frame')),
    inset: 0.6 * parseFloat(window.getComputedStyle(document.documentElement).fontSize)
  }
})
const DEFAULT_VIEWPORT = { width: 1280, height: 720 }
const openDetails = async (show, width, height) => {
  await page.setViewportSize({ width, height })
  await page.goto(new URL(`site/${show.details}`, ROOT).href, { waitUntil: 'load' })
  await page.waitForFunction(() => [...document.images].every((i) => i.complete))
}

for (const show of SHOWS) {
  for (const [width, height] of [[1280, 720], [1600, 900]]) {
    describe(`${show.heading}'s details page at ${width}x${height}`, () => {
      after(() => page.setViewportSize(DEFAULT_VIEWPORT))
      // A slide of another shape would sit off the inset on one side, so every slide of a show must share one size.
      it('every slide fills its frame to the inset on each side', async () => {
        await openDetails(show, width, height)
        const { inset, gaps: all } = await gaps('.slideshow')
        assert.equal(all.length, show.slides)
        for (const g of all) for (const side of ['left', 'right', 'top', 'bottom']) assert.ok(Math.abs(g[side] - inset) <= 1, `${side} gap ${g[side]} px, want ${inset} px: ${JSON.stringify(g)}`)
      })
      it('no slide is shown wider than its own width, and the frame is no wider than its widest slide and sits left-aligned with the text', async () => {
        await openDetails(show, width, height)
        const { slides, lede, frame, inset } = await sizes()
        for (const { shown, own } of slides) assert.ok(shown <= own + 1, `slide shown ${shown} px wide, its own width is ${own} px`)
        assert.ok(Math.abs(frame.left - lede.left) <= 1, `frame left ${frame.left} px, text left ${lede.left} px`)
        // A caption wider than the slides must not widen the frame (the 2 px are its border).
        const widest = Math.max(...slides.map(({ own }) => own))
        assert.ok(frame.width <= widest + 2 * inset + 2 + 1, `frame ${frame.width} px wide, widest slide ${widest} px`)
      })
    })
  }
}

for (const [where, file] of [['the homepage', 'index.html'], ...SHOWS.map((show) => [`${show.heading}'s details page`, show.details])]) {
  for (const show of SHOWS.filter((show) => file === 'index.html' || file === show.details)) {
    const root = file === 'index.html' ? `section.row:nth-of-type(${show.row}) .slideshow` : '.slideshow'
    describe(`${where} ${show.heading} slideshow`, { concurrency: false }, () => {
      before(() => page.goto(new URL(`site/${file}`, ROOT).href, { waitUntil: 'load' }))

      it('starts on slide 1 with its caption, the buttons are labelled and a step announces its caption', async () => {
        assert.deepEqual(await shown(root), at(1, show.first, show.slides))
        assert.equal(await page.locator(`${root} button`).evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')).join()), 'Previous,Next')
        assert.equal(await page.locator(`${root} .slide-captions`).getAttribute('aria-live'), 'polite')
      })

      it('Next steps picture, caption and counter forward, and wraps from the last slide to the first', async () => {
        await page.click(`${root} .next`)
        assert.deepEqual(await shown(root), at(2, show.second, show.slides))
        for (let i = 3; i <= show.slides; i++) await page.click(`${root} .next`)
        assert.deepEqual(await shown(root), at(show.slides, show.last, show.slides))
        await page.click(`${root} .next`)
        assert.deepEqual(await shown(root), at(1, show.first, show.slides))
      })

      it('Previous wraps from the first slide to the last, and steps back from there', async () => {
        await page.click(`${root} .prev`)
        assert.deepEqual(await shown(root), at(show.slides, show.last, show.slides))
        await page.click(`${root} .prev`)
        assert.deepEqual(await shown(root), at(show.slides - 1, show.beforeLast, show.slides))
      })

      it('has a pager on each slideshow of the page', async () => {
        assert.equal(await page.locator('.slide-pager').count(), file === 'index.html' ? SHOWS.length : 1)
      })
    })
  }
}
