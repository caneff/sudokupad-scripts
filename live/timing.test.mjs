// `timingGated` (live/timing.mjs): a time budget decides a live test only when the run says so.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { timingGated } from './timing.mjs'

describe('timingGated', () => {
  it('is off in a merge check, where the env names no timing run', () => {
    assert.equal(timingGated({}), false)
    assert.equal(timingGated({ LIVE_TIMING: '' }), false)
    assert.equal(timingGated({ LIVE_TIMING: '0' }), false)
  })

  it('is on only when LIVE_TIMING is 1', () => {
    assert.equal(timingGated({ LIVE_TIMING: '1' }), true)
  })
})
