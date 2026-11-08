'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text.
const { trackPointer } =
  new Function(`${fs.readFileSync(path.join(__dirname, 'pointer-session.js'), 'utf8')}\nreturn { trackPointer }`)() // eslint-disable-line no-new-func

const pointer = (type, fields = {}) => Object.assign(new Event(type, { bubbles: true, cancelable: true }), fields)

// A target whose listeners can be counted, so a test can see a session leave nothing behind.
function countedTarget () {
  const target = new EventTarget()
  const live = new Map()
  const add = target.addEventListener.bind(target)
  const remove = target.removeEventListener.bind(target)
  const key = (type, listener, options) => `${type}|${options === true || (options && options.capture) ? 'capture' : 'bubble'}`
  target.listening = () => [...live.values()].flat().sort()
  target.addEventListener = (type, listener, options) => {
    live.set(listener, [...(live.get(listener) || []), key(type, listener, options)])
    add(type, listener, options)
  }
  target.removeEventListener = (type, listener, options) => {
    const left = (live.get(listener) || []).filter((entry) => entry !== key(type, listener, options))
    if (left.length === 0) live.delete(listener)
    else live.set(listener, left)
    remove(type, listener, options)
  }
  return target
}

test('every move of the press reaches move, in order, until the release', () => {
  const target = countedTarget()
  const seen = []
  trackPointer(target, { move: (event) => seen.push(event.clientX) })
  target.dispatchEvent(pointer('pointermove', { clientX: 1 }))
  target.dispatchEvent(pointer('pointermove', { clientX: 2 }))
  target.dispatchEvent(pointer('pointerup', { clientX: 3 }))
  target.dispatchEvent(pointer('pointermove', { clientX: 4 }))
  assert.deepEqual(seen, [1, 2])
})

test('the session listens in the capture phase, and a release or a cancel reaches end once, with its event, after which it listens to nothing', () => {
  for (const type of ['pointerup', 'pointercancel']) {
    const target = countedTarget()
    const ended = []
    trackPointer(target, { move: () => {}, end: (event) => ended.push(event.type) })
    assert.deepEqual(target.listening(), ['pointercancel|capture', 'pointermove|capture', 'pointerup|capture'])
    target.dispatchEvent(pointer(type))
    target.dispatchEvent(pointer('pointerup'))
    target.dispatchEvent(pointer('pointercancel'))
    assert.deepEqual(ended, [type])
    assert.deepEqual(target.listening(), [])
  }
})

test('the stop it returns ends the session without calling end, and a second stop does nothing', () => {
  const target = countedTarget()
  const calls = []
  const stop = trackPointer(target, { move: () => { calls.push('move'); stop() }, end: () => calls.push('end') })
  target.dispatchEvent(pointer('pointermove'))
  target.dispatchEvent(pointer('pointermove'))
  target.dispatchEvent(pointer('pointerup'))
  stop()
  assert.deepEqual(calls, ['move'])
  assert.deepEqual(target.listening(), [])
})

test('a session with no end still ends on the release', () => {
  const target = countedTarget()
  trackPointer(target, { move: () => {} })
  target.dispatchEvent(pointer('pointermove'))
  target.dispatchEvent(pointer('pointerup'))
  assert.deepEqual(target.listening(), [])
})

test('end runs after the listeners are gone', () => {
  const target = countedTarget()
  let during
  trackPointer(target, { move: () => {}, end: () => { during = target.listening() } })
  target.dispatchEvent(pointer('pointerup'))
  assert.deepEqual(during, [])
})
