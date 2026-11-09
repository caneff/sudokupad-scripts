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
// The tray reaches this far past the color block on each side, and holds its buttons this far from its edge on every side, so the margin of a button and the reach make up most of it.
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

// The panel's rules, as a list of CSS rules. `panel` is the keypad's selector and `colorButton` the selector of a color button under it; `controlButtons` is the
// selector list of the three control buttons; `tray`, `sliders` and `sliderRow` are class names; `wedgeSlider` and `fadeSlider` are the ids of the slider drawn as a wedge
// (widening to the right) and the one drawn as a fade (faint to solid); every panel has both. `pressButtons`, when given, is the selector of buttons
// that are not placed by the grid but press like the others.
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
// SudokuPad's handlers, so the thumb drags and the drag reaches nothing else on the page. A drag leaves the focus on the slider, where the arrow keys would move it and not
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
