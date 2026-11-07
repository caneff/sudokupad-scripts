import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const root = execSync('npm root -g').toString().trim();
export const { chromium } = createRequire(root + '/')('playwright');
export const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim();
export const script = readFileSync(process.env.SCRIPT || '/home/caneff/src/sudokupad-scripts/color-by-digit.user.js', 'utf8');
export const LATE = process.env.INJECT === 'late';
export const injectLate = async p => { if (LATE) { await p.evaluate(() => { window.__fwAtIdle = typeof Framework + '/' + typeof Framework.getApp; }); await p.addScriptTag({ content: script }); await p.waitForTimeout(500); } };
// Runs the userscript at DOMContentLoaded in page context: what @grant none + document-idle gives, without Tampermonkey.
export async function open(ctx, errors) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(String(e)));
  await p.route(/cookiebot|googletagmanager|plausible/, r => r.abort());
  if (!LATE) await p.addInitScript(src => {
    document.addEventListener('DOMContentLoaded', () => {
      window.__fwAtIdle = typeof Framework + '/' + (typeof Framework !== 'undefined' && typeof Framework.getApp);
      const s = document.createElement('script'); s.textContent = src; document.documentElement.appendChild(s);
    });
  }, script);
  await p.goto(url, { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  await injectLate(p);
  return p;
}
