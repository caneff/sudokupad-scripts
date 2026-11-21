// #596, from #590.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EDITOR, openSession, paintedKeys, PROFILES_KEY, SEED, openEditorOn } from './color-by-digit-fixtures.mjs'
import { closeDialogWith, savedState } from '../settings.mjs'
import { captureConsoleErrors } from '../page.mjs'
import { settle } from '../settle.mjs'
import { scriptSource, useBrowser } from '../session.mjs'
import { restingMiddle } from '../input.mjs'

const script = scriptSource('color-by-digit.user.js')

const FIRST_ROW = ['1', '2', '3']
const SECOND_ROW = ['4', '5', '6']

const browser = useBrowser()

describe('Color by Digit\'s editor paint drag, interrupted', { concurrency: false }, () => {
  let context, p, errors

  const digitKey = (digit) => p.locator(`${EDITOR} button[data-act=digit][data-digit="${digit}"]`)
  const savedProfiles = async () => savedState(await p.evaluate((key) => Framework.getData(key), PROFILES_KEY))

  before(async () => {
    ;({ context, p, errors } = await openSession(browser(), script, { seed: captureConsoleErrors }))
  })
  after(async () => { await context.close() })

  it('16: a paint drag across digits, Escape mid-drag, then the mouse-up closes the editor with nothing saved, and a drag in the editor opened again still paints', async () => {
    await openEditorOn(p)
    const started = await paintedKeys(p)
    const points = await Promise.all([...FIRST_ROW, '6'].map((d) => restingMiddle(digitKey(d))))
    await p.mouse.move(...points[0])
    await p.mouse.down()
    await p.mouse.move(...points[1], { steps: 5 })
    assert.notDeepEqual(await paintedKeys(p), started, 'the drag painted a digit in the draft')
    await p.keyboard.press('Escape')
    assert.equal(await settle(() => p.locator(EDITOR).count(), 0), 0, 'Escape closed the editor')
    await p.mouse.move(...points[2], { steps: 5 })
    await p.mouse.up()
    await p.mouse.move(...points[3], { steps: 5 })
    assert.deepEqual((await savedProfiles()).profiles, SEED.profiles, 'the saved profiles are as they were')
    assert.deepEqual(errors, [], 'the page shows no error')

    await openEditorOn(p)
    assert.deepEqual(await paintedKeys(p), started, 'the editor, opened again, shows the saved profile')
    const [four, five, six] = await Promise.all(SECOND_ROW.map((d) => restingMiddle(digitKey(d))))
    await p.mouse.move(...four)
    await p.mouse.down()
    await p.mouse.move(...five, { steps: 5 })
    await p.mouse.move(...six, { steps: 5 })
    await p.mouse.up()
    const painted = await paintedKeys(p)
    assert.equal(new Set(SECOND_ROW.map((d) => painted[d])).size, 1, 'a drag paints the three digits one color')
    assert.notEqual(painted['4'], started['4'], 'a drag across digits still paints')
    await p.mouse.move(...points[0], { steps: 5 })
    assert.deepEqual(await paintedKeys(p), painted, 'a move with no button held paints nothing')
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.deepEqual((await savedProfiles()).profiles, SEED.profiles, 'Cancel saves nothing')
    assert.deepEqual(errors, [], 'the page shows no error afterward')
  })
})
