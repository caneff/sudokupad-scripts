/* eslint-disable no-unused-vars */
// Reads rem from plain.
/* global rem */
// The purple panel Pen Tool Extras and Draw Tool give their tool: SudokuPad's outer keypad size (four rows of a 4rem button between 0.15rem margins) as a grid of the nine
// color buttons shortened to 2.5rem, a gap, a row of three controls at the full 4rem, and the sliders across the rest. A tray sits behind the last two rows; it is placed in
// their area but takes no cell, so the buttons fill the row.
// SudokuPad's purple, as its own icons draw it.
const PANEL_COLOR = '#6a1b9a'
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
const WEDGE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'><polygon points='0,4.5 100,1.5 100,8.5 0,5.5' fill='${PANEL_COLOR}'/></svg>`
const WEDGE_PICTURE = `url("data:image/svg+xml,${encodeURIComponent(WEDGE_SVG)}") center / 100% 100% no-repeat`
const FADE_PICTURE = `linear-gradient(to right, color-mix(in srgb, ${PANEL_COLOR} 8%, transparent), ${PANEL_COLOR})`
const TRACK_SHAPE = `height: ${SLIDER_TRACK_REM}rem; border: none; border-radius: ${SLIDER_TRACK_REM / 2}rem;`
const THUMB_SHAPE = `box-sizing: border-box; width: ${SLIDER_THUMB_REM}rem; height: ${SLIDER_THUMB_REM}rem; border-radius: 50%; background: #fff; border: ${SLIDER_THUMB_RING_REM}rem solid ${PANEL_COLOR};`

// The rules both panels share, as a list of CSS rules. `panel` is the keypad's selector and `colorButton` the selector of a color button under it; `controlButtons` is the
// selector list of the three control buttons; `tray`, `sliders` and `sliderRow` are class names; `wedgeSlider` and `fadeSlider` are the ids of the slider drawn as a wedge
// (widening to the right) and the one drawn as a fade (faint to solid).
function panelCss ({ panel, colorButton, controlButtons, tray, sliders, sliderRow, wedgeSlider, fadeSlider }) {
  const rows = [[1, 2, 3, COLOR_ROWS], [7, 8, 9, 1]]
  return [
    `${panel} { display: grid !important; grid-template-columns: repeat(${PANEL_COLUMNS}, ${PANEL_CELL_REM}rem); grid-template-rows: repeat(${COLOR_ROWS}, ${COLOR_CELL_REM}rem) ${rem(CONTROLS_GAP_REM + PANEL_CELL_REM)}rem 1fr; height: ${PANEL_HEIGHT_REM}rem !important; padding: 0 !important; box-sizing: border-box; justify-items: center; align-items: center; position: relative; }`,
    `${panel} > .button-row { display: contents !important; }`,
    `${panel} button[data-key="0"], ${panel} button[data-control="delete"] { display: none !important; }`,
    // Each color button keeps `position: relative`, since its color line is its `::after`.
    `${panel} ${colorButton} { position: relative; width: ${PANEL_BUTTON_REM}rem !important; height: ${COLOR_BUTTON_REM}rem !important; min-width: 0 !important; margin: ${PANEL_BUTTON_MARGIN_REM}rem !important; }`,
    `${controlButtons} { grid-row: ${CONTROLS_ROW}; align-self: end; position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; width: ${PANEL_BUTTON_REM}rem; height: ${PANEL_BUTTON_REM}rem; min-height: 0; margin: ${PANEL_BUTTON_MARGIN_REM}rem; padding: 0; background-color: var(--body-bg); color: ${PANEL_COLOR}; }`,
    `.${tray} { grid-row: ${CONTROLS_ROW} / ${SLIDERS_ROW + 1}; grid-column: 1 / ${PANEL_COLUMNS + 1}; position: absolute; inset: 0; z-index: 0; margin: ${TRAY_TOP_REM}rem -${TRAY_REACH_REM}rem 0; background: ${TRAY_COLOR}; border-radius: ${TRAY_RADIUS_PX}px; }`,
    // With no sliders the tray ends under the controls, as far past their margin as the other sides: an absolutely placed box needs its end line, or it runs to the panel's edge.
    `${panel}:not(:has(.${sliders})) .${tray} { grid-row: ${CONTROLS_ROW} / ${SLIDERS_ROW}; margin-bottom: -${rem(TRAY_PADDING_REM - PANEL_BUTTON_MARGIN_REM)}rem; }`,
    // SudokuPad's Keypad Flipped swaps the first and third rows of colors with a transform on each `.button-row`, which has no box here, so the rows are swapped by grid row.
    ...rows.flatMap(([a, b, c, row]) => [a, b, c].map((key) => `.setting-flipkeypad ${panel} button[data-key="${key}"] { grid-row: ${row} / span 1; }`)),
    `.${sliders} { grid-row: ${SLIDERS_ROW}; grid-column: 1 / ${PANEL_COLUMNS + 1}; justify-self: stretch; align-self: stretch; position: relative; z-index: 1; box-sizing: border-box; margin: ${PANEL_BUTTON_MARGIN_REM}rem ${PANEL_BUTTON_MARGIN_REM}rem ${TRAY_PADDING_REM}rem; padding: 0 0.8rem; display: flex; flex-direction: column; justify-content: space-evenly; color: ${PANEL_COLOR}; }`,
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
