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

const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows')
const read = (name) => fs.readFileSync(path.join(WORKFLOW_DIR, name), 'utf8')
const workflowFiles = fs.readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.yml'))
const SETUP_ACTION = './.github/actions/setup-repo'

// The text of one top-level key's block (`on`, `concurrency`, `jobs`), up to the next top-level key.
function section (yml, key) {
  const m = new RegExp(`^${key}:.*\\n(?:(?: .*| *#.*)?\\n)*`, 'm').exec(yml)
  assert.ok(m, `no top-level ${key}`)
  return m[0]
}
// A job's block, and a job's steps, as text blocks. The files hold no flow-style steps, so a line starting `      - ` begins one.
function jobs (yml) {
  const body = section(yml, 'jobs')
  return body.split(/\n(?= {2}\w[\w-]*:\n)/).slice(1).map((block) => ({ name: /^\s*(\S+):/.exec(block)[1], block }))
}
function steps (jobBlock) {
  return jobBlock.split(/\n(?= {6}- )/).slice(1)
}
const stepWith = (yml, needle) => {
  const found = jobs(yml).flatMap((j) => steps(j.block)).filter((s) => s.includes(needle))
  assert.equal(found.length, 1, `exactly one step with ${needle}`)
  return found[0]
}
const cancelInProgress = (yml) => /^ {2}cancel-in-progress: (.+)$/m.exec(section(yml, 'concurrency'))?.[1]

describe('every workflow', () => {
  for (const name of workflowFiles) {
    it(`${name}: every job has a time limit under the 6 hours GitHub gives a job, so a hung run fails`, () => {
      const all = jobs(read(name))
      assert.ok(all.length > 0)
      for (const { name: job, block } of all) {
        const minutes = Number(/^ {4}timeout-minutes: (\d+)$/m.exec(block)?.[1])
        assert.ok(minutes > 0 && minutes < 360, `${name} job ${job}: timeout-minutes is ${minutes}`)
      }
    })
  }
})

