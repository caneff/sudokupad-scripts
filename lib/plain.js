/* eslint-disable no-unused-vars */
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const rem = (value) => Math.round(value * 100) / 100

// SudokuPad hands every tool the keys typed into a page field too, so a key typed into a field is left to it.
const typedIntoField = (event) => Boolean(event.target && event.target.closest && event.target.closest('input, textarea, select, [contenteditable]'))

// Ctrl, Alt and Cmd start the browser's and SudokuPad's own chords; Shift alone is a key's own case.
const hasChord = (event) => Boolean(event.ctrlKey || event.altKey || event.metaKey)
