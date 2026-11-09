'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const SCRIPT = path.join(ROOT, '.github', 'actions', 'file-issue-once', 'file-issue-once.sh')
// Each workflow's filing steps, by title: a step swapped for something else must fail here.
const WORKFLOWS = {
  'watch.yml': ['Watch did not run: the live suite could not be checked', 'Tampermonkey test fails: a script does not install or run in real Tampermonkey'],
  'fuzz.yml': ['Fuzz did not run: the nightly fuzz could not be checked']
}

// A fake `gh` that logs its arguments and answers `issue list` with the given titles, or fails it when FAIL_LIST is set.
function runScript (openTitles, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-issue-once-'))
  try {
    const log = path.join(dir, 'calls.log')
    const gh = path.join(dir, 'gh')
    fs.writeFileSync(gh, '#!/bin/sh\necho "$*" >> "$CALLS"\nif [ "$2" = list ]; then [ -z "$FAIL_LIST" ] || exit 1; printf \'%s\\n\' "$OPEN"; fi\n', { mode: 0o755 })
    const r = spawnSync('bash', [SCRIPT], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, CALLS: log, OPEN: openTitles.join('\n'), GITHUB_REPOSITORY: 'o/r', TITLE: 'T', BODY: 'B', ...env },
      encoding: 'utf8'
    })
    const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []
    return { status: r.status, calls }
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

describe('file-issue-once.sh', () => {
  it('files nothing when an open issue has exactly the title', () => {
    const r = runScript(['other', 'T'])
    assert.equal(r.status, 0)
    assert.equal(r.calls.length, 1)
    assert.match(r.calls[0], /^issue list /)
  })

  it('files a bug issue when no open issue has exactly the title', () => {
    const r = runScript(['other', 'T and more'])
    assert.equal(r.status, 0)
    assert.equal(r.calls.length, 2)
    assert.equal(r.calls[1], 'issue create --repo o/r --label bug --title T --body B')
  })

  it('fails when the list fails, rather than filing a possible duplicate blind', () => {
    const r = runScript([], { FAIL_LIST: '1' })
    assert.notEqual(r.status, 0)
    assert.equal(r.calls.length, 1)
    assert.match(r.calls[0], /^issue list /)
  })
})

describe('the workflows', () => {
  for (const [name, titles] of Object.entries(WORKFLOWS)) {
    it(`${name} files each of its issues through the shared action and holds no copy of the block`, () => {
      const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8')
      assert.equal(yml.split('uses: ./.github/actions/file-issue-once').length - 1, titles.length)
      for (const title of titles) assert.ok(yml.includes(`title: '${title}'`), title)
      assert.doesNotMatch(yml, /gh issue (create|list)/)
    })
  }
})
