// Probe for #1065: a click on the last cell-centre shape sometimes leaves it shown. Wider than the first attempt: human-speed clicks, slid presses,
// clicks after a pen drag, and all scripts at Tampermonkey's timing. Each case reports the saved marks, the drawn marks near the cell and the pixels.
import { after, before, describe, it } from 'node:test'
const R = '/home/caneff/src/sudokupad-scripts/live/'
const extras = await import(R + 'pen-tool-extras/pen-tool-extras-fixtures.mjs')
const { cellCentre, undoAll } = await import(R + 'board.mjs')
const { useBrowser } = await import(R + 'session.mjs')
const OUT = '/tmp/claude-1000/-home-caneff-src-sudokupad-scripts/f08c0612-600c-4e93-beb7-295709e042c7/scratchpad/'
const ALL = ['pen-tool-extras.user.js', 'text-anywhere.user.js', 'color-by-digit.user.js', 'dark-page.user.js', 'ui-tweaks.user.js', 'auto-rules-resizer.user.js']
const CONFIG = process.env.CFG === 'all' ? { scripts: ALL, mode: 'document-idle' } : {}
const CELL = [4, 4]
const browser = useBrowser()

const read = (p) => p.evaluate(([r, c]) => {
  const cell = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c)
  const box = cell.elem.getBoundingClientRect()
  const inCell = (e) => { const b = e.getBoundingClientRect(); const x = b.x + b.width / 2; const y = b.y + b.height / 2; return b.width > 0 && x > box.x && x < box.right && y > box.y && y < box.bottom }
  return {
    held: cell.pen.map((v) => v[0]).join(''),
    drawn: [...document.querySelectorAll('svg .cell-pen, svg .penhint')].filter(inCell).map((e) => `${e.parentNode.id || e.parentNode.getAttribute('class')}:${e.getAttribute('class')}`)
  }
}, CELL)

describe(`#1065 probe (${process.env.CFG || 'pte'})`, { concurrency: false }, () => {
  let context, p, base, clip
  before(async () => {
    ;({ context, p } = await extras.open(browser(), CONFIG))
    await p.locator('.tool-pen button[data-key="1"]').click()
    await undoAll(p)
    clip = await p.evaluate(([r, c]) => { const b = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).elem.getBoundingClientRect(); return { x: b.x + 4, y: b.y + 4, width: b.width - 8, height: b.height - 8 } }, CELL)
    await p.mouse.move(5, 5)
    base = await p.screenshot({ clip })
  })
  after(async () => { await context.close() })

  const results = []
  after(() => { console.log('RESULTS\n' + results.map((r) => JSON.stringify(r)).join('\n')) })

  async function check (name, act) {
    await undoAll(p)
    await p.mouse.move(5, 5)
    const [x, y] = await cellCentre(p, ...CELL)
    await act(x, y)
    await p.waitForTimeout(600)
    const still = await read(p)
    const px = Buffer.compare(base, await p.screenshot({ clip })) === 0
    await p.mouse.move(5, 5)
    await p.waitForTimeout(300)
    const off = await read(p)
    const pxOff = Buffer.compare(base, await p.screenshot({ clip })) === 0
    const row = { name, held: still.held, drawn: still.drawn.length, blank: px, heldOff: off.held, drawnOff: off.drawn.length, blankOff: pxOff, detail: still.drawn }
    const bad = row.held !== '' || row.drawn || !row.blank || row.drawnOff || !row.blankOff
    if (bad) await p.screenshot({ path: `${OUT}probe-1065-${name.replace(/\W+/g, '_')}.png`, clip: { x: clip.x - 60, y: clip.y - 60, width: clip.width + 120, height: clip.height + 120 } })
    results.push({ bad, ...row })
  }

  const slid = (d, hold = 60) => async (x, y) => { await p.mouse.move(x, y); await p.mouse.down(); await p.waitForTimeout(hold); await p.mouse.move(x + d, y, { steps: 2 }); await p.mouse.up() }
  const three = async (x, y) => { for (let i = 0; i < 3; i++) { await p.mouse.click(x, y); await p.waitForTimeout(250) } }
  for (const [name, r, c] of [['then empty cell', 6, 6], ['then empty cell far', 1, 9]]) {
    it(`slid 7 px on the dot, ${name}`, async () => { await check(`slide7-${r}${c}`, async (x, y) => { await three(x, y); await slid(7)(x, y); await p.waitForTimeout(300); const before = await read(p); console.log('AFTER SLIDE', JSON.stringify(before)); const [a, b] = await cellCentre(p, r, c); await p.mouse.click(a, b); await p.waitForTimeout(300); console.log('AFTER OTHER CLICK held at 4,4 =', JSON.stringify(await read(p))) }) })
  }
  it('slid 7 px on the circle (first step), not the dot', async () => { await check('slide7-first', async (x, y) => { await slid(7)(x, y) }) })
  it('slid 7 px on the dot, then a plain click on it', async () => { await check('slide7-reclick', async (x, y) => { await three(x, y); await slid(7)(x, y); await p.waitForTimeout(300); await p.mouse.click(x, y) }) })
})
