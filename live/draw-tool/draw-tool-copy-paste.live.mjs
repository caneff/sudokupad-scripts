// Live check of draw-tool.user.js's copy and paste on sudokupad.app: Ctrl+C with notes selected puts their raw text on the clipboard, one paragraph each, top
// note first; Ctrl+V with no note open adds one closed, selected note at the pointer; neither throws, and SudokuPad's cell copy and paste do not run. Real keys.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'
import { settle } from '../settle.mjs'

const LOWER = [6.5, 1.5]
const UPPER = [1.5, 4.5]
const SPOT = [4.5, 6.5]
const SELECTED = '#draw-tool-layer .draw-tool-selected'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s copy and paste', { concurrency: false }, () => {
  let context, p, errors

  const clipboard = () => p.evaluate(() => navigator.clipboard.readText())
  const clickAt = async (at, options) => p.mouse.click(...await gridPoint(p, at), options)
  const typeText = async (at, content) => {
    await clickAt(at)
    await p.keyboard.type(content)
    await draw.finishNote(p)
  }
  const selectedCount = () => p.locator(SELECTED).count()

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.reload(p)
    await draw.pickDraw(p)
    // The lower note is typed first, so reading order, not the order they were made in, puts the upper one first.
    await typeText(LOWER, '**Bee**')
    await typeText(UPPER, 'Ay')
  })
  after(async () => { await context.close() })

  it('Ctrl+C with two notes selected copies their raw text, the upper one first, and Ctrl+V adds one closed, selected note at the pointer', async () => {
    // A note typed at the spot shows where a paste there lands, and what the current Size, color and Transparency give it.
    await typeText(SPOT, 'probe')
    const probe = (await draw.saved(p)).find((item) => item.text === 'probe')
    await clickAt(SPOT)
    await p.keyboard.press('Delete')
    await clickAt(LOWER)
    await p.keyboard.down('Shift')
    await clickAt(UPPER)
    await p.keyboard.up('Shift')
    assert.equal(await selectedCount(), 2, 'both notes are selected')
    await p.keyboard.press('Control+c')
    assert.equal(await settle(clipboard, 'Ay\n\n**Bee**'), 'Ay\n\n**Bee**', 'the clipboard holds both notes\' text, the upper note first')
    await p.mouse.move(...await gridPoint(p, SPOT))
    await p.keyboard.press('Control+v')
    const pasted = await settle(async () => (await draw.saved(p)).filter((item) => item.text === 'Ay\n\n**Bee**'), (found) => found.length === 1)
    assert.equal(pasted.length, 1, 'one note holds the pasted text')
    assert.deepEqual([pasted[0].at, pasted[0].size, pasted[0].color], [probe.at, probe.size, probe.color], 'it starts where a note typed at the pointer does, with the current look')
    assert.equal(await draw.saved(p).then((items) => items.length), 3, 'the paste added one note and no more')
    assert.equal(await p.locator(draw.TEXT_BOX).count(), 0, 'the note is not open for typing')
    assert.equal(await selectedCount(), 1, 'the new note is the one selected')
    await p.keyboard.press('Delete')
    assert.deepEqual((await draw.saved(p)).map((item) => item.text).sort(), ['**Bee**', 'Ay'], 'Delete takes the pasted note away')
    assert.deepEqual(errors, [], 'no page error')
  })

  it('Ctrl+C with nothing selected copies nothing and throws nothing, and an empty clipboard pastes no note', async () => {
    await clickAt([8.5, 8.5])
    await draw.finishNote(p)
    await p.evaluate(() => navigator.clipboard.writeText('kept'))
    await p.keyboard.press('Control+c')
    assert.equal(await clipboard(), 'kept', 'the clipboard is as it was')
    await p.evaluate(() => navigator.clipboard.writeText(''))
    await p.keyboard.press('Control+v')
    assert.equal(await p.locator(draw.TEXT_BOX).count(), 0)
    assert.equal((await draw.saved(p)).length, 2, 'no note was added')
    assert.deepEqual(errors, [], 'no page error')
  })
})
