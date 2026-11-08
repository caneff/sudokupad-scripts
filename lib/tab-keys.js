/* eslint-disable no-unused-vars */
const TOGGLE_KEY = '/'
const TAB_KEY = 'Tab'
// The marker UI Tweaks puts on the page, and the event it fires, when it starts: No Tab Letters watches for both, so Tab is handled by one script and not two.
const UI_TWEAKS_ATTRIBUTE = 'data-ui-tweaks'
const UI_TWEAKS_EVENT = 'ui-tweaks-running'

// SudokuPad's toggle handler also stops Tab's default, so focus stays on the puzzle; keep that.
function ignoreKey (event) {
  event.preventDefault()
}

// The Tab entry is found by sharing the "/" entry's handler, the letter toggle.
function withInertTab (handlers, inert) {
  if (!Array.isArray(handlers)) return null
  const toggle = handlers.find((entry) => entry.key === TOGGLE_KEY)
  if (!toggle) return null
  const isTabToggle = (entry) => entry.key === TAB_KEY && entry.handler === toggle.handler
  if (!handlers.some(isTabToggle)) return null
  return handlers.map((entry) => (isTabToggle(entry) ? { ...entry, handler: inert } : entry))
}

// SudokuPad's keydown handler returns early on an auto-repeat, so the swapped Tab entry never sees a held Tab. A repeated Tab is stopped
// here instead, so a dialog keeps its normal Tab.
function isHeldTabToStop (event, { toolOn, dialogOpen }) {
  return event.key === TAB_KEY && event.repeat === true && toolOn && !dialogOpen
}
