// The puzzles a fuzz list can run on (#679), each built in code with `puzzleData` and opened by its id, so none costs a request to sudokupad.app, plus the
// recorded 9x9 of `live/puzzle-url.txt`. The set is data with no browser: the generator (`actions.mjs`) reads each puzzle's targets and digit keys from it,
// so a list names its puzzle and a replay path finds it again. `fuzz.mjs` opens a puzzle and checks the page against what is said here. Not a check itself.
//
// A puzzle is: `name` (what a report prints), `rows` and `cols`, `data` (the SCL for `puzzleData`; null for the recorded one), `rules` ('long', 'short' or 'none':
// the rules text its page shows), `keys` (the digit keys SudokuPad takes on it), `free` (the cells a digit can go in, `[row, col]`, 0-based) and `cells`
// (the targets an action can pick: the free cells, then, when `margin` is set, the cells just outside the grid where the clues are).
import { CLASSIC_GIVENS, CLASSIC_SOLUTION, puzzleData } from '../puzzles.mjs'

// The rules text every long-rules page shows: twenty times a short paragraph, which at every fuzz window size Auto Rules Resizer has to shrink below SudokuPad's own font
// to fit and can (the recorded puzzle has no rules of its own).
export const RULES_TEXT = Array(20).fill('Normal sudoku rules apply. Digits along an arrow sum to the digit in its circle. Cells separated by a white dot contain consecutive digits.').join(' ')
const SHORT_RULES = 'Normal sudoku rules apply. Cages sum to their clue.'

// The rules text a puzzle's page shows, or null when it shows none.
export const rulesTextFor = (puzzle) => ({ long: RULES_TEXT, short: SHORT_RULES, none: null })[puzzle.rules]

const clue = (row, col, text) => ({ center: [row, col], width: 0.8, height: 0.6, text, fontSize: 18, color: '#000000' })

// A 9x9 cut into nine connected regions of nine cells that are not boxes: the cells in a serpentine along two-column strips, nine to a region.
function jigsawRegions () {
  const path = []
  for (let strip = 0; strip < 5; strip++) {
    const width = strip === 4 ? 1 : 2
    const rows = strip % 2 === 0 ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1, 0]
    rows.forEach((r, i) => {
      const cols = Array.from({ length: width }, (_, k) => strip * 2 + k)
      path.push(...(i % 2 === 0 ? cols : cols.reverse()).map((c) => [r, c]))
    })
  }
  return Array.from({ length: 9 }, (_, k) => path.slice(k * 9, k * 9 + 9))
}

// Cells holding a given.
const SIDE = 9
const givensOf = (solution, keep) => [...solution].flatMap((d, i) => (keep(i) ? [[Math.floor(i / SIDE), i % SIDE, Number(d)]] : []))

const THERMO = { thickness: 12, color: '#cccccc' }
const bulb = (r, c) => ({ center: [r, c], width: 0.7, height: 0.7, rounded: true, backgroundColor: '#cccccc', borderColor: '#cccccc', borderThickness: 1 })

// What the 9x9 with cages, arrows and thermometers holds: killer cages, an arrow with its circle, and two thermometers with their bulbs.
const CAGES = puzzleData({
  id: 'fuzz-cages',
  givens: givensOf(CLASSIC_SOLUTION, (i) => i % 7 === 0),
  metadata: { title: 'fuzz cages' },
  cages: [{ cells: [[0, 1], [0, 2]], value: '12' }, { cells: [[2, 3], [2, 4], [3, 4]], value: '15' }, { cells: [[4, 0], [5, 0], [5, 1]], value: '16' }],
  arrows: [{ wayPoints: [[6, 6], [6, 7], [6, 8]], headLength: 0.3, thickness: 2, color: '#000000' }],
  lines: [{ wayPoints: [[8, 0], [7, 1], [6, 2], [5, 3]], ...THERMO }, { wayPoints: [[1, 8], [2, 8], [3, 8], [3, 7]], ...THERMO }],
  underlays: [{ center: [6, 6], width: 0.7, height: 0.7, rounded: true, backgroundColor: '#ffffff', borderColor: '#000000', borderThickness: 1 }, bulb(8, 0), bulb(1, 8)]
})

// Sandwich and X-sum numbers around the classic 9x9, where Text Anywhere's notes and the pen's lines go.
const OUTSIDE = puzzleData({
  id: 'fuzz-outside',
  givens: CLASSIC_GIVENS,
  metadata: { title: 'fuzz outside clues' },
  overlays: [clue(-0.5, 0.5, '12'), clue(-0.5, 4.5, '3'), clue(-0.5, 7.5, '20'), clue(4.5, -0.5, '7'), clue(7.5, -0.5, '14'), clue(4.5, 9.5, '8'), clue(1.5, 9.5, '16'), clue(9.5, 4.5, '21'), clue(9.5, 1.5, '5')]
})

// The classic puzzle with two cells left, and its solution, so the solved message can show.
const NEARLY_SOLVED = puzzleData({
  id: 'fuzz-nearly-solved',
  givens: givensOf(CLASSIC_SOLUTION, (i) => i !== 2 && i !== 40),
  metadata: { title: 'fuzz nearly solved', solution: CLASSIC_SOLUTION }
})

