'use strict'
// Spec #1071's closing check: one pass over the spec's acceptance at the `npm test` seam, which reads the published text.
// Blind to: real SudokuPad (the Framework calls, rendering, undo), Tampermonkey's own view of a header and a link preview in Discord.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { scriptFiles } = require('../sync-lib.js')
const { headerField } = require('./header-version.js')

const ROOT = path.join(__dirname, '..')
const readRoot = name => fs.readFileSync(path.join(ROOT, name), 'utf8')
const readSite = name => readRoot(path.join('site', name))
const PAGES = fs.readdirSync(path.join(ROOT, 'site')).filter(f => f.endsWith('.html') && f !== 'draw-tool.html')
const plain = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const SCRIPTS = scriptFiles(ROOT).filter(f => f !== 'draw-tool.user.js')

test('spec 1071: six SudokuPad scripts are checked', () => {
  assert.equal(SCRIPTS.length, 6)
})

for (const file of SCRIPTS) {
  const source = readRoot(file)
  const name = headerField(source, 'name').replace(/^SudokuPad /, '')
  test(`spec 1071: ${file} has the full header and the plain notice-bar wording`, () => {
    assert.match(headerField(source, 'homepageURL'), /^https:\/\/caneff\.github\.io\/sudokupad-scripts\//)
    assert.equal(headerField(source, 'supportURL'), 'https://github.com/caneff/sudokupad-scripts/issues')
    assert.equal(headerField(source, 'license'), 'MIT')
    assert.doesNotMatch(source, /@sandbox/)
    assert.match(source, /off because SudokuPad changed\./)
    assert.doesNotMatch(source, /off — SudokuPad changed/)
    assert.doesNotMatch(source, /label: '(settings entry|settings dialog|editor|max size settings|dialog overlay|drag highlight|redraw after the puzzle loads)'/)
  })
  test(`spec 1071: ${name}'s @description is its README row and its homepage card's opening`, () => {
    const summary = headerField(source, 'description')
    assert.ok(readRoot('README.md').includes(`| ${name} | ${summary}`), `README row for ${name}`)
    assert.ok(plain(readSite('index.html')).includes(summary), `homepage card for ${name}`)
  })
}

test('spec 1071: the homepage says where settings live, once', () => {
  const home = plain(readSite('index.html'))
  assert.match(home, /Each script's settings are in SudokuPad's settings, in the Experimental group, and every dialog has Restore defaults\./)
  assert.equal(home.split('Restore defaults').length - 1, 1)
})

test('spec 1071: every page has a favicon, a description and the three Open Graph tags; the redirect has lang and canonical', () => {
  for (const page of PAGES) {
    const html = readSite(page)
    for (const re of [/<link rel="icon"/, /<meta name="description"/, /property="og:title"/, /property="og:description"/, /property="og:image"/]) assert.match(html, re, `site/${page}`)
  }
  const redirect = readSite('draw-tool.html')
  assert.match(redirect, /<html lang="en">/)
  assert.match(redirect, /<link rel="canonical"/)
})

test('spec 1071: every details page carries the contact line', () => {
  for (const page of PAGES.filter(p => p !== 'index.html')) assert.match(readSite(page), /<footer>[\s\S]*Message me on Discord[\s\S]*<\/footer>/, `site/${page}`)
})

test("spec 1071: the README follows the homepage's order and says how to reach Chris", () => {
  const readme = readRoot('README.md')
  const rows = [...readme.matchAll(/^\| ([^|]*?) \| .* \| \[Install\]\(/gm)].map(m => m[1])
  const home = readSite('index.html')
  const order = rows.filter(n => home.includes(`<h2>${n}</h2>`) || home.includes(`>${n}</`)).map(n => home.indexOf(`>${n}<`))
  assert.deepEqual(order, [...order].sort((a, b) => a - b))
  assert.match(readme, /Discord/)
})

test('spec 1071: one spelling across the site, the README and the glossary', () => {
  for (const text of [readRoot('README.md'), readRoot('GLOSSARY.md'), ...PAGES.map(p => plain(readSite(p)))]) {
    assert.doesNotMatch(text, /\bgrey\b/i)
    assert.doesNotMatch(text, /\bthe Text tool\b/)
    assert.doesNotMatch(text, /\bright click (on|a|the)\b/i)
  }
})
