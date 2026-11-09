/* eslint-disable no-unused-vars */
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const rem = (value) => Math.round(value * 100) / 100

// SudokuPad hands every tool the keys typed into a page field too, so a key typed into a field is left to it.
const typedIntoField = (event) => Boolean(event.target && event.target.closest && event.target.closest('input, textarea, select, [contenteditable]'))

// The index `delta` steps from `index` in a list of `count`, going round past either end.
const wrapIndex = (index, delta, count) => (((index + delta) % count) + count) % count

// The page's style element `id`, added on the first call, holds `css`.
function writeStyle (id, css, doc = document) {
  let style = doc.getElementById(id)
  if (!style) {
    style = doc.createElement('style')
    style.id = id
    doc.head.appendChild(style)
  }
  style.textContent = css
}
