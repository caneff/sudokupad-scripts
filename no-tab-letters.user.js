// ==UserScript==
// @name         SudokuPad No Tab Letters
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.1.0
// @description  Stops Tab from toggling SudokuPad's letter mode, so a stray Tab no longer switches the number pad to letters and saves that choice. The letter button and "/" still toggle it, and Tab still moves focus.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/no-tab-letters.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/no-tab-letters.user.js
// ==/UserScript==

(function () {
  'use strict'

  const TOGGLE_KEY = '/'
  const TAB_KEY = 'Tab'

  // SudokuPad's key handlers for a tool are { key, handler } entries. Returns them without the
  // entry that binds Tab to the same handler as the "/" entry, which is the letter toggle; every
  // other entry is kept as it is. Null when there is no such Tab entry to drop: no "/" entry to
  // name the toggle, or no Tab entry bound to it.
  function withoutTabToggle (handlers) {
    if (!Array.isArray(handlers)) return null
    const toggle = handlers.find((entry) => entry.key === TOGGLE_KEY)
    if (!toggle) return null
    const kept = handlers.filter((entry) => !(entry.key === TAB_KEY && entry.handler === toggle.handler))
    return kept.length === handlers.length ? null : kept
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { withoutTabToggle }
  }
  if (typeof document === 'undefined') return

  // The page may not be SudokuPad's (the match covers other pages of crackingthecryptic.com).
  if (typeof Framework === 'undefined' || !Framework.getApp) return

  // `ToolLetter` is the global tool-letter.js declares; its one `tool` object is what the
  // "Enable Letter Tool" setting adds to and removes from the app, so a list set on it holds
  // whenever the tool is switched on. The list is set on the object itself, which hides the shared
  // prototype's list from it without editing that list.
  Framework.getApp().then(() => {
    const tool = typeof ToolLetter === 'undefined' ? null : ToolLetter.tool
    const kept = tool && withoutTabToggle(tool.keyHandlers)
    if (!kept) {
      console.warn('no-tab-letters: SudokuPad\'s letter tool has no Tab binding, so nothing was changed')
      return
    }
    tool.keyHandlers = kept
  })
})()
