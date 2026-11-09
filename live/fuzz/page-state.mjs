/* global Framework */
// Reads a snapshot's `page` (the shape `rules.mjs` describes) from real SudokuPad. Not a check itself.
import { createRequire } from 'node:module'
import { setTimeout as sleep } from 'node:timers/promises'
import { PROFILES_KEY } from '../color-by-digit/color-by-digit-fixtures.mjs'
import { saved as savedNotes, TEXTS } from '../draw-tool/draw-tool-fixtures.mjs'
import { rulesPaneFits } from './rules.mjs'

const { stateFromStored, activeGroups } = createRequire(import.meta.url)('../../color-by-digit.user.js')

const COLOR_BUTTON_TITLE = /^Color by digit: (\w+)$/
// Auto Rules Resizer refits 100 ms after the last resize, and the rules are read once they fit or this long has passed: a wait on a condition, so a slow box
// reads the finished fit, and a pane that never fits is still read and reported.
const RULES_FIT_MS = 2000
const POLL_MS = 50

// What the page holds that the rules read, in one round trip.
const readDom = ({ texts, profilesKey }) => {
  const puzzle = Framework.app.puzzle
  const strokeOf = (names) => `pen-${names[0]} pencolor-${names.slice(1)}`
  const rules = document.querySelector('.puzzle-rules')
  const controls = document.querySelector('.controls-main')
  if (!rules || rules.offsetWidth === 0) throw new Error('the rules pane is not shown, though every fuzz page has rules')
  if (!controls) throw new Error('the number pad (.controls-main) is not on the page')
  // SudokuPad's own font for the pane, from a sibling the script has not styled.
  const bare = document.createElement('div')
  bare.className = 'puzzle-rules selectable'
  rules.parentElement.appendChild(bare)
  const ownFontPx = parseFloat(window.getComputedStyle(bare).fontSize)
  bare.remove()
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
    rulesPane: { fontPx: parseFloat(window.getComputedStyle(rules).fontSize), ownFontPx, scrollHeight: rules.scrollHeight, clientHeight: rules.clientHeight },
    letterMode: controls.classList.contains('input-letter')
  }
}

export async function readPageState (p) {
  const args = { texts: TEXTS, profilesKey: PROFILES_KEY }
  let dom = await p.evaluate(readDom, args)
  for (const deadline = Date.now() + RULES_FIT_MS; !rulesPaneFits(dom.rulesPane) && Date.now() < deadline;) {
    await sleep(POLL_MS)
    dom = await p.evaluate(readDom, args)
  }
  const notesSaved = await savedNotes(p)
  const mode = COLOR_BUTTON_TITLE.exec(dom.buttonTitle ?? '')?.[1]
  if (!mode) throw new Error(`Color by Digit's button has no mode in its title: ${JSON.stringify(dom.buttonTitle)}`)
  const { profiles, digits, buttonTitle, ...rest } = dom
  return { ...rest, notesSaved, colorByDigit: { mode, groups: activeGroups(stateFromStored({ getData: () => profiles })), cells: digits } }
}
