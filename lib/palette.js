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
