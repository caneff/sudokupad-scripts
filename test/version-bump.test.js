'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { headerVersion } = require('./header-version.js')

const ROOT = path.join(__dirname, '..')
const BASE_REF = 'origin/main'

// A version's three numbers. Throws on any other shape, so an unreadable version fails the check instead of passing it.
function parseVersion (version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`@version "${version}" is not X.Y.Z`)
  return version.split('.').map(Number)
}

// Positive when `a` is a higher version than `b`.
function compareVersions (a, b) {
  const [pa, pb] = [parseVersion(a), parseVersion(b)]
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

// One message per script this branch changed since the merge base whose @version is not above the one on `baseRef`.
// `current`, `mergeBase` and `tip` each take a file name and return its text there, or null when the file does not exist there.
function versionProblems (files, { current, mergeBase, tip }, baseRef) {
  const problems = []
  for (const file of files) {
    const [now, forked, onTip] = [current(file), mergeBase(file), tip(file)]
    if (now === null || forked === null || onTip === null || now === forked) continue
    const [nowVersion, tipVersion] = [headerVersion(now), headerVersion(onTip)]
    if (compareVersions(nowVersion, tipVersion) <= 0) problems.push(`${file} changed but @version ${nowVersion} is not above ${baseRef}'s ${tipVersion}`)
  }
  return problems
}

describe('versionProblems', () => {
  const src = (version, body = '') => `// @version      ${version}\n${body}`
  const at = (text) => (file) => text === null ? null : text
  const check = ({ current, mergeBase, tip }) => versionProblems(['a.user.js'], { current: at(current), mergeBase: at(mergeBase), tip: at(tip) }, 'tip')

  it('passes a changed script whose version is above the tip\'s', () => {
    assert.deepEqual(check({ current: src('1.0.1', 'x'), mergeBase: src('1.0.0'), tip: src('1.0.0') }), [])
  })

  it('fails a changed script whose version equals the tip\'s', () => {
    assert.deepEqual(check({ current: src('1.0.1', 'x'), mergeBase: src('1.0.0'), tip: src('1.0.1', 'y') }), ["a.user.js changed but @version 1.0.1 is not above tip's 1.0.1"])
  })

  it('compares numerically, so 0.9.0 is below 0.10.0', () => {
    assert.equal(check({ current: src('0.9.0', 'x'), mergeBase: src('0.8.0'), tip: src('0.10.0') }).length, 1)
  })

  it('ignores a script this branch did not change, even when the tip moved ahead', () => {
    assert.deepEqual(check({ current: src('1.0.0'), mergeBase: src('1.0.0'), tip: src('1.0.5') }), [])
  })

  it('ignores a script new on this branch (absent at the merge base)', () => {
    assert.deepEqual(check({ current: src('0.0.1'), mergeBase: null, tip: null }), [])
    assert.deepEqual(check({ current: src('0.0.1'), mergeBase: null, tip: src('0.0.1') }), [])
  })

  it('ignores a script the tip deleted', () => {
    assert.deepEqual(check({ current: src('1.0.1', 'x'), mergeBase: src('1.0.0'), tip: null }), [])
  })

  it('throws on a version that is not X.Y.Z, rather than passing it', () => {
    assert.throws(() => check({ current: src('1.2', 'x'), mergeBase: src('1.0.0'), tip: src('1.0.0') }), /"1.2" is not X.Y.Z/)
    assert.throws(() => check({ current: src('1.0.1', 'x'), mergeBase: src('1.0.0'), tip: src('1.0.0-beta') }), /"1.0.0-beta" is not X.Y.Z/)
  })
})

function git (...args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  return r.stdout
}

// The file's text at a revision, or null when the revision has no such file; any other git failure throws.
function fileAt (rev, file) {
  return git('ls-tree', rev, '--', file) === '' ? null : git('show', `${rev}:${file}`)
}

describe('this checkout against origin/main', () => {
  it('raises the @version of every *.user.js it changed', (t) => {
    const hasBase = spawnSync('git', ['rev-parse', '--verify', '-q', BASE_REF], { cwd: ROOT }).status === 0
    if (!hasBase) {
      // Only CI must have the ref; a local clone without it has nothing to compare against.
      assert.notEqual(process.env.CI, 'true', `${BASE_REF} is not fetched; ci.yml must fetch it`)
      return t.skip(`${BASE_REF} is not fetched`)
    }
    const mergeBase = git('merge-base', BASE_REF, 'HEAD').trim()
    const files = git('ls-files', '*.user.js').split('\n').filter(Boolean)
    assert.notEqual(files.length, 0, 'git ls-files found no *.user.js')
    const current = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
    assert.deepEqual(versionProblems(files, { current, mergeBase: (file) => fileAt(mergeBase, file), tip: (file) => fileAt(BASE_REF, file) }, BASE_REF), [])
  })
})
