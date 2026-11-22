'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const DOCS = ['AGENTS.md', ...fs.readdirSync(path.join(ROOT, 'docs/agents')).map((name) => `docs/agents/${name}`), 'docs/research/README.md']
const KNOWN_EXTENSIONS = /\.(md|js|mjs|json|jsonl|png|webp|html|yml|yaml|py|sh|replay|toml)$/
// A code span names a repo path when it has a slash or ends in a known extension, and holds no space, placeholder, glob or protocol.
const IS_PATH = /^[\w.+@-]+(\/[\w.+@-]+)*\/?$/
const NOT_REPO = /^(\.scratch\/|node_modules\/|origin\/|\.claude\/|\.git\/|\.\.?\/|\.\w+$)/
// Named in the docs and not in this repo: the GitHub repo's own name and a skill's file in the agent-skills repo.
const OTHER_REPOS = ['caneff/sudokupad-scripts', 'implement/SKILL.md']

// The repo paths a Markdown text names in code spans, with a trailing `:line` or ` § section` dropped.
function namedPaths (text) {
  const spans = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim().replace(/ § .*$/, '').replace(/(:\d+(-\d+)?)$/, ''))
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
  it('drops a line number or a section from the span and checks the path', () => {
    assert.deepEqual(namedPaths('`sync-lib.js:136` `live/README.md § The fuzz run`'), ['sync-lib.js', 'live/README.md'])
  })
  it('skips a relative example', () => {
    assert.deepEqual(namedPaths('`./x.mjs` `../sync-lib.js`'), [])
  })
  it('reads a bare root file with a .toml extension', () => {
    assert.deepEqual(namedPaths('`netlify.toml`'), ['netlify.toml'])
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

// live/README.md names its own folder's files both from the repo root (`live/board.mjs`) and from `live/` (`fuzz/engine.mjs`), and bare file
// names inside a section about one folder; a path with a slash is checked from either root, and a bare name is not checked.
describe('live/README.md', () => {
  it('names only paths that exist, from the repo root or from live/', () => {
    const text = fs.readFileSync(path.join(ROOT, 'live/README.md'), 'utf8')
    const withSlash = namedPaths(text).filter((name) => name.includes('/'))
    assert.ok(withSlash.length > 20, 'live/README.md names few paths, so the check reads nothing')
    assert.deepEqual(deadPaths(withSlash.map((name) => `\`${name}\``).join(' '), (name) => ['', 'live'].some((dir) => fs.existsSync(path.join(ROOT, dir, name)))), [])
  })
})
