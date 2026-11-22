/* eslint-env browser */
'use strict'
const ARROW_ICON = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`

for (const show of document.querySelectorAll('.slideshow')) {
  const slides = [...show.querySelectorAll('.slide')]
  const captions = [...show.querySelectorAll('.slide-caption')]
  // A step announces its caption, which carries its meaning, as well as the counter.
  show.querySelector('.slide-captions').setAttribute('aria-live', 'polite')
  const bar = show.querySelector('.slide-bar')
  // Each button's accessible name carries the slideshow's name, so the buttons of a page's slideshows differ.
  const name = bar.dataset.name
  const pager = document.createElement('div')
  pager.className = 'slide-pager'
  pager.innerHTML = `<button type="button" class="prev" aria-label="Previous: ${name}">${ARROW_ICON('M15 5l-7 7 7 7')}</button>` +
    '<span class="slide-count" aria-live="polite"></span>' +
    `<button type="button" class="next" aria-label="Next: ${name}">${ARROW_ICON('M9 5l7 7-7 7')}</button>`
  bar.appendChild(pager)
  let at = 0
  const go = (to) => {
    at = (to + slides.length) % slides.length
    slides.forEach((slide, i) => slide.classList.toggle('current', i === at))
    captions.forEach((caption, i) => caption.classList.toggle('current', i === at))
    pager.querySelector('.slide-count').textContent = `${at + 1} / ${slides.length}`
  }
  pager.querySelector('.prev').addEventListener('click', () => go(at - 1))
  pager.querySelector('.next').addEventListener('click', () => go(at + 1))
  go(0)
}
