// Takes docs/research/site-color-by-digit.png: the two boxes of color-by-digit-example.mjs in Both, on the demo profile, reached by
// two presses from Cell. Cells take their group's color, and entered digits and corner marks its darker shade; the
// corner and center 5s that conflict with the given 5 have their circles. The mascot is hidden.
// Run from the repo root: node docs/research/color-by-digit-screenshot.mjs
import { chromium } from 'playwright'
import { exampleClip, openExample, pressTo, waitForCircles } from './color-by-digit-example.mjs'

const out = new URL('./site-color-by-digit.png', import.meta.url).pathname

const browser = await chromium.launch()
const p = await openExample(browser)
await pressTo(p, 'DIGIT')
await pressTo(p, 'BOTH')
await waitForCircles(p)
await p.screenshot({ path: out, clip: await exampleClip(p) })
await browser.close()
