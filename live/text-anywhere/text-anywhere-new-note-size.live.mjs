import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { openPage } from '../page.mjs'
import { openPuzzleId, puzzleData, puzzleIdFor, installAll, CLASSIC_GIVENS } from '../puzzles.mjs'
import { pickTool, typeText } from '../board.mjs'
import { TEXTS } from './text-anywhere-fixtures.mjs'
import { useBrowser } from '../session.mjs'

const browser = useBrowser()
const SHAPES = [['4x4', 4, 2, [[0, 0, 1]]], ['9x9', 9, 3, CLASSIC_GIVENS], ['16x16', 16, 4, [[0, 0, 1]]]]
// A new note's line is about as tall on screen on every grid (within 25%), though a 16x16's cells are far smaller.
const WITHIN = 0.25

describe('Text Anywhere\'s new note size follows the grid', { concurrency: false }, () => {
  let context, p, errors

  beforeEach(async () => { ;({ context, p, errors } = await openPage(browser(), { seed: (page) => installAll(page) })) })
  afterEach(async () => {
    try {
      assert.deepEqual(errors, [], 'no page error or skip line')
    } finally {
      await context?.close()
    }
  })

  const lineHeight = async ([name, size, box, givens]) => {
    await openPuzzleId(p, await puzzleIdFor(p, puzzleData({ id: `new-note-${name}`, rows: size, cols: size, boxRows: box, boxCols: box, givens })))
    await pickTool(p, 'textanywhere')
    await typeText(p, [0.5, 0.5], 'A')
    return p.locator(TEXTS).first().evaluate((e) => e.getBoundingClientRect().height)
  }

  it('a note typed on a 4x4, a 9x9 and a 16x16 is about the same height on screen', async () => {
    const heights = {}
    for (const shape of SHAPES) {
      heights[shape[0]] = await lineHeight(shape)
      await p.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('TextAnywhere_notes')).forEach((k) => localStorage.removeItem(k)))
    }
    for (const name of ['4x4', '16x16']) assert.ok(Math.abs(heights[name] / heights['9x9'] - 1) < WITHIN, `${name} ${heights[name]}px against the 9x9's ${heights['9x9']}px`)
  })
})
