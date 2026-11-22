// Closing check of spec #1073 (tests, harness and CI): one pass over the spec's acceptance, read from the repo.
// Seam: `npm test`. Blind to: real SudokuPad (the Framework calls, rendering, undo) and to GitHub Actions itself;
// a green run here does not show that a workflow runs, only that its file says what the spec decided.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))

test('spec 1073: every workflow that runs a job has a time limit', () => {
  for (const name of ['ci', 'watch', 'pages', 'fuzz', 'fuzz-pr']) {
    assert.match(read(`.github/workflows/${name}.yml`), /timeout-minutes: \d+/, name)
  }
})

test('spec 1073: every npm script that starts a browser has a test timeout', () => {
  const { scripts } = JSON.parse(read('package.json'))
  for (const name of ['test:live:files', 'test:fuzz:smoke', 'test:tampermonkey']) {
    assert.match(scripts[name], /--test-timeout=\d+/, name)
  }
})

test('spec 1073: one composite setup action, used by the four workflows that set up Node and npm', () => {
  const action = read('.github/actions/setup-repo/action.yml')
  assert.match(action, /using: composite/)
  assert.match(action, /node-version-file: \.nvmrc/)
  assert.match(action, /npm ci/)
  assert.match(action, /playwright install/)
  for (const name of ['ci', 'watch', 'fuzz', 'fuzz-pr']) {
    const workflow = read(`.github/workflows/${name}.yml`)
    assert.match(workflow, /uses: \.\/\.github\/actions\/setup-repo/, name)
    assert.doesNotMatch(workflow, /run: npm ci/, name)
  }
})

test('spec 1073: the PR fuzz runs the smoke test and triggers on the lockfile and the setup action', () => {
  const workflow = read('.github/workflows/fuzz-pr.yml')
  assert.match(workflow, /npm run test:fuzz:smoke/)
  assert.match(workflow, /- package-lock\.json/)
  assert.match(workflow, /- \.github\/actions\/setup-repo\/\*\*/)
  assert.match(read('live/README.md'), /test:fuzz:smoke/)
})

test('spec 1073: package.json declares the Node it needs', () => {
  assert.ok(JSON.parse(read('package.json')).engines.node)
})

test('spec 1073: the standing rules have one test named for them', () => {
  assert.ok(exists('test/repo-conventions.test.mjs'))
  assert.ok(exists('test/broken-sudokupad.js'))
  assert.ok(!exists('test/specs'))
})

test('spec 1073: the attack suites share the attacks-* prefix and the harness suites are named as harness tests', () => {
  const live = fs.readdirSync(path.join(root, 'live'))
  for (const file of ['attacks-sudokupad.live.mjs', 'attacks-script-clash.live.mjs', 'attacks-replay.live.mjs',
    'harness-settings-dialog.live.mjs', 'harness-page-errors.live.mjs', 'all-scripts.mjs', 'issues.mjs']) {
    assert.ok(live.includes(file), file)
  }
  for (const file of ['sudokupad-attacks.live.mjs', 'script-clash-attacks.live.mjs', 'replay-playback.live.mjs']) {
    assert.ok(!live.includes(file), file)
  }
  assert.doesNotMatch(read('live/watch.mjs'), /gh issue create/)
})

test('spec 1073: attack 76 names one case; the storage case is attack 79', () => {
  const storage = read('live/attacks-storage.live.mjs')
  assert.match(storage, /attack 79: Copy settings with a blocked storage/)
  assert.doesNotMatch(storage, /attack 76/)
})

test('spec 1073: @version is read by one module that the sync tool shares', () => {
  assert.ok(exists('userscript-header.js'))
  const sync = read('sync-lib.js')
  assert.match(sync, /require\('\.\/userscript-header\.js'\)/)
  assert.doesNotMatch(sync, /\/\/ @version\\s\+\)/)
})

test('spec 1073: AGENTS.md writes down the module formats and points to the fuzz section', () => {
  const agents = read('AGENTS.md')
  assert.match(agents, /\*\*Module formats\*\*: CommonJS at the root, in `lib\/` and in `test\/`/)
  assert.match(agents, /live\/README\.md` § The fuzz/)
})
