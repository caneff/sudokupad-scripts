'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
// Color by Digit and Pen Tool Extras export their copy of lib/color-math.js; test/sync-lib.test.js holds every copy to the module.
const COLOR_EXPORTERS = ['color-by-digit', 'pen-tool-extras'].map((script) => require(`../${script}.user.js`))

test('every script\'s parseColor reads every color format any script accepted, clamped to 0-255, with transparent as none', () => {
  for (const { parseColor } of COLOR_EXPORTERS) {
    assert.deepEqual(['#abc', '#a1b2c3', 'rgb(1, 2, 3)', 'rgb(1 2 3)', 'rgb(1 2 3 / .5)', 'rgba(300, 2, 3, 0.5)'].map((text) => parseColor(text)),
      [[170, 187, 204], [161, 178, 195], [1, 2, 3], [1, 2, 3], [1, 2, 3], [255, 2, 3]])
    assert.equal(parseColor('transparent'), null)
  }
})
