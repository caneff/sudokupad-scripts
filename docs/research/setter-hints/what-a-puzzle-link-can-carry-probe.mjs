// Research probe for docs/research/setter-hints/what-a-puzzle-link-can-carry.md (#1170). Frozen once that note is written; the lint
// and the seam never read docs/research/. Run from the repo root: `node docs/research/setter-hints/what-a-puzzle-link-can-carry-probe.mjs`.
// It serves SudokuPad from the live tests' recording (live/README.md § The recording), opens a few built puzzles by link and prints
// what a userscript can read on each after Start Puzzle. Nothing is posted anywhere: no short link is made.
/* global Framework, loadFPuzzle, PuzzleZipper */
import { chromium } from 'playwright'
import { openPage, startPuzzle } from '../../../live/page.mjs'
import { puzzleData } from '../../../live/puzzles.mjs'
import { LOAD_MS } from '../../../live/cache.mjs'

const RULES = 'Normal sudoku rules apply.\n<b>bold?</b> <!-- hidden comment --> <span style="display:none">hidden span</span>\n' +
  '[a SudokuPad link](https://sudokupad.app/x) [another link](https://example.com/) 🎉'
const LONG = 'Long rules line. '.repeat(1200)

// Each case: a name, how to build its id in the page (`scl` plain JSON, `zip` as SudokuPad's own tools write it, or `fpuz`), the data, and a query and hash on the link.
const CASES = [
  ['scl, metadata object + top-level key', 'scl', puzzleData({
    id: 'probe-scl',
    metadata: { title: 'Probe title', author: 'Probe author', rules: RULES, hints: 'HINT TEXT', msgcorrect: 'Solved!' },
    hintsTop: { steps: [{ t: 'kept?' }] }
  }), '?hints=fromquery#hintsfromhash'],
  ['scl, meta cages only', 'scl', puzzleData({
    id: 'probe-cages',
    metadata: undefined,
    cages: [{ value: 'title: Cage title' }, { value: 'rules: ' + RULES }, { value: 'hints: from a cage' }, { value: 'hints: second' }]
  }), ''],
  ['zip, nested short keys', 'zip', puzzleData({
    id: 'probe-zip',
    metadata: { title: 'Zip', hints: [{ t: 'a t key', v: '5', q: 'say "hi"', hex: 'beef12' }] }
  }), ''],
  ['fpuz, metadata + cage meta', 'fpuz', {
    size: 9,
    grid: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({}))),
    title: 'Fpuz title',
    author: 'Fpuz author',
    ruleset: RULES,
    metadata: { hints: 'from fpuz metadata' },
    hintsTop: 'dropped?',
    cage: [{ cells: [], value: 'hints2: from an f-puzzles cage' }]
  }, ''],
  ['scl, 20 kB rules', 'scl', puzzleData({ id: 'probe-long', metadata: { title: 'Long', rules: LONG } }), '']
]

const browser = await chromium.launch()
try {
  const { p } = await openPage(browser)
  await startPuzzle(p)
  for (const [name, kind, data, tail] of CASES) {
    const id = await p.evaluate(([kind, json]) => {
      if (kind === 'fpuz') return 'fpuzzles' + loadFPuzzle.compressPuzzle(json)
      if (kind === 'zip') return 'scl' + loadFPuzzle.compressPuzzle(PuzzleZipper.zip(json))
      return 'scl' + loadFPuzzle.compressPuzzle(json)
    }, [kind, JSON.stringify(data)])
    await p.goto('https://sudokupad.app/' + id + tail, { waitUntil: 'load', timeout: LOAD_MS })
    await startPuzzle(p)
    const seen = await p.evaluate(() => {
      const { currentPuzzle: cp, sourcePuzzle: sp } = Framework.app
      const rules = document.querySelector('.puzzle-rules')
      return {
        currentPuzzleKeys: Object.keys(cp),
        metadata: cp.metadata,
        sourceKeys: Object.keys(sp),
        sourceMetadata: sp.metadata,
        sourceHintsTop: sp.hintsTop,
        rulesHtml: rules.innerHTML.slice(0, 600),
        rulesTextLength: rules.textContent.length,
        rulesBox: [rules.clientHeight, rules.scrollHeight],
        docTitle: document.title,
        search: location.search,
        hash: location.hash,
        urlLength: location.href.length
      }
    })
    if (seen.metadata && typeof seen.metadata.rules === 'string') seen.metadata.rules = seen.metadata.rules.slice(0, 80) + '…'
    if (seen.sourceMetadata && typeof seen.sourceMetadata.rules === 'string') seen.sourceMetadata.rules = seen.sourceMetadata.rules.slice(0, 80) + '…'
    console.log('==', name, '(id', id.length, 'chars)')
    console.log(JSON.stringify(seen, null, 1))
  }
} finally {
  await browser.close()
}
