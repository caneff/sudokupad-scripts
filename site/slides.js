/* eslint-env browser */
'use strict'
// The slideshow every page shares: it adds a pager to each .slideshow and steps the .slide pictures and .slide-caption
// texts, which share the .current class. Without this script the first slide and its caption show.
const CHEVRON = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`

for (const show of document.querySelectorAll('.slideshow')) {
  const slides = [...show.querySelectorAll('.slide')]
  const captions = [...show.querySelectorAll('.slide-caption')]
  if (slides.length < 2) continue
  const pager = document.createElement('div')
  pager.className = 'slide-pager'
  pager.innerHTML = `<button type="button" class="prev" aria-label="Previous">${CHEVRON('M15 5l-7 7 7 7')}</button>` +
    '<span class="slide-count" aria-live="polite"></span>' +
    `<button type="button" class="next" aria-label="Next">${CHEVRON('M9 5l7 7-7 7')}</button>`
  show.querySelector('.slide-bar').appendChild(pager)
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
