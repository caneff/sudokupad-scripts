// ==UserScript==
// @name         SudokuPad No Tab Letters
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.1.0
// @description  Stops Tab from toggling SudokuPad's letter mode, so a stray Tab no longer switches the number pad to letters and saves that choice. During play Tab does nothing, as before; the letter button and "/" still toggle it, and Tab still moves focus in dialogs.
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

  // What Tab does in play: nothing. SudokuPad's toggle handler also stops the key's default, so a
  // Tab pressed over the puzzle leaves focus where it is; this handler keeps that and drops the toggle.
  function ignoreKey (event) {
    event.preventDefault()
  }

  // SudokuPad's key handlers for a tool are { key, handler } entries. Returns them with the Tab
  // entry that shares the "/" entry's handler (the letter toggle) given `inert` as its handler;
  // every other entry is kept as it is. Null when there is no such Tab entry to change: no "/"
  // entry to name the toggle, or no Tab entry bound to it.
  function withInertTab (handlers, inert) {
    if (!Array.isArray(handlers)) return null
    const toggle = handlers.find((entry) => entry.key === TOGGLE_KEY)
    if (!toggle) return null
    const isTabToggle = (entry) => entry.key === TAB_KEY && entry.handler === toggle.handler
    if (!handlers.some(isTabToggle)) return null
    return handlers.map((entry) => (isTabToggle(entry) ? { ...entry, handler: inert } : entry))
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { withInertTab, ignoreKey }
  }
  if (typeof document === 'undefined') return

  // The page may not be SudokuPad's (the match covers other pages of crackingthecryptic.com), which
  // has no Framework and is left alone. A Framework without `getApp` is a SudokuPad this script
  // cannot hook, which is reported.
  if (typeof Framework === 'undefined') return
  if (!Framework.getApp) {
    console.warn('no-tab-letters: SudokuPad\'s Framework has no getApp, so nothing was changed')
    return
  }

  // `ToolLetter` is the global tool-letter.js declares; its one `tool` object is what the
  // "Enable Letter Tool" setting adds to and removes from the app, so a list set on it holds
  // whenever the tool is switched on. The list is set on the object itself, which hides the shared
  // prototype's list from it without editing that list.
  Framework.getApp().then(() => {
    const tool = typeof ToolLetter === 'undefined' ? null : ToolLetter.tool
    if (!tool) {
      console.warn('no-tab-letters: SudokuPad has no ToolLetter.tool, so nothing was changed')
      return
    }
    const changed = withInertTab(tool.keyHandlers, ignoreKey)
    if (!changed) {
      console.warn('no-tab-letters: the letter tool has no Tab binding to the toggle, so nothing was changed')
      return
    }
    tool.keyHandlers = changed
  })
})()
