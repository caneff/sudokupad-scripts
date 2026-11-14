/* eslint-disable no-unused-vars */
// The keys that step a panel slider: + (also =, and the keypad's) up and - down.
const SLIDER_STEP_KEYS = { '+': 1, '=': 1, '-': -1 }
const steppedSlider = ({ min, max, step }, value, direction) => Math.min(max, Math.max(min, value + direction * step))
// Any multiple of the step from the minimum; counted in steps rather than by a remainder, which a fractional step would leave inexact.
const onSliderStep = ({ min, max, step }, value) => typeof value === 'number' && value >= min && value <= max && Number.isInteger((value - min) / step)
