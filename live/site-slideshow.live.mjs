// Live check of site/slides.js on the homepage and on each details page with a slideshow (Color by Digit, Pen Tool Extras, Draw Tool), opened from disk: Next and Previous step
// the slideshow's picture, caption and counter, and both ends wrap. The page's raw.githubusercontent.com
// pictures are served from this checkout, since a branch is not on main yet.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const RAW = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/'
const ROOT = new URL('../', import.meta.url)
// The slideshows: the homepage row heading and its place among the rows, the details page, the slide count and the first, second, last and second-last picture and caption.
const SHOWS = [
  {
    heading: 'Color by Digit',
    row: 1,
    details: 'color-by-digit.html',
    slides: 10,
    first: ['color-by-digit-slide-1-start.png', 'Start'],
    second: ['color-by-digit-slide-2-type.png', 'Type a 1'],
    last: ['color-by-digit-slide-10-split.png', 'Cells from one profile, digits from another'],
    beforeLast: ['color-by-digit-slide-9-modular.png', 'Pick Modular']
  },
  {
    heading: 'Pen Tool Extras',
    row: 2,
    details: 'pen-tool-extras.html',
    slides: 14,
    first: ['pen-tool-extras-slide-1-line.png', 'Draw a line'],
    second: ['pen-tool-extras-slide-2-hold.png', 'Hold a color button'],
    last: ['pen-tool-extras-slide-14-erased.png', 'The whole line is gone'],
    beforeLast: ['pen-tool-extras-slide-13-erase.png', 'Right-click a line to delete it']
  },
  {
    heading: 'Draw Tool',
    row: 3,
    details: 'draw-tool.html',
    slides: 9,
    first: ['draw-tool-slide-1-line.png', 'Draw a line'],
    second: ['draw-tool-slide-2-straight.png', 'Hold Shift for a straight line'],
    last: ['draw-tool-slide-9-erased.png', 'The whole line is gone'],
    beforeLast: ['draw-tool-slide-8-erase.png', 'Erase: right-click a line']
  }
]

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
