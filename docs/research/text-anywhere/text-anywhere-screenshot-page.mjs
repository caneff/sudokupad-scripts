// Shared by Text Anywhere's screenshot scripts: the recorded puzzle past Start Puzzle, with text-anywhere.user.js injected
// and the Text Anywhere tool on. Not a script to run.
import { readFileSync } from 'node:fs'
import { openPage, startPuzzle } from '../../../live/page.mjs'

const script = readFileSync(new URL('../../../text-anywhere.user.js', import.meta.url), 'utf8')

export async function openTextAnywherePage (browser, deviceScaleFactor) {
  const { p } = await openPage(browser, { contextOptions: { deviceScaleFactor } })
  await startPuzzle(p)
  await p.addStyleTag({ content: '#svenpeek { display: none !important }' })
  await p.addScriptTag({ content: script })
  await p.locator('#control-textanywhere').waitFor({ state: 'visible' })
  for (let i = 0; i < 20 && (await p.evaluate(() => Framework.app.tool)) !== 'textanywhere'; i++) {
    await p.click('#control-textanywhere')
    await p.waitForTimeout(300)
  }
  return p
}
