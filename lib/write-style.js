/* eslint-disable no-unused-vars */
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
