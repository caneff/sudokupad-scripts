// ==UserScript==
// @name         SudokuPad No Tab Letters
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.1.1
// @description  Stops a stray Tab from switching SudokuPad's number pad to letters. The letter button and the / key still switch it.
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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { withInertTab, ignoreKey }
  }
  if (typeof document === 'undefined') return

  // The match also covers other crackingthecryptic.com pages, which have no Framework.
  if (typeof Framework === 'undefined') return
  if (!Framework.getApp) {
    console.warn('no-tab-letters: SudokuPad\'s Framework has no getApp, so nothing was changed')
    return
  }

  // The "Enable Letter Tool" setting adds and removes ToolLetter's one `tool` object, so a list set
  // on it holds whenever the tool is on. Setting it on the object shadows the shared prototype's list.
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
