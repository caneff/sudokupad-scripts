'use strict'

// A page a script starts on: a document and a window that take every call the startup makes and find none of SudokuPad's own elements.
function pageStandIn () {
  const element = () => new Proxy({ style: {}, classList: { add () {}, remove () {}, toggle () {}, contains: () => false }, dataset: {}, children: [] }, {
    get: (target, key) => key in target ? target[key] : (key === 'then' ? undefined : () => element())
  })
  const document = {
    createElement: element,
    createElementNS: element,
    head: element(),
    body: element(),
    documentElement: { outerHTML: '' },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener () {}
  }
  const window = { addEventListener () {}, MutationObserver: class { observe () {} }, getComputedStyle: () => ({}), WheelEvent: { DOM_DELTA_LINE: 1, DOM_DELTA_PAGE: 2 } }
  return { document, window }
}

module.exports = { pageStandIn }
