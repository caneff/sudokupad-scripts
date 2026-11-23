// Takes docs/research/site/site-preview-card.png (1200x630), the homepage's link-preview card (og:image in
// site/index.html, #1151): the title and the three biggest scripts side by side, each panel a tight crop of that
// script's first slide, and an "and more!" sticker in the bottom right corner. The site's own font and colors, read from site/style.css. Also writes a 400 px wide copy, about
// what Discord shows, to $SHOTS (else /tmp) as site-preview-card-400.png, to check the labels still read.
// Run from the repo root: node docs/research/site/site-preview-card-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const root = new URL('../../../', import.meta.url)
const bytes = (path) => readFileSync(new URL(path, root))
const data = (path, type) => `data:${type};base64,${bytes(path).toString('base64')}`
const css = bytes('site/style.css').toString()
const token = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))[1]
const background = css.match(/^html \{ background: ([^;]+?) fixed;/m)[1]

const WIDTH = 1200
const HEIGHT = 630
const PANEL_WIDTH = 352
const PADDING = 12
// Each crop is a rectangle of the slide, in the slide's own pixels.
const PANELS = [
  { label: 'Pen Tool Extras', color: 'pink', slide: 'docs/research/pen-tool-extras/pen-tool-extras-slide-1-color.png', crop: [230, 0, 454, 430] },
  { label: 'Text Anywhere', color: 'yellow', slide: 'docs/research/text-anywhere/text-anywhere-slide-1-type.png', crop: [330, 90, 360, 240] },
  { label: 'Color by Digit', color: 'mint', slide: 'docs/research/color-by-digit/color-by-digit-slide-1-start.png', crop: [190, 0, 375, 375] }
]

// A PNG's size is the two big-endian numbers after its signature and the IHDR chunk's name.
const pngSize = (path) => [bytes(path).readUInt32BE(16), bytes(path).readUInt32BE(20)]

const panel = ({ label, color, slide, crop: [x, y, w, h] }) => {
  const [width, height] = pngSize(slide)
  if (x < 0 || y < 0 || x + w > width || y + h > height) throw new Error(`${label}: the crop ${[x, y, w, h]} is outside the ${width}x${height} slide`)
  const scale = (PANEL_WIDTH - 2 * PADDING) / w
  return `<div class="panel ${color}"><div class="label">${label}</div>
    <div class="crop" style="width:${w * scale}px;height:${h * scale}px"><img src="${data(slide, 'image/png')}" style="width:${width * scale}px;left:${-x * scale}px;top:${-y * scale}px"></div></div>`
}

const html = `<!doctype html><style>
@font-face { font-family: Fredoka; src: url(${data('site/Fredoka.woff2', 'font/woff2')}) format("woff2"); font-weight: 300 700; }
:root { --accent: ${token('accent')}; --lavender: ${token('lavender')}; --lavender-fill: ${token('lavender-fill')}; }
body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; box-sizing: border-box; padding: 34px 40px; background: ${background}; }
h1 { margin: 0 0 30px; padding: 6px 0 10px; text-align: center; font: 600 68px/1.1 Fredoka, sans-serif; color: var(--accent); background: var(--lavender-fill); border: 10px solid var(--lavender); border-radius: 24px; box-shadow: 0 0 0 6px #fff; }
.row { display: flex; gap: 24px; justify-content: center; align-items: stretch; }
.panel { box-sizing: border-box; width: ${PANEL_WIDTH}px; padding: ${PADDING}px; border: 8px solid var(--edge); border-radius: 22px; background: var(--fill); box-shadow: 0 0 0 5px #fff; display: flex; flex-direction: column; align-items: center; gap: 10px; }
${['pink', 'yellow', 'mint'].map((c) => `.${c} { --edge: ${token(c)}; --fill: ${token(c + '-fill')}; }`).join(' ')}
.label { font: 600 38px/1.1 Fredoka, sans-serif; color: var(--accent); white-space: nowrap; }
.crop { position: relative; overflow: hidden; background: #fff; border-radius: 10px; margin: auto 0; }
.crop img { position: absolute; max-width: none; }
.sticker { position: absolute; right: 16px; bottom: 16px; transform: rotate(-6deg); padding: 2px 22px 6px; font: 600 36px/1.1 Fredoka, sans-serif; color: var(--accent); background: var(--lavender-fill); border: 6px solid var(--lavender); border-radius: 999px; box-shadow: 0 0 0 4px #fff, 0 4px 10px rgba(0, 0, 0, 0.18); white-space: nowrap; }
</style><h1>Puzzle Scripts for SudokuPad</h1><div class="row">${PANELS.map(panel).join('')}</div><div class="sticker">and more!</div>`

const browser = await chromium.launch()
const render = async (path, deviceScaleFactor) => {
  const page = await (await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor })).newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const m = await page.evaluate(() => ({
    broken: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
    overflow: document.documentElement.scrollHeight - innerHeight,
    fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family)
  }))
  if (m.broken > 0 || m.overflow > 0 || !m.fonts.includes('Fredoka')) throw new Error(JSON.stringify(m))
  await page.screenshot({ path })
  return m
}
console.log('card', JSON.stringify(await render(new URL('./site-preview-card.png', import.meta.url).pathname, 1)))
await render(`${process.env.SHOTS || '/tmp'}/site-preview-card-400.png`, 400 / WIDTH)
await browser.close()
