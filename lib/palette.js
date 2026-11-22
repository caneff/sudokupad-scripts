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
// The OKLCH chroma under which a darkened color counts as gray: SudokuPad's grays are 0, a tinted dark gray such as rgb(10, 20, 30) is about 0.024, and the
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

// A color set (lib/color-set.js) without its `fromPreset`.
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

function missingColorsText (missing, fromPreset) {
  const page = PAGE_PRESETS.indexOf(fromPreset) + 1
  const list = (missing.length === 1 ? 'pen color ' : 'pen colors ') + missing.join(', ')
  return `Cell color page ${page} has no usable color at the matching button, so ${list} keep${missing.length === 1 ? 's' : ''} SudokuPad's own.`
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

const BAD_PALETTE = 'SudokuPad\'s color palette has no pages of color keys'

// The one reader of the palette's pages: none while SudokuPad has no palette, and a throw for a palette of a shape the script does not know.
function palettePages () {
  const palette = colorTool()?.palette
  if (!palette) return []
  if (!Array.isArray(palette.pages) || !palette.pages.every(Array.isArray)) throw new Error(BAD_PALETTE)
  return palette.pages
}

// `init` assigns the page and sets the `--cell-color-<key>` variables in one synchronous step, so a palette on the tool means the variables are set too (the stylesheet's own
// values for them exist earlier and say nothing about a custom palette).
const readyColorTool = () => palettePages().length > 0 ? colorTool() : null

// A bad palette is a warning under the script's id and no pages, so a dialog still opens; `note` is the warning's text, for the dialog to show.
function readPalettePages (scriptId) {
  try {
    return { pages: palettePages(), note: '' }
  } catch (error) {
    console.warn(`${scriptId}: ${error.message}`)
    return { pages: [], note: error.message }
  }
}

// What a script with the Darker page presets loses to a bad palette, for paletteNoteHtml.
const PRESETS_LEFT_OUT = 'the Darker page presets are left out'
// A dialog's line for a bad palette: readPalettePages' `note`, then `outcome`, what the script does without the palette's pages. '' with no note.
const paletteNoteHtml = (note, outcome, className = '') => note ? `<div${className ? ` class="${className}"` : ''} data-role="palette-note">${note}, so ${outcome}.</div>` : ''

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
