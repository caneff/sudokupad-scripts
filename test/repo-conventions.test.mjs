import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SETTINGS_SCRIPTS } from '../live/scripts.mjs'
import { filesUnder, read, ROOT } from './repo-files.mjs'

// The repo's conventions, each a rule that guarded later work in the closing tests of specs 334, 449, 685, 688, 834 and 835 (retired in #1029) and of spec 1074, read off the
// tree as text. Blind to real SudokuPad: that the suites and scripts still work there is `npm run test:live`'s to show.
const require = createRequire(import.meta.url)
const { fakeStore } = require('./fake-store.js')
const { scriptFiles, withoutLibBlocks } = require('../sync-lib.js')
// The lines of `files` a pattern matches, as `file:line`.
const hits = (files, pattern) => files.flatMap((file) => read(file).split('\n').flatMap((text, index) => (pattern.test(text) ? [`${file}:${index + 1}`] : [])))
const liveFiles = filesUnder('live', /\.m?js$/)
const liveSuites = liveFiles.filter((file) => file.endsWith('.live.mjs'))

test('no live suite sets a phone-size viewport or SudokuPad\'s own dark mode', () => {
  assert.ok(liveSuites.length > 30, `${liveSuites.length} live suites are read`)
  assert.deepEqual(hits(liveSuites, /\b390\b/), [])
  assert.deepEqual(hits(liveSuites, /setting-darkmode/), [])
})

test('no live suite launches Chromium itself: live/session.mjs does', () => {
  assert.deepEqual(hits(liveSuites, /\bchromium\s*\.\s*launch/), [])
  assert.ok(hits(['live/session.mjs'], /\bchromium\s*\.\s*launch/).length > 0, 'session.mjs launches it')
})

test('no unit test builds a store that reads undefined for a missing key, and the shared fake store reads null', () => {
  const tests = filesUnder('test', /\.m?js$/).filter((file) => file !== 'test/repo-conventions.test.mjs')
  assert.ok(tests.length > 30, `${tests.length} test files are read`)
  // `getData: (key) => saved[key]`, a lookup with nothing after it to turn a missing key into null.
  assert.deepEqual(hits(tests, /getData\s*:\s*\(?\w+\)?\s*=>\s*[\w.]+\[\w+\]\s*(,|\}|$)/), [])
  assert.equal(fakeStore({}).getData('missing'), null)
  assert.equal(fakeStore({ kept: 0 }).getData('kept'), 0)
})

test('every shared module has a test, and it loads the module through the one loader', () => {
  const modules = readdirSync(new URL('lib/', ROOT)).filter((file) => file.endsWith('.js') && !file.endsWith('.test.js'))
  assert.ok(modules.length > 10, `${modules.length} shared modules are read`)
  for (const file of modules) {
    const testFile = `lib/${file.replace(/\.js$/, '.test.js')}`
    assert.ok(existsSync(new URL(testFile, ROOT)), `${testFile} is missing`)
    assert.match(read(testFile), /require\('\.\.\/test\/load-lib\.js'\)/, `${testFile} loads through test/load-lib.js`)
    assert.doesNotMatch(read(testFile), /new Function/, testFile)
  }
})

