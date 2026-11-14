/* eslint-disable no-unused-vars */
function writeStyle (id, css, doc = document) {
  let style = doc.getElementById(id)
  if (!style) {
    style = doc.createElement('style')
    style.id = id
    doc.head.appendChild(style)
  }
  style.textContent = css
}
