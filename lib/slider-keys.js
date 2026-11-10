/* eslint-disable no-unused-vars */
// The keys that step a panel slider: + (also =, and the keypad's) up and - down.
const SLIDER_STEP_KEYS = { '+': 1, '=': 1, '-': -1 }
const steppedSlider = ({ min, max, step }, value, direction) => Math.min(max, Math.max(min, value + direction * step))
