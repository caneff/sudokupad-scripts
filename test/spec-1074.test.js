// Spec #1074's acceptance criteria, run once at the seam and then removed (closing check).
// Blind to: real SudokuPad (the Framework calls, rendering, undo), which `npm run test:live` covers; this file reads only the docs.
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(ROOT, p))
const agents = read('AGENTS.md')

test('D1 AGENTS.md facts: pages, live injection', () => {
  assert.match(agents, /one details page per script that has one/)
  assert.match(agents, /after Start Puzzle by default/)
  assert.match(read('docs/agents/site.md'), /every page in `site\/`/)
})

test('D2 AGENTS.md diet: pointers, no merge-raises-version clause', () => {
  assert.ok(Buffer.byteLength(agents) < 9970, 'AGENTS.md is shorter than before the spec')
  for (const doc of ['docs/agents/site.md', 'docs/agents/dispatch.md', 'docs/agents/keys.md']) {
    assert.ok(agents.includes(doc), `AGENTS.md points to ${doc}`)
    assert.ok(exists(doc), doc)
  }
  assert.doesNotMatch(agents, /every merge raises/i)
})

test('D3 the shows rule names the reference page and README notes beside site/', () => {
  const line = agents.split('\n').find((l) => l.includes('A change to what a script shows'))
  assert.ok(line)
  assert.match(line, /`site\/`/)
  assert.match(line, /docs\/pen-tool-extras\.md/)
  assert.match(line, /README/)
})

const notesUnder = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
  const p = `${dir}/${e.name}`
  if (e.isDirectory()) return notesUnder(p)
  return e.name.endsWith('.md') && p !== 'docs/research/README.md' ? [p] : []
})

test('D4 the research index lists every note, grouped', () => {
  const index = read('docs/research/README.md')
  for (const h of ['## SudokuPad itself', '## Per script', '## Tooling', '## Published pictures: do not move', '## Byte-identical before and after pairs']) {
    assert.ok(index.includes(h), h)
  }
  const missing = notesUnder('docs/research').filter((n) => !index.includes(`\`${n}\``))
  assert.deepStrictEqual(missing, [])
})

test('D5 research placement', () => {
  assert.ok(!exists('docs/research/no-tab-letters'))
  for (const p of ['docs/research/tooling', 'docs/research/ui-tweaks', 'docs/research/ui-tweaks/bottom-row-css-wrap.md', 'docs/research/text-anywhere/discord-markdown.md']) {
    assert.ok(exists(p), p)
  }
  for (const p of ['docs/research/pen-tool-extras/puzzle-ui-pen-tools.md', 'docs/research/text-anywhere/gdc-notes-vs-text-anywhere.md']) {
    assert.ok(exists(p), p)
  }
})

const glossary = read('GLOSSARY.md')
const sections = glossary.split(/^## /m).slice(1).map((s) => {
  const [title, ...rest] = s.split('\n')
  const entries = rest.filter((l) => l.startsWith('- **')).map((l) => ({ term: l.match(/^- \*\*(.+?)\*\*/)[1], line: l }))
  return { title, entries }
})

test('D6 glossary step 1: sections, alphabetical, the missing entries', () => {
  assert.deepStrictEqual(sections.slice(0, 2).map((s) => s.title), ['Shared', 'SudokuPad'])
  for (const s of sections) {
    const terms = s.entries.map((e) => e.term.toLowerCase())
    assert.deepStrictEqual(terms, [...terms].sort((a, b) => a.localeCompare(b)), `${s.title} is alphabetical`)
  }
  const all = sections.flatMap((s) => s.entries.map((e) => e.term))
  for (const t of ['draft', 'Restore defaults', 'settings entry', 'recording', 'plant', 'mutant', 'crash signal', 'skip line', 'closing test', 'tray', 'handover']) {
    assert.ok(all.some((x) => x.toLowerCase() === t.toLowerCase()), `entry for ${t}`)
  }
  assert.ok(glossary.includes('Called Draw Tool before 0.17.0'))
})

test('D7 glossary step 2: definitions only, behavior on reference pages', () => {
  const long = sections.flatMap((s) => s.entries).filter((e) => e.line.length > 600).map((e) => e.term)
  assert.deepStrictEqual(long, [], 'no entry over 600 characters')
  for (const p of ['docs/shared.md', 'docs/auto-rules-resizer.md', 'docs/color-by-digit.md', 'docs/dark-page.md', 'docs/pen-tool-extras.md', 'docs/text-anywhere.md']) {
    assert.ok(exists(p), p)
  }
  assert.match(read('docs/agents/consistency-survey.md'), /reference pages/)
})

test('D8 the ignore file is grouped by audit with today\'s names', () => {
  const ignore = read('.audit-ignore.md')
  assert.ok((ignore.match(/^## /gm) || []).length >= 2)
  assert.doesNotMatch(ignore, /\.(js|mjs):\d+/, 'no line-number citations')
})

test('D9 the ADRs and out-of-scope records', () => {
  const adrs = fs.readdirSync(path.join(ROOT, 'docs/adr'))
  for (const n of ['0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009']) assert.ok(adrs.some((f) => f.startsWith(n)), n)
  for (const p of ['.out-of-scope/phones-and-tablets.md', '.out-of-scope/sudokupad-dark-mode.md']) {
    assert.ok(exists(p), p)
    assert.ok(agents.includes(p), `AGENTS.md names ${p}`)
  }
})

test('D10 the docs form line', () => {
  assert.match(read('CODING_STANDARDS.md'), /\(Chris, YYYY-MM-DD\)/)
})

test('D11 no § for a function or test block', () => {
  assert.ok(!read('dark-page.user.js').includes('§ at document-start'))
  assert.ok(!read('live/color-by-digit/color-by-digit-polish.live.mjs').includes('§ darkenColor'))
})

test('D12 the dead-pointer test exists', () => {
  assert.ok(exists('test/doc-paths.test.js'))
})
