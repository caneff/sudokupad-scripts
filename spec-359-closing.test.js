'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, existsSync, readdirSync } = require('node:fs')
const { join } = require('node:path')
const vm = require('node:vm')
const { pictureTags, tagOf } = require('./tag-pictures.js')

const SITE = join(__dirname, 'site')
const read = (file) => readFileSync(join(SITE, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
const rowsOf = (html) => html.split('<section class="row">').slice(1)
const showOf = (html) => html.split('<div class="slideshow">')[1].split(/<h2>What it adds<\/h2>|<\/section>/)[0]
const captionsOf = (html) => [...html.matchAll(/<p class="slide-caption( current)?">([^<]*)<\/p>/g)].map((m) => ({ current: Boolean(m[1]), text: m[2] }))
const imgsOf = (html) => [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])

// A minimal stand-in for the page, enough to run site/slides.js as it ships: classes, attributes, click handlers and text.
const fakeElement = () => {
  const classes = new Set()
  const found = {}
  const el = {
    attrs: {},
    clicks: {},
    textContent: '',
    classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), contains: (name) => classes.has(name) },
    setAttribute (name, value) { el.attrs[name] = value },
    addEventListener (type, handler) { el.clicks[type] = handler },
    appendChild (child) { el.child = child },
    querySelector: (selector) => (found[selector] ??= fakeElement())
  }
  return el
}
const runSlides = (count) => {
  const show = fakeElement()
  const slides = Array.from({ length: count }, fakeElement)
  const captions = Array.from({ length: count }, fakeElement)
  const barParent = show.querySelector('.slide-bar')
  const live = show.querySelector('.slide-captions')
  show.querySelectorAll = (selector) => (selector === '.slide' ? slides : captions)
  let pager
  const document = {
    querySelectorAll: () => [show],
    createElement: () => (pager = fakeElement())
  }
  vm.runInNewContext(readFileSync(join(SITE, 'slides.js'), 'utf8'), { document })
  return { slides, captions, pager, barParent, live }
}

// Spec 359's acceptance as one pass at `npm test`: the homepage rows and what each one holds, the slideshow script run against a stand-in page
// (stepping, wrap at both ends, counter, caption, labelled buttons), the pictures on disk and tagged, the details pages that carry the
// same slides, and the theme rules in style.css. This seam is blind to a real browser: clicking a real Next button, what the browser draws and the
// hover and focus looks are `npm run test:live`'s (live/site-slideshow.live.mjs), and the Pages site after the merge is checked by hand.
test('spec 359: the homepage is rows of slideshows, the details pages carry the same slides, and the slideshow steps and wraps', () => {
  // Homepage: one row per script in order, with No Tab Letters off the site and the script kept in the repo.
  const home = read('index.html')
  const rows = rowsOf(home)
  assert.deepEqual(rows.map((r) => r.match(/<h2>([^<]*)<\/h2>/)[1]), ['Color by Digit', 'Pen Tool Extras', 'Draw Tool', 'Dark Page', 'Auto Rules Resizer'])
  assert.equal(existsSync(join(__dirname, 'no-tab-letters.user.js')), true)
  for (const name of readdirSync(SITE).filter((f) => f.endsWith('.html'))) assert.doesNotMatch(read(name), /no-tab-letters|No Tab Letters/i, name)
  assert.match(home, /\.row \{[^}]*grid-template-columns: 30rem 1fr/)

  // Dark Page and Auto Rules Resizer keep one picture and no pager; the other three rows are slideshows with a picture, caption and Install each.
  for (const row of rows.slice(3)) {
    assert.equal(imgsOf(row).length, 1)
    assert.doesNotMatch(row, /slideshow|slide-caption/)
  }
  const details = { 'Color by Digit': 'color-by-digit.html', 'Pen Tool Extras': 'pen-tool-extras.html', 'Draw Tool': 'draw-tool.html' }
  rows.slice(0, 3).forEach((row, i) => {
    const heading = Object.keys(details)[i]
    const show = showOf(row)
    const pictures = imgsOf(show)
    const captions = captionsOf(show)
    assert.ok(pictures.length >= 8, `${heading} has ${pictures.length} slides`)
    assert.equal(captions.length, pictures.length)
    assert.deepEqual(captions.map((c) => c.current), pictures.map((_, n) => n === 0))
    assert.deepEqual(pictures.map((p) => /class="slide current"/.test(p)), pictures.map((_, n) => n === 0))
    for (const c of captions) assert.match(c.text, /\S/)
    for (const { file, tag } of pictureTags(show)) {
      assert.equal(existsSync(join(__dirname, file)), true, `${file} is not in the repo`)
      assert.equal(tag, tagOf(file), `${file} has a stale ?v= tag`)
    }
    assert.match(row, new RegExp(`class="install" href="[^"]*\\.user\\.js"[\\s\\S]*href="${details[heading]}"`))

    // The details page carries the same slides, between the install link and "What it adds".
    const page = read(details[heading])
    assert.deepEqual(imgsOf(showOf(page)), pictures)
    assert.deepEqual(captionsOf(showOf(page)), captions)
    assert.ok(page.indexOf('class="install"') < page.indexOf('<div class="slideshow">') && page.indexOf('<div class="slideshow">') < page.indexOf('<h2>What it adds</h2>'))
  })

  // No tour GIF is left on any page, and the only script a page loads is the shared slideshow script.
  for (const name of readdirSync(SITE).filter((f) => f.endsWith('.html'))) {
    assert.doesNotMatch(read(name), /\.gif\b/, `site/${name} links a GIF`)
    assert.deepEqual([...read(name).matchAll(/<script\b[^>]*>/g)].map((m) => m[0]).filter((t) => t !== '<script src="slides.js">'), [], name)
  }

  // The slideshow script, run as it ships: labelled buttons, the first slide and its caption and "1 / n", stepping, and a wrap at both ends.
  const n = 5
  const { slides, captions, pager, barParent, live } = runSlides(n)
  assert.equal(barParent.child, pager)
  assert.equal(live.attrs['aria-live'], 'polite')
  const shown = () => ({
    slide: slides.findIndex((s) => s.classList.contains('current')),
    caption: captions.findIndex((c) => c.classList.contains('current')),
    count: pager.querySelector('.slide-count').textContent,
    currentSlides: slides.filter((s) => s.classList.contains('current')).length
  })
  const next = pager.querySelector('.next').clicks.click
  const prev = pager.querySelector('.prev').clicks.click
  assert.match(pager.innerHTML, /aria-label="Previous"[\s\S]*aria-label="Next"/)
  assert.deepEqual(shown(), { slide: 0, caption: 0, count: '1 / 5', currentSlides: 1 })
  next()
  assert.deepEqual(shown(), { slide: 1, caption: 1, count: '2 / 5', currentSlides: 1 })
  prev()
  prev()
  assert.deepEqual(shown(), { slide: 4, caption: 4, count: '5 / 5', currentSlides: 1 })
  next()
  assert.deepEqual(shown(), { slide: 0, caption: 0, count: '1 / 5', currentSlides: 1 })

  // Theme: the frame follows the system theme, only the current slide and caption show, and the caption is 1.1rem on the homepage and 1.25rem on details pages.
  const css = read('style.css')
  assert.match(css, /prefers-color-scheme: dark\) \{[^}]*--frame-bg/)
  assert.match(css, /\.slideshow \.slide:not\(\.current\) \{ visibility: hidden/)
  assert.match(css, /\.slide-caption \{[^}]*font-size: 1\.1rem/)
  assert.match(css, /\.details \.slide-caption \{ font-size: 1\.25rem/)
})
