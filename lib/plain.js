/* eslint-disable no-unused-vars */
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const rem = (value) => Math.round(value * 100) / 100

// SudokuPad hands every tool the keys typed into a page field too, so a key typed into a field is left to it.
const typedIntoField = (event) => Boolean(event.target && event.target.closest && event.target.closest('input, textarea, select, [contenteditable]'))

// Ctrl, Alt and Cmd start the browser's and SudokuPad's own chords; Shift alone is a key's own case.
const hasChord = (event) => Boolean(event.ctrlKey || event.altKey || event.metaKey)

// Text into HTML markup or an attribute value: the four characters that would end one or open another.
const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// A mouse event's `button` numbers the button that changed; its `buttons` has one bit per button held.
const PRIMARY_BUTTON = 0
const SECONDARY_BUTTON = 2
const PRIMARY_HELD = 1
const SECONDARY_HELD = 2
