'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const DOCS = ['AGENTS.md', ...fs.readdirSync(path.join(ROOT, 'docs/agents')).map((name) => `docs/agents/${name}`), 'docs/research/README.md']
const KNOWN_EXTENSIONS = /\.(md|js|mjs|json|jsonl|png|webp|html|yml|yaml|py|sh|replay)$/
// A code span names a repo path when it has a slash or ends in a known extension, and holds no space, placeholder, glob or protocol.
const IS_PATH = /^[\w.+@-]+(\/[\w.+@-]+)*\/?$/
const NOT_REPO = /^(\.scratch\/|node_modules\/|origin\/|\.claude\/|\.git\/|\.\w+$)/
// Named in the docs and not in this repo: the GitHub repo's own name and a skill's file in the agent-skills repo.
const OTHER_REPOS = ['caneff/sudokupad-scripts', 'implement/SKILL.md']

// The repo paths a Markdown text names in code spans, with a trailing `:line` or `§ section` dropped.
function namedPaths (text) {
  const spans = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim().replace(/(:\d+(-\d+)?)$/, ''))
  return spans.filter((span) => IS_PATH.test(span) && !NOT_REPO.test(span) && !OTHER_REPOS.includes(span) && (span.includes('/') || KNOWN_EXTENSIONS.test(span)))
}

// The named paths no `exists` call finds.
const deadPaths = (text, exists) => [...new Set(namedPaths(text))].filter((name) => !exists(name))

describe('deadPaths', () => {
  const only = (...names) => (name) => names.includes(name)
  it('reports a path that is not there and not one that is', () => {
    assert.deepEqual(deadPaths('See `docs/a.md` and `docs/gone.md`.', only('docs/a.md')), ['docs/gone.md'])
  })
  it('skips placeholders, globs, words, protocols and scratch space', () => {
    assert.deepEqual(deadPaths('`docs/research/<script name>/` `*.user.js` `npm test` `https://x.y/z` `.scratch/p.mjs` `origin/main` `GLOSSARY`', only()), [])
  })
  it('drops a line number from the span', () => {
    assert.deepEqual(deadPaths('`sync-lib.js:136`', only('sync-lib.js')), [])
  })
})

describe('the docs that name repo paths', () => {
  for (const file of DOCS) {
    it(`${file} names only paths that exist`, () => {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
      if (['AGENTS.md', 'docs/research/README.md'].includes(file)) assert.ok(namedPaths(text).length > 20, `${file} names few paths, so the check reads nothing`)
      assert.deepEqual(deadPaths(text, (name) => fs.existsSync(path.join(ROOT, name))), [])
    })
  }
})
