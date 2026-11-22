'use strict'
require('./fake-page-storage.js')
const test = require('node:test')
const assert = require('node:assert/strict')
const darkPage = require('../dark-page.user.js')
const penToolExtras = require('../pen-tool-extras.user.js')
const textAnywhere = require('../text-anywhere.user.js')
const autoRulesResizer = require('../auto-rules-resizer.user.js')

// Each side names the class, id or variable itself; a rename on either side alone turns one of these red.

const darkCss = darkPage.buildCss(darkPage.DEFAULT_COLOR)

test('Dark Page styles the Pen Tool Extras tray by the class Pen Tool Extras gives it', () => {
  assert.equal(darkPage.PEN_TOOL_EXTRAS_TRAY_CLASS, penToolExtras.TRAY_CLASS)
  assert.ok(darkCss.includes(`.${penToolExtras.TRAY_CLASS}`), `no .${penToolExtras.TRAY_CLASS} rule in Dark Page's CSS`)
})

test('Dark Page styles the Text Anywhere tray by the class Text Anywhere gives it', () => {
  assert.equal(darkPage.TEXT_ANYWHERE_TRAY_CLASS, textAnywhere.TRAY_CLASS)
  assert.ok(darkCss.includes(`.${textAnywhere.TRAY_CLASS}`), `no .${textAnywhere.TRAY_CLASS} rule in Dark Page's CSS`)
})

test('Dark Page styles the Auto Rules Resizer font bar by the id Auto Rules Resizer gives it', () => {
  assert.equal(darkPage.RULES_FONT_BAR_ID, autoRulesResizer.FONT_BAR_ID)
  assert.ok(darkCss.includes(`#${autoRulesResizer.FONT_BAR_ID} `), `no #${autoRulesResizer.FONT_BAR_ID} rule in Dark Page's CSS`)
})

test('Text Anywhere backs a note off the board with the page color variable Dark Page sets', () => {
  assert.ok(darkCss.includes(`${darkPage.PAGE_COLOR_VAR}: `), `Dark Page's CSS sets no ${darkPage.PAGE_COLOR_VAR}`)
  const board = { left: 100, right: 500, top: 100, bottom: 500 }
  assert.ok(textAnywhere.noteBackdrop([99, 300], board).startsWith(`var(${darkPage.PAGE_COLOR_VAR}, `), 'an off-board note\'s backdrop reads Dark Page\'s variable')
})

test('Dark Page keeps its button borders off the Text Anywhere tool by the tool name Text Anywhere registers', () => {
  assert.ok(darkCss.includes(`:not(.tool-${textAnywhere.TOOL_NAME})`), `no :not(.tool-${textAnywhere.TOOL_NAME}) in Dark Page's CSS`)
})
