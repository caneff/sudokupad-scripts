// Live check of text-anywhere.user.js on a board saved before 0.45.0, under the DrawTool_ keys: its notes and settings show after the update
// and a reload, the notice bar's dismissal is copied from the old script id's, the old keys stay, and settings text copied from that version pastes.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { settle } from '../settle.mjs'
import { useBrowser } from '../session.mjs'
import { openScriptDialog, paste } from '../settings.mjs'

const { INDEX_KEY, SETTINGS_EDITOR, SIZE_SLIDER, WIDTH_KEY, FRAME_KEY } = textAnywhere
const OLD_NOTES_PREFIX = 'DrawTool_drawing_'
const OLD_INDEX_KEY = 'DrawTool_index'
const OLD_WIDTH_KEY = 'DrawTool_width'
const OLD_FRAME_KEY = 'DrawTool_frame'
const NOTICE_KEY = 'text-anywhere-notice'
const OLD_NOTICE_KEY = 'draw-tool-notice'
const DISMISSAL = { version: '0.0.1', features: ['tool'] }
const NOTE = { kind: 'text', color: 1, size: 20, opacity: 100, text: '15', at: [160, 160] }

const browser = useBrowser()

describe('Text Anywhere on a board saved under the DrawTool_ keys', { concurrency: false }, () => {
  let context, p, errors
  const getData = (key) => p.evaluate((k) => Framework.getData(k), key)

  before(async () => {
    ;({ context, p, errors } = await textAnywhere.open(browser(), { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }))
    await textAnywhere.forgetNotes(p)
    const puzzle = await textAnywhere.puzzleKey(p)
    await p.evaluate(([remove, plant]) => {
      remove.forEach((k) => Framework.removeData(k))
      plant.forEach(([k, value]) => Framework.setData(k, value))
    }, [[WIDTH_KEY, NOTICE_KEY], [[OLD_NOTES_PREFIX + puzzle, { v: 0, data: [NOTE] }], [OLD_INDEX_KEY, [puzzle]], [OLD_WIDTH_KEY, 3.5], [OLD_NOTICE_KEY, DISMISSAL]]])
  })
  after(async () => { await context.close() })

  it('the update shows the old notes and settings, saved under the new keys with the notice bar\'s dismissal, and keeps the old keys', async () => {
    await textAnywhere.reload(p)
    assert.deepEqual(await settle(() => textAnywhere.texts(p), ['15']), ['15'])
    const puzzle = await textAnywhere.puzzleKey(p)
    assert.deepEqual(await textAnywhere.saved(p), [NOTE])
    assert.deepEqual(await getData(INDEX_KEY), [puzzle])
    assert.equal(await getData(WIDTH_KEY), 3.5)
    assert.deepEqual(await getData(NOTICE_KEY), DISMISSAL)
    await textAnywhere.pickTextAnywhere(p)
    assert.equal(await p.locator(SIZE_SLIDER).inputValue(), '3.5', 'the Size slider shows the old width')
    assert.deepEqual(await getData(OLD_NOTES_PREFIX + puzzle), { v: 0, data: [NOTE] }, 'the old notes stay')
    assert.deepEqual(await getData(OLD_INDEX_KEY), [puzzle], 'the old index stays')
    assert.deepEqual(await getData(OLD_NOTICE_KEY), DISMISSAL, 'the old dismissal stays')
  })

  it('a reload after the update still shows the notes', async () => {
    await textAnywhere.reload(p)
    assert.deepEqual(await settle(() => textAnywhere.texts(p), ['15']), ['15'])
    assert.deepEqual(await textAnywhere.saved(p), [NOTE], 'the notes stay saved under the new key')
  })

  it('settings text copied from the old version pastes under the new keys', async () => {
    await openScriptDialog(p, 'Text Anywhere', SETTINGS_EDITOR)
    assert.equal(await paste(p, JSON.stringify({ [OLD_WIDTH_KEY]: 5, [OLD_FRAME_KEY]: true })), 'Pasted 2 settings.')
    assert.equal(await getData(WIDTH_KEY), 5)
    assert.equal(await getData(FRAME_KEY), true)
    assert.equal(await getData(OLD_FRAME_KEY), null, 'nothing is written under an old key')
    assert.deepEqual(errors, [])
  })
})
