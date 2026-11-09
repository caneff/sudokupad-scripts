'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, readdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const ROOT = join(__dirname, '..', '..')

const read = (file) => readFileSync(join(ROOT, file), 'utf8')

// Spec 132's acceptance at `npm test`: the agent docs point only at files that exist. It pins no sentence of the docs, so it is blind
// to whether a `gh` command in them still runs, and to real SudokuPad, whose recording `live/README.md` describes.
test('the agent docs link only files that exist', () => {
  const domain = read('docs/agents/domain.md')
  for (const path of ['GLOSSARY.md', 'docs/adr/0001-live-tests-type-storage-keys.md']) {
    assert.ok(domain.includes(path.split('/').pop()), path)
    assert.ok(existsSync(join(ROOT, path)), path)
  }
  for (const doc of [...readdirSync(join(ROOT, 'docs/agents')).map((file) => `docs/agents/${file}`), 'live/README.md', 'AGENTS.md']) {
    for (const [, target] of read(doc).matchAll(/\]\(([^)#\s]+\.md)\)/g)) {
      if (/^https?:/.test(target)) continue
      const base = doc.includes('/') ? doc.slice(0, doc.lastIndexOf('/')) : '.'
      assert.ok(existsSync(join(ROOT, base, target)), `${doc} links ${target}`)
    }
  }
})
