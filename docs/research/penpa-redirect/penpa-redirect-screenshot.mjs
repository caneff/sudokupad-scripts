// Takes docs/research/penpa-redirect/penpa-redirect.png, the picture on the homepage's Penpa+ Redirect entry: ChinStrap's
// Penpa+ solve page (chinstrap45.github.io/penpa-edit/solve.html), where a redirected link opens. The puzzle is the Sudoku
// 9x9 from that site's own review gallery (gallery-puzzles.js), so the picture shows what the page is reviewed with.
// Run from the repo root: node docs/research/penpa-redirect/penpa-redirect-screenshot.mjs
import { chromium } from 'playwright'

const SITE = 'https://chinstrap45.github.io/penpa-edit/'
const PUZZLE = 'sudoku-9x9'
const WIDTH = 1200
const HEIGHT = 720

const gallery = await (await fetch(`${SITE}gallery-puzzles.js`)).text()
const puzzles = JSON.parse(gallery.match(/const GALLERY_PUZZLES = (\[[\s\S]*?\n\])/)[1])
const puzzle = puzzles.find((p) => p.id === PUZZLE)
if (!puzzle) throw new Error(`no ${PUZZLE} in ${SITE}gallery-puzzles.js: ${puzzles.map((p) => p.id)}`)

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } })).newPage()
await page.goto(`${SITE}solve.html${puzzle.link}`, { waitUntil: 'networkidle' })
const skip = page.getByText('Skip tour')
if (await skip.count()) await skip.click()
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(1000)
await page.screenshot({ path: new URL('./penpa-redirect.png', import.meta.url).pathname })
await browser.close()
console.log('penpa-redirect.png', puzzle.name)
