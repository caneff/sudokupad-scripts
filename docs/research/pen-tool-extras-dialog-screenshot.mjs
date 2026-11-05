// Takes the Pen Tool Extras settings dialog screenshots for #210: desktop (1200x900) and phone (390x800), each with the
// dialog as it opens and again with every box flipped (so the rows hidden by default show). Run from the repo root:
//   node docs/research/pen-tool-extras-dialog-screenshot.mjs <script path> <out prefix>
// To compare a change, take the pictures with the script before and after, then:
//   node docs/research/pen-tool-extras-dialog-screenshot.mjs --compare <prefix a> <prefix b>
// which exits 1 naming each picture whose bytes differ (the same page renders to the same PNG bytes).
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { openPage, startPuzzle } from '../../live/page.mjs'
import { openExtrasEditor } from '../../live/settings.mjs'

const VIEWPORTS = [['desktop', { width: 1200, height: 900 }], ['phone', { width: 390, height: 800 }]]
const STATES = ['opened', 'flipped']

if (process.argv[2] === '--compare') {
  const [a, b] = process.argv.slice(3)
  const differ = VIEWPORTS.flatMap(([viewport]) => STATES.map((state) => `${viewport}-${state}`))
    .filter((name) => !readFileSync(`${a}-${name}.png`).equals(readFileSync(`${b}-${name}.png`)))
  console.log(differ.length ? `differ: ${differ.join(', ')}` : 'no difference')
  process.exit(differ.length ? 1 : 0)
}

const [scriptPath, prefix] = process.argv.slice(2)
const script = readFileSync(scriptPath, 'utf8')
const browser = await chromium.launch()
for (const [name, viewport] of VIEWPORTS) {
  const { context, p } = await openPage(browser, { contextOptions: { viewport } })
  await startPuzzle(p)
  await p.addScriptTag({ content: script })
  await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
  await p.evaluate(() => Framework.setSetting('toolpen', true))
  await openExtrasEditor(p)
  // The dialog fades in; a picture taken mid-fade differs by a shade from one taken a frame later.
  await p.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)))
  await p.locator('.dialog').first().screenshot({ path: `${prefix}-${name}-opened.png` })
  for (const box of await p.locator('#pen-tool-extras-editor input[type=checkbox]').all()) await box.click()
  await p.locator('.dialog').first().screenshot({ path: `${prefix}-${name}-flipped.png` })
  await context.close()
}
await browser.close()
