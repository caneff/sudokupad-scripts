// Attacks on Color by Digit's gestures (#596, from #590): the editor's paint drag across the digit keys, interrupted by Escape, on sudokupad.app
// in headless Chromium. Real input throughout. It checks the crash signals (an uncaught error, a console error, a skip line), that Escape ends the
// dialog with nothing saved, and that the editor, opened again, shows the saved profiles and paints
// as before.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EDITOR, openSession, paintedKeys, PROFILES_KEY, SEED, savedState } from './color-by-digit-fixtures.mjs'
import { closeDialogWith, openScriptDialog } from '../settings.mjs'
import { captureConsoleErrors } from '../page.mjs'
import { settle } from '../settle.mjs'
import { scriptSource, useBrowser } from '../session.mjs'

const script = scriptSource('color-by-digit.user.js')

const FIRST_ROW = ['1', '2', '3']
const SECOND_ROW = ['4', '5', '6']

const browser = useBrowser()

describe('Color by Digit\'s editor paint drag, interrupted', { concurrency: false }, () => {
  let context, p, errors

  const digitKey = (digit) => p.locator(`${EDITOR} button[data-act=digit][data-digit="${digit}"]`)
  // Hovering first waits for the dialog to stop moving, so the box read is where the key is.
  const centre = async (digit) => { await digitKey(digit).hover(); const b = await digitKey(digit).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
  const savedProfiles = async () => savedState(await p.evaluate((key) => Framework.getData(key), PROFILES_KEY))
  const openEditor = () => openScriptDialog(p, 'Color by Digit', EDITOR)

  before(async () => {
    ;({ context, p, errors } = await openSession(browser(), script, { seed: captureConsoleErrors }))
  })
  after(async () => { await context.close() })

  it('16: a paint drag across digits, Escape mid-drag, then the mouse-up closes the editor with nothing saved, and a drag in the editor opened again still paints', async () => {
    await openEditor()
    const started = await paintedKeys(p)
    const points = await Promise.all([...FIRST_ROW, '6'].map(centre))
    await p.mouse.move(points[0].x, points[0].y)
    await p.mouse.down()
    await p.mouse.move(points[1].x, points[1].y, { steps: 5 })
    assert.notDeepEqual(await paintedKeys(p), started, 'the drag painted a digit in the draft')
    await p.keyboard.press('Escape')
    assert.equal(await settle(() => p.locator(EDITOR).count(), 0), 0, 'Escape closed the editor')
    await p.mouse.move(points[2].x, points[2].y, { steps: 5 })
    await p.mouse.up()
    await p.mouse.move(points[3].x, points[3].y, { steps: 5 })
    assert.deepEqual((await savedProfiles()).profiles, SEED.profiles, 'the saved profiles are as they were')
    assert.deepEqual(errors, [], 'the page shows no error')

    await openEditor()
    assert.deepEqual(await paintedKeys(p), started, 'the editor, opened again, shows the saved profile')
    const [four, five, six] = await Promise.all(SECOND_ROW.map(centre))
    await p.mouse.move(four.x, four.y)
    await p.mouse.down()
    await p.mouse.move(five.x, five.y, { steps: 5 })
    await p.mouse.move(six.x, six.y, { steps: 5 })
    await p.mouse.up()
    const painted = await paintedKeys(p)
    assert.equal(new Set(SECOND_ROW.map((d) => painted[d])).size, 1, 'a drag paints the three digits one color')
    assert.notEqual(painted['4'], started['4'], 'a drag across digits still paints')
    await p.mouse.move(points[0].x, points[0].y, { steps: 5 })
    assert.deepEqual(await paintedKeys(p), painted, 'a move with no button held paints nothing')
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.deepEqual((await savedProfiles()).profiles, SEED.profiles, 'Cancel saves nothing')
    assert.deepEqual(errors, [], 'the page shows no error afterward')
  })
})
