/* global Framework */
// The `page` shape is documented in rules.mjs. Not a check itself, so `live/**/*.live.mjs` skips it.
import { createRequire } from 'node:module'
import { setTimeout as sleep } from 'node:timers/promises'
import { PROFILES_KEY } from '../color-by-digit/color-by-digit-fixtures.mjs'
import { BOX_KEY, saved as savedNotes, SEEN_TEXTS, TEXT_BGS, TEXTS } from '../text-anywhere/text-anywhere-fixtures.mjs'
import { POLL_MS } from '../settle.mjs'
import { rulesPaneFits } from './rules.mjs'

const { stateFromStored, activeGroups } = createRequire(import.meta.url)('../../color-by-digit.user.js')
const { boxFill, readBoxColor } = createRequire(import.meta.url)('../../text-anywhere.user.js')

const COLOR_BUTTON_TITLE = /^Color by digit: (\w+)$/
// Auto Rules Resizer refits 100 ms after the last resize, and the rules are read once they fit or this long has passed: a wait on a condition, so a slow box
// reads the finished fit, and a pane that never fits is still read and reported.
const RULES_FIT_MS = 2000

const readDom = ({ texts, seenTexts, boxedTexts, boxKey, profilesKey, expectRules }) => {
  const puzzle = Framework.app.puzzle
  const strokeOf = (names) => `pen-${names[0]} pencolor-${names.slice(1)}`
  const rules = document.querySelector('.puzzle-rules')
  const controls = document.querySelector('.controls-main')
  // A puzzle with no rules text shows no pane; a puzzle with rules text that shows none is a crash.
  if (expectRules && (!rules || rules.offsetWidth === 0)) throw new Error('the rules pane is not shown, though this fuzz page has rules')
  const shown = rules && rules.offsetWidth > 0
  if (!controls) throw new Error('the number pad (.controls-main) is not on the page')
  // SudokuPad's own font for the pane, from a sibling the script has not styled.
  let ownFontPx = 0
  if (shown) {
    const bare = document.createElement('div')
    bare.className = 'puzzle-rules selectable'
    rules.parentElement.appendChild(bare)
    ownFontPx = parseFloat(window.getComputedStyle(bare).fontSize)
    bare.remove()
  }
  return {
    undoDepth: puzzle.undoStack.length,
    cells: JSON.parse(puzzle.serializeState()).cells,
    penState: puzzle.cells.flatMap((cell) => cell.pen.map((entry) => strokeOf(String(entry)))),
    penDrawn: [...document.querySelectorAll('#cell-pen .cell-pen')].map((e) => [...e.classList].filter((c) => /^pen(?:color)?-/.test(c)).join(' ')),
    notesDrawn: [...document.querySelectorAll(texts)].map((e) => e.textContent),
    // What the player sees: the note open for typing too, once something is typed in it (an empty box is no text).
    notesSeen: [...document.querySelectorAll(seenTexts)].map((e) => e.textContent).filter((t) => t !== ''),
    // A boxed note's fill and text color as computed, with the box color Text Anywhere has saved (read raw; the node side turns it into the fill it should give).
    boxedNotes: [...document.querySelectorAll(boxedTexts)].map((e) => { const style = window.getComputedStyle(e); return { text: e.textContent, fill: style.backgroundColor, color: style.color } }),
    savedBox: Framework.getData(boxKey) ?? null,
    buttonTitle: document.querySelector('#control-colorbydigit')?.title ?? null,
    profiles: Framework.getData(profilesKey),
    digits: puzzle.cells.map((cell) => ({ digit: String(cell.value || ''), given: Boolean(cell.given), colours: cell.colours.map(String) })),
    pageColor: window.getComputedStyle(document.body).backgroundColor,
    rulesPane: !shown ? null : { fontPx: parseFloat(window.getComputedStyle(rules).fontSize), ownFontPx, scrollHeight: rules.scrollHeight, clientHeight: rules.clientHeight },
    letterMode: controls.classList.contains('input-letter')
  }
}

// Each boxed note as `{ text, fill, expected }`: `expected` is the fill of `boxFill` of the saved box color and the note's own color, as the page computes it
// (the fill is CSS that may hold `var(--body-bg)` or `color-mix`, which only the page can resolve).
const withExpectedFills = (p, boxedNotes, boxColor) => p.evaluate(([notes, wanted]) => notes.map(({ text, fill }, i) => {
  const probe = document.body.appendChild(document.createElement('div'))
  probe.style.background = wanted[i]
  const expected = window.getComputedStyle(probe).backgroundColor
  probe.remove()
  return { text, fill, expected }
}), [boxedNotes, boxedNotes.map(({ color }) => boxFill(boxColor, color))])

// `expectRules` says whether the puzzle has rules text. A puzzle that does must show the pane (or the read throws); the snapshot's `rulesPane` is null when no pane is shown.
export async function readPageState (p, { expectRules }) {
  const args = { texts: TEXTS, seenTexts: SEEN_TEXTS, boxedTexts: TEXT_BGS, boxKey: BOX_KEY, profilesKey: PROFILES_KEY, expectRules }
  let dom = await p.evaluate(readDom, args)
  for (const deadline = Date.now() + RULES_FIT_MS; dom.rulesPane !== null && !rulesPaneFits(dom.rulesPane) && Date.now() < deadline;) {
    await sleep(POLL_MS)
    dom = await p.evaluate(readDom, args)
  }
  const notesSaved = await savedNotes(p)
  const mode = COLOR_BUTTON_TITLE.exec(dom.buttonTitle ?? '')?.[1]
  if (!mode) throw new Error(`Color by Digit's button has no mode in its title: ${JSON.stringify(dom.buttonTitle)}`)
  const { profiles, digits, buttonTitle, boxedNotes, savedBox, ...rest } = dom
  const noteBoxes = await withExpectedFills(p, boxedNotes, readBoxColor(savedBox))
  return { ...rest, notesSaved, noteBoxes, colorByDigit: { mode, groups: activeGroups(stateFromStored({ getData: () => profiles })), cells: digits } }
}
