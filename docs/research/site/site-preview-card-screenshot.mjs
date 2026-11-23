// Takes docs/research/site/site-preview-card.png (1200x630), the homepage's link-preview card (og:image in
// site/index.html, #1151): the title and the three biggest scripts side by side, each panel a tight crop of that
// script's first slide. The site's own font and colors (site/style.css). Also writes a 400 px wide copy, about
// what Discord shows, to $SHOTS (else /tmp) as site-preview-card-400.png, to check the labels still read.
// Run from the repo root: node docs/research/site/site-preview-card-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const root = new URL('../../../', import.meta.url)
const data = (path, type) => `data:${type};base64,${readFileSync(new URL(path, root)).toString('base64')}`
const font = (name) => data(`site/${name}.woff2`, 'font/woff2')

const WIDTH = 1200
const HEIGHT = 630
const PANEL_WIDTH = 352
// Each crop is a rectangle of the slide, in the slide's own pixels; `size` is the slide's full size.
const PANELS = [
  { label: 'Pen Tool Extras', color: 'pink', slide: 'docs/research/pen-tool-extras/pen-tool-extras-slide-1-color.png', size: [684, 430], crop: [230, 0, 454, 430] },
  { label: 'Text Anywhere', color: 'yellow', slide: 'docs/research/text-anywhere/text-anywhere-slide-1-type.png', size: [800, 500], crop: [240, 90, 450, 400] },
  { label: 'Color by Digit', color: 'mint', slide: 'docs/research/color-by-digit/color-by-digit-slide-1-start.png', size: [900, 375], crop: [190, 0, 375, 380] }
]

const panel = ({ label, color, slide, size, crop: [x, y, w, h] }) => {
  const scale = (PANEL_WIDTH - 24) / w
  return `<div class="panel ${color}"><div class="label">${label}</div>
    <div class="crop" style="width:${w * scale}px;height:${h * scale}px"><img src="${data(slide, 'image/png')}" style="width:${size[0] * scale}px;left:${-x * scale}px;top:${-y * scale}px"></div></div>`
}

const html = `<!doctype html><style>
@font-face { font-family: Fredoka; src: url(${font('Fredoka')}) format("woff2"); font-weight: 300 700; }
@font-face { font-family: Nunito; src: url(${font('Nunito')}) format("woff2"); font-weight: 200 1000; }
:root { --accent: #5f519e; --lavender: #c9b8f2; --lavender-fill: #f5f1fe; --pink: #f9b7c6; --pink-fill: #fdeaef; --yellow: #fcd598; --yellow-fill: #fff8eb; --mint: #b1e6c6; --mint-fill: #eefaf2; }
body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; box-sizing: border-box; padding: 34px 40px; font-family: Nunito, sans-serif;
  background: repeating-linear-gradient(118deg, #ffc9d2 0 90px, #ffe0bd 90px 180px, #fff3c0 180px 270px, #cff5dc 270px 360px, #cdeaff 360px 450px, #ddd2ff 450px 540px, #ffd4ea 540px 630px); }
h1 { margin: 0 0 30px; padding: 6px 0 10px; text-align: center; font: 600 68px/1.1 Fredoka, sans-serif; color: var(--accent); background: var(--lavender-fill); border: 10px solid var(--lavender); border-radius: 24px; box-shadow: 0 0 0 6px #fff; }
.row { display: flex; gap: 24px; justify-content: center; align-items: stretch; }
.panel { box-sizing: border-box; width: ${PANEL_WIDTH}px; padding: 12px; border: 8px solid var(--edge); border-radius: 22px; background: var(--fill); box-shadow: 0 0 0 5px #fff; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.pink { --edge: var(--pink); --fill: var(--pink-fill); } .yellow { --edge: var(--yellow); --fill: var(--yellow-fill); } .mint { --edge: var(--mint); --fill: var(--mint-fill); }
.label { font: 600 38px/1.1 Fredoka, sans-serif; color: var(--accent); white-space: nowrap; }
.crop { position: relative; overflow: hidden; background: #fff; border-radius: 10px; }
.crop img { position: absolute; max-width: none; }
.row .panel .crop { margin-top: auto; margin-bottom: auto; }
</style><h1>Puzzle Scripts for SudokuPad</h1><div class="row">${PANELS.map(panel).join('')}</div>`

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } })).newPage()
await page.setContent(html, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)
const m = await page.evaluate(() => ({
  broken: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
  overflow: document.documentElement.scrollHeight - innerHeight,
  fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family)
}))
if (m.broken > 0 || m.overflow > 0 || !m.fonts.includes('Fredoka')) throw new Error(JSON.stringify(m))
await page.screenshot({ path: new URL('./site-preview-card.png', import.meta.url).pathname })
const small = await (await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 400 / WIDTH })).newPage()
await small.setContent(html, { waitUntil: 'load' })
await small.evaluate(() => document.fonts.ready)
await small.screenshot({ path: `${process.env.SHOTS || '/tmp'}/site-preview-card-400.png` })
console.log('card', JSON.stringify(m))
await browser.close()
