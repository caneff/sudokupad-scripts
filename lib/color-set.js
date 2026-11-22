/* eslint-disable no-unused-vars */
/* global parseColor, toHex, savedHex, isPlainObject, SUDOKUPAD_PEN_COLORS, PEN_COLOR_NUMBERS, paletteColors, copiedTable */ // eslint-disable-line no-redeclare
// A color set is `{ colors, preset, missing, fromPreset }`: the nine #rrggbb colors, the preset they came from, the pens a page preset left with SudokuPad's own,
// and the preset the dialog's note names them for. A hand edit keeps the last two, so the note still names the page. Every change makes a whole new record.
// `presets` is the list of preset ids a script saves beside its colors; any other is Custom.
const CUSTOM = 'custom'

// A color picker takes only #rrggbb, so every color is kept as one. A transparent color has none to keep.
const hexColor = (text) => {
  const rgb = parseColor(text)
  return rgb ? toHex(rgb) : undefined
}

// null when no key 1 to 9 holds a #rrggbb color: nothing is saved, so the install save (Text Anywhere's first use's copy) is still owed and may replace
// what is there. A bad entry beside a usable one shows SudokuPad's own color.
function savedColorSet (data, presets) {
  if (!isPlainObject(data) || !PEN_COLOR_NUMBERS.some((n) => savedHex(data[n]))) return null
  const colors = Object.fromEntries(PEN_COLOR_NUMBERS.map((n) => [n, savedHex(data[n]) ?? SUDOKUPAD_PEN_COLORS[n]]))
  return { colors, preset: presets.includes(data.preset) ? data.preset : CUSTOM, missing: [], fromPreset: null }
}

// The colors stay under keys 1 to 9, where older versions read them, with the preset's id beside them.
const storedColorSet = ({ colors, preset }) => preset === CUSTOM ? { ...colors } : { ...colors, preset }

// The set is what gets saved, so an invalid pen or value throws rather than saving a wrong entry.
function editedColorSet (set, pen, value) {
  if (!PEN_COLOR_NUMBERS.map(String).includes(String(pen))) throw new RangeError(`color-set: ${pen} is not a color number`)
  const hex = hexColor(value)
  if (!hex) throw new RangeError(`color-set: ${value} is not a color`)
  return { colors: { ...set.colors, [pen]: hex }, preset: CUSTOM, missing: set.missing.filter((n) => String(n) !== String(pen)), fromPreset: set.fromPreset }
}

// A pasted table passes when it holds a usable color and every color it holds is one: the saved reader would show SudokuPad's own for a bad entry.
function pastedColorSet (data, presets) {
  const set = savedColorSet(data, presets)
  return set && PEN_COLOR_NUMBERS.every((n) => !(n in data) || savedHex(data[n])) ? storedColorSet(set) : undefined
}

// The colors once saved; undefined while none are.
function copiedColorSet (data, presets) {
  const set = savedColorSet(data, presets)
  return set ? storedColorSet(set) : undefined
}

// The set a preset gives, `fromPreset` naming it, with its own copy of the colors.
function presetColorSet (preset, pages, readCell) {
  const { colors, missing } = paletteColors(preset, pages, readCell)
  return { colors: { ...colors }, preset, missing, fromPreset: preset }
}

// Copy's text: every row of the settings table at the value in force, defaults included, so a paste can put one back to its default; the colors only once they are saved.
function copiedSettingsWithColors (rows, store, colorsKey, presets) {
  const copied = copiedTable(rows, store)
  const colors = copiedColorSet(store.getData(colorsKey), presets)
  if (colors) copied[colorsKey] = colors
  return JSON.stringify(copied)
}

// `:root:root` outranks a plain `:root` rule whichever stylesheet loads last.
const colorSetCss = (colors, varOf) => [':root:root {', ...PEN_COLOR_NUMBERS.map((n) => `  ${varOf(n)}: ${colors[n]};`), '}'].join('\n')
