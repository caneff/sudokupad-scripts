'use strict'
// Auto Rules Resizer's refused limits and floors, at the `npm test` seam.
const test = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { fakeStore, quietly } = require('./fake-store.js')

const rulesResizer = require(join(__dirname, '..', 'auto-rules-resizer.user.js'))

test('Auto Rules Resizer refuses a limit under its floor or not whole pixels, and reads a saved one under the floor as the floor', () => {
  const { limitFromBox, readLimits, LIMIT_FLOORS, MAX_HEIGHT_KEY, MAX_WIDTH_KEY } = rulesResizer
  assert.deepEqual(LIMIT_FLOORS, { maxWidth: 240, maxHeight: 112 })
  assert.equal(limitFromBox('', 'maxHeight'), null)
  assert.equal(limitFromBox('112', 'maxHeight'), 112)
  for (const [text, name] of [['111', 'maxHeight'], ['239', 'maxWidth'], ['300.5', 'maxHeight'], ['abc', 'maxWidth']]) {
    assert.throws(() => limitFromBox(text, name), /must be a whole number of pixels/, `${name} ${text}`)
  }
  const { result } = quietly(() => readLimits(fakeStore({ [MAX_HEIGHT_KEY]: { v: 0, data: 50 }, [MAX_WIDTH_KEY]: { v: 0, data: 100 } })))
  assert.deepEqual(result, { maxWidth: 240, maxHeight: 112 })
})