describe('the setup action', () => {
  const dir = path.join(ROOT, '.github', 'actions', 'setup-repo')
  const action = fs.readFileSync(path.join(dir, 'action.yml'), 'utf8')

  it('is composite and sets up Node from .nvmrc alone, a bare major version, pinning none of its own', () => {
    assert.match(fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8'), /^\d+\s*$/)
    assert.match(action, /^ {2}using: composite$/m)
    assert.match(action, /uses: actions\/setup-node@v6\n\s+with:\n\s+node-version-file: \.nvmrc\n/)
    assert.doesNotMatch(action, /^\s+node-version: /m)
  })

  it('installs the packages with npm ci, and Chromium only when asked, so the CI job stays browserless', () => {
    assert.match(action, /run: npm ci$/m)
    assert.match(action, /inputs:\n {2}playwright:\n(?: {4}.*\n)*? {4}default: 'false'/)
    const chromium = action.split(/\n(?= {4}- )/).find((s) => s.includes('playwright install'))
    assert.ok(chromium, 'a Playwright install step')
    assert.match(chromium, /npx playwright install --with-deps chromium/)
    assert.match(chromium, /if: \$\{\{ inputs\.playwright == 'true' \}\}/)
  })

  const USERS = { 'ci.yml': false, 'fuzz-pr.yml': true, 'fuzz.yml': true, 'watch.yml': true }
  for (const [name, playwright] of Object.entries(USERS)) {
    it(`${name} sets up through the action after its checkout, and repeats none of it${playwright ? ', asking for Chromium' : ', without Chromium'}`, () => {
      const yml = read(name)
      const setup = stepWith(yml, `uses: ${SETUP_ACTION}`)
      assert.equal(/playwright: '?true'?/.test(setup), playwright)
      const all = jobs(yml).flatMap((j) => steps(j.block))
      assert.ok(all.findIndex((s) => s.includes('actions/checkout@')) < all.findIndex((s) => s.includes(SETUP_ACTION)), 'a local action exists only after the checkout')
      assert.doesNotMatch(yml, /^\s*(- )?(uses|run): .*(setup-node|npm ci|playwright install)/m)
    })
  }
})

describe('ci.yml (#1027)', () => {
  const yml = read('ci.yml')

  it('starts one run for a push to a pull request: pull_request for any branch, push for main only', () => {
    const on = section(yml, 'on')
    assert.match(on, /^ {2}push:\n {4}branches: \[main\]$/m)
    assert.match(on, /^ {2}pull_request:/m)
  })

  it('cancels a superseded pull-request run and never a run on main, whose every push has a group of its own so none waits behind another to be dropped', () => {
    const concurrency = section(yml, 'concurrency')
    assert.match(concurrency, /group: .*pull_request\.number.*github\.sha/)
    assert.match(cancelInProgress(yml), /github\.event_name == 'pull_request'/)
  })

  it('keeps the job named test, so the check a pull request shows is the same one', () => {
    assert.deepEqual(jobs(yml).map((j) => j.name), ['test'])
    assert.doesNotMatch(jobs(yml)[0].block, /^ {4}name:/m)
  })

  it('has the history, for the version-bump test', () => {
    assert.match(stepWith(yml, 'actions/checkout@'), /fetch-depth: 0/)
  })

  it('runs the tests, and runs the lint even when a test fails', () => {
    assert.match(stepWith(yml, 'run: npm test'), /^ {6}- run: npm test$/m)
    const lint = stepWith(yml, 'run: npm run lint')
    assert.match(lint, /if: \$\{\{ !cancelled\(\) \}\}|if: \$\{\{ always\(\) \}\}/)
  })
})

describe('fuzz-pr.yml (#724)', () => {
  const yml = read('fuzz-pr.yml')
  const paths = () => section(yml, 'on').split('paths:\n')[1].split('\n').map((l) => /^ {6}- (.+)$/.exec(l)?.[1]).filter(Boolean)
  const covered = (file) => paths().some((p) => p === file || (p.endsWith('/**') && file.startsWith(p.slice(0, -2))))

  it('runs on pull requests only, and files no other trigger', () => {
    assert.match(section(yml, 'on'), /^ {2}pull_request:\n {4}paths:\n/m)
    assert.doesNotMatch(section(yml, 'on'), /^ {2}(push|schedule|workflow_dispatch):/m)
  })

  it('runs on a change to a script, lib/, the fuzz harness or the lockfile (a new Playwright is a new Chromium)', () => {
    for (const file of [...scriptFiles(), 'lib/sudokupad.js', 'live/fuzz/fuzz.mjs', 'package-lock.json']) assert.ok(covered(file), file)
    assert.ok(!covered('draw-tool.user.js'), 'the frozen handover is not fuzzed')
  })

  it('runs on a change to any module the fuzz imports from outside live/fuzz/, found by following its imports', () => {
    const seen = new Set()
    const queue = fs.readdirSync(path.join(ROOT, 'live', 'fuzz')).filter((f) => f.endsWith('.mjs')).map((f) => `live/fuzz/${f}`)
    while (queue.length) {
      const file = queue.pop()
      if (seen.has(file)) continue
      seen.add(file)
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8')
      for (const m of source.matchAll(/(?:from|import\(|require\()\s*'(\.[^']+)'/g)) {
        const target = path.relative(ROOT, path.join(ROOT, path.dirname(file), m[1])).split(path.sep).join('/')
        if (fs.existsSync(path.join(ROOT, target)) && fs.statSync(path.join(ROOT, target)).isFile()) queue.push(target)
      }
    }
    const outside = [...seen].filter((f) => !f.startsWith('live/fuzz/'))
    assert.ok(outside.includes('live/session.mjs') && outside.includes('sync-lib.js'), 'the walk reached the shared modules')
    for (const file of outside) assert.ok(covered(file), `${file} is imported by the fuzz and no path of fuzz-pr.yml covers it`)
  })

  it('fuzzes for 5 minutes with the changed scripts in focus, and files no issue and runs no other live test', () => {
    const fuzz = stepWith(yml, 'npm run test:fuzz -- --minutes')
    assert.match(fuzz, /npm run test:fuzz -- --minutes 5 /)
    assert.match(fuzz, /git diff --name-only "origin\/\$BASE_REF\.\.\.HEAD" -- '\*\.user\.js'/)
    assert.match(fuzz, /--focus/)
    assert.match(fuzz, /set -o pipefail/, 'without it tee hides the fuzz exit code from the default shell')
    assert.doesNotMatch(yml, /file-issue-once|gh issue/)
    assert.doesNotMatch(yml, /test:tampermonkey|test:live/)
  })

  it('runs the smoke test when the fuzz harness changed against the base, and not otherwise', () => {
    const smoke = stepWith(yml, 'run: npm run test:fuzz:smoke')
    assert.match(smoke, /if: .*steps\.\w+\.outputs\.\w+ == 'true'/)
    const detect = stepWith(yml, '-- live/fuzz')
    assert.match(detect, /git diff --name-only "origin\/\$BASE_REF\.\.\.HEAD" -- live\/fuzz/)
    assert.match(detect, /GITHUB_OUTPUT/)
    const outputName = /steps\.(\w+)\.outputs\.(\w+) == 'true'/.exec(smoke)
    assert.ok(detect.includes(`id: ${outputName[1]}`), 'the smoke step reads the detecting step')
    assert.ok(detect.includes(`${outputName[2]}=`), 'the detecting step writes the output the smoke step reads')
  })

  it('is advisory: it files no issue and its token can only comment on the pull request (#1030)', () => {
    assert.match(yml, /^permissions:\n {2}contents: read\n {2}pull-requests: write\n/m)
    assert.doesNotMatch(yml, /issues: write/)
  })

  it('cancels a superseded run, since the run on the old head is worthless', () => {
    assert.equal(cancelInProgress(yml), 'true')
  })

  it('fails a run with no verdict, through pr-verdict.mjs, and leaves one comment that a later push edits (#1030)', () => {
    const verdict = stepWith(yml, 'run: node live/fuzz/pr-verdict.mjs')
    assert.match(verdict, /if: \$\{\{ !cancelled\(\) \}\}/)
    assert.match(verdict, /FUZZ_OUTCOME: \$\{\{ steps\.fuzz\.outcome \}\}/)
    const comment = stepWith(yml, 'Comment the result on the pull request')
    assert.match(comment, /if: .*!cancelled\(\).*steps\.verdict\.outcome == 'success'.*steps\.verdict\.outcome == 'failure'.*head\.repo\.full_name == github\.repository/, "a fork's token cannot comment, and a green run edits an earlier red comment")
    assert.match(comment, /elif \[ "\$VERDICT" = failure \]/, 'a green run creates no comment')
    const marker = /export const COMMENT_MARKER = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'live', 'fuzz', 'pr-verdict.mjs'), 'utf8'))[1]
    assert.ok(comment.includes(`startswith("${marker}")`), 'the step looks for the comment by the marker the script writes')
    assert.match(comment, /gh api --method PATCH /)
    assert.match(comment, /gh pr comment /)
  })

  it('puts a failure into the job summary', () => {
    const summary = stepWith(yml, 'GITHUB_STEP_SUMMARY')
    assert.match(summary, /if: \$\{\{ failure\(\) && steps\.fuzz\.outcome == 'failure' \}\}/)
  })
})

describe('fuzz.yml: the nightly fuzz', () => {
  it('never cancels a run in progress, so no two runs overlap and none is dropped', () => {
    assert.equal(cancelInProgress(read('fuzz.yml')), 'false')
  })
})

describe('watch.yml (#1026)', () => {
  const yml = read('watch.yml')

  it('runs the full live suite every night through watch:live, which files the issue and exits 1 when the night is not green', () => {
    assert.match(section(yml, 'on'), /schedule:\n {4}- cron: '\d+ \d+ \* \* \*'/)
    assert.match(stepWith(yml, 'run: npm run watch:live'), /id: watch/)
    assert.match(section(yml, 'permissions'), /issues: write/)
  })

  it("may read the workflow's earlier runs, which is how it sees a skipped night", () => {
    assert.match(section(yml, 'permissions'), /^ {2}actions: read$/m)
  })

  it('never cancels a run in progress, so two nights do not each file the bug', () => {
    assert.equal(cancelInProgress(yml), 'false')
  })

  it('keeps nothing between nights: the recording is made again each run, so no Actions cache holds a version or a run time', () => {
    assert.doesNotMatch(yml, /actions\/cache/)
  })
})
