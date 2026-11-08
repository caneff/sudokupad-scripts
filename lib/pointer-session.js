/* eslint-disable no-unused-vars */
// One press, from after its `pointerdown` to its release: `move` hears each `pointermove` and `end` the `pointerup` or `pointercancel`.
// The session listens in the capture phase, so a page handler that stops a release cannot leave it listening, and it is gone before
// `end` runs. The returned stop ends it with no `end`.
const PRESS_END_EVENTS = ['pointerup', 'pointercancel']
// The object form: Node's EventTarget, which the tests use, keeps a listener removed with a bare `true`.
const CAPTURE = { capture: true }

function trackPointer (target, { move = () => {}, end = () => {} }) {
  const finish = (event) => {
    stop()
    end(event)
  }
  const stop = () => {
    target.removeEventListener('pointermove', move, CAPTURE)
    PRESS_END_EVENTS.forEach((type) => target.removeEventListener(type, finish, CAPTURE))
  }
  target.addEventListener('pointermove', move, CAPTURE)
  PRESS_END_EVENTS.forEach((type) => target.addEventListener(type, finish, CAPTURE))
  return stop
}
