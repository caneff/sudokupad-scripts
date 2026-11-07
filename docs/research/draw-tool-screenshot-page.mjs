// Shared by the Draw Tool's screenshot scripts: the recorded puzzle past Start Puzzle, with draw-tool.user.js injected
// and the Draw tool on. Not a script to run.
import { readFileSync } from 'node:fs'
import { openPage, startPuzzle } from '../../live/page.mjs'

const script = readFileSync(new URL('../../draw-tool.user.js', import.meta.url), 'utf8')

export async function openDrawPage (browser, deviceScaleFactor) {
  const { p } = await openPage(browser, { contextOptions: { deviceScaleFactor } })
  await startPuzzle(p)
  await p.addStyleTag({ content: '#svenpeek { display: none !important }' })
  await p.addScriptTag({ content: script })
  await p.locator('#control-draw').waitFor({ state: 'visible' })
  for (let i = 0; i < 20 && (await p.evaluate(() => Framework.app.tool)) !== 'draw'; i++) {
    await p.click('#control-draw')
    await p.waitForTimeout(300)
  }
  return p
}
