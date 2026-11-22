'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const vm = require('node:vm')

const SITE = join(__dirname, '..', 'site')

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
  barParent.dataset = { name: 'The X show' }
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

// Blind to a real browser: clicking a real Next button, what the browser draws and the hover and focus looks are `npm run test:live`'s
// (live/site-slideshow.live.mjs).
test('the slideshow script labels its buttons, shows the first slide, caption and count, steps, and wraps at both ends', () => {
  // Run as it ships: labelled buttons, the first slide and its caption and "1 / n", stepping, and a wrap at both ends.
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
  // Each button's accessible name names its slideshow, so a page with several tells their buttons apart.
  assert.equal(pager.querySelector('.prev').attrs['aria-label'], 'Previous: The X show')
  assert.equal(pager.querySelector('.next').attrs['aria-label'], 'Next: The X show')
  assert.deepEqual(shown(), { slide: 0, caption: 0, count: '1 / 5', currentSlides: 1 })
  next()
  assert.deepEqual(shown(), { slide: 1, caption: 1, count: '2 / 5', currentSlides: 1 })
  prev()
  prev()
  assert.deepEqual(shown(), { slide: 4, caption: 4, count: '5 / 5', currentSlides: 1 })
  next()
  assert.deepEqual(shown(), { slide: 0, caption: 0, count: '1 / 5', currentSlides: 1 })
})