test('every script that copies in lib:settings-dialog has a record in the live settings table, and the three dialog suites loop over the table', () => {
  const copying = scriptFiles().filter((file) => read(file).includes('// <lib:settings-dialog>'))
  assert.ok(copying.includes('ui-tweaks.user.js'), 'UI Tweaks has a settings dialog')
  assert.deepEqual(copying.filter((file) => !SETTINGS_SCRIPTS.some((record) => record.file === file)), [])
  for (const suite of ['settings-shell', 'settings-copy-paste', 'attacks-storage']) {
    const text = read(`live/${suite}.live.mjs`)
    assert.match(text, /SETTINGS_SCRIPTS/, `${suite} loops over the records`)
    assert.doesNotMatch(text, /for \(const [^)]*\) of \[\s*\{/, `${suite} types no table of its own`)
  }
})

test('no shared live module imports from a script\'s folder', () => {
  const shared = readdirSync(new URL('live/', ROOT)).filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs') && !name.endsWith('.live.mjs'))
  assert.ok(shared.length > 10, `${shared.length} shared live modules are read`)
  const importing = shared.map((name) => `live/${name}`).filter((file) => /from\s+'\.\/(?!fuzz\/)[\w-]+\//.test(read(file)))
  assert.deepEqual(importing, [])
})

test('every script declares its features through the shared guard', () => {
  const scripts = scriptFiles()
  assert.equal(scripts.length, 6, scripts.join(', '))
  for (const file of scripts) {
    const source = read(file)
    assert.match(source, /\/\/ <lib:sudokupad>/, file)
    assert.match(withoutLibBlocks(source), /createGuard\(\{ script: SCRIPT_ID, [^\n]*features: FEATURES \}\)/, file)
  }
})

test('the tests read the script list from the sync tool, and the contract test loops over it', () => {
  const tests = filesUnder('test', /\.test\.m?js$/).filter((file) => !['test/sync-lib.test.js', 'test/repo-conventions.test.mjs'].includes(file))
  assert.ok(tests.length > 30, `${tests.length} test files are read`)
  // A listing of the root by extension, or a regex over the lib block markers, is the tool's grammar written again. A pattern for `@version` is
  // test/userscript-header.test.js's to catch.
  assert.deepEqual(hits(tests, /endsWith\('\.user\.js'\)|<lib:\(/), [])
  assert.match(read('test/script-contract.test.js'), /for \(const \w+ of scriptFiles\(\)\)|scriptFiles\(\)\.(map|forEach|filter)/)
})

test('the helpers for a broken SudokuPad sit in the unit tests\' folder, not a specs folder', () => {
  assert.ok(existsSync(new URL('test/broken-sudokupad.js', ROOT)))
  assert.equal(existsSync(new URL('test/specs/', ROOT)), false)
  assert.deepEqual(hits(filesUnder('test', /\.m?js$/).filter((file) => file !== 'test/repo-conventions.test.mjs'), /specs\/broken-sudokupad/), [])
})

// The repo lives at chinstrap45 (#1055). Pages answers 404 at the caneff host, and a caneff raw address works only while no
// repo is made there. The frozen handover and the dated research notes keep it; each other line that may is named.
test('no tracked text names the caneff repo or Pages host, but the lines that must', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: fileURLToPath(ROOT), encoding: 'utf8' }).split('\n')
    .filter((file) => /\.(?:m?js|md|html|json|ya?ml|txt|css|toml)$/.test(file) && !['draw-tool.user.js', 'test/repo-conventions.test.mjs'].includes(file) && !file.startsWith('docs/research/'))
  const kept = /^\/\/ @namespace {4}https:\/\/github\.com\/caneff\/sudokupad-scripts$|^const (?:CANEFF_RAW|LAST_OLD_COPY) = |'namespace'\), 'https:\/\/github\.com\/caneff\/sudokupad-scripts'\)$/
  const named = hits(tracked, /caneff\\?\/sudokupad-scripts|caneff\\?\.github\\?\.io/).filter((at) => {
    const [file, line] = at.split(':')
    return !kept.test(read(file).split('\n')[line - 1].trim())
  })
  assert.deepEqual(named, [])
})

// A Markdown list's items, each with its wrapped continuation lines joined on.
const listItems = (text) => text.split('\n').reduce((items, line) => {
  if (line.startsWith('- ')) items.push(line)
  else if (items.length && /^\s+\S/.test(line)) items[items.length - 1] += ` ${line.trim()}`
  else if (line.trim() === '' || line.startsWith('#')) items.push(null)
  return items
}, []).filter(Boolean)

test('the research index gives every note under docs/research/ a line of its own', () => {
  const ownLines = new Set(listItems(read('docs/research/README.md')).map((item) => item.match(/^- `([^`]+)`/)?.[1]))
  const notes = filesUnder('docs/research', /\.md$/).filter((file) => file !== 'docs/research/README.md')
  assert.ok(notes.length > 50, `${notes.length} notes are read`)
  assert.deepEqual(notes.filter((note) => !ownLines.has(note)), [])
})

// Each glossary entry is a definition of one or two sentences (spec #1074), with behavior on the reference pages; 600 characters is the ceiling such an entry stays under.
test('GLOSSARY.md opens with Shared and SudokuPad, each section is in alphabetical order, and no entry runs past 600 characters', () => {
  const sections = read('GLOSSARY.md').split(/^## /m).slice(1).map((text) => {
    const [title, ...lines] = text.split('\n')
    const entries = listItems(lines.join('\n')).filter((item) => item.startsWith('- **'))
    return { title, entries, terms: entries.map((entry) => entry.match(/^- \*\*(.+?)\*\*/)[1].toLowerCase()) }
  })
  assert.deepEqual(sections.slice(0, 2).map((section) => section.title), ['Shared', 'SudokuPad'])
  for (const { title, terms } of sections) assert.deepEqual(terms, [...terms].sort((a, b) => a.localeCompare(b)), `${title} is alphabetical`)
  assert.deepEqual(sections.flatMap((section) => section.entries).filter((entry) => entry.length > 600), [])
})

test('.audit-ignore.md cites a test by its title, never a line number', () => {
  assert.deepEqual(hits(['.audit-ignore.md'], /\.m?js:\d+/), [])
})

test('the research index\'s do-not-move list is exactly the research pictures the site and the README link', () => {
  const pages = ['README.md', ...filesUnder('site', /\.(html|json|css|js)$/)]
  const linked = new Set(pages.flatMap((file) => read(file).match(/docs\/research\/[\w./-]+?\.(?:png|webp|jpg|gif|svg)/g) ?? []))
  const section = read('docs/research/README.md').split('## Published pictures: do not move')[1].split(/^## /m)[0]
  const listed = new Set(listItems(section).map((item) => item.match(/^- `([^`]+)`/)?.[1]).filter(Boolean))
  assert.ok(linked.size > 30, `${linked.size} linked pictures are read`)
  assert.deepEqual([...linked].filter((picture) => !listed.has(picture)), [], 'linked but not listed')
  assert.deepEqual([...listed].filter((picture) => !linked.has(picture)), [], 'listed but not linked')
})
