import { readFileSync } from 'node:fs';
import { chromium, url } from './lib.mjs';
const b = await chromium.launch();
const coloured = p => p.evaluate(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).filter(c => c.colours && c.colours.length).length);
for (const [name, file] of [['main', '/home/caneff/src/sudokupad-scripts/color-by-digit.user.js'], ['impl3', new URL('./impl3.user.js', import.meta.url).pathname]]) {
  const src = readFileSync(file, 'utf8');
  for (const when of ['before-start', 'after-start']) {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } }); const p = await ctx.newPage();
    await p.route(/cookiebot|googletagmanager|plausible/, r => r.abort());
    await p.goto(url, { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells.length);
    await p.waitForTimeout(1500);
    const startBtn = p.getByRole('button', { name: /Start Puzzle/i }).first();
    if (when === 'before-start') { await p.addScriptTag({ content: src }); await p.waitForTimeout(500); await startBtn.click(); }
    else { await startBtn.click(); await p.waitForTimeout(800); await p.addScriptTag({ content: src }); await p.waitForTimeout(500); }
    await p.waitForTimeout(400);
    await p.click('#control-colorbydigit'); await p.waitForTimeout(400);
    console.log(name, when, 'coloured after click =', await coloured(p));
    await ctx.close();
  }
}
await b.close();