const SIX = puzzleData({ id: 'fuzz-6x6', rows: 6, cols: 6, boxRows: 2, boxCols: 3, givens: [[0, 0, 1], [1, 3, 2], [2, 1, 3], [3, 4, 4], [4, 2, 5], [5, 5, 6]], metadata: { title: 'fuzz 6x6' } })
const FOUR = puzzleData({ id: 'fuzz-4x4', rows: 4, cols: 4, boxRows: 2, boxCols: 2, givens: [[0, 0, 1], [1, 2, 3], [2, 1, 2], [3, 3, 4]], metadata: { title: 'fuzz 4x4' } })
const TWELVE = puzzleData({ id: 'fuzz-12x12', rows: 12, cols: 12, boxRows: 3, boxCols: 4, givens: [[0, 0, 1], [2, 5, 7], [5, 3, 10], [7, 8, 12], [11, 11, 3]], metadata: { title: 'fuzz 12x12' } })
const SIX_BY_EIGHT = puzzleData({ id: 'fuzz-6x8', rows: 6, cols: 8, boxRows: 2, boxCols: 4, givens: [[0, 0, 1], [1, 5, 3], [3, 2, 8], [5, 7, 4]], metadata: { title: 'fuzz 6x8' } })
const SIXTEEN = puzzleData({ id: 'fuzz-16x16', rows: 16, cols: 16, boxRows: 4, boxCols: 4, givens: [[0, 0, 1], [5, 5, 3], [2, 3, 2], [9, 9, 12], [15, 15, 16]], metadata: { title: 'fuzz 16x16' } })
const EMPTY = puzzleData({ id: 'fuzz-empty', metadata: { title: 'fuzz empty 9x9' } })
const JIGSAW = puzzleData({ id: 'fuzz-jigsaw', givens: givensOf(CLASSIC_SOLUTION, (i) => i % 5 === 0), regions: jigsawRegions(), metadata: { title: 'fuzz jigsaw' } })

// The digit keys SudokuPad's pad takes on a grid this big: 1 up to the size (9 at most), and 0 for the digits past 9.
const keysFor = (size) => [...Array.from({ length: Math.min(size, 9) }, (_, i) => String(i + 1)), ...(size > 9 ? ['0'] : [])]

function describePuzzle ({ name, data, rules, margin = false, rows = data ? data.cells.length : SIDE, cols = data ? data.cells[0].length : SIDE }) {
  const givens = data ? [] : CLASSIC_GIVENS
  const fromData = data ? data.cells.flatMap((row, r) => row.flatMap((c, i) => (c.value ? [`${r},${i}`] : []))) : []
  const given = new Set([...givens.map(([r, c]) => `${r},${c}`), ...fromData])
  const free = Array.from({ length: rows * cols }, (_, i) => [Math.floor(i / cols), i % cols]).filter(([r, c]) => !given.has(`${r},${c}`))
  const around = [
    ...Array.from({ length: cols }, (_, c) => [-1, c]), ...Array.from({ length: cols }, (_, c) => [rows, c]),
    ...Array.from({ length: rows }, (_, r) => [r, -1]), ...Array.from({ length: rows }, (_, r) => [r, cols])
  ]
  return { name, data, rows, cols, rules, margin, keys: keysFor(Math.max(rows, cols)), free, cells: [...free, ...(margin ? around : [])] }
}

export const FUZZ_PUZZLES = [
  describePuzzle({ name: 'recorded 9x9', data: null, rules: 'long' }),
  describePuzzle({ name: '6x6', data: SIX, rules: 'long' }),
  describePuzzle({ name: '4x4', data: FOUR, rules: 'none' }),
  describePuzzle({ name: 'cages 9x9', data: CAGES, rules: 'short' }),
  describePuzzle({ name: 'jigsaw 9x9', data: JIGSAW, rules: 'long' }),
  describePuzzle({ name: 'outside clues 9x9', data: OUTSIDE, rules: 'short', margin: true }),
  describePuzzle({ name: '12x12', data: TWELVE, rules: 'long' }),
  describePuzzle({ name: '16x16', data: SIXTEEN, rules: 'long' }),
  describePuzzle({ name: '6x8', data: SIX_BY_EIGHT, rules: 'short' }),
  describePuzzle({ name: 'nearly solved 9x9', data: NEARLY_SOLVED, rules: 'short' }),
  describePuzzle({ name: 'empty 9x9', data: EMPTY, rules: 'short' }),
  describePuzzle({ name: 'cages 9x9, long rules', data: { ...CAGES, id: 'fuzz-cages-long' }, rules: 'long' })
]

// Whether a target `[row, col]` of `puzzle` is a cell of the grid, not one just outside it.
export const insideGrid = (puzzle, [row, col]) => row >= 0 && col >= 0 && row < puzzle.rows && col < puzzle.cols

export const puzzleByName = (name) => {
  const puzzle = FUZZ_PUZZLES.find((p) => p.name === name)
  if (!puzzle) throw new Error(`no puzzle "${name}"; known: ${FUZZ_PUZZLES.map((p) => p.name).join(', ')}`)
  return puzzle
}
