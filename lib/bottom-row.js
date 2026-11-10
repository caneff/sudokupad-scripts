/* eslint-disable no-unused-vars */
// SudokuPad's bottom row of tool buttons.
const BOTTOM_ROW = '.controls-aux'
// SudokuPad's own rules make this row wrap and size its buttons in rem under a scale transform, so a cap in rem holds five a row at every window size, whichever script added which button. !important because something on Chris's page gave the row an inline max-width of 482px, which beats a stylesheet cap.
const BOTTOM_ROW_CSS = `${BOTTOM_ROW} { max-width: 21.6rem !important; }`
