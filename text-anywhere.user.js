// ==UserScript==
// @name         SudokuPad Text Anywhere
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.46.1
// @description  Adds a Text Anywhere tool for typed notes on the board or beside it, such as cage sums, in colors of its own. Each puzzle keeps its own notes.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/text-anywhere.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/text-anywhere.user.js
// ==/UserScript==

(function () {
  'use strict'

  const VERSION = '0.46.1'
  const TOOL_NAME = 'textanywhere'
  const LAYER_ID = 'text-anywhere-layer'
  const DIALOG_BLUR_PX = 8
  const MIN_WIDTH = 1
  const MAX_WIDTH = 16
  const WIDTH_STEP = 0.5
  const DEFAULT_WIDTH = 6
  // Percent. The Opacity slider sets it; a note saved without one reads as the default.
  const MIN_OPACITY = 20
  const MAX_OPACITY = 100
  const OPACITY_STEP = 5
  const DEFAULT_OPACITY = 100
  // An item saves its color as a number, 1 to 9, the number of one of the nine colors, so a recolor recolors it.
  const NOTE_COLOR_COUNT = 9
  const COLOR_NUMBERS = Array.from({ length: NOTE_COLOR_COUNT }, (_, i) => i + 1)
  const DEFAULT_COLOR = 1
  const KEY_PREFIX = 'TextAnywhere_'
  // Every key was saved under this prefix before 0.45.0. Each is copied to its new name and kept, so a rolled-back version still finds it.
  const OLD_KEY_PREFIX = 'DrawTool_'
  // The shared guard saves a dismissal of the notice bar under `<createGuard's script id>-notice`. The one saved under the old id is copied as the keys are.
  const NOTICE_KEY = 'text-anywhere-notice'
  const OLD_NOTICE_KEY = 'draw-tool-notice'
  const COLOR_KEY = KEY_PREFIX + 'color'
  const COLORS_KEY = KEY_PREFIX + 'colors'
  const colorVar = (n) => `--text-anywhere-color-${n}`
  // <lib:palette>
  // Generated from lib/palette.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  /* global parseColor, darkenColor, toOklab */
  // SudokuPad's own pen colors (tool-pen.css). Color 9 is rgb(-36, -36, -36) there, which clamps to black.
  const SUDOKUPAD_PEN_COLORS = Object.freeze({
    1: '#1f8020',
    2: '#e87cf1',
    3: '#e49632',
    4: '#f53a37',
    5: '#d2be32',
    6: '#3d99f5',
    7: '#d6d6d6',
    8: '#7c7c7c',
    9: '#000000'
  })
  const PEN_COLOR_NUMBERS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9])
  // The OKLCH chroma under which a darkened color counts as grey: SudokuPad's greys are 0, a tinted dark grey such as rgb(10, 20, 30) is about 0.024, and the
  // least saturated darkened default colors are above 0.08.
  const GREY_CHROMA = 0.04
  const PAGE_PRESETS = ['page-1', 'page-2', 'page-3']
  const SUDOKUPAD_PRESET = 'sudokupad'
  const PALETTE_PRESET_LABELS = {
    'page-1': 'Darker page 1',
    'page-2': 'Darker page 2',
    'page-3': 'Darker page 3',
    [SUDOKUPAD_PRESET]: 'SudokuPad colors'
  }

  // A color set is `{ colors, preset, missing }`: the nine colors, the preset they came from, and the pens of that page with no usable color, which keep SudokuPad's own.
  const SUDOKUPAD_SET = Object.freeze({ colors: SUDOKUPAD_PEN_COLORS, preset: SUDOKUPAD_PRESET, missing: Object.freeze([]) })

  // Color N is the color at index N of the page: SudokuPad shows index K on the cell color button with data-key K, so color N lines up with cell color button N.
  // Of the darkened colors, the darkest one under GREY_CHROMA becomes #000000, so the darkest color is black as in SudokuPad's own set.
  function darkerPageColors (keys, readCell) {
    const colors = {}
    const missing = []
    const derived = []
    PEN_COLOR_NUMBERS.forEach((n) => {
      const rgb = n < keys.length ? parseColor(readCell(keys[n])) : null
      if (rgb) {
        colors[n] = darkenColor(rgb)
        derived.push(n)
      } else {
        colors[n] = SUDOKUPAD_PEN_COLORS[n]
        missing.push(n)
      }
    })
    let darkest = null
    let darkestLightness = Infinity
    for (const n of derived) {
      const [lightness, a, b] = toOklab(parseColor(colors[n]))
      if (Math.hypot(a, b) < GREY_CHROMA && lightness < darkestLightness) {
        darkest = n
        darkestLightness = lightness
      }
    }
    if (darkest) colors[darkest] = '#000000'
    return { colors, missing }
  }

  function paletteOptions (pageCount) {
    return [...PAGE_PRESETS.slice(0, pageCount), SUDOKUPAD_PRESET]
  }

  function paletteColors (preset, pages, readCell) {
    if (preset === SUDOKUPAD_PRESET) return SUDOKUPAD_SET
    const page = paletteOptions(pages.length).indexOf(preset)
    if (page === -1) throw new RangeError(`palette: ${preset} is not a preset of this palette`)
    return { ...darkerPageColors(pages[page], readCell), preset }
  }

  const colorTool = () => Framework.app?.tools?.colour

  // `init` assigns the page and sets the `--cell-color-<key>` variables in one synchronous step, so a palette on the tool means the variables are set too (the stylesheet's own
  // values for them exist earlier and say nothing about a custom palette).
  function readyColorTool () {
    const tool = colorTool()
    const pages = tool?.palette?.pages
    return Array.isArray(pages) && Array.isArray(pages[0]) ? tool : null
  }

  function palettePages () {
    const palette = colorTool()?.palette
    if (!palette) return []
    if (!Array.isArray(palette.pages) || !palette.pages.every(Array.isArray)) throw new Error('SudokuPad\'s color palette has no pages of color keys, so the Darker page presets are left out')
    return palette.pages
  }

  // A custom palette can hold any CSS color (`#f00`, `red`, `hsl()`) and the variable reads back as written, so the browser turns it into `rgb()` text on a probe.
  // '' for a value it rejects or a variable with none.
  function readRootColor (name) {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    const probe = document.createElement('span')
    probe.style.color = value
    if (!probe.style.color) return ''
    document.body.appendChild(probe)
    try {
      return window.getComputedStyle(probe).color
    } finally {
      probe.remove()
    }
  }

  const readPenColor = (n) => readRootColor(`--puzzle-pencolor-${n}`)
  // The raw `--cell-color-<key>` value, not the 60% opacity it shows with on the grid. SudokuPad sets the variable of every key in the palette, so any page reads.
  const readCellColor = (key) => readRootColor(`--cell-color-${key}`)
  /* eslint-enable no-unused-vars */
  // </lib:palette>
  const HEX_COLOR = /^#([0-9a-f]{6})$/
  // The page's own color, as SudokuPad's buttons use it behind their icons.
  const PAGE_COLOR = 'var(--body-bg, #fff)'
  const PEN_PRESET = 'pen'
  const CUSTOM = 'custom'
  const PRESET_LABELS = {
    [CUSTOM]: 'Custom',
    [PEN_PRESET]: 'Pen colors',
    ...PALETTE_PRESET_LABELS
  }
  // The next note's size is saved as a width; a text size is 2 x the width + 8.
  const WIDTH_KEY = KEY_PREFIX + 'width'
  const OUTLINE_KEY = KEY_PREFIX + 'outline'
  const OPACITY_KEY = KEY_PREFIX + 'opacity'
  const BACKGROUND_KEY = KEY_PREFIX + 'background'
  const BOX_KEY = KEY_PREFIX + 'box'
  const FRAME_KEY = KEY_PREFIX + 'frame'
  const FONT_KEY = KEY_PREFIX + 'font'
  // A character's width as a share of the text size: the widest digit of a sans-serif font, so a hit test errs wide.
  const CHAR_WIDTH = 0.6
  // A line's height as a share of the text size, in the font's own spacing, so a note's box is as tall as the note drawn.
  const LINE_HEIGHT = 1.15
  const SELECTION_TINT_PERCENT = 25
  // A note never resized wraps at this many em and stops growing at this many lines, then scrolls.
  const BOX_WIDTH_EM = 16
  const BOX_LINES = 8
  // The smallest box a resize handle leaves, in em, unless the note's auto size is smaller.
  const MIN_BOX_EM = [3, LINE_HEIGHT]
  // The least a resize leaves of any note, in em, so a box stays a target for its handles even when the note is empty.
  const GRABBABLE_EM = 0.25
  // How far, in screen pixels, the mouse may move between press and release and the press still be a click.
  const CLICK_SLOP = 4
  // A selection rectangle smaller than this, in screen pixels both ways, that selects nothing is a click that slipped.
  const RECTANGLE_CLICK_PX = 8
  const TEXT_BOX_CLASS = 'text-anywhere-textbox'
  const CLEAR_CLASS = 'text-anywhere-clear'
  const SETTINGS_CLASS = 'text-anywhere-settings'
  const BACKGROUND_CLASS = 'text-anywhere-background'
  const BACKGROUND_FILL_CLASS = 'text-anywhere-background-fill'
  const TEXT_CLASS = 'text-anywhere-text'
  const TEXT_BACKGROUND_CLASS = 'text-anywhere-text-bg'
  const SELECTED_CLASS = 'text-anywhere-selected'
  const CHECK_CLASS = 'text-anywhere-check'
  const CHECK_DONE_CLASS = 'text-anywhere-check-done'
  const CODE_CLASS = 'text-anywhere-code'
  const STRIKE_CLASS = 'text-anywhere-strike'
  const STRIKE_PIECE_CLASS = 'text-anywhere-strike-piece'
  const CODE_BLOCK_CLASS = 'text-anywhere-code-block'
  const DONE_OPACITY = 0.6
  // A note being moved is drawn at this share of its own opacity, so the board shows through.
  const MOVING_OPACITY = 0.6
  // The hover outline and the handles fade in over this long, on Material's decelerate curve.
  const FADE_IN_MS = 80
  const FADE_IN_EASE = 'cubic-bezier(0, 0, 0, 1)'
  const MOTION_OK = '(prefers-reduced-motion: no-preference)'
  const EMPTY_CLASS = 'text-anywhere-empty'
  // A handle is made with this class and loses it a frame later, which is what starts its fade in.
  const ENTERING_CLASS = 'text-anywhere-entering'
  // While a note is moved or a handle dragged, every element on the page shows the cursor this property holds.
  const HELD_CURSOR_CLASS = 'text-anywhere-holding-cursor'
  const HELD_CURSOR_VAR = '--text-anywhere-held-cursor'
  // The notes' two groups in the layer: the notes on the board, in board units under the board's own transform, and the fixed notes, in screen pixels,
  // drawn above them.
  const BOARD_NOTES_CLASS = 'text-anywhere-board'
  const SCREEN_NOTES_CLASS = 'text-anywhere-screen'
  // One screen pixel in the units of a note's group, so a note's frame is as thin on the board as off it.
  const PIXEL_VAR = '--text-anywhere-px'
  const SCROLLS_CLASS = 'text-anywhere-scrolls'
  // On the layer while Text Anywhere is current: only then do the notes take the pointer.
  const ACTIVE_CLASS = 'text-anywhere-active'
  const HANDLE_CLASS = 'text-anywhere-resize'
  const SELECTION_CLASS = 'text-anywhere-selection'
  const NUDGING_CLASS = 'text-anywhere-nudging'
  // On a note within the hit margin of the pointer but not under it, for its hover look.
  const HOVERED_CLASS = 'text-anywhere-hovered'
  const GUIDE_CLASS = 'text-anywhere-snap-guide'
  const GUIDE_PX = 1
  const SELECTION_OUTLINE_PX = 2
  const SELECTION_OFFSET_PX = 2
  const OPEN_OUTLINE_CLASS = 'text-anywhere-open-outline'
  const HANDLE_PX = 11
  // A note's own opacity, as a number, for the hover look: it draws on the note and the note's opacity multiplies into it.
  const NOTE_OPACITY_VAR = '--text-anywhere-note-opacity'
  const NOTE_COLOR_VAR = '--text-anywhere-note-color'
  const RECTANGLE_CLASS = 'text-anywhere-selection-rectangle'
  const TRAY_CLASS = 'text-anywhere-tray'
  const SLIDERS_CLASS = 'text-anywhere-sliders'
  const SLIDER_ROW_CLASS = 'text-anywhere-slider'
  const SLIDER_ROWS_CLASS = 'text-anywhere-slider-rows'
  const HIDE_ALL_CLASS = 'text-anywhere-hide-all'
  const HIDDEN_CLASS = 'text-anywhere-hidden'
  const SIZE_SLIDER = 'text-anywhere-size'
  const OPACITY_SLIDER = 'text-anywhere-opacity'
  const SIZE_LABEL = 'Size'
  const OPACITY_LABEL = 'Opacity'
  const CLASS_PREFIX = 'text-anywhere-'
  const COLORS_STYLE_ID = 'text-anywhere-colors'
  const PANEL_STYLE_ID = 'text-anywhere-style'
  const CLEAR_QUESTION = 'Clear all notes?'
  const OK_LABEL = 'OK'
  const NOTES_PREFIX = KEY_PREFIX + 'notes_'
  const OLD_NOTES_PREFIX = OLD_KEY_PREFIX + 'drawing_'
  const INDEX_KEY = KEY_PREFIX + 'index'
  // The notes a Restart cleared, kept until Undo straight after it brings them back.
  const RESTARTED_PREFIX = KEY_PREFIX + 'restarted_'
  const KEPT_PUZZLES = 50
  // How far, in screen pixels, past a note's drawn box a press, a hover or an erase still hits it.
  const HIT_MARGIN_PX = 4
  const PRIMARY_BUTTON = 0
  const SECONDARY_BUTTON = 2
  const TEXT_KIND = 'text'
  // Kinds an earlier version saved; they stay in storage and are never drawn.
  const HIDDEN_KINDS = ['stroke', 'shape']
  const TEXT_GLYPH = '<path d="M8 16.5l4-8 4 8M9.5 14h5"/>'
  // The tool button is a sticky note; the Background button shows the letter.
  const STICKY_NOTE = '<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/><path d="M8 9h8M8 13h5"/>'
  const BUTTON_ICON = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${STICKY_NOTE}</svg>`
  // The box behind a note with a background: the text's own box grown by these shares of the text size, with rounded corners.
  const BACKGROUND_PAD_X = 0.35
  const BACKGROUND_PAD_Y = 0.15
  const BACKGROUND_RADIUS = 0.3
  // An outline is the halo round a note's letters: how far it reaches past them, as a share of the text size. The settings dialog sets one for every note; a
  // note's own saved `outline` field is never read.
  const OUTLINE_EM = { none: 0, thin: 0.07, medium: 0.14 }
  const OUTLINES = Object.keys(OUTLINE_EM)
  const DEFAULT_OUTLINE = 'medium'
  const OUTLINE_LABELS = { none: 'None', thin: 'Thin', medium: 'Thick' }
  const readOutline = (saved) => OUTLINES.includes(saved) ? saved : DEFAULT_OUTLINE
  // text-shadow joins with round corners, which -webkit-text-stroke does not: its miters grow spikes on A, V, W, M and 4. The ring of shadows is in em, so it follows the font size.
  const HALO_SHADOWS = 16
  function haloShadow (outline, color) {
    const reach = OUTLINE_EM[outline]
    if (reach === 0) return 'none'
    const em = (value) => Math.round(value * 1000) / 1000
    return Array.from({ length: HALO_SHADOWS }, (_, k) => {
      const angle = 2 * Math.PI * k / HALO_SHADOWS
      return `${em(reach * Math.cos(angle))}em ${em(reach * Math.sin(angle))}em 0 ${color}`
    }).join(', ')
  }

  const roundToTenth = (value) => Math.round(value * 10) / 10
  // A placed note's point is kept to a hundredth, fine enough to put its drawn left and top on a whole device pixel.
  const roundToHundredth = (value) => Math.round(value * 100) / 100

  const cross = ([ax, ay], [bx, by], [cx, cy]) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  const segmentsCross = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0

  // Markers in the order they are tried, each with the flag it sets. `**` comes before `*` and `__` before `_`, so a double marker is never read as two single ones.
  const FLAGS = ['bold', 'italic', 'strike', 'underline', 'code']
  const MARKERS = [['**', 'bold'], ['__', 'underline'], ['~~', 'strike'], ['*', 'italic'], ['_', 'italic']]
  // An underscore is not a word character here, so `___a___` opens `_` after the `__`.
  const isWordChar = (char) => char !== undefined && /[^\W_]/.test(char)
  const isSpace = (char) => char === undefined || /\s/.test(char)

  // A pair of backticks with nothing between is no span; `open` is the last backtick left without a partner.
  function codeSpans (line) {
    const spans = []
    let at = line.indexOf('`')
    while (at !== -1) {
      const end = line.indexOf('`', at + 1)
      if (end === -1) return { spans, open: at }
      if (end > at + 1) {
        spans.push([at, end + 1])
        at = line.indexOf('`', end + 1)
      } else at = end
    }
    return { spans, open: -1 }
  }

  // One line of a note as runs of text, each `{ text }` with its `bold`, `italic`, `strike`, `underline` or `code` flag set where it applies. Inside inline code nothing else is read.
  // A marker opens only before a non-space and closes only after one, `_` only at a word's edge and never as half of a `__` that did not open, and a marker with no partner shows as typed.
  function parseLine (line) {
    const memo = new Map()
    const codeEnds = new Map(codeSpans(line).spans)
    const add = (runs, run) => {
      const last = runs[runs.length - 1]
      if (last && FLAGS.every((flag) => Boolean(last[flag]) === Boolean(run[flag]))) last.text += run.text
      else runs.push({ ...run })
    }
    // The runs from `at` up to the marker that closes `stop`, or to the end when `stop` is empty; `closed` says whether it was found.
    function read (at, stop) {
      const key = `${stop}@${at}`
      if (memo.has(key)) return memo.get(key)
      const runs = []
      let i = at
      let result = null
      while (i < line.length && !result) {
        const codeEnd = codeEnds.get(i)
        const opener = !codeEnd && MARKERS.find(([mark]) => line.startsWith(mark, i) && !isSpace(line[i + mark.length]) && !(mark === '_' && (isWordChar(line[i - 1]) || line[i + 1] === '_')))
        const inner = opener && read(i + opener[0].length, opener[0])
        if (codeEnd) {
          add(runs, { text: line.slice(i + 1, codeEnd - 1), code: true })
          i = codeEnd
        } else if (inner && inner.closed) {
          for (const run of inner.runs) add(runs, { ...run, [opener[1]]: true })
          i = inner.end
        } else if (stop && line.startsWith(stop, i) && i > at && !isSpace(line[i - 1]) && !(stop === '_' && isWordChar(line[i + 1]))) {
          result = { runs, end: i + stop.length, closed: true }
        } else {
          const mark = opener ? opener[0] : line[i]
          add(runs, { text: mark })
          i += mark.length
        }
      }
      result ??= { runs, end: i, closed: false }
      memo.set(key, result)
      return result
    }
    return read(0, '').runs
  }

  const INDENT_SPACES = 2
  const INDENT = `((?:${' '.repeat(INDENT_SPACES)})*)`
  const BULLET_MARK = new RegExp(`^${INDENT}[-*] `)
  const NUMBER_MARK = new RegExp(`^${INDENT}(\\d+\\.) `)
  // The end of the line ends the match too, so an empty item still matches once `closedText` has dropped its trailing space.
  const CHECK_MARK = new RegExp(`^${INDENT}([-*] )?\\[([ xX]?)\\](?: |$)`)
  const HEADER_MARK = /^(#{1,3}) /
  const SUBTEXT_MARK = '-# '
  const isTicked = (state) => /x/i.test(state)
  const listMark = (indent, mark) => ({ ...mark, bullet: true, ...(indent && { level: indent.length / INDENT_SPACES }) })
  // A list line's first run is its marker, `{ text: '•', bullet: true }`, with `level` when nested. A numbered item's marker is its number as typed, with `numbered: true`.
  // A checklist line takes the bullet's place with `{ text: '☐' | '☑', bullet: true, checked }`. A header line's first run is `{ text: '', header: 1 | 2 | 3 }`, a subtext line's `{ text: '', subtext: true }`.
  function parseBlock (line) {
    const check = CHECK_MARK.exec(line)
    if (check) {
      const checked = isTicked(check[3])
      return [listMark(check[1], { text: checked ? '☑' : '☐', checked }), ...parseLine(line.slice(check[0].length))]
    }
    const bullet = BULLET_MARK.exec(line)
    if (bullet) return [listMark(bullet[1], { text: '•' }), ...parseLine(line.slice(bullet[0].length))]
    const number = NUMBER_MARK.exec(line)
    if (number) return [listMark(number[1], { text: number[2], numbered: true }), ...parseLine(line.slice(number[0].length))]
    const header = HEADER_MARK.exec(line)
    if (header) return [{ text: '', header: header[1].length }, ...parseLine(line.slice(header[0].length))]
    return line.startsWith(SUBTEXT_MARK) ? [{ text: '', subtext: true }, ...parseLine(line.slice(SUBTEXT_MARK.length))] : parseLine(line)
  }

  const FENCE_OPEN = /^```[^\s`]*[ \t]*$/
  const FENCE_CLOSE = /^```[ \t]*$/
  // What each line is: 'fence' (an opening or closing line), 'code' (between them; an unclosed block runs to the end of the note) or 'text'.
  function lineKinds (lines) {
    let fenced = false
    return lines.map((line) => {
      if ((fenced ? FENCE_CLOSE : FENCE_OPEN).test(line)) {
        fenced = !fenced
        return 'fence'
      }
      return fenced ? 'code' : 'text'
    })
  }

  // Whether the character at index `at` of `text` is code: in a block or in inline code. While `typing`, text after a backtick with no partner yet counts too, since the typist is mid-span.
  function inCode (text, at, typing) {
    const lineStart = at === 0 ? 0 : text.lastIndexOf('\n', at - 1) + 1
    const lines = text.slice(0, at).split('\n')
    if (lineKinds(lines).pop() === 'code') return true
    const lineEnd = text.indexOf('\n', lineStart)
    const { spans, open } = codeSpans(text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd))
    const index = at - lineStart
    return (typing && open !== -1 && index > open) || spans.some(([start, end]) => index > start && index < end)
  }

  function toggledCheck (text, index) {
    return text.split('\n').map((line, i) => i === index ? line.replace(CHECK_MARK, (mark, indent, dash = '', state) => `${indent}${dash}[${isTicked(state) ? ' ' : 'x'}]${mark.endsWith(' ') ? ' ' : ''}`) : line).join('\n')
  }

  // Symbols typed as ASCII. `sum` is a word of its own, so "summary" stays.
  const SYMBOLS = { '->': '→', '<-': '←', '!=': '≠', '<=': '≤', '>=': '≥', sum: 'Σ' }
  const SYMBOL_PATTERN = /->|<-|!=|<=|>=|\bsum\b/g
  // A note that ends in the word `sum` has no character typed after it to complete it, so closing the note does.
  const closedSymbols = (text) => inCode(text, text.length - 1, false) ? text : text.replace(/\bsum$/, SYMBOLS.sum)

  // What a closed note keeps of its typed text: trailing spaces and tabs go from every line, and blank lines before and after the text go, so a note of
  // only spaces is empty. Line breaks inside the text stay.
  const closedText = (typed) => typed.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '')

  // The symbol the character just typed before `caret` completed, or null. A pair is complete at the caret; `sum` only once a character that is not part of a word follows it.
  function symbolJustTyped (text, caret) {
    for (const found of text.slice(0, caret).matchAll(SYMBOL_PATTERN)) {
      const end = found.index + found[0].length
      if (inCode(text, end - 1, true)) continue
      if (end === caret && found[0] !== 'sum') return { start: found.index, end, symbol: SYMBOLS[found[0]] }
      if (end === caret - 1 && found[0] === 'sum') return { start: found.index, end, symbol: SYMBOLS.sum }
    }
    return null
  }

  const isBullet = (runs) => Boolean(runs[0]?.bullet)
  const BULLET_INDENT_EM = 1.2
  // A number wider than "1." (two characters) pushes its text right by this much for each character more.
  const NUMBER_DIGIT_EM = 0.5
  const HEADER_SCALES = [1.5, 1.25, 1.1]
  const SUBTEXT_SCALE = 0.8
  const SUBTEXT_OPACITY = 0.6
  const levelIndentEm = (mark) => (mark.level ?? 0) * BULLET_INDENT_EM
  const markerIndentEm = (mark) => BULLET_INDENT_EM + (mark.numbered ? Math.max(0, mark.text.length - 2) * NUMBER_DIGIT_EM : 0)
  const isSizedLine = (runs) => Boolean(runs[0]?.header || runs[0]?.subtext)
  const lineScale = (runs) => runs[0]?.header ? HEADER_SCALES[runs[0].header - 1] : runs[0]?.subtext ? SUBTEXT_SCALE : 1

  // A note's text as one list of runs per line; a marker does not reach across a line break. A fence line is `[{ text: '', fence: true }]`; a line between fences is one run of its text as typed.
  function parseMarkdown (text) {
    const lines = text.split('\n')
    const kinds = lineKinds(lines)
    return lines.map((line, i) => kinds[i] === 'fence' ? [{ text: '', fence: true }] : kinds[i] === 'code' ? [{ text: line }] : parseBlock(line))
  }

  // Each text parsed once: a redraw, a move or a recolor reads a note's runs again without parsing it again.
  const parsedTexts = new Map()
  function parsedText (text) {
    if (!parsedTexts.has(text)) parsedTexts.set(text, parseMarkdown(text))
    return parsedTexts.get(text)
  }

  const shownLength = (runs) => runs.reduce((sum, run) => sum + run.text.length, 0)

  // A line's width in characters of the note's size: a list marker's indent is wider than the text its run holds, and a header's characters are larger.
  function lineChars (runs) {
    const markerChars = isBullet(runs) ? (levelIndentEm(runs[0]) + markerIndentEm(runs[0])) / CHAR_WIDTH - runs[0].text.length : 0
    return (shownLength(runs) + markerChars) * lineScale(runs)
  }

  // The size a note was last drawn at, in board units, kept on its item under a symbol, which a spread copies and JSON leaves out, so no save stores it.
  const DRAWN_SIZE = Symbol('drawn size')

  function noteSize (item) {
    if (item.box) return item.box
    if (item[DRAWN_SIZE]) return item[DRAWN_SIZE]
    const lines = parsedText(item.text)
    const widths = lines.map((runs) => Math.max(1, lineChars(runs)) * CHAR_WIDTH)
    const rows = widths.reduce((sum, width, i) => sum + Math.ceil(width / BOX_WIDTH_EM) * lineScale(lines[i]), 0)
    return [Math.min(BOX_WIDTH_EM, Math.max(...widths)) * item.size, Math.min(BOX_LINES, rows) * LINE_HEIGHT * item.size]
  }

  // The box a text takes on the board: its point is the top left of the text, so the first character starts where the solver clicked.
  function textRect (item) {
    const [width, height] = noteSize(item)
    const [x, y] = item.at
    return { left: x, right: x + width, top: y, bottom: y + height }
  }

  const backgroundPadding = (item) => [BACKGROUND_PAD_X, BACKGROUND_PAD_Y].map((share) => share * item.size)

  function notePadding (item, outline) {
    return item.bg ? backgroundPadding(item) : Array(2).fill(OUTLINE_EM[outline] * item.size)
  }

  function noteBox (item) {
    const box = textRect(item)
    if (!item.bg) return box
    const [padX, padY] = backgroundPadding(item)
    return { left: box.left - padX, right: box.right + padX, top: box.top - padY, bottom: box.bottom + padY }
  }

  const inBox = ([x, y], box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom

  const grownBox = (box, margin) => ({ left: box.left - margin, right: box.right + margin, top: box.top - margin, bottom: box.bottom + margin })

  // The last box is the topmost.
  const noteAtPoint = (boxes, point, margin) => boxes.findLastIndex((box) => inBox(point, grownBox(box, margin)))

  function notesTouched (notes, [ax, ay], [bx, by]) {
    const [left, right, top, bottom] = [Math.min(ax, bx), Math.max(ax, bx), Math.min(ay, by), Math.max(ay, by)]
    return notes.flatMap((item, i) => {
      if (item.kind !== TEXT_KIND) return []
      const box = noteBox(item)
      return box.left <= right && box.right >= left && box.top <= bottom && box.bottom >= top ? [i] : []
    })
  }

  function touchesBox (box, from, to) {
    if (inBox(from, box) || inBox(to, box)) return true
    const corners = [[box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom]]
    return corners.some((corner, i) => segmentsCross(from, to, corner, corners[(i + 1) % 4]))
  }

  const roundPoint = ([x, y]) => [roundToHundredth(x), roundToHundredth(y)]

  // A note put down at screen point `point` is pinned to the grid in board units when the point is over the board, and is
  // fixed on the screen, under its own `fixed` field, when it is not: an older version reads every note's `at` as board units.
  // `board` is the board's screen box and the map from a screen point to board units.
  function placedItem (item, point, board) {
    const { at, fixed, ...rest } = item
    return inBox(point, board.box) ? { ...rest, at: roundPoint(board.toBoard(point)) } : { ...rest, fixed: roundPoint(point) }
  }

  // A fixed note whose point the window or the layout has put out of reach is drawn at a point it can be reached at, kept on its item under this symbol with
  // the stored point it was worked out for: a spread copies it and JSON leaves it out, so no save stores it, and a note given a new point is drawn at that one.
  const SHOWN_AT = Symbol('shown at')

  const drawnPoint = (item) => item[SHOWN_AT]?.from === item.fixed ? item[SHOWN_AT].point : item.fixed

  // The note in board units, wherever it is stored, so a selection rectangle and an erase test notes on and off the board alike.
  const boardView = (item, toBoard) => item.fixed ? { ...item, at: toBoard(drawnPoint(item)) } : item

  const screenPoint = (item, toScreen) => item.fixed ? drawnPoint(item) : toScreen(item.at)

  // The box a note's element takes on the screen, padding included, worked out from its item rather than measured: `map` has the maps between board
  // units and the screen.
  function noteScreenBox (item, map, outline) {
    const box = textRect(boardView(item, map.toBoard))
    const [padX, padY] = notePadding(item, outline)
    const [left, top] = map.toScreen([box.left - padX, box.top - padY])
    const [right, bottom] = map.toScreen([box.right + padX, box.bottom + padY])
    return { left, right, top, bottom }
  }

  function noteMiddle (item, map, outline) {
    const { left, right, top, bottom } = noteScreenBox(item, map, outline)
    return [(left + right) / 2, (top + bottom) / 2]
  }

  // The gap left to the window's edge, so the half pixel a note's measured size and its rounded point can differ by never puts it back out of reach.
  const REACH_MARGIN_PX = 1
  const PIXEL_SNAP_EPSILON_PX = 0.005

  // The point nearest `[x, y]` for the middle of a note box `width` by `height` that lies wholly inside `win`, in screen pixels.
  function reachablePoint ([x, y], [width, height], win) {
    if (win.right <= win.left || win.bottom <= win.top) return [x, y]
    const clamp = (value, low, high) => low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value))
    const [spanX, spanY] = [width / 2 + REACH_MARGIN_PX, height / 2 + REACH_MARGIN_PX]
    return [clamp(x, win.left + spanX, win.right - spanX), clamp(y, win.top + spanY, win.bottom - spanY)]
  }

  const CORNERS = { topLeft: [-1, -1], topRight: [1, -1], bottomLeft: [-1, 1], bottomRight: [1, 1] }

  // The note with the box corner `corner` of CORNERS dragged to screen point `point`, the opposite corner kept at screen point `anchor`. The box is in board
  // units on the board and off it, since a note off the board is drawn at the board's scale too; the note's point moves to the box's new top left, pinned or fixed as it was.
  // A short note can shrink back to its `autoSize` in board units, which is why the floor is not MIN_BOX_EM alone.
  function resizedItem (item, anchor, point, board, corner, autoSize) {
    const box = [0, 1].map((i) => roundToTenth(Math.max(GRABBABLE_EM * item.size, Math.min(MIN_BOX_EM[i] * item.size, autoSize[i]), corner[i] * (point[i] - anchor[i]) / board.scale)))
    const topLeft = [0, 1].map((i) => corner[i] < 0 ? anchor[i] - box[i] * board.scale : anchor[i])
    const { at, fixed, ...rest } = item
    return item.fixed ? { ...rest, box, fixed: roundPoint(topLeft) } : { ...rest, box, at: roundPoint(board.toBoard(topLeft)) }
  }

  function autoSized (item) {
    const { box, ...rest } = item
    return rest
  }

  const isClick = (points) => points.every(([x, y]) => Math.hypot(x - points[0][0], y - points[0][1]) <= CLICK_SLOP)

  const isSmallRectangle = (points) => {
    const [[ax, ay], [bx, by]] = [points[0], points[points.length - 1]]
    return Math.abs(bx - ax) < RECTANGLE_CLICK_PX && Math.abs(by - ay) < RECTANGLE_CLICK_PX
  }

  // A keypad button's data-value is text, and Framework.getData parses a saved number back as a number.
  function noteColorNumber (value) {
    const n = typeof value === 'string' && /^[0-9]$/.test(value) ? Number(value) : value
    return Number.isInteger(n) && n >= 1 && n <= NOTE_COLOR_COUNT ? n : undefined
  }
  const readColor = (saved) => noteColorNumber(saved) ?? DEFAULT_COLOR
  const onSlider = (value, min, max, step) => isNumber(value) && value >= min && value <= max && Number.isInteger((value - min) / step)
  const isWidth = (value) => onSlider(value, MIN_WIDTH, MAX_WIDTH, WIDTH_STEP)
  const isOpacity = (value) => onSlider(value, MIN_OPACITY, MAX_OPACITY, OPACITY_STEP)
  const readWidth = (saved) => isWidth(saved) ? saved : DEFAULT_WIDTH
  const readFlag = (saved) => saved === true
  const readBackground = readFlag
  const BOX_PRESETS = { page: 'Page', white: 'White', yellow: 'Yellow', tint: 'Tint' }
  const BOX_CUSTOM = 'custom'
  const BOX_CUSTOM_LABEL = 'Own'
  const BOX_WHITE = '#ffffff'
  const DEFAULT_BOX_COLOR = 'page'
  const BOX_YELLOW = '#fff4b0'
  const BOX_TINT_PERCENT = 15
  const readBoxColor = (saved) => Object.hasOwn(BOX_PRESETS, saved) ? saved : savedHex(saved) ?? DEFAULT_BOX_COLOR
  const boxChoice = (setting) => Object.hasOwn(BOX_PRESETS, setting) ? setting : BOX_CUSTOM
  const BOX_FILLS = {
    page: () => PAGE_COLOR,
    white: () => BOX_WHITE,
    yellow: () => BOX_YELLOW,
    tint: (noteColor) => `color-mix(in srgb, ${noteColor} ${BOX_TINT_PERCENT}%, ${PAGE_COLOR})`
  }
  const boxFill = (setting, noteColor) => BOX_FILLS[setting]?.(noteColor) ?? setting
  // The frame is one screen pixel: PIXEL_VAR is that in the units of a note's group, and a fixed note's group, in screen pixels, sets none.
  const FRAME_COLOR = '#c4c4c4'
  const readFrame = readFlag
  const frameShadow = (on) => on ? `0 0 0 var(${PIXEL_VAR}, 1px) ${FRAME_COLOR}` : 'none'
  const FONT_PROPORTIONAL = 'proportional'
  const FONT_FIXED = 'fixed'
  const FONTS = { [FONT_PROPORTIONAL]: 'Proportional', [FONT_FIXED]: 'Fixed width' }
  const DEFAULT_FONT = FONT_PROPORTIONAL
  const FIXED_FONT_STACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
  const readFont = (saved) => Object.hasOwn(FONTS, saved) ? saved : DEFAULT_FONT
  const noteFontFamily = (font, boardFont) => font === FONT_FIXED ? FIXED_FONT_STACK : boardFont
  // Classed as the color pulldown, whose look the dialog's stylesheet already gives (colorBlockCss); a copy of that rule would drift from it.
  const renderFontChoice = (font) =>
    `<div class="${CLASS_PREFIX}color-block"><select class="${CLASS_PREFIX}color-choice" data-role="font-choice" aria-label="Font">${Object.entries(FONTS).map(([value, label]) => `<option value="${value}"${value === font ? ' selected' : ''}>${label}</option>`).join('')}</select></div>`
  const HALO_CELL_COLOR = '#8fb8e8'
  const SAMPLE_BOX_STYLE = 'display:inline-block;padding:0.15em 0.35em;border-radius:0.3em'
  const FRAME_CHOICES = [['off', 'None'], ['on', 'Thin grey']]
  function renderSamplePicks ({ outline, box, custom, frame, textColor }) {
    const pickButton = (role, value, label, pressed, sample) =>
      `<button type="button" class="${CLASS_PREFIX}pick" data-role="${role}" data-value="${value}" aria-label="${escapeHtml(label)}" aria-pressed="${pressed}">${sample}<span class="${CLASS_PREFIX}pick-label">${escapeHtml(label)}</span></button>`
    const row = (title, note, buttons, after = '') => `<div class="${CLASS_PREFIX}section-title">${title}</div><div class="${CLASS_PREFIX}pick-note">${note}</div><div class="${CLASS_PREFIX}pick-row">${buttons.join('')}</div>${after}`
    const halo = (name) => `<span class="${CLASS_PREFIX}sample" data-cell style="background:${HALO_CELL_COLOR};color:${escapeHtml(textColor)};font-size:26px;text-shadow:${escapeHtml(haloShadow(name, PAGE_COLOR))}">A</span>`
    const boxed = (fill, framed) => `<span class="${CLASS_PREFIX}sample" style="color:${escapeHtml(textColor)};font-size:18px"><span style="${SAMPLE_BOX_STYLE};background:${escapeHtml(fill)};box-shadow:${frameShadow(framed)}">A=B</span></span>`
    const choice = boxChoice(box)
    const fillFor = (id) => id === BOX_CUSTOM ? custom : boxFill(id, textColor)
    return row('Halo round the letters', 'For notes without a box, so they read over digits and grid lines.', OUTLINES.map((name) => pickButton('outline-pick', name, OUTLINE_LABELS[name], outline === name, halo(name)))) +
      row('Box color', 'For notes made with the Background button on.',
        [...Object.keys(BOX_PRESETS), BOX_CUSTOM].map((id) => pickButton('box-pick', id, BOX_PRESETS[id] ?? BOX_CUSTOM_LABEL, choice === id, boxed(fillFor(id), frame))),
        choice === BOX_CUSTOM ? `<input type="color" class="${CLASS_PREFIX}swatch" data-role="box-custom" value="${escapeHtml(custom)}" aria-label="Own box color" title="Own box color">` : '') +
      row('Box border', 'The line round a note with a box.',
        FRAME_CHOICES.map(([value, label]) => pickButton('frame-pick', value, label, frame === (value === 'on'), boxed(fillFor(choice), value === 'on'))))
  }
  // Board units, as a text's height.
  const TEXT_SIZE_PER_WIDTH = 2
  const TEXT_SIZE_BASE = 8
  const textSizeFor = (width) => TEXT_SIZE_PER_WIDTH * width + TEXT_SIZE_BASE
  const sizeStep = (width, direction) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width + direction * WIDTH_STEP))
  const widthFor = (size) => (size - TEXT_SIZE_BASE) / TEXT_SIZE_PER_WIDTH
  const itemOpacity = (item) => item.opacity ?? DEFAULT_OPACITY
  const noteOpacity = (item) => itemOpacity(item) / 100
  const readOpacity = (saved) => isOpacity(saved) ? saved : DEFAULT_OPACITY

  // A color or background the notes do not share is null; a slider must show one value, so it shows the first note's (the oldest).
  function panelLooks (items) {
    const shared = (values) => values.every((v) => v === values[0]) ? values[0] : null
    return { color: shared(items.map((item) => item.color)), width: widthFor(items[0].size), opacity: itemOpacity(items[0]), bg: shared(items.map((item) => Boolean(item.bg))) }
  }

  // Whether closing the open note `item` with `text` changes the saved note `before` (null for a new note, which began empty): its text, or its color, size,
  // opacity, background or box.
  const noteChanged = (item, text, before) => text !== (before?.text ?? '') ||
    (before !== null && (item.color !== before.color || item.size !== before.size || itemOpacity(item) !== itemOpacity(before) || Boolean(item.bg) !== Boolean(before.bg) || String(item.box) !== String(before.box)))

  // Where the note at index `index` sits after the notes `keep` marks false went, or -1 when it went (or was never saved, as a new note's -1).
  const indexAfterKeep = (index, keep) => index < 0 || !keep[index] ? -1 : keep.slice(0, index).filter(Boolean).length

  // Which notes a change of color, size, opacity or Background reaches besides the next note's setting: the open note, else the selected ones, else none.
  const lookTarget = (editing, selected) => editing ? 'open' : selected.length ? 'selected' : 'next'

  const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
  // <lib:plain>
  // Generated from lib/plain.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  const rem = (value) => Math.round(value * 100) / 100

  // SudokuPad hands every tool the keys typed into a page field too, so a key typed into a field is left to it.
  const typedIntoField = (event) => Boolean(event.target && event.target.closest && event.target.closest('input, textarea, select, [contenteditable]'))
  /* eslint-enable no-unused-vars */
  // </lib:plain>

  // <lib:write-style>
  // Generated from lib/write-style.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // The page's style element `id`, added on the first call, holds `css`.
  function writeStyle (id, css, doc = document) {
    let style = doc.getElementById(id)
    if (!style) {
      style = doc.createElement('style')
      style.id = id
      doc.head.appendChild(style)
    }
    style.textContent = css
  }
  /* eslint-enable no-unused-vars */
  // </lib:write-style>
  // <lib:store>
  // Generated from lib/store.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  /* global isPlainObject */
  // A saved value is `{ v, data }`, so a later change to its shape has a version to migrate from; a value saved before the envelope is
  // version 0, and so is every shape saved so far. A version above this one was saved by a later script, and is unreadable here.
  const STORE_VERSION = 0
  const UNREADABLE_SUFFIX = '_unreadable'

  const isEnvelope = (raw) => isPlainObject(raw) && Number.isInteger(raw.v) && Object.hasOwn(raw, 'data') && Object.keys(raw).length === 2

  // The first free slot, `<key>_unreadable`, then `<key>_unreadable2` and on, or the one already holding `raw`: no kept copy is ever replaced.
  function keptSlot (store, key, raw) {
    const same = JSON.stringify(raw)
    for (let n = 1; ; n++) {
      const slot = key + UNREADABLE_SUFFIX + (n === 1 ? '' : n)
      const held = store.getData(slot)
      if (held === null || JSON.stringify(held) === same) return { slot, copied: held === null }
    }
  }

  function readSaved (raw, read) {
    if (isEnvelope(raw) && raw.v > STORE_VERSION) throw new Error(`it was saved by a later version (version ${raw.v})`)
    const value = read(isEnvelope(raw) ? raw.data : raw)
    if (value === undefined) throw new Error('its reader refused it')
    return value
  }

  // `read` returns the value, or undefined for one it refuses, as a paste reader does. A value that cannot be read is copied aside before
  // anything can save over it, through the store's `keep` when it has one: a copy the browser refuses must stop saving, not be forgotten.
  function load (store, { key, read }) {
    const raw = store.getData(key)
    if (raw === null) return { value: undefined }
    try {
      return { value: readSaved(raw, read) }
    } catch (error) {
      const unreadable = error.message || String(error) || 'its reader threw'
      const { slot, copied } = keptSlot(store, key, raw)
      if (copied) {
        if (store.keep) store.keep(slot, raw)
        else store.setData(slot, raw)
        console.warn(`${key}: the saved value could not be read (${unreadable}); it is kept under ${slot}`)
      }
      return { value: undefined, unreadable }
    }
  }

  const hasUnreadable = (store, key) => store.getData(key + UNREADABLE_SUFFIX) !== null

  // A puzzle's saved data is keyed by its id; one with none of its own (a replay or a pack) is told apart by its page URL.
  const puzzleKey = (puzzleId, href) => String(puzzleId || href)

  function save (store, key, data) {
    store.setData(key, { v: STORE_VERSION, data })
  }
  /* eslint-enable no-unused-vars */
  // </lib:store>

  // <lib:color-math>
  // Generated from lib/color-math.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  const clamp255 = (x) => Math.max(0, Math.min(255, x))

  // The share of its OKLCH lightness a cell color keeps when darkened: low enough to read against cell colors drawn at 60% opacity, high enough that the lightest still show as 5px lines on white and the nine stay apart.
  const LIGHTNESS_FACTOR = 0.75
  const GAMUT_EDGE = 1e-6
  const LIGHT_TEXT = '#dddddd'
  const DARK_TEXT = '#222222'

  const COLOR_FUNCTION = /^(rgb|hsl)a?\(([^)]*)\)$/
  const HEX_DIGITS = /^#([0-9a-f]{3}|[0-9a-f]{6})$/
  const HEX_ALPHA = /^#[0-9a-f]{3}([0-9a-f])$|^#[0-9a-f]{6}([0-9a-f]{2})$/

  const alphaOf = (text) => text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text)

  function colorFunction (value) {
    const fn = COLOR_FUNCTION.exec(value)
    if (!fn) return null
    const parts = fn[2].split(/[,/\s]+/).filter(Boolean)
    return { kind: fn[1], args: parts.slice(0, 3), alpha: parts.length > 3 ? alphaOf(parts[3]) : undefined }
  }

  // A page lists `transparent`, or a color with alpha 0, to leave a slot empty (key 0 of each default page).
  function isTransparent (text) {
    if (typeof text !== 'string') return false
    const value = text.trim().toLowerCase()
    if (value === 'transparent') return true
    const hex = HEX_ALPHA.exec(value)
    if (hex) return parseInt(hex[1] ?? hex[2], 16) === 0
    const fn = colorFunction(value)
    return Boolean(fn && fn.alpha <= 0)
  }

  // SudokuPad's own cell color 3 is `rgb(-36, -36, -36)`, which clamps to black.
  function parseColor (text) {
    if (typeof text !== 'string' || isTransparent(text)) return null
    const value = text.trim().toLowerCase()
    const hex = HEX_DIGITS.exec(value)
    if (hex) {
      const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
      return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16))
    }
    const fn = colorFunction(value)
    if (!fn || fn.kind !== 'rgb' || fn.args.length < 3) return null
    const channels = fn.args.map(Number)
    return channels.some(Number.isNaN) ? null : channels.map((x) => Math.round(clamp255(x)))
  }

  const toHex = (rgb) => '#' + rgb.map((x) => Math.round(clamp255(x)).toString(16).padStart(2, '0')).join('')

  const toLinear = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  const fromLinear = (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)

  // Ottosson's published matrices. The way back returns the unclamped linear channels, so a caller can tell an out-of-gamut color.
  function toOklab ([r, g, b]) {
    const [lr, lg, lb] = [r, g, b].map(toLinear)
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    ]
  }

  function fromOklabLinear ([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
    ]
  }

  const inGamut = (linear) => linear.every((x) => x >= -GAMUT_EDGE && x <= 1 + GAMUT_EDGE)

  // Lowering lightness at fixed chroma can leave sRGB, so chroma is reduced just far enough to fit (a bisection), which keeps the hue.
  function darkenColor (rgb) {
    const [L, a, b] = toOklab(rgb.map(clamp255))
    const target = L * LIGHTNESS_FACTOR
    let low = 1
    if (!inGamut(fromOklabLinear([target, a, b]))) {
      low = 0
      let high = 1
      for (let i = 0; i < 30; i++) {
        const mid = (low + high) / 2
        if (inGamut(fromOklabLinear([target, a * mid, b * mid]))) low = mid
        else high = mid
      }
    }
    const out = fromOklabLinear([target, a * low, b * low])
    return toHex(out.map((x) => fromLinear(Math.max(0, Math.min(1, x)))))
  }

  function wcagLuminance (rgb) {
    const [r, g, b] = rgb.map((c) => {
      const x = c / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  // `light` or `dark` (LIGHT_TEXT and DARK_TEXT unless given), whichever contrasts more with the background color (any parseColor text).
  function textColorFor (background, light = LIGHT_TEXT, dark = DARK_TEXT) {
    const rgb = parseColor(background)
    if (!rgb) throw new RangeError(`color-math: ${background} is not a color`)
    const page = wcagLuminance(rgb) + 0.05
    const contrast = (text) => { const t = wcagLuminance(parseColor(text)) + 0.05; return Math.max(page, t) / Math.min(page, t) }
    return contrast(light) >= contrast(dark) ? light : dark
  }
  /* eslint-enable no-unused-vars */
  // </lib:color-math>
  // <lib:color-picker>
  // Generated from lib/color-picker.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  /* global PEN_COLOR_NUMBERS */
  // SudokuPad's color tool holds its cell color buttons for the same 1000 ms (HoldToEditDelayMs).
  const HOLD_TO_EDIT_MS = 1000
  const SWATCH_PX = 34
  const SWATCH_GAP_PX = 4
  // The pickers over the panel's buttons, in the size SudokuPad's color tool uses for the same job.
  const PICKER_INPUT_REM = 2.4
  const PICKER_COLUMNS = 3
  // The pickers are rare enough to fade in; ending edit mode takes them away at once, with no fade out.
  const PICKER_ENTRY_SCALE = 0.95
  const PICKER_ENTRY_MS = 150
  // Percent-encoded; its inner quotes are single, so the url("...") wrapper's double quotes hold it.
  const CHOICE_ARROW = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%236b4fa0\'/%3E%3C/svg%3E")'

  // A preset in force that is not among the pickable `presets` (Custom, a page the palette no longer has) is shown first, selected and disabled, so the pulldown says what is in force and
  // every preset stays pickable: picking the option already shown fires no `change`. `labels` names each id.
  function presetChoices (preset, presets, labels) {
    const option = (id, disabled) => ({ value: id, label: labels[id], selected: id === preset, disabled })
    return [...(presets.includes(preset) ? [] : [option(preset, true)]), ...presets.map((id) => option(id, false))]
  }

  const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  const fillWithOpacity = (color, opacity) => opacity < 1 ? `color-mix(in srgb, ${color} ${opacity * 100}%, transparent)` : color

  // Free mode (no `picked`) makes each swatch a color input; palette mode makes each a button, `picked` the pressed one, and a null swatch an empty cell.
  // `options` are `{ value, label, selected, disabled }`; `beside` goes in the grid's row, after it.
  // A `fillOpacity` under 1 draws the palette swatches that strong over what is behind them; the border and the pressed ring stay whole.
  function renderColorBlock ({ prefix, label, options, swatches, picked, beside = '', fillOpacity = 1 }) {
    const palette = picked !== undefined
    const option = ({ value, label, selected, disabled }) =>
      `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}>${escapeHtml(label)}</option>`
    const named = (swatch) => `aria-label="${escapeHtml(swatch.label)}" title="${escapeHtml(swatch.label)}"`
    const swatch = (s) => {
      const head = `class="${prefix}swatch" data-role="swatch"`
      if (!s) return `<span ${head} data-empty="slot"></span>`
      if (!palette) return `<input type="color" ${head} data-key="${escapeHtml(s.key)}" value="${escapeHtml(s.value)}" ${named(s)}>`
      return `<button type="button" ${head} data-key="${escapeHtml(s.key)}" aria-pressed="${s.key === picked}" ${named(s)} style="background:${fillWithOpacity(escapeHtml(s.value), fillOpacity)}"></button>`
    }
    return `<div class="${prefix}color-block">` +
      `<select class="${prefix}color-choice" data-role="color-choice" aria-label="${escapeHtml(label)}">${options.map(option).join('')}</select>` +
      `<div class="${prefix}color-row"><div class="${prefix}swatches">${swatches.map(swatch).join('')}</div>${beside}</div></div>`
  }

  // `scope` is the dialog's own element (`#id`), so SudokuPad's rules for its dialogs' selects and buttons are outranked without !important.
  function colorBlockCss (prefix, scope) {
    const at = (selector) => `${scope} .${prefix}${selector}`
    return [
      `${at('color-block')} { display: grid; justify-items: start; gap: 6px; margin: 6px 0; }`,
      // As wide as the block, whatever its longest option: a select is otherwise as wide as that, and would widen the dialog's column.
      `${at('color-choice')} { box-sizing: border-box; width: 0; min-width: 100%; margin: 0; font-size: 1rem; padding: 4px 28px 4px 10px; border: 1px solid #b9b0c9; border-radius: 6px; appearance: none; color: #222; background: #fff ${CHOICE_ARROW} no-repeat right 10px center; }`,
      `${at('color-row')} { display: flex; align-items: flex-start; gap: 12px; }`,
      `${at('swatches')} { display: grid; grid-template-columns: repeat(${PICKER_COLUMNS}, ${SWATCH_PX}px); gap: ${SWATCH_GAP_PX}px; }`,
      `${at('swatch')} { box-sizing: border-box; display: block; width: ${SWATCH_PX}px; height: ${SWATCH_PX}px; margin: 0; padding: 0; border: 1px solid rgb(0 0 0 / .25); border-radius: 6px; background: none; cursor: pointer; -webkit-appearance: none; appearance: none; }`,
      `${at('swatch')}[data-empty] { border: none; cursor: default; }`,
      `${at('swatch')}[aria-pressed="true"] { border: 2px solid #fff; outline: 3px solid #000; }`,
      `${at('swatch')}::-webkit-color-swatch-wrapper { padding: 0; }`,
      `${at('swatch')}::-webkit-color-swatch { border: none; border-radius: 5px; }`,
      `${at('swatch')}::-moz-color-swatch { border: none; border-radius: 5px; }`
    ].join('\n')
  }

  // A picker is out of the flow, so it takes no cell from the buttons the panel places itself.
  function pickerCss (prefix, tool) {
    const panel = `.tool-${tool} .controls-input`
    const picker = (n) => `${panel} .${prefix}picker[data-key="${n}"]`
    const rows = PEN_COLOR_NUMBERS.length / PICKER_COLUMNS
    return [
      `.${prefix}editing .controls-input button[data-key]::after { opacity: 0; }`,
      // The button held to open edit mode is still pressed, and the panel's press shrink (lib/panel.js) would leave it a different size from the rest.
      `.tool-${tool}.${prefix}editing .controls-input button[data-key]:active { transform: none; transition: none; }`,
      `.${prefix}editing .${prefix}picker { position: absolute; inset: 0; z-index: 10; animation: ${prefix}picker-in ${PICKER_ENTRY_MS}ms ease-out; }`,
      `@keyframes ${prefix}picker-in { from { opacity: 0; transform: scale(${PICKER_ENTRY_SCALE}); } }`,
      `@media (prefers-reduced-motion: reduce) { .${prefix}editing .${prefix}picker { animation: none; } }`,
      `.${prefix}editing .${prefix}picker input { position: absolute; inset: 0; margin: auto; width: ${PICKER_INPUT_REM}rem; height: ${PICKER_INPUT_REM}rem; padding: 0; pointer-events: all; }`,
      ...PEN_COLOR_NUMBERS.map((n) => `${picker(n)} { grid-row: ${Math.ceil(n / PICKER_COLUMNS)} / span 1; grid-column: ${(n - 1) % PICKER_COLUMNS + 1} / span 1; }`),
      // SudokuPad's Keypad Flipped swaps the first and third rows of buttons, so each picker follows its button.
      ...[[[1, 2, 3], rows], [[7, 8, 9], 1]].flatMap(([keys, row]) => keys.map((n) => `.setting-flipkeypad ${picker(n)} { grid-row: ${row} / span 1; }`))
    ].join('\n')
  }

  function refreshPickers (prefix, colorOf) {
    document.querySelectorAll(`.${prefix}picker input`).forEach((input) => { input.value = colorOf(input.dataset.key) })
  }

  // Left Alt held opens edit mode until it is released, as SudokuPad's own color tool does.
  function installHoldToEdit ({ prefix, tool, colorOf, save, guard = (toggle) => toggle() }) {
    const toolClass = `tool-${tool}`
    const editing = `${prefix}editing`
    const pickerClass = `${prefix}picker`
    // A right-click hold ends over a picker in edit mode, and Windows opens the context menu on release, so it is suppressed over the pickers as well as the buttons.
    const targets = `.${toolClass} .controls-input button[data-key], .${toolClass} .${pickerClass} input`
    // SudokuPad keeps one panel element and swaps its `tool-<name>` class for the next tool's, so a class watcher ends edit mode when the panel stops being this tool's.
    let leaveWatch = null
    let editPanel = null
    let altOpened = false

    function exit () {
      if (leaveWatch) leaveWatch.disconnect()
      leaveWatch = null
      editPanel.classList.remove(editing)
      editPanel.querySelectorAll(`.${pickerClass}`).forEach((el) => el.remove())
      editPanel = null
      altOpened = false
    }

    const endEditMode = () => { if (editPanel) exit() }

    function enter (panel) {
      // Every button is found before anything changes, so a missing one leaves no half edit mode.
      const buttons = PEN_COLOR_NUMBERS.map((n) => {
        const button = panel.querySelector(`.controls-input button[data-key="${n}"]`)
        if (!button) throw new Error(`${prefix}color-picker: the ${tool} tool has no button for color ${n}`)
        return button
      })
      panel.classList.add(editing)
      editPanel = panel
      buttons.forEach((button, i) => {
        const n = PEN_COLOR_NUMBERS[i]
        button.insertAdjacentHTML('beforebegin', `<div class="${pickerClass}" data-key="${n}"><input type="color" data-key="${n}" value="${escapeHtml(colorOf(String(n)))}"></div>`)
      })
      leaveWatch = new window.MutationObserver(() => {
        if (!panel.classList.contains(toolClass)) exit()
      })
      leaveWatch.observe(panel, { attributes: true, attributeFilter: ['class'] })
    }

    let timer
    let holdDone = false
    const cancel = () => { clearTimeout(timer); timer = undefined }
    // A press outside the panel only ends edit mode, so the click it ends with is dropped as well; the next press clears the trap.
    const swallowClick = (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      document.removeEventListener('click', swallowClick, true)
    }
    // Pointer events carry a mouse button of either kind.
    document.addEventListener('pointerdown', (event) => {
      cancel()
      holdDone = false
      document.removeEventListener('click', swallowClick, true)
      if (editPanel && !editPanel.contains(event.target)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (event.button === 0) document.addEventListener('click', swallowClick, true)
        endEditMode()
        return
      }
      const target = event.target.closest(targets)
      if (!target) return
      const panel = target.closest(`.${toolClass}`)
      timer = setTimeout(() => {
        timer = undefined
        holdDone = true
        if (!panel.classList.contains(toolClass)) return
        guard(() => panel.classList.contains(editing) ? exit() : enter(panel))
      }, HOLD_TO_EDIT_MS)
    }, true)
    window.addEventListener('pointerup', cancel, true)
    window.addEventListener('pointercancel', cancel, true)
    // The browser's menu would open over the picker during a right-click hold: when the press is still going (Linux opens it on press),
    // or after the hold has run its course (Windows opens it on release, over the picker that appeared under the pointer).
    // A quick right-click on a button, released before the delay, keeps its menu on Windows.
    document.addEventListener('contextmenu', (event) => {
      if ((timer !== undefined || holdDone) && event.target.closest(targets)) event.preventDefault()
    }, true)
    // On the window, in the capture phase, so it runs ahead of SudokuPad's own Alt (a temporary switch to another tool, which would take the panel away) and can stop it.
    window.addEventListener('keydown', (event) => guard(() => {
      if (event.code === 'Escape' || event.key === 'Escape') return endEditMode()
      if (event.code !== 'AltLeft' || event.target.closest?.('input, textarea, [contenteditable]')) return
      const panel = document.querySelector(`.${toolClass}`)
      if (!panel) return
      // Stopped even with edit mode already open, or SudokuPad's own Alt would switch tools and take the panel away.
      event.stopImmediatePropagation()
      if (event.repeat || editPanel) return
      enter(panel)
      altOpened = true
    }), true)
    window.addEventListener('keyup', (event) => guard(() => {
      if (event.code === 'AltLeft' && altOpened) endEditMode()
    }), true)
    window.addEventListener('blur', () => guard(endEditMode))
    document.addEventListener('input', (event) => {
      const input = event.target
      if (input.matches(`.${pickerClass} input`)) save(input.dataset.key, input.value)
    })
    return { endEditMode }
  }
  /* eslint-enable no-unused-vars */
  // </lib:color-picker>

  // A color picker takes only #rrggbb, so every note color is kept as one. A transparent color has none to keep.
  const hexColor = (text) => {
    const rgb = parseColor(text)
    return rgb ? toHex(rgb) : undefined
  }

  const savedHex = (value) => typeof value === 'string' && HEX_COLOR.test(value.toLowerCase()) ? value.toLowerCase() : undefined

  // null when nothing is saved, which means the first-use copy of the pen colors is still owed. A saved value that is not
  // nine colors still counts as saved, so the copy never writes over it: each color it lacks shows SudokuPad's own.
  function readNoteColors (saved) {
    if (saved === null || saved === undefined) return null
    const entries = isPlainObject(saved) ? saved : {}
    return Object.fromEntries(COLOR_NUMBERS.map((n) => [n, savedHex(entries[n]) ?? SUDOKUPAD_PEN_COLORS[n]]))
  }

  // The colors stay under keys 1 to 9 with the preset's id beside them; a set with no `preset`, or one that is none of ours, is Custom (null).
  const NOTE_PRESETS = [PEN_PRESET, ...PAGE_PRESETS, SUDOKUPAD_PRESET]
  const readNotePreset = (saved) => isPlainObject(saved) && NOTE_PRESETS.includes(saved.preset) ? saved.preset : null
  const storedNoteColors = (colors, preset) => preset ? { ...colors, preset } : { ...colors }

  // `readPenColor(n)` reads pen color n as the browser computes it.
  const copiedPenColors = (readPenColor) => Object.fromEntries(COLOR_NUMBERS.map((n) => [n, hexColor(readPenColor(n)) ?? SUDOKUPAD_PEN_COLORS[n]]))

  function editedColor (colors, n, value) {
    if (noteColorNumber(n) === undefined) throw new RangeError(`text-anywhere: ${n} is not a color number`)
    const hex = hexColor(value)
    if (!hex) throw new RangeError(`text-anywhere: ${value} is not a color`)
    return { ...colors, [n]: hex }
  }

  // `:root:root` outranks a plain `:root` rule whichever stylesheet loads last.
  const colorsCss = (colors) => [':root:root {', ...COLOR_NUMBERS.map((n) => `  ${colorVar(n)}: ${colors[n]};`), '}'].join('\n')

  const presetOptions = (pageCount) => [PEN_PRESET, ...paletteOptions(pageCount)]

  // `pages` is the palette's pages of color keys; `readCell` reads a key's color and `readPen` a pen color, each as CSS text.
  function presetColors (preset, pages, readCell, readPen) {
    if (preset === PEN_PRESET) return copiedPenColors(readPen)
    return { ...paletteColors(preset, pages, readCell).colors }
  }

  // Each look setting is one row: its stored `key`, `read` (a saved value as the setting, default for anything invalid), and an optional `validator` a pasted value must pass or be skipped.
  // `dialog` marks the looks the settings dialog sets and the notes are drawn again in; the others are the panel's sliders.
  // The ticket reads an invalid pasted outline as Thick, box color as Page and frame as off, so none is counted as skipped; a font is read the same way.
  const LOOKS = [
    { name: 'width', key: WIDTH_KEY, read: readWidth, validator: isWidth },
    { name: 'opacity', key: OPACITY_KEY, read: readOpacity, validator: isOpacity },
    { name: 'outline', key: OUTLINE_KEY, read: readOutline, dialog: true },
    { name: 'boxColor', key: BOX_KEY, read: readBoxColor, dialog: true },
    { name: 'frame', key: FRAME_KEY, read: readFrame, dialog: true },
    { name: 'noteFont', key: FONT_KEY, read: readFont, dialog: true }
  ]
  const lookKeys = (looks) => looks.map((row) => row.key)
  const lookReaders = (looks) => Object.fromEntries(looks.map(({ key, read, validator }) => [key, validator ? (data) => validator(data) ? data : undefined : read]))
  // Every look as `store` holds it, keyed by each row's `by` field: its name for the looks in force, its stored key for Copy.
  const readLooks = (store, looks = LOOKS, by = 'name') => Object.fromEntries(looks.map((row) => [row[by], row.read(store.getData(row.key))]))
  const lookRow = (name) => LOOKS.find((row) => row.name === name)
  // The dialog's rows whose draft differs from the value in force.
  const changedDialogLooks = (looks, draft, now) => looks.filter((row) => row.dialog && draft[row.name] !== now[row.name])
  const dialogDefaults = () => Object.fromEntries(LOOKS.filter((row) => row.dialog).map((row) => [row.name, row.read(undefined)]))
  // A paste puts the pasted looks (read from `now`, once saved) into the draft and leaves every other look as the draft has it.
  const draftWithPasted = (looks, draft, now, values) => ({ ...draft, ...Object.fromEntries(looks.filter((row) => row.key in values).map((row) => [row.name, now[row.name]])) })

  // Copy and Paste carry the colors, size, opacity, outline, box color, frame and font, and not the notes, the color picked or the background button.
  const readPastedColors = (data) => isPlainObject(data) && COLOR_NUMBERS.some((n) => n in data) && COLOR_NUMBERS.every((n) => !(n in data) || savedHex(data[n])) ? storedNoteColors(readNoteColors(data), readNotePreset(data)) : undefined
  const READERS = { [COLORS_KEY]: readPastedColors, ...lookReaders(LOOKS) }

  // The looks in force, default included, so a paste can put them back to their defaults; the colors only once they are saved.
  function copiedSettings (store, looks = LOOKS) {
    const copied = readLooks(store, looks, 'key')
    const savedColors = readNoteColors(store.getData(COLORS_KEY))
    if (savedColors) copied[COLORS_KEY] = storedNoteColors(savedColors, readNotePreset(store.getData(COLORS_KEY)))
    return JSON.stringify(copied)
  }

  // A note is a text item. `bg` is set only on a note made with the Background button on, so a note saved without it has no box.
  const textItem = ([x, y], text, color, size, background, opacity = DEFAULT_OPACITY) => ({ kind: TEXT_KIND, color, size, opacity, ...(background ? { bg: true } : {}), text, at: [roundToTenth(x), roundToTenth(y)] })

  // A saved note is checked against the stored format only, not the panel's slider ranges, so a later change to a slider cannot make a note saved before it unreadable.
  const isStoredOpacity = (value) => value === undefined || (isNumber(value) && value > 0 && value <= 100)
  const isStoredSize = (value) => Number.isInteger(value) && value > 0
  const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(isNumber)
  const isBox = (box) => isPoint(box) && box.every((side) => side > 0)
  const isText = (item) => isPlainObject(item) && item.kind === TEXT_KIND && noteColorNumber(item.color) !== undefined && isStoredOpacity(item.opacity) &&
    (item.bg === undefined || item.bg === true) && (item.box === undefined || isBox(item.box)) && isStoredSize(item.size) && typeof item.text === 'string' && item.text.length > 0 &&
    (isPoint(item.at) ? item.fixed === undefined : item.at === undefined && isPoint(item.fixed))
  // Saved notes can hold the strokes and shapes of an earlier version. They are kept in storage as they are and never drawn, so they are not read further.
  const isHiddenItem = (item) => isPlainObject(item) && HIDDEN_KINDS.includes(item.kind)

  // A puzzle with nothing saved has no notes; saved data that is not a list throws rather than read as none. The list is read note by note:
  // an entry that is not a note, stroke or shape is kept, never drawn, and saved back as it is.
  function readNotes (saved) {
    if (saved === null || saved === undefined) return { items: [], kept: [] }
    if (!Array.isArray(saved)) throw new Error(`the saved notes are not a list: ${JSON.stringify(saved).slice(0, 200)}`)
    const read = { items: [], kept: [] }
    for (const entry of saved) (isText(entry) || isHiddenItem(entry) ? read.items : read.kept).push(entry)
    return read
  }

  // `unreadable` is the reason when the whole saved value could not be read, and is then copied aside by `load`.
  function loadNotes (store, key) {
    const { value, unreadable } = load(store, { key: notesKey(key), read: readNotes })
    return { ...(value ?? { items: [], kept: [] }), unreadable }
  }

  // The index lists puzzle keys oldest change first.
  function readIndex (saved) {
    if (saved === null || saved === undefined) return []
    if (!Array.isArray(saved) || !saved.every((key) => typeof key === 'string')) throw new Error(`the saved index is not a list of puzzle keys: ${JSON.stringify(saved).slice(0, 200)}`)
    return saved
  }

  function touchIndex (index, key) {
    const next = index.filter((k) => k !== key).concat(key)
    return { index: next.slice(-KEPT_PUZZLES), dropped: next.slice(0, Math.max(0, next.length - KEPT_PUZZLES)) }
  }

  const notesKey = (key) => NOTES_PREFIX + key
  const restartedKey = (key) => RESTARTED_PREFIX + key

  // A puzzle dropped from the index loses its notes and the ones its Restart kept.
  function forgetPuzzle (store, key) {
    store.removeData(notesKey(key))
    store.removeData(restartedKey(key))
  }

  // `store` has Framework's getData, setData and removeData. Writes `value` under `dataKey` and makes puzzle `key` the newest in `index`. The value is written
  // before the index, and the dropped puzzles' data is removed last, so a write that throws (a full localStorage) loses nothing already saved.
  function writeIndexed (store, index, key, dataKey, value, write = (k, v) => store.setData(k, v)) {
    const touched = touchIndex(index, key)
    write(dataKey, value)
    store.setData(INDEX_KEY, touched.index)
    for (const dropped of touched.dropped) forgetPuzzle(store, dropped)
  }

  // A puzzle is in the index while it has notes, saved or kept by its Restart. An index that cannot be read throws before anything is written.
  function saveNotesTo (store, key, items, kept = []) {
    const notes = items.concat(kept)
    const index = readIndex(store.getData(INDEX_KEY))
    if (notes.length > 0) {
      writeIndexed(store, index, key, notesKey(key), notes, (k, v) => save(store, k, v))
      return
    }
    store.removeData(notesKey(key))
    if (store.getData(restartedKey(key)) == null) store.setData(INDEX_KEY, index.filter((k) => k !== key))
  }

  function keepRestartedTo (store, key, notes) {
    if (notes.length > 0) writeIndexed(store, readIndex(store.getData(INDEX_KEY)), key, restartedKey(key), notes)
    else store.removeData(restartedKey(key))
  }

  const oldKey = (key) => {
    if (key === NOTICE_KEY) return OLD_NOTICE_KEY
    if (key.startsWith(NOTES_PREFIX)) return OLD_NOTES_PREFIX + key.slice(NOTES_PREFIX.length)
    return OLD_KEY_PREFIX + key.slice(KEY_PREFIX.length)
  }

  // A value is copied as it was saved, unreadable or not, so its new key's reader applies lib/store.js's rule to it; a key already saved is never written.
  // False when the old value is still not saved under its new key: the store drops a write the browser refuses (a full localStorage).
  function copyOldKey (store, key) {
    if (store.getData(key) !== null) return true
    const saved = store.getData(oldKey(key))
    if (saved === null) return true
    store.setData(key, saved)
    return store.getData(key) !== null
  }

  // The puzzles' notes are copied only while the new index is unsaved, and the index last, once every puzzle's copy is saved: a puzzle cleared
  // since the copy is not brought back from its old notes, and a copy the browser refused is tried again at the next start. An old index that
  // cannot be read lists no puzzles: their notes stay under the old keys only.
  function copyOldKeys (store) {
    for (const key of [COLOR_KEY, BACKGROUND_KEY, COLORS_KEY, NOTICE_KEY, ...lookKeys(LOOKS)]) copyOldKey(store, key)
    if (store.getData(INDEX_KEY) !== null) return
    let puzzles = []
    try {
      puzzles = readIndex(store.getData(oldKey(INDEX_KEY)))
    } catch (error) {
      console.warn(`text-anywhere: ${error.message}; the notes it lists stay under ${OLD_KEY_PREFIX} keys only`)
    }
    const copied = puzzles.flatMap((puzzle) => [notesKey(puzzle), restartedKey(puzzle)]).map((key) => copyOldKey(store, key))
    if (copied.every(Boolean)) copyOldKey(store, INDEX_KEY)
  }

  const newKey = (key) => key.startsWith(OLD_KEY_PREFIX) ? KEY_PREFIX + key.slice(OLD_KEY_PREFIX.length) : key
  // Settings copied before 0.45.0 name the old keys; a new key beside its old twin wins.
  const withNewKeys = (data) => Object.fromEntries(Object.entries(data)
    .filter(([key]) => newKey(key) === key || !Object.hasOwn(data, newKey(key)))
    .map(([key, value]) => [newKey(key), value]))

  // SudokuPad gives the tools the keys Z X C V B N M by their place in getToolNames(). Leaving Text Anywhere out of the
  // list while a keydown is dispatched gives it no key, and keeps every other tool's key where it is without it.
  const toolNamesFor = (names, event) => event && event.type === 'keydown' && event.eventPhase !== 0
    ? names.filter((name) => name !== TOOL_NAME)
    : names

  // SudokuPad marks .controls-main with this class while its Letter tool is on, and the number pad and keys then type letters.
  const LETTER_MODE_CLASS = 'input-letter'
  const TEXT_KEY = 't'

  // T makes Text Anywhere current, except where T is typed. An open note needs no test: only Text Anywhere opens one.
  const wantsTextTool = (event, { tool, letterMode, dialogOpen, inField }) =>
    typeof event.key === 'string' && event.key.toLowerCase() === TEXT_KEY && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing &&
    tool !== TOOL_NAME && !letterMode && !dialogOpen && !inField

  // <lib:settings-dialog>
  // Generated from lib/settings-dialog.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // Reads ERROR_LOG_KEY, readErrorLog, formatErrorLog and SUDOKUPAD_PURPLE from sudokupad, and wireCopyPaste from settings-transfer. A script
  // that copies in panel as well has a second `global` naming SUDOKUPAD_PURPLE, which the linter calls a redeclaration.
  /* global ERROR_LOG_KEY, readErrorLog, formatErrorLog, SUDOKUPAD_PURPLE, wireCopyPaste */ // eslint-disable-line no-redeclare
  // The events that end a press. SudokuPad's pen tool takes its click from `mouseup` (seen live), and
  // a touch ends with `pointerup`, `touchend` and a compatibility `mouseup`, so all four are swallowed.
  const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'mouseup', 'touchend']
  const SETTINGS_GROUP = 'experimental'
  const TITLE_MUTED = '#777'
  const CONTROL_HOVER = '#f3e5f5'
  const SAVE_FILL = '#6b3fa0'
  // An inset layer darkens whatever fill the control has.
  const PRESS_LAYER = 'box-shadow: inset 0 0 0 100vmax rgb(0 0 0 / .1)'
  const STATUS_ATTRIBUTE = 'data-role="settings-status"'
  const STATUS_SELECTOR = `[${STATUS_ATTRIBUTE}]`

  function setDialogStatus (dialog, message) {
    dialog.querySelector(STATUS_SELECTOR).textContent = message
  }
  // What `keys` hold now, and the script's in-memory copy of them, as a function that puts both back; a key that held nothing is removed
  // again. `holdMirror()` runs now and returns what puts the copy back. Every key is written back even when one throws, and the copy is
  // put back after them; the first throw then goes on. The stored values are held by reference, so a script's save must replace a value
  // and never edit one in place.
  function snapshotStore (store, keys, holdMirror = () => () => {}) {
    const before = keys.map((key) => [key, store.getData(key)])
    const putMirrorBack = holdMirror()
    return () => {
      const failures = []
      before.forEach(([key, value]) => {
        try {
          if (value == null) store.removeData(key)
          else store.setData(key, value)
        } catch (error) {
          failures.push(error)
        }
      })
      putMirrorBack()
      if (failures.length > 0) throw failures[0]
    }
  }

  // A thrown value that is not an Error has no message, so it is shown as itself.
  const errorText = (error) => error?.message ?? String(error)

  // `snapshot()` runs first and returns the function that puts back everything `write` can change, so a write that fails half-way leaves
  // the stored values and their mirrors as they were. The write's throw is rethrown; a restore that itself throws is named beside it.
  function writeOrRestore (snapshot, write) {
    const restore = snapshot()
    try {
      write()
    } catch (error) {
      try {
        restore()
      } catch (restoreError) {
        throw new Error(`${errorText(error)}; the earlier values could not be put back: ${errorText(restoreError)}`, { cause: error })
      }
      throw error
    }
  }

  // The next press ends the swallowing even when no release came (a close from the keyboard).
  function swallowRelease (win = window) {
    const swallow = (event) => event.stopImmediatePropagation()
    const stop = () => {
      RELEASE_EVENTS.forEach((type) => win.removeEventListener(type, swallow, true))
      win.removeEventListener('pointerdown', stop, true)
    }
    RELEASE_EVENTS.forEach((type) => win.addEventListener(type, swallow, true))
    win.addEventListener('pointerdown', stop, true)
  }

  // SudokuPad runs a dialog button's handler on the press and removes the dialog at once, so the release lands on the grid and the pen tool takes it for a click on the cell under the button.
  function closeDialogKeepingGrid (framework, win = window) {
    framework.closeDialog()
    swallowRelease(win)
  }

  // SudokuPad's showDialog does nothing while its settings dialog is open, so that one closes first; `open` then runs after the close has settled.
  function addSettingsEntry (framework, { name, content, open }, { log = console.error } = {}) {
    framework.addSetting({
      tag: 'button',
      name,
      group: SETTINGS_GROUP,
      content,
      handler: () => {
        closeDialogKeepingGrid(framework)
        setTimeout(() => {
          try { open() } catch (error) { log(`${name}: could not open its settings dialog`, error) }
        }, 0)
      }
    })
  }

  const COPY_PASTE_PICTURES = {
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4"/>'
  }
  const titleIconButton = (act, label, picture) =>
    `<button type="button" data-act="${act}" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${picture}</svg></button>`

  // The title rules travel with the row, so they are in the page exactly while the dialog is.
  function renderDialogTitle ({ prefix, name, version }) {
    return `<style>${dialogTitleCss(prefix)}</style>` +
      `<div class="${prefix}title-row"><span><b>${name}</b> <small class="${prefix}version">v${version}</small></span>` +
      `<span ${STATUS_ATTRIBUTE}></span>` +
      `<span class="${prefix}tools">${titleIconButton('copy-settings', 'Copy settings', COPY_PASTE_PICTURES.copy)}${titleIconButton('paste-settings', 'Paste settings', COPY_PASTE_PICTURES.paste)}</span></div>`
  }

  // SudokuPad styles a dialog's buttons by tag, so a button that is to look like bare text or a bare icon has each of these forced.
  const BARE_BUTTON = 'background: none !important; border: none !important; box-shadow: none !important; margin: 0 !important; width: auto !important; min-width: 0 !important; height: auto !important; cursor: pointer;'
  const ERROR_LOG_ATTRIBUTE = 'data-role="error-log"'
  const ERROR_LOG_SELECTOR = `[${ERROR_LOG_ATTRIBUTE}]`

  function errorLogCss (prefix) {
    return [
      `.${prefix}error-log { display: flex; gap: 12px; margin-top: 10px; }`,
      `.${prefix}error-log button { ${BARE_BUTTON} padding: 2px 0 !important; font-size: .8rem !important; color: ${TITLE_MUTED} !important; text-decoration: underline; }`,
      `.${prefix}error-log button:focus-visible { outline: 2px solid ${SUDOKUPAD_PURPLE} !important; outline-offset: 2px; }`
    ].join('\n')
  }

  function renderErrorLogRow (prefix) {
    return `<style>${errorLogCss(prefix)}</style><div class="${prefix}error-log" ${ERROR_LOG_ATTRIBUTE}><button type="button" data-act="copy-error-log">Copy error log</button><button type="button" data-act="clear-error-log">Clear</button></div>`
  }

  function wireErrorLog (dialog, win) {
    const say = (message) => setDialogStatus(dialog, message)
    dialog.querySelector(ERROR_LOG_SELECTOR).addEventListener('click', async (event) => {
      const act = event.target.closest('button[data-act]')?.dataset.act
      if (act !== 'copy-error-log' && act !== 'clear-error-log') return
      event.preventDefault()
      event.stopPropagation()
      try {
        if (act === 'clear-error-log') {
          win.localStorage.removeItem(ERROR_LOG_KEY)
          say('Error log cleared.')
          return
        }
        const log = readErrorLog(win.localStorage)
        if (log.length === 0) {
          say(formatErrorLog(log))
          return
        }
        await win.navigator.clipboard.writeText(formatErrorLog(log))
        say('Error log copied.')
      } catch (error) {
        say(`Could not ${act === 'copy-error-log' ? 'copy' : 'clear'} the error log: ${errorText(error)}`)
      }
    })
  }

  function dialogTitleCss (prefix) {
    const tools = `.${prefix}tools`
    return [
      `.${prefix}version { opacity: .6; }`,
      `.${prefix}title-row { display: flex; align-items: center; gap: 12px; }`,
      `${tools} { display: flex; align-items: center; gap: 4px; }`,
      // SudokuPad styles a dialog's buttons by tag, so each of these is forced.
      `${tools} button { ${BARE_BUTTON} padding: 4px !important; line-height: 0 !important; color: ${TITLE_MUTED} !important; border-radius: 6px !important; }`,
      `${tools} button:hover { background: #f0edf5 !important; }`,
      `${tools} button:focus-visible { outline: 2px solid ${SUDOKUPAD_PURPLE} !important; outline-offset: 0; }`,
      `${tools} svg { width: 20px; height: 20px; }`,
      `${tools} svg * { fill: none !important; }`,
      // A flex item with no intrinsic width: a long message wraps in the room the title leaves and never widens the dialog.
      `.${prefix}title-row ${STATUS_SELECTOR} { flex: 1 1 0; min-width: 0; contain: inline-size; text-align: right; font-size: .8rem; color: ${TITLE_MUTED}; }`
    ].join('\n')
  }

  function addStyleOnce (id, css, doc = document) {
    if (doc.getElementById(id)) return
    const style = doc.createElement('style')
    style.id = id
    style.textContent = css
    doc.head.appendChild(style)
  }

  // SudokuPad styles a dialog's buttons by tag, so each of these is forced. Scoped by the body's id, so SudokuPad's other dialogs are left alone.
  function buttonRowCss (bodyId) {
    const row = `.dialog:has(#${bodyId}) .dialog-options`
    return [
      `${row} { display: flex !important; flex-direction: row !important; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; border-top: 1px solid #e3dff0; padding: 14px 4px 2px; margin-top: 8px; box-sizing: border-box; width: 100%; }`,
      `${row} button { background: #f1eff5 !important; color: #333 !important; border: 1px solid #cfc9db !important; border-radius: 8px !important; font-size: 1rem !important; padding: 0 22px !important; height: 38px !important; line-height: 36px !important; margin: 0 !important; width: auto !important; min-width: 0 !important; flex: none; cursor: pointer; }`,
      `${row} button[data-role="save"] { background: ${SAVE_FILL} !important; color: #fff !important; border: 1px solid #5a3489 !important; font-weight: 600; }`,
      `${row} button:hover { background: ${CONTROL_HOVER} !important; }`,
      `${row} button[data-role="save"]:hover { background: ${CONTROL_HOVER} !important; color: ${SAVE_FILL} !important; }`,
      `${row} button:active { ${PRESS_LAYER} !important; }`,
      `${row} button:focus-visible { outline: 2px solid ${SUDOKUPAD_PURPLE}; outline-offset: 2px; }`
    ].join('\n')
  }

  const SAVE_LABEL = 'Save'
  const CANCEL_LABEL = 'Cancel'

  // Escape needs no handler here: SudokuPad's own dialog closes on it.
  // Returns the body container for the script to fill and wire, or null when SudokuPad showed no dialog (it ignores showDialog while another dialog is open).
  // Save and Paste each write under `snapshot` (`writeOrRestore`'s), in a dialog action of the guard feature `feature` (`runInDialog`).
  // `copyPaste` holds the rest of `wireCopyPaste`'s options: `copied`, `readers`, `upgrade` and `apply`.
  function showSettingsDialog (framework, { prefix, name, version, bodyId, styleId, css, centerOverBoard = true, changed, save, snapshot, feature, copyPaste, extraButtons = [] }, { doc = document, win = window } = {}) {
    if (typeof snapshot !== 'function') throw new Error(`${name}: a settings dialog needs a snapshot`)
    addStyleOnce(`settings-dialog-buttons-${bodyId}`, buttonRowCss(bodyId), doc)
    if (css) addStyleOnce(styleId, css, doc)
    const close = () => closeDialogKeepingGrid(framework, win)
    // After a failed save the script's `changed()` may already read false, so a retry saves again whatever it says.
    let failed = false
    const saveAndClose = () => {
      try {
        if (failed || changed()) feature.runInDialog(() => writeOrRestore(snapshot, save))
      } catch (error) {
        failed = true
        // The dialog stays open so the failure is read and the choices are kept.
        setDialogStatus(doc.getElementById(bodyId).closest('.dialog'), `Not saved: ${errorText(error)}`)
        return
      }
      close()
    }
    const buttons = [
      { content: SAVE_LABEL, role: 'save', handler: saveAndClose },
      { content: CANCEL_LABEL, role: 'cancel', handler: close },
      ...extraButtons
    ]
    framework.showDialog({
      centerOverBoard,
      parts: [
        { tag: 'text', innerHTML: renderDialogTitle({ prefix, name, version }) },
        { tag: 'text', innerHTML: `<div id="${bodyId}"></div>` },
        { tag: 'options', options: buttons.map(({ content, handler }) => ({ tag: 'button', content, handler })) },
        // Below the footer, so the script's own layout still runs down to the footer line.
        { tag: 'text', innerHTML: renderErrorLogRow(prefix) }
      ]
    })
    const body = doc.getElementById(bodyId)
    if (!body) return null
    const dialog = body.closest('.dialog')
    wireErrorLog(dialog, win)
    wireCopyPaste(dialog, { ...copyPaste, snapshot, feature })
    // No selector tells the buttons apart but their text, so the shell marks each with its role for the script's stylesheet.
    const row = dialog?.querySelector('.dialog-options')
    if (row) row.querySelectorAll('button').forEach((button, index) => { button.dataset.role = buttons[index].role })
    return body
  }
  /* eslint-enable no-unused-vars */
  // </lib:settings-dialog>
  // <lib:settings-transfer>
  // Generated from lib/settings-transfer.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  /* global setDialogStatus, errorText, writeOrRestore */
  // A reader returns the value to save, or undefined to refuse it. `upgrade` rewrites the parsed object first, for text copied by an older version.
  function pastedSettings (text, readers, upgrade = (data) => data) {
    let data
    try {
      data = JSON.parse(text)
    } catch (error) {
      throw new Error('the clipboard text is not JSON', { cause: error })
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('the clipboard text is not a settings object')
    data = upgrade(data)
    const values = {}
    let skipped = 0
    for (const [key, read] of Object.entries(readers)) {
      if (!Object.hasOwn(data, key)) continue
      const value = read(data[key])
      if (value === undefined) skipped++
      else values[key] = value
    }
    return { values, skipped }
  }

  function pasteReport (applied, skipped) {
    if (applied === 0 && skipped === 0) return 'Nothing to paste: the text holds none of this script\'s settings.'
    return `Pasted ${applied} setting${applied === 1 ? '' : 's'}${skipped ? `; skipped ${skipped} that did not check out` : ''}.`
  }

  function wireCopyPaste (root, { copied, readers, upgrade, apply, snapshot, feature }) {
    const say = (message) => setDialogStatus(root, message)
    root.addEventListener('click', async (event) => {
      const act = event.target.closest('button[data-act]')?.dataset.act
      if (act !== 'copy-settings' && act !== 'paste-settings') return
      event.preventDefault()
      event.stopPropagation()
      try {
        if (act === 'copy-settings') {
          await navigator.clipboard.writeText(copied())
          say('Settings copied.')
        } else {
          const { values, skipped } = pastedSettings(await navigator.clipboard.readText(), readers, upgrade)
          if (Object.keys(values).length > 0) feature.runInDialog(() => writeOrRestore(snapshot, () => apply(values)))
          say(pasteReport(Object.keys(values).length, skipped))
        }
      } catch (error) {
        say(`Could not ${act === 'copy-settings' ? 'copy' : 'paste'}: ${errorText(error)}`)
      }
    })
  }
  /* eslint-enable no-unused-vars */
  // </lib:settings-transfer>
  // <lib:sudokupad>
  // Generated from lib/sudokupad.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  /* global Framework */
  // A script's features, each with the SudokuPad internals it needs: one that lacks an internal, or whose own code throws, turns off
  // alone, and a bar at the bottom of the page says so once per SudokuPad version.
  const NOTICE_HOST_ID = 'sudokupad-scripts-notices'
  // SudokuPad's own button purple, as its icons draw it: the one purple of every script's bar, panel and focus ring, and the site's --accent.
  const SUDOKUPAD_PURPLE = '#6a1b9a'
  const REPORT_URL = 'https://github.com/caneff/sudokupad-scripts/issues/new'
  // The page's assets carry SudokuPad's version as `?v=` (docs/research/sudokupad-version-signal.md); live/cache.mjs reads it the same way.
  const PAGE_VERSION = /\?v=(\d+(?:\.\d+)+)/
  const INTERNAL_KINDS = {
    function: (value) => typeof value === 'function',
    array: Array.isArray,
    integer: Number.isInteger,
    number: (value) => typeof value === 'number',
    object: (value) => Boolean(value) && typeof value === 'object'
  }

  // A path's first part names a root (`Framework`, `ToolPen`): SudokuPad declares them with `const`, so they are not on `window`.
  function readInternal (roots, path) {
    const [root, ...keys] = path.split('.')
    return keys.reduce((owner, key) => (owner === undefined || owner === null ? undefined : owner[key]), roots[root])
  }

  function lackingInternals (features, roots) {
    const lacking = new Map()
    Object.entries(features).forEach(([name, { needs }]) => {
      const missing = Object.entries(needs).find(([path, kind]) => !INTERNAL_KINDS[kind](readInternal(roots, path)))
      if (missing) lacking.set(missing[0], [...(lacking.get(missing[0]) || []), name])
    })
    return lacking
  }

  function sudokupadVersion (doc) {
    const found = PAGE_VERSION.exec(doc.documentElement.outerHTML)
    return found ? found[1] : null
  }

  // One key for every script, so a reader finds every feature any script turned off.
  const ERROR_LOG_KEY = 'sudokupad-scripts-error-log'
  const ERROR_LOG_LIMIT = 50
  // A write the browser refuses (a full localStorage) is the browser's doing, not a SudokuPad change.
  const isRefusedWrite = (error) => Boolean(error) && error.name === 'QuotaExceededError'

  // A report is a URL, and GitHub refuses a long one.
  const REPORT_STACK_LIMIT = 1200

  // Oldest first. Throws when the storage is blocked or the saved text is not a list, so a caller never mistakes either for an empty log.
  function readErrorLog (storage) {
    const saved = storage.getItem(ERROR_LOG_KEY)
    if (saved === null) return []
    const log = JSON.parse(saved)
    if (!Array.isArray(log)) throw new Error('the saved error log is not a list')
    return log
  }

  // V8's stack opens with the error's own line (`TypeError: message`); Firefox's holds only frames.
  const withStack = (headline, stack) => (typeof stack !== 'string' || stack === '' ? headline : stack.startsWith(headline) ? stack : `${headline}\n${stack}`)

  function formatErrorLog (log) {
    if (log.length === 0) return 'The error log is empty.'
    return [...log].reverse().map((record) => [
      `${record.time} ${record.script}@${record.version} on SudokuPad ${record.sudokupad || 'unknown'}: ${record.feature}`,
      `  ${record.url}`,
      record.missing
        ? `  SudokuPad has no ${record.missing}`
        : withStack(record.name ? `${record.name}: ${record.message}` : record.message, record.stack).split('\n').map((line) => `  ${line}`).join('\n')
    ].join('\n')).join('\n\n')
  }

  function reportUrl ({ name, version, sudokupad, off }) {
    const shownVersion = sudokupad || 'unknown'
    const labels = off.map((feature) => feature.label).join(', ')
    const body = [
      `Script: ${name} ${version}`,
      `SudokuPad version: ${shownVersion}`,
      '',
      ...off.map(({ label, why }) => `- ${label}: ${typeof why === 'string' ? `SudokuPad has no ${why}` : withStack(String(why), why && why.stack).slice(0, REPORT_STACK_LIMIT)}`)
    ].join('\n')
    return `${REPORT_URL}?${new URLSearchParams({ title: `${name}: ${labels} off on SudokuPad ${shownVersion}`, body })}`
  }

  const NOTICE_HOST_CSS = 'position: fixed; left: 50%; bottom: 8px; transform: translateX(-50%); z-index: 10000; display: flex; flex-direction: column; gap: 4px; align-items: center;'
  const NOTICE_BAR_CSS = `display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 14px; border-radius: 6px; background: ${SUDOKUPAD_PURPLE}; color: #fff; font: 14px/1.3 sans-serif; box-shadow: 0 2px 6px rgba(0, 0, 0, .3);`
  const NOTICE_LINK_CSS = 'color: #fff; font-weight: bold; text-decoration: underline;'
  const NOTICE_DISMISS_CSS = 'background: none; border: none; color: #fff; font-size: 18px; line-height: 1; padding: 0 4px; cursor: pointer;'

  function noticeHost (doc) {
    let host = doc.getElementById(NOTICE_HOST_ID)
    if (!host) {
      host = doc.createElement('div')
      host.id = NOTICE_HOST_ID
      host.style.cssText = NOTICE_HOST_CSS
      doc.body.append(host)
    }
    return host
  }

  function dismissButton (doc) {
    const dismiss = doc.createElement('button')
    dismiss.type = 'button'
    dismiss.textContent = '×'
    dismiss.title = 'Dismiss'
    dismiss.setAttribute('aria-label', 'Dismiss')
    dismiss.style.cssText = NOTICE_DISMISS_CSS
    return dismiss
  }

  // `features` maps a name to `{ label, needs, onSkip }`: `label` is what the bar and the console call it, `needs` maps each internal's
  // path to its kind (a key of INTERNAL_KINDS), and `onSkip` undoes what the feature left on the page. `probe` runs once SudokuPad's app
  // exists; `store` is SudokuPad's Framework, whose saved data remembers a dismissal under `<script>-notice`.
  function createGuard ({ script, name, version, features }) {
    const reasons = []
    let page = null

    const dismissKey = `${script}-notice`
    // A dismissal is saved only under a SudokuPad version read from the page: one saved with none would match every later version that
    // also has none. A store with no getData or setData (a SudokuPad that changed), or one that throws (a frame with storage blocked),
    // cannot save one either. Without a save, a dismissal holds for this page load only.
    const dismissedHere = []
    let storeFailed = false
    const savesDismissals = () => !storeFailed && page.sudokupad !== null && typeof page.store.getData === 'function' && typeof page.store.setData === 'function'
    function useStore (fn) {
      try {
        return fn()
      } catch (error) {
        storeFailed = true
        console.warn(`${script}: a dismissal of the notice bar cannot be saved, so it holds for this page load only:`, error)
        return null
      }
    }
    const dismissed = () => {
      const saved = savesDismissals() ? useStore(() => page.store.getData(dismissKey)) : null
      return [...(saved && saved.version === page.sudokupad && Array.isArray(saved.features) ? saved.features : []), ...dismissedHere]
    }

    // Every feature turned off is kept, shown or not. A blocked or unreadable storage costs the record, never the page. A missing internal
    // is the same fact on every load, so one already recorded for this script version and SudokuPad version is not recorded again: it
    // would push the one-off throw out of the newest 50.
    let sudokupad = null
    let logFailed = false
    function recordFeatureOff (label, why) {
      if (logFailed) return
      const fields = typeof why === 'string' ? { missing: why } : { name: why && why.name, message: String(why && why.message !== undefined ? why.message : why), stack: why && why.stack }
      try {
        const log = readErrorLog(globalThis.localStorage)
        const same = (record) => record.script === script && record.version === version && record.sudokupad === sudokupad && record.feature === label && record.missing === fields.missing
        if (fields.missing && log.some(same)) return
        log.push({ time: new Date().toISOString(), script, version, sudokupad, feature: label, url: globalThis.location.href, ...fields })
        globalThis.localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(log.slice(-ERROR_LOG_LIMIT)))
      } catch (error) {
        logFailed = true
        console.warn(`${script}: the error log cannot be saved, so ${label} and later features turned off are not recorded:`, error)
      }
    }

    let bar = null
    function showNotice () {
      if (bar) bar.remove()
      bar = null
      const gone = dismissed()
      const shown = reasons.filter((reason) => !gone.includes(reason.name))
      if (shown.length === 0 || !page.doc.body) return
      const { doc } = page
      const host = noticeHost(doc)
      bar = doc.createElement('div')
      bar.setAttribute('data-script', script)
      bar.style.cssText = NOTICE_BAR_CSS
      const text = doc.createElement('span')
      text.textContent = `${name}: ${shown.map((reason) => reason.label).join(', ')} ${shown.length === 1 ? 'is' : 'are'} off — SudokuPad changed.`
      const link = doc.createElement('a')
      link.href = reportUrl({ name, version, sudokupad: page.sudokupad, off: shown })
      link.target = '_blank'
      link.rel = 'noopener'
      link.textContent = 'Report'
      link.style.cssText = NOTICE_LINK_CSS
      const dismiss = dismissButton(doc)
      dismiss.addEventListener('click', () => {
        dismissedHere.push(...shown.map((reason) => reason.name))
        if (savesDismissals()) useStore(() => page.store.setData(dismissKey, { version: page.sudokupad, features: dismissed() }))
        showNotice()
      })
      bar.append(text, link, dismiss)
      host.append(bar)
    }

    const told = new Set()
    function tell (text) {
      if (told.has(text) || !page || !page.doc.body) return
      told.add(text)
      const { doc } = page
      const host = noticeHost(doc)
      const message = doc.createElement('div')
      message.setAttribute('data-script', script)
      message.style.cssText = NOTICE_BAR_CSS
      const span = doc.createElement('span')
      span.textContent = text
      const dismiss = dismissButton(doc)
      dismiss.addEventListener('click', () => message.remove())
      message.append(span, dismiss)
      host.append(message)
    }

    // While a dialog action (`runInDialog`) runs, a store write that throws goes on, marked here, through every `run` to the caller.
    let dialogActions = 0
    const storeFailures = new WeakSet()

    function createFeature (featureName, { label, onSkip }) {
      const feature = {
        label,
        off: false,
        skip (why, installed = true) {
          if (feature.off) return
          feature.off = true
          reasons.push({ name: featureName, label, why })
          recordFeatureOff(label, why)
          if (installed) {
            console.warn(`${script}: ${label} skipped because SudokuPad changed:`, why)
            try {
              if (onSkip) onSkip()
            } catch (error) {
              // Best effort: the feature is off already, and what it left behind stays until the page reloads.
              console.warn(`${script}: could not undo ${label}:`, error)
            }
          }
          if (page) showNotice()
        },
        run (fn, fallback = () => {}) {
          if (feature.off) return fallback()
          try {
            return fn()
          } catch (error) {
            if (storeFailures.has(error)) throw error
            feature.skip(error)
            return fallback()
          }
        },
        // An action the user asked for in a dialog: its throw goes on to the caller and leaves the feature on, so the caller can write the
        // earlier values back and say why; one with the feature off throws saying so. A store write that fails in it throws on too.
        runInDialog (fn) {
          if (feature.off) throw new Error(`${name} turned off its ${label}`)
          dialogActions++
          try {
            return fn()
          } finally {
            dialogActions--
          }
        },
        // SudokuPad's code runs only through `stock` or `stock.sudokupad`, so a throw from it passes through as SudokuPad's own. After the
        // body's own throw, the original runs only if nothing was sent for this event: a click half sent must not be sent again. A call
        // that sends nothing (`stock.sudokupad(fn, false)`) leaves the original to run.
        wrap (owner, method, body) {
          const original = owner[method]
          owner[method] = function (...args) {
            if (feature.off) return original.apply(this, args)
            let reached = false
            let result
            let failure = null
            const sudokupad = (fn, sends = true) => {
              if (sends) reached = true
              try {
                return fn()
              } catch (error) {
                failure = { error }
                throw error
              }
            }
            const stock = (...stockArgs) => sudokupad(() => { result = original.apply(this, stockArgs); return result })
            stock.sudokupad = sudokupad
            try {
              return body.call(this, stock, ...args)
            } catch (error) {
              if (failure && failure.error === error) throw error
              feature.skip(error)
              return reached ? result : original.apply(this, args)
            }
          }
        }
      }
      return feature
    }

    const guarded = Object.fromEntries(Object.entries(features).map(([featureName, declared]) => [featureName, createFeature(featureName, declared)]))

    function probe ({ roots, store, doc = document }) {
      sudokupad = sudokupadVersion(doc)
      lackingInternals(features, roots).forEach((names, missing) => {
        names.forEach((featureName) => guarded[featureName].skip(missing, false))
        console.warn(`${script}: ${names.map((featureName) => features[featureName].label).join(', ')} skipped because SudokuPad has no ${missing}`)
      })
      page = { store, doc, sudokupad }
      showNotice()
    }

    // A feature's saved data in SudokuPad. A read with the feature off is null, as for a key with nothing saved, and a write is dropped.
    // A write that throws turns the feature off and its caller goes on, except in a dialog action, where it throws on (`runInDialog`). A
    // write the browser refuses (a full localStorage) is the browser's doing: it is told to the user and leaves the feature on, so it saves
    // again once space frees. `keep`, the copy of an unreadable value, turns the feature off on any throw, a refusal included, so nothing
    // can save over the original.
    function storeFor (feature) {
      const write = (fn) => {
        if (feature.off) return
        try {
          fn()
        } catch (error) {
          if (dialogActions > 0) {
            if (Object(error) === error) storeFailures.add(error)
            throw error
          }
          if (!isRefusedWrite(error)) return feature.skip(error)
          console.warn(`${script}: ${feature.label} could not save, the browser refused the write:`, error)
          tell(`${name}: the browser has no room left, so ${feature.label} could not be saved.`)
        }
      }
      return {
        getData: (key) => feature.run(() => Framework.getData(key), () => null),
        setData: (key, value) => write(() => Framework.setData(key, value)),
        removeData: (key) => write(() => Framework.removeData(key)),
        keep: (key, value) => feature.run(() => Framework.setData(key, value))
      }
    }

    // What a settings entry and dialog are handed in place of Framework: the close a dialog button runs goes under `feature`.
    const dialogsFor = (feature) => ({
      addSetting: (setting) => Framework.addSetting(setting),
      showDialog: (options) => Framework.showDialog(options),
      closeDialog: () => feature.run(() => Framework.closeDialog())
    })

    return { features: guarded, get off () { return reasons.map((reason) => reason.label) }, probe, storeFor, dialogsFor }
  }
  /* eslint-enable no-unused-vars */
  // </lib:sudokupad>
  // Each feature with the SudokuPad internals it cannot work without. A path's first part is a root of `guard.probe`: `Framework`, or `app`, which is what
  // `Framework.getApp` resolves to. Not declared, because a check at startup cannot tell them from "not there yet": `Framework.app.puzzle.puzzleId` and
  // `currentPuzzle` (a puzzle not loaded has neither), and `Framework.app.tool`, a name and not a kind the guard checks.
  const BOARD = { 'Framework.getApp': 'function', 'Framework.app.svgRenderer.getElem': 'function', 'Framework.app.puzzle': 'object', 'app.puzzle.on': 'function', 'app.on': 'function' }
  const FEATURES = {
    // Without these the script starts from its defaults and keeps nothing: the notes and settings last until the page reloads.
    saved: { label: 'saved notes and settings', needs: { 'Framework.getData': 'function', 'Framework.setData': 'function', 'Framework.removeData': 'function' } },
    // The notes already saved, drawn on the board and kept in place as the board moves; with the Text tool off they show and cannot be changed.
    notes: {
      label: 'notes on the board',
      needs: BOARD,
      onSkip () {
        document.getElementById(LAYER_ID)?.remove()
      }
    },
    tool: {
      label: 'Text tool',
      needs: { ...BOARD, 'Framework.addTool': 'function', 'Framework.showDialog': 'function', 'app.getToolNames': 'function', 'Framework.app.grid.rows': 'integer', 'Framework.app.grid.cols': 'integer' },
      onSkip () {
        document.getElementById(`control-${TOOL_NAME}`)?.remove()
        document.getElementById(LAYER_ID)?.classList.remove(ACTIVE_CLASS)
        document.getElementById(PANEL_STYLE_ID)?.remove()
        hidePanel()
      }
    },
    settings: {
      label: 'settings',
      needs: { 'Framework.addSetting': 'function', 'Framework.showDialog': 'function', 'Framework.closeDialog': 'function' },
      onSkip () {
        document.querySelector(`.${SETTINGS_CLASS}`)?.remove()
        Framework.closeDialog()
      }
    },
    // Undo straight after a Restart brings back the notes it cleared (docs/research/sudokupad-custom-tool.md § Saving the notes).
    undoRestart: { label: 'Undo after Restart', needs: { 'Framework.app.puzzle': 'object', 'Framework.app.puzzle.undoStack': 'array', 'app.puzzle.on': 'function' } },
    // The Darker page presets of the settings dialog read SudokuPad's color palette.
    presets: { label: 'color presets', needs: { 'Framework.app.tools.colour': 'object' } }
  }
  // The script times the repeat itself: SudokuPad's App.handleKeydown drops every keydown with `event.repeat` before any tool sees it.
  const NUDGE_PX = 1
  const NUDGE_SHIFT_PX = 10
  const NUDGE_MAX_PX = 8
  const NUDGE_SHIFT_MAX_PX = 40
  const NUDGE_REPEAT_MS = 300
  const NUDGE_RAMP_MS = 1500
  const NUDGE_TICK_MS = 50
  // Dragging a note pulls it onto the grid and the other notes. On one axis the dragged note's box spans `lo`..`hi` in screen pixels and its selection outline's line
  // lies `reach` past it. The nearest target within SNAP_PX gives the `shift` and the `guide`, where the outline then lies: the grid's `lines` for the outline's line
  // (or a cell's middle for the box's middle), or one of `others`' `{ lo, hi }` boxes for the same edge or middle. A tie goes to the first target found, a cell's.
  const SNAP_PX = 4
  const CELL_UNITS = 64
  // The grid's lines on one axis, from one cell before the first to one cell after the last: the implied ring of cells round the board, drawn nowhere, that notes snap to too.
  function gridLines (cells, lineAt) {
    return Array.from({ length: cells + 3 }, (_, i) => lineAt(i - 1))
  }
  function snapAxis (lo, hi, { lines, others = [], reach = 0 }) {
    const middle = (lo + hi) / 2
    let best = null
    const consider = (from, to, guide) => {
      const shift = to - from
      if (Math.abs(shift) <= SNAP_PX && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, guide }
    }
    if (hi + reach >= lines[0] && lo - reach <= lines[lines.length - 1]) {
      lines.forEach((line, i) => {
        consider(lo - reach, line, line)
        consider(hi + reach, line, line)
        if (i < lines.length - 1) consider(middle, (line + lines[i + 1]) / 2, (line + lines[i + 1]) / 2)
      })
    }
    for (const other of others) {
      consider(lo, other.lo, other.lo - reach)
      consider(hi, other.hi, other.hi + reach)
      consider(middle, (other.lo + other.hi) / 2, (other.lo + other.hi) / 2)
    }
    return best
  }
  // A drag only snaps while the solver is placing the note: the pointer slower than SNAP_MAX_SPEED px/ms over the last SPEED_WINDOW_MS, as tldraw does.
  // `samples` are `[x, y, time]` in ms in order; a pointer that has stood still the whole window has no sample in it, or one.
  const SNAP_MAX_SPEED = 0.5
  const SPEED_WINDOW_MS = 100
  // The wait past SPEED_WINDOW_MS before a still pointer's move is drawn again, so the window has surely emptied.
  const SETTLE_SLACK_MS = 20
  function pointerSpeed (samples, now) {
    const recent = samples.filter(([, , time]) => time >= now - SPEED_WINDOW_MS)
    if (recent.length < 2) return 0
    const [x, y, time] = recent[0]
    const [lastX, lastY] = recent[recent.length - 1]
    return Math.hypot(lastX - x, lastY - y) / Math.max(now - time, 1)
  }
  const isPlacing = (samples, now) => pointerSpeed(samples, now) < SNAP_MAX_SPEED

  // The axis, 0 for x and 1 for y, a move `[dx, dy]` is locked off: the one of lesser movement; a tie keeps x.
  const lockedAxis = ([dx, dy]) => Math.abs(dx) >= Math.abs(dy) ? 1 : 0
  const axisLocked = (delta, locked) => locked ? delta.map((v, axis) => axis === lockedAxis(delta) ? 0 : v) : delta

  const WINDOW_PAD_PX = 20
  // How far the open note's screen box must move to lie WINDOW_PAD_PX inside `win`, by the same rule a dropped note is kept reachable by.
  function viewShift (box, win) {
    const room = { left: win.left + WINDOW_PAD_PX - REACH_MARGIN_PX, top: win.top + WINDOW_PAD_PX - REACH_MARGIN_PX, right: win.right - WINDOW_PAD_PX + REACH_MARGIN_PX, bottom: win.bottom - WINDOW_PAD_PX + REACH_MARGIN_PX }
    const middle = [(box.left + box.right) / 2, (box.top + box.bottom) / 2]
    const [x, y] = reachablePoint(middle, [box.right - box.left, box.bottom - box.top], room)
    return [x - middle[0], y - middle[1]]
  }
  function nudgeStep (heldMs, shift) {
    if (heldMs < NUDGE_REPEAT_MS) return 0
    const [from, to] = shift ? [NUDGE_SHIFT_PX, NUDGE_SHIFT_MAX_PX] : [NUDGE_PX, NUDGE_MAX_PX]
    return Math.round(from + (to - from) * Math.min(1, (heldMs - NUDGE_REPEAT_MS) / NUDGE_RAMP_MS))
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { snapAxis, gridLines, SNAP_PX, nudgeStep, NUDGE_PX, NUDGE_SHIFT_PX, NUDGE_REPEAT_MS, NUDGE_RAMP_MS, NUDGE_MAX_PX, NUDGE_SHIFT_MAX_PX, VERSION, lackingInternals, FEATURES, READERS, TOOL_NAME, toolNamesFor, wantsTextTool, readNotes, loadNotes, puzzleKey, touchIndex, readIndex, saveNotesTo, keepRestartedTo, NOTES_PREFIX, RESTARTED_PREFIX, INDEX_KEY, DEFAULT_COLOR, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH, MIN_OPACITY, MAX_OPACITY, DEFAULT_OPACITY, noteColorNumber, readColor, readWidth, readBackground, textSizeFor, OUTLINES, DEFAULT_OUTLINE, OUTLINE_LABELS, readOutline, haloShadow, OUTLINE_EM, itemOpacity, readOpacity, HIT_MARGIN_PX, grownBox, noteAtPoint, pointerSpeed, isPlacing, SNAP_MAX_SPEED, SPEED_WINDOW_MS, lockedAxis, axisLocked, viewShift, WINDOW_PAD_PX, textItem, textRect, noteBox, parseMarkdown, closedSymbols, closedText, isSmallRectangle, RECTANGLE_CLICK_PX, symbolJustTyped, rawOffset, toggledCheck, notesTouched, panelLooks, lookTarget, noteChanged, indexAfterKeep, touchesBox, placedItem, boardView, screenPoint, SHOWN_AT, noteScreenBox, resizedItem, autoSized, CORNERS, reachablePoint, DRAWN_SIZE, BOX_WIDTH_EM, BOX_LINES, LINE_HEIGHT, MIN_BOX_EM, isClick, CLICK_SLOP, SUDOKUPAD_PEN_COLORS, hexColor, readNoteColors, readNotePreset, storedNoteColors, dialogDefaults, draftWithPasted, presetOptions, presetColors, copiedSettings, pastedSettings, pasteReport, copyOldKeys, withNewKeys, NOTICE_KEY, COLOR_KEY, LOOKS, lookReaders, lookKeys, readLooks, changedDialogLooks, PRESET_LABELS, COLORS_KEY, WIDTH_KEY, OPACITY_KEY, OUTLINE_KEY, BACKGROUND_KEY, BOX_KEY, FRAME_KEY, FONT_KEY, FONTS, DEFAULT_FONT, FIXED_FONT_STACK, readFont, noteFontFamily, renderFontChoice, sizeStep, BOX_PRESETS, DEFAULT_BOX_COLOR, BOX_YELLOW, readBoxColor, boxChoice, boxFill, FRAME_COLOR, readFrame, frameShadow, renderSamplePicks, copiedPenColors, editedColor, colorsCss, HOLD_TO_EDIT_MS }
  }
  if (typeof document === 'undefined') return

  // The match also covers other crackingthecryptic.com pages, which have no Framework.
  if (typeof Framework === 'undefined') return

  const guard = createGuard({ script: 'text-anywhere', name: 'Text Anywhere', version: VERSION, features: FEATURES })
  const { saved: storage, notes: boardNotes, tool: textTool, settings: settingsUi, presets, undoRestart } = guard.features
  // The saved data is read and written only here: with no getData, setData or removeData nothing is read, so the defaults show, and nothing is kept.
  const savedData = guard.storeFor(storage)
  const dialogs = guard.dialogsFor(settingsUi)
  const under = (feature, handler) => (...args) => feature.run(() => handler(...args))
  const onWindow = (feature, type, handler, options) => window.addEventListener(type, under(feature, handler), options)

  const boardSvg = () => Framework.app.svgRenderer.getElem()

  // What SudokuPad draws above the notes' layer: an open dialog and the menu drawer.
  const ABOVE_NOTES = '.dialog-overlay, #appmenu'

  // A press on these goes to SudokuPad's controls (or a link or field anywhere), never to a note: the top bar, the menu drawer and an open dialog.
  const CONTROLS = `.topbar, ${ABOVE_NOTES}, button, a, input, select, textarea`
  // The control panel's box is larger than what is drawn in it: a div with no text, fill or picture of its own is only layout.
  const CONTROLS_BOX = '#controls'
  const isLayoutOnly = (element) => {
    if (element.tagName !== 'DIV') return false
    const style = window.getComputedStyle(element)
    const ownText = [...element.childNodes].some((node) => node.nodeType === window.Node.TEXT_NODE && node.textContent.trim() !== '')
    return !ownText && style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.backgroundImage === 'none'
  }
  // Inside the controls box, a press is on a control when anything drawn under the pointer there is not layout only (a panel's fill sits under its empty divs).
  const overControl = (event) => {
    if (!(event.target instanceof window.Element)) return false
    if (event.target.closest(CONTROLS) !== null) return true
    const box = event.target.closest(CONTROLS_BOX)
    if (box === null) return false
    return document.elementsFromPoint(event.clientX, event.clientY).some((element) => box.contains(element) && !isLayoutOnly(element))
  }

  // The notes' layer covers the page, above the board's digits and SudokuPad's clock and rules copy (z-index 10) and below its dialogs and menu drawer (1000).
  const LAYER_Z = 20

  function notesLayer () {
    let layer = document.getElementById(LAYER_ID)
    if (!layer) {
      layer = document.createElement('div')
      layer.id = LAYER_ID
      document.body.appendChild(layer)
    }
    return layer
  }

  const eventPoint = (event) => [event.clientX, event.clientY]

  // The board as the notes see it now: its screen box, the maps between screen points and board units, and screen pixels per board unit.
  function boardMap () {
    const svg = boardSvg()
    const ctm = svg.getScreenCTM()
    const through = (matrix) => ([x, y]) => {
      const p = new window.DOMPoint(x, y).matrixTransform(matrix)
      return [p.x, p.y]
    }
    const { left, top, right, bottom } = svg.getBoundingClientRect()
    return { box: { left, top, right, bottom }, toBoard: through(ctm.inverse()), toScreen: through(ctm), scale: ctm.a, matrix: [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f] }
  }

  // Until Text Anywhere is first made current its colors are not copied yet, so a note drawn by an older version shows in the pen color.
  const itemColor = (n) => `var(${colorVar(n)}, var(--puzzle-pencolor-${n}))`

  // `scale` is pixels of the note's box per board unit. A note with no background is padded by its halo's reach, since its box clips what overflows it.
  function noteStyle (item, [x, y], scale) {
    const px = (units) => `${roundToTenth(units * scale)}px`
    const [width, height] = item.box ? item.box.map(px) : ['', '']
    const limit = item.box ? 'none' : ''
    const pad = notePadding(item, look.outline)
    const [padX, padY] = pad.map(px)
    return {
      left: `${roundToHundredth(x - pad[0] * scale)}px`,
      top: `${roundToHundredth(y - pad[1] * scale)}px`,
      caretColor: itemColor(item.color),
      fontSize: px(item.size),
      width,
      height,
      maxWidth: limit,
      maxHeight: limit,
      color: itemColor(item.color),
      opacity: String(noteOpacity(item)),
      [NOTE_OPACITY_VAR]: String(noteOpacity(item)),
      [NOTE_COLOR_VAR]: itemColor(item.color),
      backgroundColor: item.bg ? boxFill(look.boxColor, itemColor(item.color)) : 'transparent',
      boxShadow: item.bg ? frameShadow(look.frame) : 'none',
      textShadow: item.bg ? 'none' : haloShadow(look.outline, PAGE_COLOR),
      padding: `${padY} ${padX}`,
      borderRadius: item.bg ? px(BACKGROUND_RADIUS * item.size) : '0'
    }
  }

  // Sets a noteStyle on an element: a custom property needs setProperty, which assigning to the style's own fields does not do.
  function applyNoteStyle (element, style) {
    for (const [name, value] of Object.entries(style)) {
      if (name.startsWith('--')) element.style.setProperty(name, value)
      else element.style[name] = value
    }
  }

  // The open note sits in the layer itself, in screen pixels, on the board or off it.
  function styleNote (element, item, map) {
    applyNoteStyle(element, noteStyle(item, screenPoint(item, map.toScreen), map.scale))
    element.classList.toggle(TEXT_BACKGROUND_CLASS, Boolean(item.bg))
  }

  const FLAG_STYLES = (run) => {
    return { ...(run.bold && { fontWeight: 'bold' }), ...(run.italic && { fontStyle: 'italic' }), ...(run.underline && { textDecoration: 'underline' }) }
  }

  // A struck run is drawn by its own line, not `text-decoration: line-through`: the browser paints a decoration's halo shadow over the letters, which hides their top half. Each word and each
  // gap is a piece with its own line (a stylesheet rule), so the line follows the text over a wrapped line, and the text itself stays as it was.
  function struckPieces (text) {
    return text.split(/(\s+)/).filter(Boolean).map((part) => {
      const piece = document.createElement('span')
      piece.className = STRIKE_PIECE_CLASS
      piece.textContent = part
      return piece
    })
  }

  function runElement (run) {
    if (!FLAGS.some((flag) => run[flag])) return run.text
    const element = document.createElement('span')
    if (run.strike) element.append(...struckPieces(run.text))
    else element.textContent = run.text
    element.className = [run.code && CODE_CLASS, run.strike && STRIKE_CLASS].filter(Boolean).join(' ')
    Object.assign(element.style, FLAG_STYLES(run))
    return element
  }

  function checkBox (checked, lineIndex) {
    const box = document.createElement('span')
    box.className = checked ? `${CHECK_CLASS} ${CHECK_DONE_CLASS}` : CHECK_CLASS
    box.dataset.line = String(lineIndex)
    return box
  }

  // A list line is a block whose first line hangs out over the indent: the marker sits in the indent, wrapped lines start at its right, and each level moves the whole line right.
  function bulletElement ([mark, ...runs], lineIndex) {
    const line = document.createElement('div')
    const indent = markerIndentEm(mark)
    Object.assign(line.style, { marginLeft: `${levelIndentEm(mark)}em`, paddingLeft: `${indent}em`, textIndent: `-${indent}em` })
    const bullet = document.createElement('span')
    if (mark.checked === undefined) bullet.textContent = mark.text
    else {
      bullet.append(checkBox(mark.checked, lineIndex))
      if (mark.checked) line.style.opacity = String(DONE_OPACITY)
    }
    Object.assign(bullet.style, { display: 'inline-block', width: `${indent}em`, textIndent: '0' })
    line.append(bullet, ...runs.map((run) => runElement(mark.checked ? { ...run, strike: true } : run)))
    return line
  }

  function sizedLineElement ([mark, ...runs]) {
    const line = document.createElement('div')
    Object.assign(line.style, { fontSize: `${lineScale([mark])}em`, ...(mark.header ? { fontWeight: 'bold' } : { opacity: String(SUBTEXT_OPACITY) }) })
    line.append(...runs.map(runElement))
    return line
  }

  // A trailing empty line needs a second line feed to show, since a single one at the end of a block is dropped.
  function codeBlockElement (lines) {
    const block = document.createElement('div')
    block.className = `${CODE_CLASS} ${CODE_BLOCK_CLASS}`
    block.textContent = lines.join('\n') + (lines[lines.length - 1] === '' ? '\n' : '')
    return block
  }

  const isFence = (runs) => Boolean(runs[0]?.fence)

  function notePieces (lines) {
    const pieces = []
    for (let i = 0; i < lines.length; i++) {
      const runs = lines[i]
      if (isFence(runs)) {
        const body = []
        for (i++; i < lines.length && !isFence(lines[i]); i++) body.push(lines[i][0].text)
        if (body.length) pieces.push({ block: true, empty: false, content: [codeBlockElement(body)] })
      } else if (isBullet(runs)) pieces.push({ block: true, empty: false, content: [bulletElement(runs, i)] })
      else if (isSizedLine(runs)) pieces.push({ block: true, empty: false, content: [sizedLineElement(runs)] })
      else pieces.push({ block: false, empty: runs.length === 0, content: runs.map(runElement) })
    }
    return pieces
  }

  // A block ends its own line, so a line break goes only between two plain lines, and before a block that follows an empty line.
  const breaksBefore = (piece, previous) => piece.block ? previous.empty : !previous.block

  function noteContent (text) {
    const pieces = notePieces(parsedText(text))
    return pieces.flatMap((piece, i) => [...(i && breaksBefore(piece, pieces[i - 1]) ? ['\n'] : []), ...piece.content])
  }

  function newTextBox (item, map) {
    const element = document.createElement('div')
    element.className = `${TEXT_CLASS} ${TEXT_BOX_CLASS}`
    element.textContent = item.text
    styleNote(element, item, map)
    return element
  }

  // <lib:panel>
  // Generated from lib/panel.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // Reads rem from plain, and SUDOKUPAD_PURPLE from sudokupad. A script that copies in settings-dialog as well has a second `global` naming
  // SUDOKUPAD_PURPLE, which the linter calls a redeclaration.
  /* global rem, SUDOKUPAD_PURPLE */ // eslint-disable-line no-redeclare
  // A tool's purple panel: SudokuPad's outer keypad size (four rows of a 4rem button between 0.15rem margins) as a grid of the nine
  // color buttons shortened to 2.5rem, a gap, a row of three controls at the full 4rem, and the sliders across the rest. A tray sits behind the last two rows; it is placed in
  // their area but takes no cell, so the buttons fill the row.
  const TRAY_COLOR = '#efeaf4'
  const PANEL_BUTTON_REM = 4
  const COLOR_BUTTON_REM = 2.5
  const PANEL_BUTTON_MARGIN_REM = 0.15
  const PANEL_CELL_REM = rem(PANEL_BUTTON_REM + 2 * PANEL_BUTTON_MARGIN_REM)
  const COLOR_CELL_REM = rem(COLOR_BUTTON_REM + 2 * PANEL_BUTTON_MARGIN_REM)
  const PANEL_HEIGHT_REM = 4 * PANEL_CELL_REM
  const PANEL_COLUMNS = 3
  const COLOR_ROWS = 3
  const CONTROLS_ROW = COLOR_ROWS + 1
  const SLIDERS_ROW = CONTROLS_ROW + 1
  const CONTROLS_GAP_REM = 0.75
  const TRAY_RADIUS_PX = 14
  // A pressed button shrinks to this scale over this long, so a click shows before it lets go; SudokuPad's own buttons have no pressed look.
  const PRESS_SCALE = 0.97
  const PRESS_MS = 120
  const TRAY_REACH_REM = 0.25
  const TRAY_PADDING_REM = 0.4
  const TRAY_TOP_REM = rem(CONTROLS_GAP_REM + PANEL_BUTTON_MARGIN_REM - TRAY_PADDING_REM)
  const SLIDER_TRACK_REM = 0.8
  const SLIDER_THUMB_REM = 1.1
  const SLIDER_THUMB_RING_REM = 0.2
  // A hidden slider's empty row has the same height, so the other keeps its place.
  const SLIDER_ROW_HEIGHT_REM = 1.4
  // The wedge is a data-URI picture, since a CSS gradient cannot draw a slanted edge. `preserveAspectRatio="none"` stretches it over the track.
  const WEDGE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'><polygon points='0,4.5 100,1.5 100,8.5 0,5.5' fill='${SUDOKUPAD_PURPLE}'/></svg>`
  const WEDGE_PICTURE = `url("data:image/svg+xml,${encodeURIComponent(WEDGE_SVG)}") center / 100% 100% no-repeat`
  const FADE_PICTURE = `linear-gradient(to right, color-mix(in srgb, ${SUDOKUPAD_PURPLE} 8%, transparent), ${SUDOKUPAD_PURPLE})`
  const TRACK_SHAPE = `height: ${SLIDER_TRACK_REM}rem; border: none; border-radius: ${SLIDER_TRACK_REM / 2}rem;`
  const THUMB_SHAPE = `box-sizing: border-box; width: ${SLIDER_THUMB_REM}rem; height: ${SLIDER_THUMB_REM}rem; border-radius: 50%; background: #fff; border: ${SLIDER_THUMB_RING_REM}rem solid ${SUDOKUPAD_PURPLE};`

  // `panel`, `colorButton`, `controlButtons` and `pressButtons` are selectors; `tray`, `sliders` and `sliderRow` are bare class names and `wedgeSlider` and `fadeSlider` bare ids.
  function panelCss ({ panel, colorButton, controlButtons, pressButtons, tray, sliders, sliderRow, wedgeSlider, fadeSlider }) {
    const rows = [[1, 2, 3, COLOR_ROWS], [7, 8, 9, 1]]
    const pressable = [`${panel} ${colorButton}`, controlButtons, ...(pressButtons ? [pressButtons] : [])].join(', ')
    const pressed = `:is(${pressable}):active`
    return [
      `${panel} { display: grid !important; grid-template-columns: repeat(${PANEL_COLUMNS}, ${PANEL_CELL_REM}rem); grid-template-rows: repeat(${COLOR_ROWS}, ${COLOR_CELL_REM}rem) ${rem(CONTROLS_GAP_REM + PANEL_CELL_REM)}rem 1fr; height: ${PANEL_HEIGHT_REM}rem !important; padding: 0 !important; box-sizing: border-box; justify-items: center; align-items: center; position: relative; }`,
      `${panel} > .button-row { display: contents !important; }`,
      `${panel} button[data-key="0"], ${panel} button[data-control="delete"] { display: none !important; }`,
      // Each color button keeps `position: relative`, since its color line is its `::after`.
      `${panel} ${colorButton} { position: relative; width: ${PANEL_BUTTON_REM}rem !important; height: ${COLOR_BUTTON_REM}rem !important; min-width: 0 !important; margin: ${PANEL_BUTTON_MARGIN_REM}rem !important; }`,
      `${controlButtons} { grid-row: ${CONTROLS_ROW}; align-self: end; position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; width: ${PANEL_BUTTON_REM}rem; height: ${PANEL_BUTTON_REM}rem; min-height: 0; margin: ${PANEL_BUTTON_MARGIN_REM}rem; padding: 0; background-color: var(--body-bg); color: ${SUDOKUPAD_PURPLE}; }`,
      `.${tray} { grid-row: ${CONTROLS_ROW} / ${SLIDERS_ROW + 1}; grid-column: 1 / ${PANEL_COLUMNS + 1}; position: absolute; inset: 0; z-index: 0; margin: ${TRAY_TOP_REM}rem -${TRAY_REACH_REM}rem 0; background: ${TRAY_COLOR}; border-radius: ${TRAY_RADIUS_PX}px; }`,
      // With no sliders the tray ends under the controls, as far past their margin as the other sides: an absolutely placed box needs its end line, or it runs to the panel's edge.
      `${panel}:not(:has(.${sliders})) .${tray} { grid-row: ${CONTROLS_ROW} / ${SLIDERS_ROW}; margin-bottom: -${rem(TRAY_PADDING_REM - PANEL_BUTTON_MARGIN_REM)}rem; }`,
      // SudokuPad's Keypad Flipped swaps the first and third rows of colors with a transform on each `.button-row`, which has no box here, so the rows are swapped by grid row.
      ...rows.flatMap(([a, b, c, row]) => [a, b, c].map((key) => `.setting-flipkeypad ${panel} button[data-key="${key}"] { grid-row: ${row} / span 1; }`)),
      `.${sliders} { grid-row: ${SLIDERS_ROW}; grid-column: 1 / ${PANEL_COLUMNS + 1}; justify-self: stretch; align-self: stretch; position: relative; z-index: 1; box-sizing: border-box; margin: ${PANEL_BUTTON_MARGIN_REM}rem ${PANEL_BUTTON_MARGIN_REM}rem ${TRAY_PADDING_REM}rem; }`,
      `${pressable} { transition: transform ${PRESS_MS}ms ease-out; }`,
      `${pressed} { transform: scale(${PRESS_SCALE}); }`,
      `@media (prefers-reduced-motion: reduce) { ${pressable} { transition: none; } ${pressed} { transform: none; } }`,
      `.${sliders} { padding: 0 0.8rem; display: flex; flex-direction: column; justify-content: space-evenly; color: ${SUDOKUPAD_PURPLE}; }`,
      `.${sliderRow} { display: flex; align-items: center; gap: 0.4rem; height: ${SLIDER_ROW_HEIGHT_REM}rem; }`,
      `.${sliderRow} input { flex: 1; min-width: 0; margin: 0; height: ${SLIDER_ROW_HEIGHT_REM}rem; background: transparent; outline: none; -webkit-appearance: none; appearance: none; }`,
      `.${sliderRow} input::-webkit-slider-runnable-track { ${TRACK_SHAPE} }`,
      `.${sliderRow} input::-moz-range-track { ${TRACK_SHAPE} }`,
      `#${wedgeSlider}::-webkit-slider-runnable-track { background: ${WEDGE_PICTURE}; }`,
      `#${wedgeSlider}::-moz-range-track { background: ${WEDGE_PICTURE}; }`,
      `#${fadeSlider}::-webkit-slider-runnable-track { background: ${FADE_PICTURE}; }`,
      `#${fadeSlider}::-moz-range-track { background: ${FADE_PICTURE}; }`,
      `.${sliderRow} input::-webkit-slider-thumb { -webkit-appearance: none; margin-top: ${rem((SLIDER_TRACK_REM - SLIDER_THUMB_REM) / 2)}rem; ${THUMB_SHAPE} }`,
      `.${sliderRow} input::-moz-range-thumb { ${THUMB_SHAPE} }`
    ]
  }

  // SudokuPad cancels (`preventDefault`) every mouse move on the page, and a cancelled move stops the browser dragging a slider's thumb. A move over the sliders is kept from
  // SudokuPad's handlers, so the thumb drags and the drag reaches nothing else on the page. A drag leaves the focus on the slider, where the arrow keys would not
  // reach the puzzle, so the focus goes back to the page when the pointer is released. `sliders` is the selector of the block that holds the slider inputs.
  function installSliderGuards (sliders, doc = document, win = window) {
    doc.addEventListener('mousemove', (event) => {
      if (event.target.closest(sliders)) event.stopPropagation()
    }, true)
    win.addEventListener('pointerup', () => {
      const focused = doc.activeElement
      if (focused && focused.matches(`${sliders} input`)) focused.blur()
    }, true)
  }

  // A panel's settings gear: its viewBox centres its ink, measured from rendered pixels like the other control icons. The gear is Lucide's `settings` (https://lucide.dev, ISC licence). Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT);
  // all other copyright (c) for Lucide are held by Lucide Contributors 2022. Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is
  // hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
  const SETTINGS_ICON_VIEWBOX = '-1.51 -2.63 27.882 27.882'
  const SETTINGS_ICON = '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'
  /* eslint-enable no-unused-vars */
  // </lib:panel>
  const COLOR_LABEL_REM = 1.7
  // The eye is a square that fills the sliders block's height, with its icon a little smaller.
  const HIDE_BUTTON_REM = 2.8
  const HIDE_ICON_REM = 2.2
  const CONTROL_COLUMNS = { [CLEAR_CLASS]: 1, [BACKGROUND_CLASS]: 2, [SETTINGS_CLASS]: 3 }
  const PANEL = '.tool-textanywhere .controls-input'
  // Under the panel's own button rule, which sets a color and background on every button in it.
  const HIDE_ALL = `${PANEL} button.${HIDE_ALL_CLASS}`
  const controlButtons = Object.keys(CONTROL_COLUMNS).map((name) => `${PANEL} button.${name}`).join(', ')
  const hoverShare = (percent) => `color-mix(in srgb, ${SUDOKUPAD_PURPLE} min(100%, calc(${percent}% / var(${NOTE_OPACITY_VAR}))), transparent)`
  const hoverLook = (outlinePercent, fillPercent) => `outline: 1px solid ${hoverShare(outlinePercent)}; outline-offset: 2px; background-image: linear-gradient(${hoverShare(fillPercent)}, ${hoverShare(fillPercent)});`
  // A closed note that is not selected, under Text Anywhere: the one that shows a hover outline.
  const IDLE_NOTE = `.${ACTIVE_CLASS} .${TEXT_CLASS}:not(.${TEXT_BOX_CLASS}, .${SELECTED_CLASS})`
  const PANEL_CSS = [
    ...panelCss({ panel: PANEL, colorButton: 'button.digit', controlButtons, pressButtons: HIDE_ALL, tray: TRAY_CLASS, sliders: SLIDERS_CLASS, sliderRow: SLIDER_ROW_CLASS, wedgeSlider: SIZE_SLIDER, fadeSlider: OPACITY_SLIDER }),
    `${PANEL} button.digit { text-indent: -999em; overflow: hidden; color: transparent; }`,
    `${PANEL} button.digit:not(.current) { background-color: var(--body-bg); }`,
    `${PANEL} button.digit::after { content: "Aa"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-indent: 0; font-size: ${COLOR_LABEL_REM}rem; font-weight: 600; line-height: 1; }`,
    ...COLOR_NUMBERS.map((n) => `${PANEL} button[data-key="${n}"]::after { color: var(${colorVar(n)}); }`),
    ...Object.entries(CONTROL_COLUMNS).map(([name, column]) => `${PANEL} button.${name} { grid-column: ${column}; }`),
    `:is(.${CLEAR_CLASS}, .${SETTINGS_CLASS}, .${BACKGROUND_CLASS}) svg { width: 2.6rem; height: 2.6rem; }`,
    // SudokuPad's CSS fills every 'svg path' and the paths in a tool button's icon, which would turn the icons' lines into blobs, the tool button's note into a solid square.
    `:is(.${CLEAR_CLASS}, .${SETTINGS_CLASS}, #control-${TOOL_NAME}, ${HIDE_ALL}) :is(path, circle, rect, ellipse), .${BACKGROUND_CLASS} :is(path, circle, rect, ellipse):not(.${BACKGROUND_FILL_CLASS}) { fill: none !important; }`,
    `:is(.${BACKGROUND_CLASS}, ${HIDE_ALL})[aria-pressed="true"] { background-color: ${TRAY_COLOR}; outline: 2px solid ${SUDOKUPAD_PURPLE}; }`,
    `.${SLIDERS_CLASS} { flex-direction: row; align-items: center; gap: 0.4rem; }`,
    `.${SLIDER_ROWS_CLASS} { flex: 1; min-width: 0; align-self: stretch; display: flex; flex-direction: column; justify-content: space-evenly; }`,
    `${HIDE_ALL} { flex: none; display: flex; align-items: center; justify-content: center; width: ${HIDE_BUTTON_REM}rem; height: ${HIDE_BUTTON_REM}rem; min-height: 0; margin: 0; padding: 0; background-color: var(--body-bg); color: ${SUDOKUPAD_PURPLE}; }`,
    `${HIDE_ALL} svg { width: ${HIDE_ICON_REM}rem; height: ${HIDE_ICON_REM}rem; }`,
    // Hidden notes keep their layout, so they measure and come back in place; a hidden element takes no pointer, so none can be hit.
    `#${LAYER_ID}.${HIDDEN_CLASS} { visibility: hidden; }`,
    `.${BACKGROUND_CLASS}[aria-pressed="mixed"] { outline: 2px dashed ${SUDOKUPAD_PURPLE}; }`,
    ...COLOR_NUMBERS.map((n) => `${PANEL} button[data-key="${n}"] { grid-row: ${Math.ceil(n / PANEL_COLUMNS)} / span 1; grid-column: ${(n - 1) % PANEL_COLUMNS + 1} / span 1; }`),
    pickerCss(CLASS_PREFIX, TOOL_NAME),
    `#${LAYER_ID} { position: fixed; inset: 0; z-index: ${LAYER_Z}; pointer-events: none; overflow: hidden; }`,
    // SudokuPad blurs the board under a dialog opened with `overlayBlur` (`body.overlay-visible .boardsvg > *`), which is how it hides the grid while paused.
    // The notes would give the solve away, so they blur with it and take no pointer; selection and an open note stay as they are underneath.
    `body.overlay-visible #${LAYER_ID} { filter: blur(${DIALOG_BLUR_PX}px); }`,
    `body.overlay-visible #${LAYER_ID} * { pointer-events: none !important; }`,
    // A line as tall as the hit box, so a note's background box is as tall as a digit and covers one under it.
    // SudokuPad sizes every box border-box; a note's sizes are its text's, as its hit box is, with the padding around them.
    `.${TEXT_CLASS} { position: absolute; box-sizing: content-box; line-height: ${LINE_HEIGHT}; white-space: pre-wrap; overflow-wrap: anywhere; width: max-content; max-width: ${BOX_WIDTH_EM}em; max-height: ${roundToTenth(BOX_LINES * LINE_HEIGHT)}em; overflow: hidden; }`,
    // A thin bar whose room is kept whether it shows or not, so the text does not wrap again as it appears.
    // A closed note that scrolls always shows it, in the note's own color, so a solver sees there is more text; it fades with the note.
    // The open box is being typed in, so its bar stays out of the way until the pointer is over it.
    `.${TEXT_CLASS}.${SCROLLS_CLASS} { overflow-y: auto; scrollbar-width: thin; scrollbar-color: currentColor transparent; }`,
    `.${TEXT_CLASS}.${TEXT_BOX_CLASS}.${SCROLLS_CLASS} { scrollbar-color: transparent transparent; }`,
    `.${TEXT_CLASS}.${TEXT_BOX_CLASS}.${SCROLLS_CLASS}:hover { scrollbar-color: currentColor transparent; }`,
    // Under every other tool a press or a move over a note goes to what lies under it, as if the notes were not there. Under this one a closed note shows
    // the move cursor, and a note neither selected nor open shows a faint outline and fill, so a click reads as selecting it and not as starting a new note.
    // The hover look is drawn on the note itself, so each share is divided by the note's opacity, to a cap of all of it: a faded note's cue stays about as visible as the note.
    // The fill is a background image because the note's inline background color, empty or its box, wins over any stylesheet color.
    `.${ACTIVE_CLASS} .${TEXT_CLASS}:not(.${TEXT_BOX_CLASS}) { pointer-events: auto; cursor: move; }`,
    // The outline is there and clear until the pointer comes, so its color is what fades in.
    `${IDLE_NOTE} { outline: 1px solid transparent; outline-offset: 2px; }`,
    `${IDLE_NOTE}:is(:hover, .${HOVERED_CLASS}) { ${hoverLook(35, 4)} }`,
    `.${TEXT_BOX_CLASS}.${EMPTY_CLASS} { min-width: 1em; outline: 1px solid color-mix(in srgb, currentColor 30%, transparent); }`,
    `html.${HELD_CURSOR_CLASS}, html.${HELD_CURSOR_CLASS} * { cursor: var(${HELD_CURSOR_VAR}) !important; }`,
    `@media ${MOTION_OK} {`,
    `  ${IDLE_NOTE}:is(:hover, .${HOVERED_CLASS}) { transition: outline-color ${FADE_IN_MS}ms ${FADE_IN_EASE}; }`,
    `  .${HANDLE_CLASS} { transition: opacity ${FADE_IN_MS}ms ${FADE_IN_EASE}; }`,
    '}',
    `.${HANDLE_CLASS}.${ENTERING_CLASS} { opacity: 0; }`,
    `.${CHECK_CLASS} { display: inline-block; box-sizing: border-box; width: 0.8em; height: 0.8em; border: 2px solid currentColor; border-radius: 3px; vertical-align: -0.05em; position: relative; }`,
    `.${CODE_CLASS} { font-family: ${FIXED_FONT_STACK}; font-size: 0.9em; background: color-mix(in srgb, currentColor 15%, transparent); border-radius: 0.25em; padding: 0.05em 0.25em; box-decoration-break: clone; -webkit-box-decoration-break: clone; }`,
    // A struck run is a stacking context of its own, so its lines paint with it: a note drawn later still covers them.
    `.${STRIKE_CLASS} { isolation: isolate; }`,
    `.${STRIKE_PIECE_CLASS} { position: relative; }`,
    `.${STRIKE_PIECE_CLASS}::after { content: ''; position: absolute; left: 0; right: 0; top: 52%; height: 0.07em; background: currentColor; }`,
    `.${CODE_BLOCK_CLASS} { display: block; padding: 0.15em 0.35em; border-radius: 0.3em; }`,
    `.${CHECK_DONE_CLASS}::after { content: ''; position: absolute; left: 0.2em; top: -0.1em; width: 0.25em; height: 0.5em; border: solid currentColor; border-width: 0 2px 2px 0; transform: rotate(45deg); }`,
    `.${ACTIVE_CLASS} .${TEXT_CLASS}:not(.${TEXT_BOX_CLASS}) .${CHECK_CLASS} { cursor: pointer; }`,
    `:is(.${BOARD_NOTES_CLASS}, .${SCREEN_NOTES_CLASS}) { position: absolute; left: 0; top: 0; transform-origin: 0 0; }`,
    // The outline is a box of its own in the layer, since a note's opacity would fade an outline drawn on the note itself.
    `.${SELECTION_CLASS} { position: absolute; box-sizing: border-box; pointer-events: none; outline: ${SELECTION_OUTLINE_PX}px solid ${SUDOKUPAD_PURPLE}; outline-offset: ${SELECTION_OFFSET_PX}px; }`,
    `.${GUIDE_CLASS} { position: absolute; background: color-mix(in srgb, ${SUDOKUPAD_PURPLE} 35%, transparent); pointer-events: none; }`,
    `.${SELECTION_CLASS}.${OPEN_OUTLINE_CLASS} { outline-width: 1px; outline-offset: 1px; }`,
    `.${NUDGING_CLASS} :is(.${SELECTION_CLASS}, .${HANDLE_CLASS}) { visibility: hidden; }`,
    `.${RECTANGLE_CLASS} { position: absolute; box-sizing: border-box; border: 1px solid ${SUDOKUPAD_PURPLE}; background: color-mix(in srgb, ${SUDOKUPAD_PURPLE} 6%, transparent); }`,
    `.${HANDLE_CLASS} { position: absolute; box-sizing: border-box; width: ${HANDLE_PX}px; height: ${HANDLE_PX}px; background: ${SUDOKUPAD_PURPLE}; border: 2px solid #fff; border-radius: 2px; box-shadow: 0 0 0 1px ${SUDOKUPAD_PURPLE}, 0 1px 3px rgb(0 0 0 / .3); pointer-events: auto; }`,
    `.${TEXT_BOX_CLASS} { pointer-events: auto; min-width: 0.3em; cursor: text; }`,
    // The note's color is a property of its own because the selection's `currentColor` stays the color before a recolor. The browser's blue would hide it: a selection is the note's color at low opacity behind the text, with no halo to blur it.
    `.${TEXT_BOX_CLASS}::selection { background: color-mix(in srgb, var(${NOTE_COLOR_VAR}) ${SELECTION_TINT_PERCENT}%, transparent); text-shadow: none; }`,
    // The tool bar is a grid and stock buttons have order 0, so Text Anywhere's stays last whenever another is added.
    `.controls-tool #control-${TOOL_NAME} { order: 1; }`
  ].join('\n')
  const SETTINGS_LABEL = 'Text Anywhere settings'
  const controlIcon = (paths, viewBox = '0 0 24 24') => `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
  const CLEAR_LABEL = 'Clear all'
  const DELETE_SELECTED_LABEL = 'Delete the selected notes'
  const HIDE_LABEL = 'Hide all notes'
  const SHOW_LABEL = 'Show all notes'
  const EYE_OPEN_ICON = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
  const EYE_SHUT_ICON = '<path d="M2 9C6 17 18 17 22 9"/><path d="M4.3 12.1L3.2 14.5M8.5 14.5L7.8 17M15.5 14.5L16.2 17M19.7 12.1L20.8 14.5"/>'
  const CLEAR_ICON = '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>'
  let color = DEFAULT_COLOR
  // The looks in force, by `LOOKS` name: width and opacity are the next note's as the sliders set them, and remembered; the rest are
  // the outline and font of every note and the box color and frame of every note with a box, as the settings dialog sets them.
  const look = readLooks({ getData: () => null })
  // Whether the next note is made with a background. The Background button turns it on and off, and it is remembered.
  let background = false
  // Text Anywhere's nine colors, or null until they are first copied from the pen colors.
  let colors = null
  // The preset `colors` came from, or null for Custom.
  let colorsPreset = null
  let panelParts = []

  const keypad = () => document.querySelector('.controls-input')

  const unmarkColor = () => { for (const button of keypad().querySelectorAll('button.digit.current')) button.classList.remove('current') }

  // The open note's own look changes.
  function changeOpen (change) {
    editing.item = change(editing.item)
    showEditing(boardMap())
    showPanelValues()
  }

  function setColor (next) {
    color = next
    savedData.setData(COLOR_KEY, color)
  }

  // An explicit change reaches the notes `lookTarget` names and is also the next note's setting (`setNext`); selecting or opening a note sets nothing.
  function applyLook (change, setNext) {
    setNext()
    const target = lookTarget(editing, selected)
    if (target === 'open') changeOpen(change)
    else if (target === 'selected') changeSelected(change)
    else showPanelValues()
  }

  // The notes `lookTarget` names as a list, or null for the next note.
  function targetNotes () {
    const target = lookTarget(editing, selected)
    return target === 'open' ? [editing.item] : target === 'selected' ? selectedNotes() : null
  }

  const pickColor = (next) => applyLook((item) => ({ ...item, color: next }), () => setColor(next))

  function showColors () {
    writeStyle(COLORS_STYLE_ID, colors ? colorsCss(colors) : '')
  }

  // The colors and every look as stored and as shown, as a function that puts them all back after a Save or Paste that failed half-way.
  const snapshotSave = () => snapshotStore(savedData, [COLORS_KEY, ...lookKeys(LOOKS)], () => {
    const wasColors = colors
    const wasPreset = colorsPreset
    const wasLooks = { ...look }
    return () => {
      colors = wasColors
      colorsPreset = wasPreset
      Object.assign(look, wasLooks)
      showPanelValues()
      showColors()
      if (colors) refreshPickers(CLASS_PREFIX, (n) => colors[n])
      showBoxes()
    }
  })

  // A set saved with no preset is Custom.
  function saveColors (next, preset = null) {
    colors = next
    colorsPreset = preset
    savedData.setData(COLORS_KEY, storedNoteColors(colors, preset))
    showColors()
    refreshPickers(CLASS_PREFIX, (n) => colors[n])
  }

  function showBoxes () {
    boardNotes.run(() => { if (Framework.app.puzzle.currentPuzzle) redraw() })
  }

  // A look is stored and kept, then the notes are drawn again in it when it is one of the dialog's.
  function setLook (name, value) {
    const row = lookRow(name)
    look[name] = value
    savedData.setData(row.key, value)
    if (row.dialog) showBoxes()
  }

  // The dialog's pickers fill a draft that Save writes; Copy and Paste settings act at once.
  const DIALOG_ID = 'text-anywhere-dialog'
  const DIALOG_STYLE_ID = 'text-anywhere-dialog-style'
  const DIALOG_CSS = [
    `#${DIALOG_ID} .${CLASS_PREFIX}section-title { font-weight: 600; margin: 6px 0 0; }`,
    `#${DIALOG_ID} .${CLASS_PREFIX}pick-note { margin: 2px 0 0; font-size: 0.85em; opacity: 0.8; }`,
    `#${DIALOG_ID} .${CLASS_PREFIX}pick-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0; }`,
    `#${DIALOG_ID} .${CLASS_PREFIX}pick { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 4px; width: auto; height: auto; min-width: 0; margin: 0; padding: 4px 4px 6px; line-height: 1.2; border: 2px solid transparent; border-radius: 8px; background: none; color: inherit; font: inherit; cursor: pointer; }`,
    `#${DIALOG_ID} .${CLASS_PREFIX}pick[aria-pressed="true"] { border-color: #000; }`,
    `#${DIALOG_ID} .${CLASS_PREFIX}sample { box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: 64px; height: 44px; border-radius: 6px; font-weight: 600; line-height: 1; }`,
    `#${DIALOG_ID} .${CLASS_PREFIX}sample[data-cell] { border: 1px solid rgb(0 0 0 / .25); }`,
    `#${DIALOG_ID} .${CLASS_PREFIX}pick-label { font-size: 0.85em; }`,
    `#${DIALOG_ID} input.${CLASS_PREFIX}swatch[data-role="box-custom"] { display: block; margin: 0 0 6px; }`,
    colorBlockCss(CLASS_PREFIX, `#${DIALOG_ID}`),
    // The pulldowns are as wide as their longest option, not as the dialog's column (after colorBlockCss, whose rule they override).
    `#${DIALOG_ID} .${CLASS_PREFIX}color-choice { width: auto; min-width: 0; }`
  ].join('\n')

  // A pasted value is saved and shown at once, whether or not Text Anywhere is current.
  function applyPasted (values) {
    if (COLORS_KEY in values) saveColors(readNoteColors(values[COLORS_KEY]), readNotePreset(values[COLORS_KEY]))
    for (const { name, key } of LOOKS) if (key in values) setLook(name, values[key])
    showPanelValues()
  }

  function openDialog () {
    // Until the colors are first copied, the draft is the pen colors a first use would copy.
    let draft = colors ?? copiedPenColors(readPenColor)
    // Null is Custom.
    let chosen = colors ? colorsPreset : PEN_PRESET
    let colorsEdited = false
    let draftLooks = { ...look }
    let draftCustom = savedHex(look.boxColor) ?? BOX_WHITE
    let pages = []
    let paletteNote = ''
    // A palette of a shape the script does not know is the dialog's own note, and does not turn the presets off.
    if (!presets.off) {
      try {
        pages = palettePages()
      } catch (error) {
        console.warn(`text-anywhere: ${error.message}`)
        paletteNote = error.message
      }
    }
    const editedLooks = () => changedDialogLooks(LOOKS, draftLooks, look)
    const box = settingsUi.run(() => showSettingsDialog(dialogs, {
      prefix: CLASS_PREFIX,
      name: 'Text Anywhere',
      version: VERSION,
      bodyId: DIALOG_ID,
      styleId: DIALOG_STYLE_ID,
      css: DIALOG_CSS,
      changed: () => colorsEdited || editedLooks().length > 0,
      snapshot: snapshotSave,
      feature: settingsUi,
      save: () => {
        if (colorsEdited) saveColors(draft, chosen)
        for (const { name } of editedLooks()) setLook(name, draftLooks[name])
      },
      copyPaste: {
        // A copy with the saved settings off says so, rather than copy the defaults as if they were saved.
        copied: () => storage.runInDialog(() => copiedSettings(savedData)),
        readers: READERS,
        upgrade: withNewKeys,
        apply: (values) => {
          applyPasted(values)
          // The draft takes only what was pasted: an edit to anything else is still there for Save.
          draftLooks = draftWithPasted(LOOKS, draftLooks, look, values)
          if (BOX_KEY in values) draftCustom = savedHex(look.boxColor) ?? draftCustom
          if (COLORS_KEY in values) {
            draft = colors
            chosen = colorsPreset
            colorsEdited = false
          }
          draw()
        }
      },
      extraButtons: [{ content: 'Restore defaults', role: 'restore', handler: () => restoreDefaults() }]
    }), () => null)
    if (!box) return
    // Like Pen Tool Extras: the draft takes the defaults, and Save or Cancel decides.
    const restoreDefaults = () => {
      draftLooks = { ...draftLooks, ...dialogDefaults() }
      draft = copiedPenColors(readPenColor)
      chosen = PEN_PRESET
      colorsEdited = true
      draw()
    }
    const draw = () => {
      const options = presetChoices(chosen ?? CUSTOM, presetOptions(pages.length), PRESET_LABELS)
      box.innerHTML = `<div class="${CLASS_PREFIX}section-title">Colors</div>` +
        renderColorBlock({ prefix: CLASS_PREFIX, label: 'Text color preset', options, swatches: COLOR_NUMBERS.map((n) => ({ key: String(n), value: draft[n], label: `Text color ${n}` })) }) +
        (paletteNote ? `<div data-role="palette-note">${paletteNote}.</div>` : '') +
        `<div class="${CLASS_PREFIX}section-title">Font</div>${renderFontChoice(draftLooks.noteFont)}` +
        renderSamplePicks({ outline: draftLooks.outline, box: draftLooks.boxColor, custom: draftCustom, frame: draftLooks.frame, textColor: draft[color] })
    }
    draw()
    box.addEventListener('change', under(settingsUi, (event) => {
      const target = event.target
      if (target.matches('[data-role="color-choice"]')) {
        chosen = target.value
        draft = presetColors(chosen, pages, readCellColor, readPenColor)
        colorsEdited = true
        draw()
      } else if (target.matches('[data-role="font-choice"]')) {
        draftLooks.noteFont = readFont(target.value)
        draw()
      } else if (target.matches('[data-role="box-custom"]')) {
        draftCustom = draftLooks.boxColor = hexColor(target.value)
        draw()
      } else if (target.matches('input[data-role="swatch"]')) {
        draft = editedColor(draft, Number(target.dataset.key), target.value)
        chosen = null
        colorsEdited = true
        draw()
      }
    }))
    box.addEventListener('click', under(settingsUi, (event) => {
      const button = event.target.closest('button[data-role$="-pick"]')
      if (!button) return
      const { role, value } = button.dataset
      if (role === 'outline-pick') draftLooks.outline = readOutline(value)
      else if (role === 'box-pick') draftLooks.boxColor = value === BOX_CUSTOM ? draftCustom : value
      else if (role === 'frame-pick') draftLooks.frame = value === 'on'
      else return
      draw()
      box.querySelector(`button[data-role="${role}"][data-value="${value}"]`)?.focus()
    }))
  }

  const BACKGROUND_ON_LABEL = 'Background: on. Click to turn off'
  const BACKGROUND_OFF_LABEL = 'Background: off. Click to turn on'
  const BACKGROUND_MIXED_LABEL = 'Background: on for some selected notes. Click to turn on for all'
  const BACKGROUND_ICON = `<rect class="${BACKGROUND_FILL_CLASS}" x="3" y="5" width="18" height="14" rx="3" fill="currentColor" fill-opacity=".22"/><rect x="3" y="5" width="18" height="14" rx="3" stroke-dasharray="3 3"/>${TEXT_GLYPH}`

  const backgroundShown = () => {
    const notes = targetNotes()
    return notes ? panelLooks(notes).bg : background
  }

  function showBackground () {
    const button = document.querySelector(`.${BACKGROUND_CLASS}`)
    if (!button) return
    const shown = backgroundShown()
    const label = shown === null ? BACKGROUND_MIXED_LABEL : shown ? BACKGROUND_ON_LABEL : BACKGROUND_OFF_LABEL
    button.title = label
    button.setAttribute('aria-label', label)
    button.setAttribute('aria-pressed', shown === null ? 'mixed' : String(shown))
  }

  function setBackground (on) {
    background = on
    savedData.setData(BACKGROUND_KEY, on)
  }

  function pressBackground () {
    const on = backgroundShown() !== true
    applyLook(({ bg, ...rest }) => on ? { ...rest, bg: true } : rest, () => setBackground(on))
  }

  const panelValues = () => {
    const notes = targetNotes()
    return notes ? panelLooks(notes) : { color, width: look.width, opacity: look.opacity }
  }

  function sliderRow (id, label, range, value) {
    const row = document.createElement('div')
    row.className = SLIDER_ROW_CLASS
    row.title = label
    const input = document.createElement('input')
    Object.assign(input, { type: 'range', id, min: range.min, max: range.max, step: range.step, value, tabIndex: -1 })
    input.setAttribute('aria-label', label)
    row.append(input)
    return row
  }

  const SIZE_KEYS = { '+': 1, '=': 1, '-': -1 }

  // The look each slider sets, read by its row in LOOKS, and how it changes a note.
  const SLIDER_LOOKS = {
    [SIZE_SLIDER]: { name: 'width', change: (value) => (item) => ({ ...item, size: textSizeFor(value) }) },
    [OPACITY_SLIDER]: { name: 'opacity', change: (value) => (item) => ({ ...item, opacity: value }) }
  }

  function slideLook (input) {
    const { name, change } = SLIDER_LOOKS[input.id]
    const value = lookRow(name).read(Number(input.value))
    applyLook(change(value), () => setLook(name, value))
  }

  function stepSize (direction) {
    const slider = document.getElementById(SIZE_SLIDER)
    slider.value = sizeStep(panelValues().width, direction)
    slideLook(slider)
    showPanelValues()
  }

  function showPanel () {
    const tray = document.createElement('div')
    tray.className = TRAY_CLASS
    const clear = document.createElement('button')
    clear.className = CLEAR_CLASS
    clear.innerHTML = controlIcon(CLEAR_ICON)
    clear.addEventListener('click', under(textTool, () => {
      setNotesHidden(false)
      if (selected.length) deleteSelected()
      else confirmClear()
    }))
    const settings = document.createElement('button')
    settings.className = SETTINGS_CLASS
    settings.title = SETTINGS_LABEL
    settings.setAttribute('aria-label', SETTINGS_LABEL)
    settings.innerHTML = controlIcon(SETTINGS_ICON, SETTINGS_ICON_VIEWBOX)
    settings.addEventListener('click', under(settingsUi, openDialog))
    const backgroundButton = document.createElement('button')
    backgroundButton.className = BACKGROUND_CLASS
    backgroundButton.innerHTML = controlIcon(BACKGROUND_ICON)
    backgroundButton.addEventListener('click', under(textTool, pressBackground))
    const hideAll = document.createElement('button')
    hideAll.className = HIDE_ALL_CLASS
    hideAll.addEventListener('click', under(textTool, () => setNotesHidden(!notesHidden)))
    const sliderRows = document.createElement('div')
    sliderRows.className = SLIDER_ROWS_CLASS
    sliderRows.append(sliderRow(SIZE_SLIDER, SIZE_LABEL, { min: MIN_WIDTH, max: MAX_WIDTH, step: WIDTH_STEP }, look.width), sliderRow(OPACITY_SLIDER, OPACITY_LABEL, { min: MIN_OPACITY, max: MAX_OPACITY, step: OPACITY_STEP }, look.opacity))
    const sliders = document.createElement('div')
    sliders.className = SLIDERS_CLASS
    sliders.append(sliderRows, hideAll)
    // Arrow keys on a slider end in a change.
    sliders.addEventListener('change', under(textTool, returnFocusToNote))
    sliders.addEventListener('input', under(textTool, (event) => slideLook(event.target)))
    panelParts = [tray, clear, backgroundButton, ...(settingsUi.off ? [] : [settings]), sliders]
    keypad().append(...panelParts)
    showHideAllLook()
    showPanelValues()
  }

  function showPanelValues () {
    if (!panelParts[0]?.isConnected) return
    const looks = panelValues()
    unmarkColor()
    if (looks.color !== null) keypad().querySelector(`button[data-key="${looks.color}"]`).classList.add('current')
    document.getElementById(SIZE_SLIDER).value = looks.width
    document.getElementById(OPACITY_SLIDER).value = looks.opacity
    showBackground()
    const clear = document.querySelector(`.${CLEAR_CLASS}`)
    const label = selected.length ? DELETE_SELECTED_LABEL : CLEAR_LABEL
    clear.title = label
    clear.setAttribute('aria-label', label)
  }

  function hidePanel () {
    for (const part of panelParts) part.remove()
    panelParts = []
  }

  // A hold on a color button toggles a color picker over each, and a picker recolors its color number at once: every note in it reads the variable.
  function installColorPickers () {
    installHoldToEdit({ prefix: CLASS_PREFIX, tool: TOOL_NAME, colorOf: (n) => colors[n], save: (n, value) => saveColors(editedColor(colors, Number(n), value)), guard: (toggle) => textTool.run(toggle) })
  }

  // A left press in progress: `start` is the index of the note it began on, or -1 for none; `points` its points on the screen, and `pending` those its
  // moves reached since the last frame; `samples` the pointer's `[x, y, time]` of the last SPEED_WINDOW_MS, and `settle` the timer that draws the move again once
  // that window has passed with the pointer still; `move` the notes it moves (each with its index and the item as it was at the press), or null; `shift` and `detail`
  // the press's Shift key and click count; and `rectangle`, the selection rectangle's element once a press on no note has dragged.
  let drag = null
  // A right-drag in progress: the last point it reached, the points its moves reached since the last frame, and the notes it has touched, which go on its release.
  // The right button's `buttons` bit holds it.
  let erasing = null
  // The note open for typing: the index of the text it reopened, or -1 for a new one, the item and its element, which the solver types in.
  let editing = null
  // The four resize handles of the open note, or of the one note selected, each with the corner of CORNERS it sits on; none when no note shows them.
  let handles = []
  // A drag of a resize handle: the note's index in `puzzleNotes`, its item at the press, the corner dragged, the opposite corner on
  // the screen, the dragged corner's offset from the pointer at the press, and the point the last move reached, or null.
  let resizing = null
  // True from a press that finished a text box until its release, so the press does nothing else on the page.
  let pressFinishedText = false
  // Set when Ctrl+Enter or Cmd+Enter closes a note, until that Enter is released or another key is pressed.
  let endedByEnter = false
  let puzzleNotes = []
  // The saved entries that are not notes, strokes or shapes (a note that failed its check, say): never drawn, and saved back as they were.
  let keptEntries = []
  // The indices of the selected notes in `puzzleNotes`, in order.
  let selected = []
  // False while this puzzle's saved notes cannot be read: no save writes over them but an explicit wipe's.
  let savable = true
  const reported = new Set()
  // Each drawn note's element is kept on its item under a symbol, which a spread copies and JSON leaves out, so a moved, recolored or retyped note keeps
  // its element and no save stores it. Its scroll position is kept the same way, for an element put back in the page, which starts unscrolled.
  const NOTE_ELEMENT = Symbol('note element')
  const SCROLL = Symbol('scroll')
  // What each drawn note's element shows now: its item, its text, its look, and what its size was last measured for.
  const shownNotes = new WeakMap()
  // The layer's two groups of notes, made at the first redraw, with the style the board group carries.
  let groups = null
  let layerFont = ''
  let lastLayout = ''

  // The key of the puzzle these notes were loaded for, so a save lands there even when the page's puzzle has changed since. Null before the first load, when there are no notes to save and a save does nothing.
  let loadedKey = null
  const currentPuzzleKey = () => puzzleKey(Framework.app.puzzle.puzzleId, window.location.href)
  const selectedNotes = () => selected.map((i) => puzzleNotes[i])

  // Pointer work waits for the next frame, so a mouse that sends several moves a frame costs one update. Each kind of work keeps only its latest call.
  // Each kind of work belongs to a feature: a note placed again is the notes', and a gesture's work is the tool's.
  const frameWork = new Map()
  let frameRequest = 0
  function runFrame () {
    window.cancelAnimationFrame(frameRequest)
    frameRequest = 0
    const work = [...frameWork.values()]
    frameWork.clear()
    for (const run of work) run()
  }
  function inFrame (kind, run, feature = textTool) {
    frameWork.set(kind, () => feature.run(run))
    if (!frameRequest) frameRequest = window.requestAnimationFrame(runFrame)
  }
  // A release, or anything else that ends a gesture, first does the work its last moves are waiting on.
  function flushFrame () {
    if (frameRequest) runFrame()
  }

  const layoutKey = (map) => JSON.stringify([map.matrix, map.box, window.innerWidth, window.innerHeight])

  // The board moves and scales with the window and SudokuPad's layout, which sets the styles of the board and the boxes round it, so the notes are
  // placed again whenever those change, and the board or the window has moved.
  const watchedBoards = new WeakSet()
  const placeIfMoved = () => { if (layoutKey(boardMap()) !== lastLayout) renderNotes() }
  const placeSoon = () => inFrame('place', placeIfMoved, boardNotes)

  function watchBoard (svg) {
    if (watchedBoards.has(svg)) return
    watchedBoards.add(svg)
    const mutations = new window.MutationObserver(placeSoon)
    for (let box = svg; box && box !== document.body; box = box.parentElement) mutations.observe(box, { attributes: true, attributeFilter: ['style', 'class', 'viewBox', 'width', 'height', 'transform'] })
  }

  const notesOnBoard = (map) => puzzleNotes.map((item) => boardView(item, map.toBoard))

  function noteGroups (layer) {
    if (groups?.board.parentNode !== layer) {
      const [board, screen] = [BOARD_NOTES_CLASS, SCREEN_NOTES_CLASS].map((name) => Object.assign(document.createElement('div'), { className: name }))
      layer.prepend(board, screen)
      groups = { board, screen, css: '' }
    }
    return groups
  }

  // A board change is this one style write: the notes on the board keep their own styles in board units.
  function placeBoardGroup (map) {
    const css = `transform: matrix(${map.matrix.join(', ')}); ${PIXEL_VAR}: ${1 / map.scale}px;`
    if (css === groups.css) return
    groups.board.style.cssText = css
    groups.css = css
  }

  // A note on the board is placed in board units, in the group that carries the board's transform; a fixed one in screen pixels at the board's scale.
  function showNote (element, item, map) {
    const shown = shownNotes.get(element) ?? {}
    if (shown.text !== item.text) element.replaceChildren(...noteContent(item.text))
    const style = item.fixed ? noteStyle(item, drawnPoint(item), map.scale) : noteStyle(item, item.at, 1)
    const look = JSON.stringify(style)
    if (look !== shown.look) {
      applyNoteStyle(element, style)
      element.classList.toggle(TEXT_BACKGROUND_CLASS, Boolean(item.bg))
    }
    shownNotes.set(element, { ...shown, item, text: item.text, look })
  }

  // Puts each group's notes in the order of `puzzleNotes`, moving only the elements out of place. The elements it put back in the page.
  function orderNotes (notes) {
    const kept = new Set(notes.map(({ element }) => element))
    for (const group of [groups.board, groups.screen]) for (const child of [...group.children]) if (!kept.has(child)) child.remove()
    const inserted = []
    for (const group of [groups.board, groups.screen]) {
      let next = group.firstChild
      for (const { element, item } of notes) {
        if ((item.fixed ? groups.screen : groups.board) !== group) continue
        if (element === next) {
          next = next.nextSibling
          continue
        }
        group.insertBefore(element, next)
        inserted.push(element)
      }
    }
    return inserted
  }

  // A note's size depends on these, on the layer's font, and on the board's scale for a fixed note, which is drawn in screen pixels.
  const measuredFor = (item, map) => JSON.stringify([item.text, item.size, item.box, Boolean(item.bg), look.outline, layerFont, item.fixed ? map.scale : null])

  // Measures the notes whose size may have changed, every read before every write: whether its text runs past its box, then, with its scroll bar's
  // room settled, its text's size in board units.
  function measureNotes (notes, map) {
    const stale = notes.filter(({ element, item }) => shownNotes.get(element).measured !== measuredFor(item, map))
    const rooms = stale.map(({ element }) => scrollRoom(element))
    stale.forEach(({ element }, i) => element.classList.toggle(SCROLLS_CLASS, rooms[i] > 1))
    const boxes = stale.map(({ element, item }) => contentBox(element, item.fixed ? 1 : map.scale))
    stale.forEach(({ element, item }, i) => {
      item[DRAWN_SIZE] = [boxes[i].right - boxes[i].left, boxes[i].bottom - boxes[i].top].map((side) => side / map.scale)
      shownNotes.get(element).measured = measuredFor(item, map)
    })
  }

  // The open note's element, its outline, the selection outlines, the handles and the selection rectangle sit in the layer beside the two groups, where a redraw leaves them, so the note
  // keeps the focus. Each note keeps its element, and only what changed is written: a board change is one write to the board group.
  function renderNotes () {
    const layer = notesLayer()
    const svg = boardSvg()
    watchBoard(svg)
    const map = boardMap()
    lastLayout = layoutKey(map)
    const font = noteFontFamily(look.noteFont, window.getComputedStyle(svg).fontFamily)
    if (font !== layerFont) layer.style.fontFamily = layerFont = font
    noteGroups(layer)
    placeBoardGroup(map)
    const claimed = new Set()
    const notes = puzzleNotes.flatMap((item, index) => {
      if (item.kind !== TEXT_KIND || (editing && editing.index === index)) return []
      if (!item[NOTE_ELEMENT] || claimed.has(item[NOTE_ELEMENT])) item[NOTE_ELEMENT] = Object.assign(document.createElement('div'), { className: TEXT_CLASS })
      const element = item[NOTE_ELEMENT]
      claimed.add(element)
      showNote(element, item, map)
      element.classList.toggle(SELECTED_CLASS, selected.includes(index))
      return [{ element, item, index }]
    })
    const inserted = orderNotes(notes)
    measureNotes(notes, map)
    for (const element of inserted) element.scrollTop = shownNotes.get(element).item[SCROLL] ?? 0
    if (!drag?.move && !resizing) showFixedReachable(notes, map)
    if (drag?.move) showMove(drag, map)
    if (editing) showEditing(map)
    else showHandles(drag?.move ? null : selectedBox(map))
    if (!drag?.move) showSelection(map)
    if (hoverPoint) showHover()
  }

  // A fixed note the window or the layout has put out of reach is drawn at the nearest point inside the window, and its stored
  // point is left as it is: a short-lived small window (devtools opened, a window snap) never moves a note for good. Only the solver's own move or resize saves
  // a new point. A note being dragged or resized is left to follow the pointer, and is drawn in reach once it is let go.
  function showFixedReachable (notes, map) {
    const fixed = notes.filter(({ item }) => item.fixed)
    if (fixed.length === 0) return
    for (const { element, item } of fixed) {
      const point = reachOf(item, map)
      if (point[0] === item.fixed[0] && point[1] === item.fixed[1]) delete item[SHOWN_AT]
      else item[SHOWN_AT] = { from: item.fixed, point }
      showNote(element, item, map)
    }
  }

  function reachOf (item, map) {
    const { left, right, top, bottom } = noteScreenBox(item, map, look.outline)
    const win = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
    // The box is where the note is drawn now, which may not be its stored point, so the middle is taken from the stored point by the box's own offset from the drawn one.
    const drawn = drawnPoint(item)
    const toMiddle = noteMiddle(item, map, look.outline).map((v, i) => v - drawn[i])
    const reached = reachablePoint(item.fixed.map((v, i) => v + toMiddle[i]), [right - left, bottom - top], win)
    return roundPoint(reached.map((v, i) => v - toMiddle[i]))
  }

  // Restyles the open note and puts the handles on its corners. The note is shown moved in from the window's edge when its box would cross it: the view of it,
  // `editing.shift`, is a translation of its element, and its item's point is never changed.
  function showEditing (map) {
    const { element, item } = editing
    element.style.translate = ''
    styleNote(element, item, map)
    element.classList.toggle(EMPTY_CLASS, typedText(element) === '')
    markScrolling(element)
    const { left, top, right, bottom } = element.getBoundingClientRect()
    const shift = viewShift({ left, top, right, bottom }, { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight })
    element.style.translate = `${shift[0]}px ${shift[1]}px`
    editing.shift = shift
    editing.box = { left: left + shift[0], top: top + shift[1], right: right + shift[0], bottom: bottom + shift[1] }
    showHandles(editing.box)
    showSelection(map)
    showEdgeCursor(hoverPoint)
  }

  const cornerPoint = (box, corner, opposite = false) => [0, 1].map((i) => (corner[i] < 0) !== opposite ? [box.left, box.top][i] : [box.right, box.bottom][i])

  const selectedBox = (map) => selected.length === 1 ? noteScreenBox(puzzleNotes[selected[0]], map, look.outline) : null

  function placeOver (element, { left, top, right, bottom }, offset = [0, 0]) {
    Object.assign(element.style, { left: `${roundToTenth(left + offset[0])}px`, top: `${roundToTenth(top + offset[1])}px`, width: `${roundToTenth(right - left)}px`, height: `${roundToTenth(bottom - top)}px` })
  }

  function showSelection (map, offset = [0, 0]) {
    const outlines = editing ? [{ box: editing.box, color: itemColor(editing.item.color) }] : selected.map((index) => ({ box: noteScreenBox(puzzleNotes[index], map, look.outline) }))
    const layer = notesLayer()
    const shown = [...layer.querySelectorAll(`.${SELECTION_CLASS}`)]
    for (const element of shown.slice(outlines.length)) element.remove()
    outlines.forEach(({ box, color }, i) => {
      const element = shown[i] ?? layer.appendChild(Object.assign(document.createElement('div'), { className: SELECTION_CLASS }))
      element.classList.toggle(OPEN_OUTLINE_CLASS, Boolean(color))
      element.style.outlineColor = color ?? ''
      placeOver(element, box, offset)
    })
  }

  const cornerCursor = (corner) => corner[0] * corner[1] > 0 ? 'nwse-resize' : 'nesw-resize'

  // Every element on the page shows `cursor` until this is called with null, so a drag keeps its cursor when the pointer runs ahead of what it drags.
  function holdCursor (cursor) {
    const root = document.documentElement
    root.classList.toggle(HELD_CURSOR_CLASS, cursor !== null)
    if (cursor === null) root.style.removeProperty(HELD_CURSOR_VAR)
    else root.style.setProperty(HELD_CURSOR_VAR, cursor)
  }

  function showHandles (box) {
    if (!box) {
      for (const { element } of handles) element.remove()
      handles = []
      return
    }
    if (handles.length === 0) {
      handles = Object.values(CORNERS).map((corner) => {
        const element = document.createElement('div')
        element.className = `${HANDLE_CLASS} ${ENTERING_CLASS}`
        element.style.cursor = cornerCursor(corner)
        element.addEventListener('mousedown', under(textTool, (event) => startResize(event, corner)))
        element.addEventListener('dblclick', under(textTool, resetSize))
        element.addEventListener('touchstart', (event) => event.stopPropagation())
        notesLayer().append(element)
        return { element, corner }
      })
      // A layout read settles the handles at opacity 0, and dropping the class then is what fades them in.
      window.getComputedStyle(handles[0].element).getPropertyValue('opacity')
      for (const { element } of handles) element.classList.remove(ENTERING_CLASS)
    }
    for (const { element, corner } of handles) {
      const [x, y] = cornerPoint(box, corner)
      element.style.left = `${roundToTenth(x - HANDLE_PX / 2)}px`
      element.style.top = `${roundToTenth(y - HANDLE_PX / 2)}px`
    }
  }

  // A note's text box, inside its padding, on the screen. `unit` is screen pixels per pixel of the note's own box: the board's scale for a note on the board.
  function contentBox (element, unit = 1) {
    const { left, top, right, bottom } = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)
    const pad = (side) => parseFloat(style[`padding${side}`]) * unit
    return { left: left + pad('Left'), top: top + pad('Top'), right: right - pad('Right'), bottom: bottom - pad('Bottom') }
  }

  const resizedIndex = () => editing ? editing.index : selected.length === 1 ? selected[0] : null

  // A press on a handle, with any button, keeps the note's focus and never reaches SudokuPad; only the left button resizes.
  function startResize (event, corner) {
    event.preventDefault()
    event.stopPropagation()
    const index = resizedIndex()
    if (event.button !== PRIMARY_BUTTON || index === null) return
    const item = editing ? editing.item : puzzleNotes[index]
    const element = editing ? editing.element : item[NOTE_ELEMENT]
    const unit = editing || item.fixed ? 1 : boardMap().scale
    const box = contentBox(element, unit)
    const [x, y] = eventPoint(event)
    const shift = editing?.shift ?? [0, 0]
    const grabbed = cornerPoint(box, corner)
    const anchor = cornerPoint(box, corner, true).map((v, i) => v - shift[i])
    const autoSize = unresizedSize(element, unit)
    resizing = { index, item, corner, anchor, offset: [grabbed[0] - x, grabbed[1] - y], autoSize, to: null }
    holdCursor(cornerCursor(corner))
  }

  // The size in board units the note has with no box, measured live because a typed or resized note's stored size is stale. Clearing the box styles for one synchronous
  // read paints nothing between, but resets the scroll, so it is put back.
  function unresizedSize (element, unit) {
    const { style } = element
    const kept = ['width', 'height', 'maxWidth', 'maxHeight'].map((name) => [name, style[name]])
    const { scrollTop } = element
    kept.forEach(([name]) => { style[name] = '' })
    const box = contentBox(element, unit)
    kept.forEach(([name, value]) => { style[name] = value })
    element.scrollTop = scrollTop
    return [box.right - box.left, box.bottom - box.top].map((side) => side / boardMap().scale)
  }

  // A release the page never saw leaves the button up on the next move, which ends the resize.
  function resizeMove (event) {
    if (!resizing) return
    event.stopImmediatePropagation()
    if (!(event.buttons & PRIMARY_HELD) || resizedIndex() === null) {
      endResize(event)
      return
    }
    if (resizing.cancelled) return
    resizing.to = eventPoint(event)
    inFrame('resize', showResize)
  }

  function showResize () {
    if (!resizing?.to || resizing.cancelled) return
    const { index, item, corner, anchor, offset, autoSize, to } = resizing
    const map = boardMap()
    // The anchor is where the note's box lies without the view shift of an open note, so the pointer is taken out of that shift too.
    const shift = editing?.shift ?? [0, 0]
    const resized = resizedItem(item, anchor, [to[0] + offset[0] - shift[0], to[1] + offset[1] - shift[1]], map, corner, autoSize)
    if (editing) {
      editing.item = resized
      showEditing(map)
    } else {
      puzzleNotes[index] = resized
      renderNotes()
    }
  }

  function endResize (event) {
    if (!resizing) return
    event.stopImmediatePropagation()
    flushFrame()
    const { index, item, cancelled } = resizing
    resizing = null
    holdCursor(null)
    if (cancelled || editing || String(puzzleNotes[index]?.box) === String(item.box)) return
    keepDrawnPoints([index], boardMap())
    renderNotes()
    snapToPixels([index])
    saveNotes()
  }

  function resetSize () {
    const index = resizedIndex()
    if (index === null) return
    if (editing) {
      editing.item = autoSized(editing.item)
      showEditing(boardMap())
    } else if (puzzleNotes[index].box) {
      puzzleNotes[index] = autoSized(puzzleNotes[index])
      renderNotes()
      snapToPixels([index])
      saveNotes()
    }
  }

  const scrollRoom = (note) => note.scrollHeight - note.clientHeight
  // A pixel of rounding is not text past the box.
  function markScrolling (note) {
    note.classList.toggle(SCROLLS_CLASS, scrollRoom(note) > 1)
  }

  // Whether the notes are hidden by the eye. Not saved, so a reload shows them, and not an undo step.
  let notesHidden = false

  function showHideAllLook () {
    const button = document.querySelector(`.${HIDE_ALL_CLASS}`)
    if (!button) return
    const label = notesHidden ? SHOW_LABEL : HIDE_LABEL
    button.title = label
    button.setAttribute('aria-label', label)
    button.setAttribute('aria-pressed', String(notesHidden))
    button.innerHTML = controlIcon(notesHidden ? EYE_SHUT_ICON : EYE_OPEN_ICON)
  }

  // Hiding closes the open note and ends the selection, so nothing is left to act on unseen. A hidden note can be neither hit nor snapped to: no gesture can reach one.
  function setNotesHidden (hide) {
    if (hide === notesHidden) return
    if (hide && editing) finishText()
    notesHidden = hide
    notesLayer().classList.toggle(HIDDEN_CLASS, hide)
    if (hide) select([])
    else redraw()
    showHideAllLook()
  }

  // The note an event's target is in, or null; only while Text Anywhere is current is a note ever the target.
  const noteOf = (event) => event.target instanceof window.Element ? event.target.closest(`#${LAYER_ID} .${TEXT_CLASS}`) : null

  // The note the wheel is over. Under another tool the notes take no pointer, so the topmost drawn note whose box holds the point answers, unless a
  // dialog or the menu drawer, which sit above the notes, is the wheel's target.
  function wheelNote (event) {
    if (notesLayer().classList.contains(ACTIVE_CLASS)) return noteOf(event)
    if (!(event.target instanceof window.Element) || event.target.closest(ABOVE_NOTES)) return null
    return noteAt(eventPoint(event), 0)
  }

  // The topmost drawn note whose screen box, grown by `margin` px, holds `point`, as its element, or null. The notes on the board are under the fixed ones.
  function noteAt (point, margin) {
    if (notesHidden) return null
    const map = boardMap()
    const drawn = puzzleNotes.filter((item) => item.kind === TEXT_KIND && item[NOTE_ELEMENT]?.isConnected)
    const onTop = [...drawn.filter((item) => !item.fixed), ...drawn.filter((item) => item.fixed)]
    return onTop[noteAtPoint(onTop.map((item) => noteScreenBox(item, map, look.outline)), point, margin)]?.[NOTE_ELEMENT] ?? null
  }

  const pressedNote = (event) => noteOf(event) ?? noteAt(eventPoint(event), HIT_MARGIN_PX)

  // A note within the hit margin of the pointer but not under it shows its hover look from a class, since :hover needs the pointer on the element.
  let hoverPoint = null
  function showHover () {
    const layer = notesLayer()
    const near = hoverPoint && layer.classList.contains(ACTIVE_CLASS) && !drag && !erasing && !resizing ? noteAt(hoverPoint, HIT_MARGIN_PX) : null
    for (const element of layer.querySelectorAll(`.${HOVERED_CLASS}`)) if (element !== near) element.classList.remove(HOVERED_CLASS)
    near?.classList.add(HOVERED_CLASS)
  }

  const WHEEL_UNITS = { [window.WheelEvent.DOM_DELTA_LINE]: (note) => parseFloat(window.getComputedStyle(note).fontSize) * LINE_HEIGHT, [window.WheelEvent.DOM_DELTA_PAGE]: (note) => note.clientHeight }

  // The wheel over a note with text past its box scrolls it, under any tool, and never reaches SudokuPad, until the note can scroll no further that
  // way; Ctrl+wheel stays the browser's zoom.
  function scrollNote (event) {
    if (event.ctrlKey || event.deltaY === 0) return
    const note = wheelNote(event)
    if (!note || !note.classList.contains(SCROLLS_CLASS)) return
    const room = event.deltaY < 0 ? note.scrollTop : scrollRoom(note) - note.scrollTop
    if (room < 1) return
    event.preventDefault()
    event.stopImmediatePropagation()
    note.scrollTop += event.deltaY * (WHEEL_UNITS[event.deltaMode]?.(note) ?? 1)
    const item = shownNotes.get(note)?.item
    if (item) item[SCROLL] = note.scrollTop
  }

  function redraw () {
    renderNotes()
    showPanelValues()
  }

  function select (indices) {
    selected = [...new Set(indices)].sort((a, b) => a - b)
    if (selected.length === 0) stopHold()
    redraw()
  }

  // The solver loses work they think is kept, so each failure is shown once a page in SudokuPad's own dialog. Its
  // showDialog does nothing while another dialog is open, so the failure is shown at the next save instead.
  function report (message, id = message) {
    console.warn(`text-anywhere: ${message}`)
    if (reported.has(id) || document.querySelector('.dialog-overlay')) return
    reported.add(id)
    textTool.run(() => Framework.showDialog({
      parts: [{ tag: 'text', content: message }, { tag: 'options', options: [{ tag: 'button', content: OK_LABEL }] }],
      centerOverBoard: true
    }))
  }

  function forgetParsedTexts () {
    const texts = new Set(puzzleNotes.map((item) => item.text))
    for (const text of parsedTexts.keys()) if (!texts.has(text)) parsedTexts.delete(text)
  }

  // Once a puzzle, so a second puzzle with an unreadable note is told too.
  function reportKept () {
    if (keptEntries.length > 0) report(`${keptEntries.length} of this puzzle's saved notes could not be read, so Text Anywhere does not show them and keeps them as they are.`, `kept ${loadedKey}`)
  }

  const UNSAVABLE_MESSAGE = 'This puzzle\'s saved notes cannot be read, so Text Anywhere leaves them as they are and does not save notes on this puzzle. Clear all or Restart replaces them.'

  function writeNotes (items = puzzleNotes) {
    forgetParsedTexts()
    if (loadedKey === null) return
    reportKept()
    if (!savable) {
      report(UNSAVABLE_MESSAGE, `unsavable ${loadedKey}`)
      return
    }
    // A write the browser refuses (a full localStorage) is reported, and is not a SudokuPad change that turns the saved data off.
    if (!storage.off) {
      try {
        saveNotesTo(Framework, loadedKey, items, keptEntries)
      } catch (err) {
        report(`Text Anywhere could not save this puzzle's notes: ${err.message}`)
      }
    }
  }

  // Saves an edit to the notes. Any edit after a Restart ends what Undo can bring back.
  function saveNotes () {
    forgetRestarted()
    writeNotes()
  }

  const forgetRestarted = () => { if (loadedKey !== null && !storage.off) Framework.removeData(restartedKey(loadedKey)) }

  function changeSelected (change) {
    for (const i of selected) puzzleNotes[i] = change(puzzleNotes[i])
    saveNotes()
    redraw()
  }

  function keepItems (keep) {
    const kept = []
    const stillSelected = []
    const marks = puzzleNotes.map((item, i) => keep(item, i))
    puzzleNotes.forEach((item, i) => {
      if (!marks[i]) return
      if (selected.includes(i)) stillSelected.push(kept.length)
      kept.push(item)
    })
    const removed = kept.length !== puzzleNotes.length
    puzzleNotes = kept
    selected = stillSelected
    if (removed) followKept(marks)
    return removed
  }

  // The open note, a resize and a move in progress follow their notes to the places the others' removal left them. An open note that went is unsaved (-1, so closing
  // it adds it back with what was typed), and so is its resize. A selected note's resize whose note went is cancelled, so its release saves nothing; a move leaves the
  // notes that went, and a move left with none is cancelled.
  function followKept (marks) {
    if (editing) editing.index = indexAfterKeep(editing.index, marks)
    if (resizing) {
      const index = indexAfterKeep(resizing.index, marks)
      if (!editing && index === -1) resizing.cancelled = true
      resizing.index = index
    }
    if (!drag?.move) return
    const move = drag.move.map((entry) => ({ ...entry, index: indexAfterKeep(entry.index, marks) })).filter(({ index }) => index !== -1)
    if (move.length === 0) cancelDrag()
    else drag.move = move
  }

  function deleteSelected () {
    const gone = selected
    keepItems((_, i) => !gone.includes(i))
    saveNotes()
    redraw()
  }

  // A new note starts at screen point `point`: its first line's middle is on the point, so its stored point is a half line up. Whether it is pinned to the board or fixed on the
  // screen is decided by the point clicked.
  function newNote (point, map) {
    const size = textSizeFor(look.width)
    const placed = placedItem(textItem(map.toBoard(point), '', color, size, background, look.opacity), point, map)
    const halfLine = LINE_HEIGHT * size / 2
    return placed.fixed
      ? { ...placed, fixed: roundPoint([placed.fixed[0], placed.fixed[1] - halfLine * map.scale]) }
      : { ...placed, at: roundPoint([placed.at[0], placed.at[1] - halfLine]) }
  }

  // The text node and offset under screen point `[x, y]`: Chromium names the first call, older browsers only the second.
  function caretAt ([x, y]) {
    const position = document.caretPositionFromPoint?.(x, y)
    if (position) return { node: position.offsetNode, offset: position.offset }
    const range = document.caretRangeFromPoint?.(x, y)
    return range ? { node: range.startContainer, offset: range.startOffset } : null
  }

  function shownCaretIndex (element, point) {
    const caret = caretAt(point)
    if (!caret || !(element === caret.node || element.contains(caret.node))) return null
    const range = document.createRange()
    range.setStart(element, 0)
    range.setEnd(caret.node, caret.offset)
    return range.toString().length
  }

  // The offset in `raw` of the character that `shown` has at `index`: the shown text is the raw text with its markers left out and a bullet put in, so
  // each shown character is matched to the next like one in the raw text, and a shown character with no like one after the last match has none. An index past the end is the end.
  function rawOffset (raw, shown, index) {
    let cursor = 0
    for (let i = 0; i < Math.min(index, shown.length); i++) {
      const found = raw.indexOf(shown[i], cursor)
      if (found !== -1) cursor = found + 1
    }
    if (index >= shown.length) return raw.length
    const next = raw.indexOf(shown[index], cursor)
    return next === -1 ? cursor : next
  }

  // The note is typed in place: `index` names the text to reopen, with the caret at screen point `point` (the end of its text with none), or -1 for a new one starting at `point`. Opening a note ends the selection.
  function openText (index, point) {
    setNotesHidden(false)
    selected = []
    const map = boardMap()
    const item = index === -1 ? newNote(point, map) : { ...puzzleNotes[index] }
    // The note the solver double-clicked shows its text without markers, and the open one shows them, so the caret is worked out against the closed one before it goes.
    const closed = index === -1 ? null : item[NOTE_ELEMENT]
    const shownIndex = closed && point ? shownCaretIndex(closed, point) : null
    const shownText = closed?.textContent
    const element = newTextBox(item, map)
    element.contentEditable = 'plaintext-only'
    element.spellcheck = false
    // As SudokuPad's own buttons do: a press in the note is the note's, and never reaches a tool.
    for (const type of ['mousedown', 'touchstart']) element.addEventListener(type, (event) => event.stopPropagation())
    element.addEventListener('blur', under(textTool, (event) => {
      if (!editing || editing.element !== element) return
      if (isPanelControl(event.relatedTarget)) editing.caret = window.getSelection().rangeCount ? window.getSelection().getRangeAt(0).cloneRange() : null
      else finishText()
    }))
    // Typing grows the box, which carries the handles and may start the text scrolling.
    element.addEventListener('input', under(textTool, (event) => {
      if (!editing || editing.element !== element) return
      // Only a typed character completes a symbol: deleting, pasting and Undo leave the text as it is.
      if (event.inputType === 'insertText') {
        replaceTypedSymbol()
        splitTypingUndo()
      }
      showEditing(boardMap())
      clearTimeout(openNoteSaveTimer)
      openNoteSaveTimer = setTimeout(under(textTool, saveOpenNote), OPEN_NOTE_SAVE_MS)
    }))
    editing = { index, item, element }
    notesLayer().append(element)
    redraw()
    element.focus()
    window.getSelection().selectAllChildren(element)
    window.getSelection().collapseToEnd()
    if (shownIndex !== null && element.firstChild) window.getSelection().collapse(element.firstChild, rawOffset(item.text, shownText, shownIndex))
  }

  // A symbol the last typed character completed is typed over with its sign, as an insertion, so the caret stays after it and the browser's Undo can give the typed characters back.
  function replaceTypedSymbol () {
    const selection = window.getSelection()
    const { anchorNode, anchorOffset } = selection
    if (!selection.isCollapsed || anchorNode?.nodeType !== window.Node.TEXT_NODE || !editing.element.contains(anchorNode)) return
    // A line break is a text node of its own, so the whole note is read, for whether the caret is in code, and the pair is then found in the caret's node.
    const toCaret = document.createRange()
    toCaret.setStart(editing.element, 0)
    toCaret.setEnd(anchorNode, anchorOffset)
    const nodeStart = toCaret.toString().length - anchorOffset
    const found = symbolJustTyped(editing.element.textContent, nodeStart + anchorOffset)
    if (!found || found.start < nodeStart) return
    const range = document.createRange()
    range.setStart(anchorNode, found.start - nodeStart)
    range.setEnd(anchorNode, found.end - nodeStart)
    selection.removeAllRanges()
    selection.addRange(range)
    document.execCommand('insertText', false, found.symbol)
    // `sum` ends before the character typed after it, which the insertion carried the caret behind.
    if (found.end - nodeStart !== anchorOffset) selection.modify('move', 'forward', 'character')
  }

  // Chromium undoes a run of typed characters as one step; putting the caret back where it is ends the run, so Ctrl+Z takes one character at a time.
  function splitTypingUndo () {
    const selection = window.getSelection()
    if (!selection.rangeCount) return
    const range = selection.getRangeAt(0)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  // The focus went to a panel button (`caret` was saved then, null with no caret); the note takes it back, once.
  function returnFocusToNote () {
    if (!editing || !('caret' in editing)) return
    const { element, caret } = editing
    delete editing.caret
    element.focus()
    if (!caret) return
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(caret)
  }

  // The controls that work on the open note: a press on one leaves the note open.
  const isPanelControl = (target) => Boolean(target?.closest?.(`${PANEL} button.digit[data-key], ${PANEL} .${SLIDERS_CLASS}, ${PANEL} .${BACKGROUND_CLASS}`))

  const typedText = (element) => element.textContent.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '')

  // The open note is saved with the rest of the notes, as typed so far, once typing pauses and when the page is hidden or unloaded, so a reload or a crashed tab
  // keeps it. The notes in memory are not changed: finishing the note decides them.
  const OPEN_NOTE_SAVE_MS = 500
  let openNoteSaveTimer

  // What the open note's text becomes when it closes. A last word `sum` becomes a sigma before the trailing spaces go, so a sigma the typist undid stays the word.
  function closingText ({ index, element }) {
    const typed = typedText(element)
    return typed === (index === -1 ? '' : puzzleNotes[index].text) ? typed : closedText(closedSymbols(typed))
  }

  // An empty note is saved as no note, which is what closing it does; one never saved leaves the saved notes as they are.
  function saveOpenNote () {
    clearTimeout(openNoteSaveTimer)
    if (!editing) return
    const text = closingText(editing)
    if (text === '' && !editing.saved) return
    const { index, item } = editing
    editing.saved = true
    if (text === '') writeNotes(puzzleNotes.filter((_, i) => i !== index))
    else writeNotes(index === -1 ? [...puzzleNotes, { ...item, text }] : puzzleNotes.map((note, i) => i === index ? { ...item, text } : note))
  }

  function closeEditing () {
    clearTimeout(openNoteSaveTimer)
    const open = editing
    editing = null
    resizing = null
    holdCursor(null)
    open.element.remove()
    showHandles(null)
    return open
  }

  // Closes the open note. The index of the note it leaves, or -1 when there is none (it was empty).
  function finishText () {
    const open = closeEditing()
    const { index, item, saved } = open
    const text = closingText(open)
    const resized = index !== -1 && String(item.box) !== String(puzzleNotes[index].box)
    let left = index
    const changed = noteChanged(item, text, index === -1 ? null : puzzleNotes[index])
    if (changed) {
      if (text === '') {
        puzzleNotes.splice(index, 1)
        left = -1
      } else if (index === -1) left = puzzleNotes.push({ ...item, text }) - 1
      else puzzleNotes[index] = { ...item, text }
    }
    renderNotes()
    if (changed && resized && text !== '') snapToPixels([index])
    // A save made while typing is written over, even when the note ended as it began; that is no edit, so it leaves what Undo can bring back after a Restart.
    if (changed) saveNotes()
    else if (saved) writeNotes()
    showPanelValues()
    return left
  }

  // SudokuPad's key listeners are on the document and the window, and its App's in the document's capture phase, so
  // a key typed in the box is stopped in the window's capture phase, before them all. Its default is left alone, so
  // the note types, edits, pastes and composes as any editable text does, and F5 does what it does anywhere.
  function keepBoxKeys (event) {
    // The Enter that closed a note is released after the box is gone, and SudokuPad would end the selection on it. A key
    // pressed since means that release never came (a Mac sends no keyup for a key released under Cmd).
    if (event.type === 'keydown') endedByEnter = false
    if (event.type === 'keyup' && event.key === 'Enter' && endedByEnter) {
      endedByEnter = false
      event.stopImmediatePropagation()
      return
    }
    if (!editing || event.target !== editing.element) return
    event.stopImmediatePropagation()
    if (event.type !== 'keydown' || event.isComposing) return
    if (event.key === 'Tab') event.preventDefault()
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
      event.preventDefault()
      if (resizing && !resizing.cancelled) return cancelResize()
      endedByEnter = event.key === 'Enter'
      const left = finishText()
      if (left !== -1) select([left])
    }
  }

  function switchOnT (event) {
    const state = {
      tool: Framework.app.tool,
      letterMode: document.querySelector('.controls-main')?.classList.contains(LETTER_MODE_CLASS) === true,
      dialogOpen: document.querySelector('.dialog') !== null,
      inField: typedIntoField(event)
    }
    if (!wantsTextTool(event, state)) return
    event.preventDefault()
    Framework.app.changeTool(TOOL_NAME)
  }

  // SudokuPad's cell copy (feature-cellpaste.js) runs on Ctrl+C or Cmd+C and throws for a tool with no entry in its SmartSelectToolOrder, which Text Anywhere lacks.
  // It reads the tool the key was pressed under (prevTool while Ctrl has switched to Centre), so Ctrl still switches and only the copy is stopped. The key's default is left
  // alone, so a copy in an open note is still the browser's.
  function stopCellCopy (event) {
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyC' && (Framework.app.prevTool || Framework.app.tool) === TOOL_NAME) event.stopImmediatePropagation()
  }

  // SudokuPad's buttons and dialogs stop their mousedown, so a press outside the box finishes it from the window's
  // capture phase, before any of them. A press on a control that works on the open note (isPanelControl) leaves it open.
  function finishTextOnPress (event) {
    if (!editing || editing.element.contains(event.target) || isHandle(event.target) || isPanelControl(event.target)) return
    // A left press on another note goes on to select it, and to drag it. So does one on the open note's edge, on the note as it closes: its closed box is not the open one's
    // (trailing blank lines go, and the open one may be shifted clear of the window's edge), so it is not looked for again by position.
    const left = event.button === PRIMARY_BUTTON
    const onEdge = left && onOpenEdge(eventPoint(event))
    const onOther = left && !onEdge && pressedNote(event)
    const closed = finishText()
    edgeNote = onEdge && closed !== -1 ? puzzleNotes[closed][NOTE_ELEMENT] : null
    pressFinishedText = !(onOther || edgeNote)
  }

  const isHandle = (target) => handles.some(({ element }) => element === target)

  // The note whose edge the press that closed it was on; the press goes on to select it and to drag it.
  let edgeNote = null

  // The band round the open note, outside its box and within HIT_MARGIN_PX of it: a press there moves the note, as one inside selects its text.
  const onOpenEdge = (point) => Boolean(editing) && inBox(point, grownBox(editing.box, HIT_MARGIN_PX)) && !inBox(point, editing.box)

  // The move cursor over the open note's edge, which lies outside its element and so cannot carry a cursor of its own.
  let edgeCursor = false
  function showEdgeCursor (point) {
    const over = Boolean(point) && !drag && !resizing && onOpenEdge(point)
    if (over !== edgeCursor) holdCursor(over ? 'move' : null)
    edgeCursor = over
  }

  // A press on a panel button keeps the focus in the open note, so its caret stays. A slider takes the focus, and the note gets it back when the
  // pointer is released, even when the slider did not move.
  function keepNoteFocus (event) {
    if (editing && isPanelControl(event.target) && !event.target.closest(`.${SLIDERS_CLASS} input`)) event.preventDefault()
  }

  function tickCheck (note, box) {
    const index = puzzleNotes.findIndex((item) => item[NOTE_ELEMENT] === note)
    if (index === -1) return
    puzzleNotes[index] = { ...puzzleNotes[index], text: toggledCheck(puzzleNotes[index].text, Number(box.dataset.line)) }
    saveNotes()
    redraw()
  }

  // Keeps the pointer's samples of the last SPEED_WINDOW_MS and draws a move again once the pointer has stood still that long, so a note held near a line then snaps.
  function recordSample (d, point) {
    const now = window.performance.now()
    d.samples = [...d.samples.filter(([, , time]) => time >= now - SPEED_WINDOW_MS), [...point, now]]
    clearTimeout(d.settle)
    if (d.move) d.settle = setTimeout(() => { if (drag === d) inFrame('drag', dragMoves) }, SPEED_WINDOW_MS + SETTLE_SLACK_MS)
  }

  // What every end of a drag takes down: its settle timer, then `between` (the cursor, for the ends that release it), then its selection rectangle.
  function clearDrag (d, between = () => {}) {
    clearTimeout(d.settle)
    between()
    d.rectangle?.remove()
  }

  function endDrag (click = () => {}) {
    const ended = drag
    drag = null
    clearDrag(ended, () => holdCursor(null))
    if (ended.cancelled) return
    if (isClick(ended.points)) click(ended)
    else if (ended.move) endMove(ended)
    else if (ended.start === -1) selectInRectangle(ended, click)
  }

  // Cancelling a drag puts the notes back where they were at the press. The press stays the tool's until its release, which then does nothing.
  function cancelDrag () {
    const d = drag
    if (d.move) clearMove(d)
    clearDrag(d)
    Object.assign(d, { move: null, rectangle: null, pending: [], cancelled: true })
    redraw()
  }

  function cancelResize () {
    const { index, item } = resizing
    resizing.cancelled = true
    if (editing) {
      editing.item = item
      showEditing(boardMap())
    } else {
      puzzleNotes[index] = item
      renderNotes()
    }
  }

  // A press that never moved opens no text box. A lost pointer (a blur, a tool switch, a move with the button up) cancels an erase, so nothing goes that the release never confirmed.
  function endGesture () {
    stopHold()
    flushFrame()
    erasing = null
    if (drag) endDrag()
    saveNudge()
  }

  // The second press of a double-click has a click count (`detail`) of 2.
  function clickNote ({ start, points, shift, detail }) {
    if (start === -1) {
      if (selected.length) select([])
      else openText(-1, points[0])
    } else if (detail >= 2) openText(start, points[0])
    else if (shift) select(selected.includes(start) ? selected.filter((i) => i !== start) : [...selected, start])
    else select([start])
  }

  function rectangleBox ({ points }) {
    const [[ax, ay], [bx, by]] = [points[0], points[points.length - 1]]
    return { left: Math.min(ax, bx), top: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) }
  }

  function showRectangle (d) {
    if (!d.rectangle) {
      d.rectangle = document.createElement('div')
      d.rectangle.className = RECTANGLE_CLASS
      notesLayer().appendChild(d.rectangle)
    }
    const box = rectangleBox(d)
    placeOver(d.rectangle, { left: box.left, top: box.top, right: box.left + box.width, bottom: box.top + box.height })
  }

  function selectInRectangle (d, click) {
    const map = boardMap()
    const touched = notesHidden ? [] : notesTouched(notesOnBoard(map), map.toBoard(d.points[0]), map.toBoard(d.points[d.points.length - 1]))
    if (touched.length === 0 && isSmallRectangle(d.points)) return click(d)
    select(d.shift ? [...selected, ...touched] : touched)
  }

  const dragDelta = (d, [px, py] = d.points[d.points.length - 1]) => [px - d.points[0][0], py - d.points[0][1]]
  const dragOffset = (d, point) => axisLocked(dragDelta(d, point), holdShift)

  // While a move is in progress each moving note's element follows the pointer by a translation, in the units of its own group, and nothing is drawn again.
  function showMove (d, map) {
    const { offset: [dx, dy], guides } = snappedOffset(d, map)
    // The release drops the note where this showed it, so it never jumps.
    d.shown = [dx, dy]
    showHandles(null)
    showSelection(map, [dx, dy])
    showGuides(guides)
    for (const { item } of d.move) {
      const element = item[NOTE_ELEMENT]
      if (!element) continue
      const [x, y] = screenPoint(item, map.toScreen)
      const [tx, ty] = item.fixed ? [dx, dy] : map.toBoard([x + dx, y + dy]).map((v, i) => v - item.at[i])
      element.style.translate = `${tx}px ${ty}px`
      element.style.opacity = String(noteOpacity(item) * MOVING_OPACITY)
    }
  }

  function snappedOffset (d, map) {
    const raw = dragOffset(d)
    const item = puzzleNotes[d.start]
    if (!item) return { offset: raw, guides: [] }
    const reach = SELECTION_OFFSET_PX + SELECTION_OUTLINE_PX / 2
    const lines = (axis) => gridLines(Framework.app.grid[axis === 0 ? 'cols' : 'rows'], (k) => map.toScreen(axis === 0 ? [k * CELL_UNITS, 0] : [0, k * CELL_UNITS])[axis])
    const box = noteScreenBox(item, map, look.outline)
    const others = puzzleNotes.filter((other, i) => other.kind === TEXT_KIND && !d.move.some(({ index }) => index === i)).map((other) => noteScreenBox(other, map, look.outline))
    const snaps = [['left', 'right'], ['top', 'bottom']].map(([near, far], axis) => snapAxis(box[near] + raw[axis], box[far] + raw[axis], {
      lines: lines(axis), reach, others: others.map((other) => ({ lo: other[near], hi: other[far] }))
    }))
    // A fast drag passes the lines freely: only a note being placed is pulled. With Shift held the locked axis stays as it is, and only the free one is pulled.
    if (!isPlacing(d.samples, window.performance.now())) return { offset: raw, guides: [] }
    const locked = holdShift ? lockedAxis(dragDelta(d)) : -1
    if (locked !== -1) snaps[locked] = null
    const offset = raw.map((v, axis) => v + (snaps[axis]?.shift ?? 0))
    // The pull may carry a note past what the pointer left reachable, so then the note stays where the pointer put it.
    if (!movedBy(d.move, offset, map).every(({ middle }) => reachable(middle))) return { offset: raw, guides: [] }
    // The pressed note then lands on whole device pixels, as it will once let go, and a guide moves with it so the outline lies on its guide.
    const ratio = window.devicePixelRatio
    // Read at the first move, before any translation moves the note, and not at the press, which a click never needs.
    d.origin ??= (({ left, top }) => [left, top])(item[NOTE_ELEMENT].getBoundingClientRect())
    const crisp = d.origin.map((side, axis) => Math.round((side + offset[axis]) * ratio) / ratio - side - offset[axis])
    return { offset: offset.map((v, axis) => v + crisp[axis]), guides: snaps.map((snap, axis) => snap ? snap.guide + crisp[axis] : null) }
  }

  function showGuides (guides) {
    const layer = notesLayer()
    ;['x', 'y'].forEach((axis, i) => {
      let line = layer.querySelector(`.${GUIDE_CLASS}[data-axis="${axis}"]`)
      if (guides?.[i] == null) return line?.remove()
      line ??= layer.appendChild(Object.assign(document.createElement('div'), { className: GUIDE_CLASS }))
      line.dataset.axis = axis
      const at = `${roundToTenth(guides[i] - GUIDE_PX / 2)}px`
      const thick = `${GUIDE_PX}px`
      Object.assign(line.style, axis === 'x' ? { left: at, top: '0', width: thick, height: '100%' } : { top: at, left: '0', height: thick, width: '100%' })
    })
  }

  function clearMove (d) {
    showGuides(null)
    for (const { item } of d.move) if (item[NOTE_ELEMENT]) Object.assign(item[NOTE_ELEMENT].style, { translate: '', opacity: String(noteOpacity(item)) })
  }

  function dragMoves () {
    if (!drag || drag.cancelled) return
    const d = drag
    const map = boardMap()
    for (const point of d.pending.splice(0)) if (!d.move || moveKeepsReachable(d, point, map)) d.points.push(point)
    if (isClick(d.points)) return
    if (d.move) {
      holdCursor('move')
      showMove(d, map)
    } else if (d.start === -1) showRectangle(d)
  }

  // `middle` is where the note's middle then is, which is what has to stay reachable.
  const movedBy = (moves, [dx, dy], map) => moves.map(({ index, item }) => {
    const [x, y] = screenPoint(item, map.toScreen)
    const [middleX, middleY] = noteMiddle(item, map, look.outline)
    return { index, item, point: [x + dx, y + dy], middle: [middleX + dx, middleY + dy] }
  })

  // Each note keeps its offset from the pointer, and its own drop point decides whether it is pinned to the grid or fixed on the screen.
  function place (moved, map) {
    for (const { index, item, point } of moved) puzzleNotes[index] = placedItem(item, point, map)
  }

  // Moves each note of `indices` by the part of a device pixel that puts its drawn left and top on whole device pixels, so its text is never rendered soft between pixels,
  // and draws them again when any moved. Run after the notes are drawn where they were put, since it reads their elements.
  function snapToPixels (indices) {
    const ratio = window.devicePixelRatio
    const map = boardMap()
    const shifts = indices.flatMap((index) => {
      const element = puzzleNotes[index][NOTE_ELEMENT]
      if (!element?.isConnected) return []
      const { left, top } = element.getBoundingClientRect()
      return [{ index, shift: [left, top].map((side) => Math.round(side * ratio) / ratio - side) }]
    })
    const moving = shifts.filter(({ shift }) => shift.some((side) => Math.abs(side) > PIXEL_SNAP_EPSILON_PX))
    if (moving.length === 0) return
    for (const { index, shift } of moving) {
      const [x, y] = screenPoint(puzzleNotes[index], map.toScreen)
      puzzleNotes[index] = placedItem(puzzleNotes[index], [x + shift[0], y + shift[1]], map)
    }
    renderNotes()
  }

  // A note stays where a press can still reach it: its middle inside the window.
  const reachable = (point) => inBox(point, { left: 0, top: 0, right: window.innerWidth - 1, bottom: window.innerHeight - 1 })

  const moveKeepsReachable = (d, point, map) => movedBy(d.move, dragOffset(d, point), map).every(({ middle }) => reachable(middle))

  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  // Whether a nudge has moved notes that are not saved yet; the release of the key saves it.
  let nudged = false

  function nudgeSelected (direction, step) {
    const map = boardMap()
    const moved = movedBy(selected.map((index) => ({ index, item: puzzleNotes[index] })), direction.map((v) => v * step), map)
    if (!moved.every(({ middle }) => reachable(middle))) return
    place(moved, map)
    keepDrawnPoints(selected, map)
    nudged = true
    hideChrome()
    redraw()
    // Below one device pixel a nudge is finer than the grid, and rounding to it would take a tap back to where it began.
    if (NUDGE_PX * window.devicePixelRatio >= 1) snapToPixels(selected)
  }

  // The outline and the handles are hidden while arrow keys nudge, so the notes are easier to line up by eye, and come back CHROME_BACK_MS after the last nudge or on a pointer move.
  const CHROME_BACK_MS = 300
  let chromeTimer = null
  function hideChrome () {
    notesLayer().classList.add(NUDGING_CLASS)
    clearTimeout(chromeTimer)
    chromeTimer = setTimeout(showChrome, CHROME_BACK_MS)
  }

  function showChrome () {
    if (chromeTimer === null) return
    clearTimeout(chromeTimer)
    chromeTimer = null
    notesLayer().classList.remove(NUDGING_CLASS)
  }

  function saveNudge () {
    if (!nudged) return
    nudged = false
    saveNotes()
  }

  const heldArrows = new Set()
  let holdStart = 0
  let holdShift = false
  let holdTimer = null

  function stopHold () {
    clearInterval(holdTimer)
    holdTimer = null
    heldArrows.clear()
  }

  function repeatNudge () {
    if (selected.length === 0) return stopHold()
    const step = nudgeStep(Date.now() - holdStart, holdShift)
    if (step === 0) return
    const direction = [...heldArrows].reduce(([x, y], key) => [x + ARROWS[key][0], y + ARROWS[key][1]], [0, 0])
    nudgeSelected(direction, step)
  }

  function pressArrow (key, shift) {
    nudgeSelected(ARROWS[key], shift ? NUDGE_SHIFT_PX : NUDGE_PX)
    if (heldArrows.size === 0) {
      holdStart = Date.now()
      holdTimer = setInterval(repeatNudge, NUDGE_TICK_MS)
    }
    heldArrows.add(key)
  }

  function releaseKey (event) {
    heldArrows.delete(event.key)
    if (heldArrows.size > 0) return
    stopHold()
    saveNudge()
  }

  function endMove (d) {
    const map = boardMap()
    place(movedBy(d.move, d.shown, map), map)
    clearMove(d)
    const indices = d.move.map(({ index }) => index)
    keepDrawnPoints(indices, map)
    renderNotes()
    snapToPixels(indices)
    saveNotes()
  }

  // The solver's own move or resize keeps the point a fixed note will be drawn at, so a note dropped partly past the window's edge stays where it is seen.
  function keepDrawnPoints (indices, map) {
    for (const i of indices) if (puzzleNotes[i].fixed) puzzleNotes[i] = { ...puzzleNotes[i], fixed: reachOf(puzzleNotes[i], map) }
  }

  function endErase () {
    const { touched } = erasing
    erasing = null
    if (!keepItems((item) => !touched.has(item))) return
    saveNotes()
    redraw()
  }

  function cancelInput () {
    if (drag?.move) clearMove(drag)
    if (drag) clearDrag(drag)
    drag = null
    showChrome()
    erasing = null
    resizing = null
    holdCursor(null)
    selected = []
    if (editing) closeEditing()
  }

  // Saved notes the script cannot read are the browser's data and not SudokuPad's, so they are left as they are and never turn the saved data off.
  // SudokuPad keeps what its Undo brings back after a Restart in memory only, so a load ends it for the notes too.
  function showSavedNotes () {
    cancelInput()
    puzzleNotes = []
    setNotesHidden(false)
    savable = true
    loadedKey = currentPuzzleKey()
    forgetRestarted()
    if (!storage.off) {
      const { items, kept, unreadable } = loadNotes(Framework, loadedKey)
      puzzleNotes = items
      keptEntries = kept
      savable = unreadable === undefined
      if (unreadable !== undefined) report(UNSAVABLE_MESSAGE, `unsavable ${loadedKey}`)
      reportKept()
    }
    forgetParsedTexts()
    redraw()
  }

  // The saved strokes and shapes of an earlier version, and the entries that failed their check, are left as they are.
  function clearNotes () {
    puzzleNotes = puzzleNotes.filter((item) => item.kind !== TEXT_KIND)
    cancelInput()
    savable = true
  }

  function clearAll () {
    clearNotes()
    saveNotes()
    redraw()
  }

  // Restart keeps the notes before it saves them cleared, so the Undo that brings back what SudokuPad's Restart cleared brings them back too.
  function restartNotes () {
    try {
      if (loadedKey !== null && !storage.off && !undoRestart.off) keepRestartedTo(Framework, loadedKey, puzzleNotes.filter((item) => item.kind === TEXT_KIND))
    } catch (err) {
      report(`Text Anywhere could not keep this puzzle's notes for Undo: ${err.message}`)
    }
    clearNotes()
    writeNotes()
    redraw()
  }

  // SudokuPad's Undo brings back what Restart cleared when the undo stack is empty: the first Undo after a Restart, past any selection made since. Its puzzle
  // triggers `act` after each action, so whether the stack was empty before an Undo is read off the last action, a reset or a load.
  let emptyStackLength = 0
  const undoStackEmpty = () => Framework.app.puzzle.undoStack.length <= emptyStackLength
  let undoWasEmpty = false

  function followUndo (_, action) {
    if (action?.type === 'undo' && undoWasEmpty) restoreRestarted()
    undoWasEmpty = undoStackEmpty()
  }

  function restoreRestarted () {
    if (loadedKey === null || storage.off) return
    const key = restartedKey(loadedKey)
    let notes
    try {
      notes = readNotes(Framework.getData(key)).items
    } catch (err) {
      report(`Text Anywhere cannot read the notes Restart cleared, so Undo does not bring them back: ${err.message}`)
      return
    }
    if (notes.length === 0) return
    setNotesHidden(false)
    cancelInput()
    const first = puzzleNotes.length
    puzzleNotes = puzzleNotes.concat(notes)
    saveNotes()
    // So the solver sees which notes came back.
    if (Framework.app.tool === TOOL_NAME) select(notes.map((_, i) => first + i))
    else redraw()
  }

  // Adds to the erase's touched notes every note the drag from `from` to `to`, in board units, passes through or within HIT_MARGIN_PX of.
  function touchAlong (from, to, map) {
    const [a, b] = [from, to].map(map.toScreen)
    for (const item of puzzleNotes) {
      if (item.kind === TEXT_KIND && touchesBox(grownBox(noteScreenBox(item, map, look.outline), HIT_MARGIN_PX), a, b)) erasing.touched.add(item)
    }
  }

  function touchMoves () {
    if (!erasing) return
    const map = boardMap()
    for (const point of erasing.pending.splice(0)) {
      const at = map.toBoard(point)
      touchAlong(erasing.last, at, map)
      erasing.last = at
    }
  }

  // SudokuPad gives a tool every button's mousedown; the browser opens its menu on the press on Linux and on the
  // release on Windows, so it is suppressed everywhere but over the controls for as long as Text Anywhere is current.
  // On Windows a right-drag that ends over a control still opens the menu there.
  function suppressMenu (event) {
    if (Framework.app.tool === TOOL_NAME && !overControl(event)) event.preventDefault()
  }

  function confirmClear () {
    textTool.run(() => Framework.showDialog({
      parts: [
        { tag: 'text', content: CLEAR_QUESTION },
        { tag: 'options', options: [{ tag: 'button', content: OK_LABEL }, { tag: 'button', content: CANCEL_LABEL }] }
      ],
      onButton: under(textTool, (label) => { if (label === OK_LABEL) clearAll() }),
      centerOverBoard: true
    }))
  }

  // The mouse button each gesture is held by, as a bit of a MouseEvent's `buttons`.
  const PRIMARY_HELD = 1
  const SECONDARY_HELD = 2

  const toolHandlers = {
    name: TOOL_NAME,
    isTool: true,
    // A press that starts a drag returns true, so SudokuPad starts no drag of its own and selects no cell. A press that
    // finished a text box does nothing else on the page.
    handleInputdown (event) {
      if (event.type !== 'mousedown' || drag || erasing || overControl(event)) return false
      if (pressFinishedText) return true
      const map = boardMap()
      const point = eventPoint(event)
      if (event.button === SECONDARY_BUTTON) {
        if (notesHidden) return true
        const at = map.toBoard(point)
        erasing = { last: at, pending: [], touched: new Set() }
        touchAlong(at, at, map)
        return true
      }
      if (event.button !== PRIMARY_BUTTON) return false
      // A press on a note moves the selection once it drags, after selecting just that note when it was not selected; with Shift it only adds or removes the note on its release.
      // A press on empty space draws a selection rectangle once it drags.
      const note = edgeNote ?? pressedNote(event)
      edgeNote = null
      const box = event.target.closest(`.${CHECK_CLASS}`)
      if (note && box) {
        tickCheck(note, box)
        return true
      }
      const start = note ? puzzleNotes.findIndex((item) => item[NOTE_ELEMENT] === note) : -1
      const shift = event.shiftKey
      if (start !== -1 && !shift && !selected.includes(start)) select([start])
      const move = start === -1 || shift ? null : selected.map((index) => ({ index, item: puzzleNotes[index] }))
      drag = { start, move, points: [point], pending: [], samples: [[...point, window.performance.now()]], settle: null, shift, detail: event.detail, rectangle: null }
      return true
    },
    // A release the page never saw (off the window, or under another tool) leaves the button up on the next move.
    handleInputMove (event) {
      if (event.type === 'mousemove' && (erasing || drag) && !(event.buttons & (erasing ? SECONDARY_HELD : PRIMARY_HELD))) {
        endGesture()
        return false
      }
      if (erasing) {
        erasing.pending.push(eventPoint(event))
        inFrame('erase', touchMoves)
        return true
      }
      if (!drag) return false
      if (event.type === 'mousemove') holdShift = event.shiftKey
      if (drag.cancelled) return true
      // The browser goes on sending a held drag's moves past the window's edge, so the frame checks each one.
      drag.pending.push(eventPoint(event))
      recordSample(drag, eventPoint(event))
      inFrame('drag', dragMoves)
      return true
    },
    handleInputup (event) {
      flushFrame()
      if (erasing) {
        erasing.pending.push(eventPoint(event))
        touchMoves()
        endErase()
        return true
      }
      if (!drag) return false
      // A click acts only on the release of Text Anywhere's own press, never on a release or click alone.
      endDrag(clickNote)
      return true
    },
    handleToolEnter () {
      if (!colors) saveColors(copiedPenColors(readPenColor), PEN_PRESET)
      notesLayer().classList.add(ACTIVE_CLASS)
      showPanel()
    },
    handleToolExit () {
      notesLayer().classList.remove(ACTIVE_CLASS)
      hoverPoint = null
      showHover()
      showChrome()
      endGesture()
      if (editing) finishText()
      selected = []
      renderNotes()
      hidePanel()
      unmarkColor()
    },
    // A digit key or keypad button gets the button's data-value. With Text Anywhere current it picks a color, and no key
    // or button enters anything in a cell.
    handleToolButton (value) {
      const picked = noteColorNumber(value)
      // A held erase keeps the notes it touched as they were at the press, and a color pick would replace them.
      if (picked !== undefined && !erasing) pickColor(picked)
      return true
    },
    // SudokuPad calls every tool's handleKeydown first, and true ends the keydown there. Shift would otherwise switch to Corner for as long as it is held (that
    // tool's tempKey), and a drag with it held would never reach Text Anywhere.
    handleKeydown (event) {
      if (Framework.app.tool !== TOOL_NAME) return false
      holdShift = event.shiftKey
      if (event.key === 'Shift') {
        if (drag?.move) inFrame('drag', dragMoves)
        return true
      }
      if (event.key === 'Escape' && erasing) {
        erasing = null
        return true
      }
      // A key that changes notes would replace the ones the erase touched, so it waits for the release.
      if (erasing && (ARROWS[event.key] || SIZE_KEYS[event.key] || event.key === 'Delete' || event.key === 'Backspace')) return true
      if (event.key === 'Escape' && drag && !drag.cancelled) {
        cancelDrag()
        return true
      }
      if (event.key === 'Escape' && resizing && !resizing.cancelled) {
        cancelResize()
        return true
      }
      if (event.key === 'Enter' && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && selected.length === 1 && !editing && !drag) {
        event.preventDefault()
        openText(selected[0])
        return true
      }
      const sizeDirection = SIZE_KEYS[event.key]
      if (sizeDirection && !editing) {
        // A gesture holds its notes as they were at the press, and its release would put the old size back.
        if (!drag && !resizing) stepSize(sizeDirection)
        return true
      }
      if (selected.length === 0) return false
      if (event.key === 'Escape') select([])
      else if (ARROWS[event.key]) pressArrow(event.key, event.shiftKey)
      else if (event.key === 'Delete' || event.key === 'Backspace') {
        // A move in progress holds the note; cancelling it first leaves its release nothing to place.
        if (drag?.move) cancelDrag()
        deleteSelected()
      } else return false
      return true
    },
    // SudokuPad calls every tool's handleKeyup too. An arrow released with Shift still held would otherwise switch to Corner (its tempKey), which leaves this tool and ends the selection.
    handleKeyup (event) {
      holdShift = event.shiftKey
      if (event.key === 'Shift' && drag?.move) inFrame('drag', dragMoves)
      return Framework.app.tool === TOOL_NAME && selected.length > 0 && Boolean(ARROWS[event.key])
    }
  }

  // SudokuPad calls these. A throw from one turns the Text tool off, and the event goes on to SudokuPad's own tools.
  const tool = Object.fromEntries(Object.entries(toolHandlers).map(([name, handler]) => [name, typeof handler === 'function' ? (...args) => textTool.run(() => handler(...args), () => false) : handler]))

  // Without getApp there is no app: the features that need one are off, and the rest start without it.
  const start = (app) => {
    guard.probe({ roots: { Framework, app }, store: Framework })
    if (!storage.off) copyOldKeys(savedData)
    color = readColor(savedData.getData(COLOR_KEY))
    Object.assign(look, readLooks(savedData))
    background = readBackground(savedData.getData(BACKGROUND_KEY))
    colors = readNoteColors(savedData.getData(COLORS_KEY))
    colorsPreset = readNotePreset(savedData.getData(COLORS_KEY))
    showColors()
    // The features are independent: one that fails to install costs the others nothing.
    textTool.run(() => {
      addStyleOnce(PANEL_STYLE_ID, PANEL_CSS)
      textTool.wrap(app, 'getToolNames', function (stock) { return toolNamesFor(stock(), this.currentEvent) })
      Framework.addTool({
        button: { name: TOOL_NAME, title: 'Text Anywhere', content: `<div class="icon">${BUTTON_ICON}</div>Text` },
        tool
      })
      onWindow(textTool, 'contextmenu', suppressMenu)
      installColorPickers()
      onWindow(textTool, 'blur', endGesture)
      installSliderGuards(`.${SLIDERS_CLASS}`)
      onWindow(textTool, 'pointerdown', finishTextOnPress, { capture: true })
      onWindow(textTool, 'mousedown', keepNoteFocus, { capture: true })
      // After the slider guards' own release handler, which takes the focus off the slider.
      onWindow(textTool, 'pointerup', returnFocusToNote, { capture: true })
      onWindow(textTool, 'pointerup', () => { pressFinishedText = false; edgeNote = null }, { capture: true })
      onWindow(textTool, 'wheel', scrollNote, { capture: true, passive: false })
      onWindow(textTool, 'mousemove', resizeMove, { capture: true })
      onWindow(textTool, 'mousemove', (event) => {
        showChrome()
        hoverPoint = overControl(event) ? null : eventPoint(event)
        showEdgeCursor(isHandle(event.target) ? null : hoverPoint)
        inFrame('hover', showHover)
      }, { capture: true })
      onWindow(textTool, 'mouseout', (event) => {
        if (event.relatedTarget) return
        hoverPoint = null
        inFrame('hover', showHover)
      }, { capture: true })
      onWindow(textTool, 'mouseup', endResize, { capture: true })
      for (const type of ['keydown', 'keypress', 'keyup']) onWindow(textTool, type, keepBoxKeys, { capture: true })
      onWindow(textTool, 'keydown', stopCellCopy, { capture: true })
      onWindow(textTool, 'keydown', switchOnT, { capture: true })
      onWindow(textTool, 'keyup', releaseKey, { capture: true })
      onWindow(textTool, 'pagehide', saveOpenNote)
      document.addEventListener('visibilitychange', under(textTool, () => { if (document.visibilityState === 'hidden') saveOpenNote() }))
    })
    settingsUi.run(() => addSettingsEntry(dialogs, { name: 'textanywhere', content: 'Text Anywhere', open: under(settingsUi, openDialog) }))
    boardNotes.run(() => {
      app.puzzle.on('loaded', under(boardNotes, showSavedNotes))
      app.on('restarted', under(boardNotes, restartNotes))
      if (app.puzzle.currentPuzzle) showSavedNotes()
    })
    undoRestart.run(() => {
      app.puzzle.on('act', under(undoRestart, followUndo))
      // Another script may act after Restart in its own 'restarted' handler; the stack it leaves, read once all of them have run, is the empty one.
      app.on('restarted', under(undoRestart, () => queueMicrotask(() => { emptyStackLength = Framework.app.puzzle.undoStack.length; undoWasEmpty = undoStackEmpty() })))
      for (const event of ['reset', 'progressloaded']) {
        app.puzzle.on(event, under(undoRestart, () => { emptyStackLength = 0; undoWasEmpty = undoStackEmpty() }))
      }
    })
  }
  if (typeof Framework.getApp === 'function') Framework.getApp().then(start)
  else start(undefined)
})()
