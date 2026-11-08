/* eslint-disable no-unused-vars */
// The bottom row of tool buttons; Color by Digit adds a button to it and UI Tweaks wraps it.
const BOTTOM_ROW = '.controls-aux'
// SudokuPad's own rules make this row wrap and size its buttons in rem under a scale transform, so a cap in rem holds five a row at every window size, whichever script added which button.
const BOTTOM_ROW_CSS = `${BOTTOM_ROW} { max-width: 21.6rem; }`
