'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { headerVersion } = require('./header-version.js')

const ROOT = path.join(__dirname, '..')

// Positive when `a` is a higher X.Y.Z than `b`.
function compareVersions (a, b) {
  const [pa, pb] = [a, b].map(v => v.split('.').map(Number))
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

// One message per script whose text changed since `mergeBase` but whose @version is not above the one on `tipRev`.
// `show(rev, file)` returns the file's text at a revision, or null when it does not exist there.
function versionProblems (files, mergeBase, tipRev, show) {
  const problems = []
  for (const file of files) {
    const current = show('HEAD', file)
    const onBase = show(mergeBase, file)
    const onTip = show(tipRev, file)
    if (current === null || onBase === null || onTip === null || current === onBase) continue
    const [now, tip] = [headerVersion(current), headerVersion(onTip)]
    if (compareVersions(now, tip) <= 0) problems.push(`${file} changed but @version ${now} is not above ${tipRev}'s ${tip}`)
  }
  return problems
}

describe('versionProblems', () => {
  const src = (version, body = '') => `// @version      ${version}\n${body}`
  const fake = (revs) => (rev, file) => (revs[rev] && revs[rev][file] !== undefined ? revs[rev][file] : null)

  it('passes a changed script whose version is above the tip\'s', () => {
    const show = fake({ HEAD: { 'a.user.js': src('1.0.1', 'x') }, base: { 'a.user.js': src('1.0.0') }, tip: { 'a.user.js': src('1.0.0') } })
    assert.deepEqual(versionProblems(['a.user.js'], 'base', 'tip', show), [])
  })

  it('fails a changed script whose version equals the tip\'s', () => {
    const show = fake({ HEAD: { 'a.user.js': src('1.0.1', 'x') }, base: { 'a.user.js': src('1.0.0') }, tip: { 'a.user.js': src('1.0.1', 'y') } })
    assert.deepEqual(versionProblems(['a.user.js'], 'base', 'tip', show), ["a.user.js changed but @version 1.0.1 is not above tip's 1.0.1"])
  })

  it('compares numerically, so 0.9.0 is below 0.10.0', () => {
    const show = fake({ HEAD: { 'a.user.js': src('0.9.0', 'x') }, base: { 'a.user.js': src('0.8.0') }, tip: { 'a.user.js': src('0.10.0') } })
    assert.equal(versionProblems(['a.user.js'], 'base', 'tip', show).length, 1)
  })

  it('ignores a script this branch did not change, even when the tip moved ahead', () => {
    const show = fake({ HEAD: { 'a.user.js': src('1.0.0') }, base: { 'a.user.js': src('1.0.0') }, tip: { 'a.user.js': src('1.0.5') } })
    assert.deepEqual(versionProblems(['a.user.js'], 'base', 'tip', show), [])
  })

  it('ignores a script new on this branch', () => {
    const show = fake({ HEAD: { 'a.user.js': src('0.0.1') }, base: {}, tip: {} })
    assert.deepEqual(versionProblems(['a.user.js'], 'base', 'tip', show), [])
  })
})

const git = (...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })

describe('this checkout against origin/main', () => {
  it('raises the @version of every *.user.js it changed', (t) => {
    if (git('rev-parse', '--verify', '-q', 'origin/main').status !== 0) {
      // Only CI must have the ref; a local clone without it has nothing to compare against.
      assert.notEqual(process.env.CI, 'true', 'origin/main is not fetched; ci.yml must fetch it')
      return t.skip('origin/main is not fetched')
    }
    const base = git('merge-base', 'origin/main', 'HEAD')
    assert.equal(base.status, 0, `git merge-base failed: ${base.stderr}`)
    const files = git('ls-files', '*.user.js').stdout.split('\n').filter(Boolean)
    const show = (rev, file) => {
      const r = git('show', `${rev}:${file}`)
      return r.status === 0 ? r.stdout : null
    }
    const mergeBase = base.stdout.trim()
    assert.deepEqual(versionProblems(files, mergeBase, 'origin/main', (rev, file) => rev === 'HEAD' ? fs.readFileSync(path.join(ROOT, file), 'utf8') : show(rev, file)), [])
  })
})
