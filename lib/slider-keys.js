/* eslint-disable no-unused-vars */
const SLIDER_STEP_KEYS = { '+': 1, '=': 1, '-': -1 }
const steppedSlider = ({ min, max, step }, value, direction) => Math.min(max, Math.max(min, value + direction * step))
// Any multiple of the step from the minimum; counted in steps rather than by a remainder, which a fractional step would leave inexact.
const onSliderStep = ({ min, max, step }, value) => typeof value === 'number' && value >= min && value <= max && Number.isInteger((value - min) / step)
const savedSliderValue = (range, data) => (onSliderStep(range, data) ? data : undefined)
// SudokuPad drops every keydown with `event.repeat` before a tool sees it, so a script times a held key itself: nothing until the pause, then a tick of steps that ramps up.
const HELD_REPEAT_MS = 300
const HELD_RAMP_MS = 1500
const HELD_TICK_MS = 50
const HELD_SLIDER_MAX_STEPS = 4
// A held key does nothing more until the pause, then `from` a tick, ramping to `to`.
function heldRamp (heldMs, from, to) {
  if (heldMs < HELD_REPEAT_MS) return 0
  return Math.round(from + (to - from) * Math.min(1, (heldMs - HELD_REPEAT_MS) / HELD_RAMP_MS))
}
const heldSliderSteps = (heldMs) => heldRamp(heldMs, 1, HELD_SLIDER_MAX_STEPS)
// One held + or - key. Callers pass only fresh presses (a repeat would restart the ramp), and a fresh press takes the hold over, since a release the page never saw would otherwise hold on for ever.
// Only the held key's release ends it. The hold is the physical key's, so releasing Shift before = turns a held + into =.
function sliderKeyHold (onTick) {
  let hold = null
  const stop = () => {
    clearInterval(hold?.timer)
    hold = null
  }
  return {
    stop,
    press (code, direction) {
      stop()
      hold = { code, direction, start: Date.now(), timer: setInterval(() => onTick(hold), HELD_TICK_MS) }
    },
    release (code) { if (hold?.code === code) stop() }
  }
}
