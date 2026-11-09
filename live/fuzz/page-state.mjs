/* global Framework */
// Reads a snapshot's `page` (the shape `rules.mjs` describes) from real SudokuPad. Not a check itself.
import { createRequire } from 'node:module'
import { PROFILES_KEY } from '../color-by-digit/color-by-digit-fixtures.mjs'
import { saved as savedNotes, TEXTS } from '../draw-tool/draw-tool-fixtures.mjs'

const { stateFromStored, activeGroups } = createRequire(import.meta.url)('../../color-by-digit.user.js')

const COLOR_BUTTON_TITLE = /^Color by digit: (\w+)$/
// SudokuPad's own rules font is 1.1rem (the live check of Auto Rules Resizer types the same 17.6 px at 16 px a rem).
const RULES_FONT_REM = 1.1

// What the page holds that the rules read, in one round trip.
const readDom = ({ texts, profilesKey, rulesFontRem }) => {
  const puzzle = Framework.app.puzzle
  const strokeOf = (names) => `pen-${names[0]} pencolor-${names.slice(1)}`
  const rules = document.querySelector('.puzzle-rules')
  const rootPx = parseFloat(window.getComputedStyle(document.documentElement).fontSize)
  const shown = rules && rules.offsetWidth > 0
  return {
    undoDepth: puzzle.undoStack.length,
    cells: JSON.parse(puzzle.serializeState()).cells,
    penState: puzzle.cells.flatMap((cell) => cell.pen.map((entry) => strokeOf(String(entry)))),
    penDrawn: [...document.querySelectorAll('#cell-pen .cell-pen')].map((e) => [...e.classList].filter((c) => /^pen(?:color)?-/.test(c)).join(' ')),
    notesDrawn: [...document.querySelectorAll(texts)].map((e) => e.textContent),
    buttonTitle: document.querySelector('#control-colorbydigit')?.title ?? null,
    profiles: Framework.getData(profilesKey),
    digits: puzzle.cells.map((cell) => ({ digit: String(cell.value || ''), given: Boolean(cell.given), colours: cell.colours.map(String) })),
    pageColor: window.getComputedStyle(document.body).backgroundColor,
    rulesPane: shown ? { fontPx: parseFloat(window.getComputedStyle(rules).fontSize), ownFontPx: rulesFontRem * rootPx, scrollHeight: rules.scrollHeight, clientHeight: rules.clientHeight } : null,
    letterMode: document.querySelector('.controls-main')?.classList.contains('input-letter') ?? false
  }
}

export async function readPageState (p) {
  const dom = await p.evaluate(readDom, { texts: TEXTS, profilesKey: PROFILES_KEY, rulesFontRem: RULES_FONT_REM })
  const notesSaved = await savedNotes(p)
  const mode = COLOR_BUTTON_TITLE.exec(dom.buttonTitle ?? '')?.[1]
  if (!mode) throw new Error(`Color by Digit's button has no mode in its title: ${JSON.stringify(dom.buttonTitle)}`)
  const { profiles, digits, buttonTitle, ...rest } = dom
  return { ...rest, notesSaved, colorByDigit: { mode, groups: activeGroups(stateFromStored({ getData: () => profiles })), cells: digits } }
}
