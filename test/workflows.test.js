'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { scriptFiles } = require('../sync-lib.js')

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

  it('files a bug and needs-info issue, its body ending with the Blocked by section (#805), when no open issue has exactly the title', () => {
    const r = runScript(['other', 'T and more'])
    assert.equal(r.status, 0)
    assert.equal(r.calls[0].split(' ')[0], 'issue')
    // The fake logs the body's own newlines as extra lines.
    assert.equal(r.calls.slice(1).join('\n'), 'issue create --repo o/r --label bug,needs-info --title T --body B\n\n## Blocked by\n\n- None — can start immediately.')
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

describe('ci.yml (#1027)', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')

  it('starts one run for a push to a pull request: pull_request for any branch, push for main only', () => {
    assert.match(yml, /^on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:\n/m)
  })

  it('cancels a superseded pull-request run and never a run on main, whose every push has a group of its own so none waits behind another to be dropped', () => {
    assert.match(yml, /^concurrency:\n {2}group: ci-\$\{\{ github\.event\.pull_request\.number \|\| github\.sha \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}\n/m)
  })

  it('keeps the job named test, so the check a pull request shows is the same one', () => {
    assert.match(yml, /^jobs:\n {2}test:\n/m)
    assert.doesNotMatch(yml, /^ {4}name:/m)
  })
})

describe('fuzz-pr.yml (#724)', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'fuzz-pr.yml'), 'utf8')

  it('runs on pull requests that change a script or lib/, and on nothing else: not on a change to the fuzz harness alone (#1030)', () => {
    assert.match(yml, /^on:\n {2}pull_request:\n {4}paths:\n/m)
    assert.doesNotMatch(yml, /^ {2}(push|schedule|workflow_dispatch):/m)
    const paths = yml.split('paths:\n')[1].split(/\n(?! {6}- )/)[0].split('\n').map((l) => l.replace(/^ {6}- /, ''))
    const scripts = scriptFiles()
    assert.deepEqual(paths.sort(), [...scripts, 'lib/**'].sort())
  })

  it('fuzzes for 5 minutes with the changed scripts in focus, and files no issue and runs no other live test', () => {
    assert.match(yml, /npm run test:fuzz -- --minutes 5 /)
    assert.match(yml, /changed=\$\(git diff --name-only "origin\/\$BASE_REF\.\.\.HEAD" -- '\*\.user\.js'\)/)
    assert.match(yml, /focus\+=\(--focus "\$\{file%\.user\.js\}"\)/)
    assert.match(yml, /set -o pipefail/, 'without it tee hides the fuzz exit code from the default shell')
    assert.doesNotMatch(yml, /file-issue-once|gh issue/)
    assert.doesNotMatch(yml, /test:tampermonkey|test:live/)
  })

  it('is advisory: it files no issue and its token can only comment on the pull request (#1030)', () => {
    assert.match(yml, /^permissions:\n {2}contents: read\n {2}pull-requests: write\n/m)
    assert.doesNotMatch(yml, /issues: write/)
  })

  it('fails a run with no verdict, through pr-verdict.mjs, and leaves one comment that a later push edits (#1030)', () => {
    assert.match(yml, /- id: verdict\n {8}if: \$\{\{ !cancelled\(\) \}\}\n {8}run: node live\/fuzz\/pr-verdict\.mjs /)
    assert.match(yml, /FUZZ_OUTCOME: \$\{\{ steps\.fuzz\.outcome \}\}/)
    assert.match(yml, /- name: Comment the result on the pull request\n {8}if: \$\{\{ !cancelled\(\) && \(steps\.verdict\.outcome == 'success' \|\| steps\.verdict\.outcome == 'failure'\) && github\.event\.pull_request\.head\.repo\.full_name == github\.repository \}\}/, "a fork's token cannot comment, and a green run edits an earlier red comment")
    assert.match(yml, /elif \[ "\$VERDICT" = failure \]/, 'a green run creates no comment')
    const marker = /export const COMMENT_MARKER = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'live', 'fuzz', 'pr-verdict.mjs'), 'utf8'))[1]
    assert.ok(yml.includes(`startswith("${marker}")`), 'the step looks for the comment by the marker the script writes')
    assert.match(yml, /gh api --method PATCH /)
    assert.match(yml, /gh pr comment /)
  })

  it('puts a failure into the job summary', () => {
    assert.match(yml, />> "\$GITHUB_STEP_SUMMARY"/)
    assert.match(yml, /if: \$\{\{ failure\(\) && steps\.fuzz\.outcome == 'failure' \}\}/)
  })
})

describe('watch.yml (#1026)', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'watch.yml'), 'utf8')

  it('runs the full live suite every night through watch:live, which files the issue and exits 1 when the night is not green', () => {
    assert.match(yml, /schedule:\n {4}- cron: '\d+ \d+ \* \* \*'/)
    assert.match(yml, /- id: watch\n {8}run: npm run watch:live\n/)
    assert.match(yml, /issues: write/)
  })

  it('may read the workflow\'s earlier runs, which is how it sees a skipped night', () => {
    assert.match(yml, /^ {2}actions: read$/m)
  })

  it('keeps nothing between nights: the recording is made again each run, so no Actions cache holds a version or a run time', () => {
    assert.doesNotMatch(yml, /actions\/cache/)
  })

  it('has a time limit under the 6 hours GitHub gives a job, so a hung suite fails the night', () => {
    const minutes = Number(/timeout-minutes: (\d+)/.exec(yml)?.[1])
    assert.ok(minutes > 0 && minutes < 360, `timeout-minutes is ${minutes}`)
  })
})

describe('Node version', () => {
  const dir = path.join(ROOT, '.github', 'workflows')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml'))

  it('lives in .nvmrc alone, as a bare major version', () => {
    assert.match(fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8'), /^\d+\s*$/)
  })

  for (const name of ['ci.yml', 'fuzz-pr.yml', 'fuzz.yml', 'watch.yml']) {
    it(`${name} reads it through node-version-file and pins none of its own`, () => {
      assert.ok(files.includes(name))
      const yml = fs.readFileSync(path.join(dir, name), 'utf8')
      assert.match(yml, /uses: actions\/setup-node@v6\n\s+with:\n\s+node-version-file: \.nvmrc\n/)
      assert.doesNotMatch(yml, /^\s+node-version: /m)
    })
  }

  it('is set up in every workflow that sets up Node', () => {
    for (const f of files) {
      const yml = fs.readFileSync(path.join(dir, f), 'utf8')
      if (/setup-node/.test(yml)) assert.match(yml, /node-version-file: \.nvmrc/, f)
    }
  })
})
