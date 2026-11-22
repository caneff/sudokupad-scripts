'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { rewritePages } = require('../site-pages.js')

test('rewritePages writes back only a page whose text changed, skips other files, and names the page of each problem', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-pages-'))
  try {
    fs.writeFileSync(path.join(dir, 'a.html'), 'old')
    fs.writeFileSync(path.join(dir, 'b.html'), 'same')
    fs.writeFileSync(path.join(dir, 'c.txt'), 'old')
    const problems = rewritePages(dir, html => ({ text: html === 'old' ? 'new' : html, problems: html === 'same' ? ['odd'] : [] }))
    assert.deepEqual(problems, ['b.html: odd'])
    assert.deepEqual(['a.html', 'b.html', 'c.txt'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')), ['new', 'same', 'old'])
  } finally {
    fs.rmSync(dir, { recursive: true })
  }
})
