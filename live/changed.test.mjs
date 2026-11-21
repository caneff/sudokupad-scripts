import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { changedPaths, isAbsent, liveFilesIn, plan, reachOf, referencesOf, selectLiveFiles } from './changed.mjs'

describe('referencesOf', () => {
  it('reads every relative path written as a string: import, require, createRequire and new URL alike', () => {
    const source = [
      "import { a } from './a.mjs'",
      "const { b } = createRequire(import.meta.url)('../../b.user.js')",
      "readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8')",
      'const t = `./not-${x}.mjs`', // eslint-disable-line no-template-curly-in-string
      "const bare = 'node:fs'",
      "scriptSource('dark-page.user.js')"
    ].join('\n')
    assert.deepEqual(referencesOf(source), ['./a.mjs', '../../b.user.js', './puzzle-url.txt', 'dark-page.user.js'])
  })
})

describe('isAbsent', () => {
  it('is true for the errors that mean the file is not there, and false for any other, which must not read as absent', () => {
    for (const code of ['ENOENT', 'ENOTDIR', 'EISDIR']) assert.equal(isAbsent({ code }), true, code)
    for (const code of ['EACCES', 'EMFILE', 'EIO', undefined]) assert.equal(isAbsent({ code }), false, String(code))
  })
})

describe('reachOf', () => {
  const files = {
    'live/a.live.mjs': "import { x } from './lib/x.mjs'\nimport './table.mjs'\nconst s = require('../b.user.js')\nnew URL('./data.txt', import.meta.url)",
    'live/table.mjs': "scriptSource('t.user.js')",
    't.user.js': '',
    'live/lib/x.mjs': "import { y } from '../../deep/y.js'\nscriptSource('c.user.js')",
    'deep/y.js': "import './z.mjs'",
    'deep/z.mjs': '',
    'b.user.js': "import './only-from-the-script.mjs'",
    'c.user.js': '',
    'only-from-the-script.mjs': '',
    'live/data.txt': "import './only-from-the-data.mjs'",
    'live/only-from-the-data.mjs': '',
    'live/loop.live.mjs': "import './loop.live.mjs'"
  }
  const read = (path) => files[path] ?? null
  const reach = reachOf(['live/a.live.mjs', 'live/loop.live.mjs'], read)

  it('follows a reference through every file it reaches, however deep, and a bare script name in a script\'s folder to the repo root, but not one in a table directly under live/', () => {
    assert.deepEqual([...reach.get('live/a.live.mjs')].sort(), ['b.user.js', 'c.user.js', 'deep/y.js', 'deep/z.mjs', 'live/a.live.mjs', 'live/data.txt', 'live/lib/x.mjs', 'live/table.mjs'])
  })

  it('reads no further into a script or a data file, though each names a file that exists, and ends on a loop', () => {
    assert.ok(!reach.get('live/a.live.mjs').has('only-from-the-script.mjs'))
    assert.ok(!reach.get('live/a.live.mjs').has('live/only-from-the-data.mjs'))
    assert.deepEqual([...reach.get('live/loop.live.mjs')], ['live/loop.live.mjs'])
  })

  it('leaves out a reference to a file that is not there', () => {
    assert.ok(!reachOf(['live/q.live.mjs'], (path) => path === 'live/q.live.mjs' ? "import './gone.mjs'" : null).get('live/q.live.mjs').has('live/gone.mjs'))
  })

  it('lets a read error other than not-found out, rather than dropping the reference', () => {
    assert.throws(() => reachOf(['live/q.live.mjs'], () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }) }), /denied/)
  })
})

describe('selectLiveFiles', () => {
  const liveFiles = ['live/startup.live.mjs', 'live/pen-tool-extras/pen.live.mjs', 'live/pen-tool-extras/pen-two.live.mjs', 'live/dark-page/dark.live.mjs', 'live/site-slideshow.live.mjs', 'live/logic-masters-puzzle-preview/lm.live.mjs']
  const reach = new Map(liveFiles.map((f) => [f, new Set(['live/session.mjs'])]))
  reach.get('live/dark-page/dark.live.mjs').add('live/dark-page/dark-fixtures.mjs')
  reach.get('live/startup.live.mjs').add('sync-lib.js')
  const scripts = ['pen-tool-extras.user.js', 'dark-page.user.js']
  const select = (...changed) => selectLiveFiles({ changed, liveFiles, reach, scripts })

  it('selects a changed live file, and nothing for a deleted one', () => {
    assert.deepEqual(select('live/startup.live.mjs'), { files: ['live/startup.live.mjs'], widenedBy: null })
    assert.deepEqual(select('live/gone.live.mjs'), { files: [], widenedBy: null })
  })

  it('selects a changed script\'s own live folder and every top-level live file, which load every script', () => {
    assert.deepEqual(select('pen-tool-extras.user.js').files, ['live/pen-tool-extras/pen-two.live.mjs', 'live/pen-tool-extras/pen.live.mjs', 'live/site-slideshow.live.mjs', 'live/startup.live.mjs'])
  })

  it('selects only the folder of a script that is not a SudokuPad one, and nothing for the frozen handover', () => {
    assert.deepEqual(select('logic-masters-puzzle-preview.user.js'), { files: ['live/logic-masters-puzzle-preview/lm.live.mjs'], widenedBy: null })
    assert.deepEqual(select('draw-tool.user.js'), { files: [], widenedBy: null })
  })

  it('selects the live files whose references reach a changed helper, however deep', () => {
    assert.deepEqual(select('live/dark-page/dark-fixtures.mjs').files, ['live/dark-page/dark.live.mjs'])
    assert.deepEqual(select('live/session.mjs').files, [...liveFiles].sort())
    assert.deepEqual(select('sync-lib.js').files, ['live/startup.live.mjs'])
  })

  it('selects the page checks for a change under site/', () => {
    assert.deepEqual(select('site/index.html'), { files: ['live/site-slideshow.live.mjs'], widenedBy: null })
  })

  it('selects the startup check for a change to the runner, package.json or node-test.js, so one live file runs through it', () => {
    assert.deepEqual(select('package.json'), { files: ['live/startup.live.mjs'], widenedBy: null })
    assert.deepEqual(select('node-test.js').files, ['live/startup.live.mjs'])
  })

  it('places a path no live test reads as touching none: docs, tests, workflows, a helper no live file loads, lib/', () => {
    for (const p of ['docs/a/b.png', 'README.md', 'test/x.test.js', '.github/workflows/ci.yml', 'live/watch.mjs', 'live/fuzz/run.mjs', 'live/changed.test.mjs', 'lib/settings.js', 'lib/settings.test.js', 'sync-slides.js']) {
      assert.deepEqual(select(p), { files: [], widenedBy: null }, p)
    }
  })

  it('widens to every live file for a path it cannot place, and names the path', () => {
    for (const p of ['package-lock.json', '.nvmrc', 'brand-new-dir/x.js', 'surprise.txt']) {
      assert.deepEqual(select('docs/a.md', p), { files: [...liveFiles].sort(), widenedBy: p }, p)
    }
  })

  it('returns the files sorted and each once', () => {
    const { files } = select('live/startup.live.mjs', 'pen-tool-extras.user.js', 'dark-page.user.js')
    assert.deepEqual(files, [...new Set(files)].sort())
  })
})

describe('changedPaths', () => {
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })
  const write = (cwd, file, text) => { mkdirSync(dirname(join(cwd, file)), { recursive: true }); writeFileSync(join(cwd, file), text) }

  it('lists what the branch committed, what is edited and what is new, a rename and a deletion included', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'changed-'))
    try {
      git(cwd, 'init', '-q', '-b', 'main')
      git(cwd, 'config', 'user.email', 't@example.test')
      git(cwd, 'config', 'user.name', 't')
      for (const f of ['keep.txt', 'edit.txt', 'move.txt', 'gone.txt']) write(cwd, f, f)
      git(cwd, 'add', '-A')
      git(cwd, 'commit', '-q', '-m', 'base')
      git(cwd, 'checkout', '-q', '-b', 'work')
      write(cwd, 'committed.txt', 'x')
      git(cwd, 'mv', 'move.txt', 'moved.txt')
      git(cwd, 'rm', '-q', 'gone.txt')
      git(cwd, 'add', '-A')
      git(cwd, 'commit', '-q', '-m', 'work')
      write(cwd, 'edit.txt', 'edited')
      write(cwd, 'untracked.txt', 'u')
      assert.deepEqual(changedPaths('main', cwd), ['committed.txt', 'edit.txt', 'gone.txt', 'move.txt', 'moved.txt', 'untracked.txt'])
    } finally { rmSync(cwd, { recursive: true, force: true }) }
  })

  it('throws for a ref git cannot read, never an empty list', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'changed-'))
    try {
      git(cwd, 'init', '-q', '-b', 'main')
      assert.throws(() => changedPaths('no-such-ref', cwd))
    } finally { rmSync(cwd, { recursive: true, force: true }) }
  })
})

describe('the real tree', () => {
  const pick = (...changed) => plan({ changed })

  it('has live files to select from, found under live/', () => {
    assert.ok(liveFilesIn().length > 20)
    assert.ok(liveFilesIn().every((f) => f.endsWith('.live.mjs')))
  })

  it('maps a script to its folder, the top-level files and startup', () => {
    const { files } = pick('pen-tool-extras.user.js')
    assert.ok(files.includes('live/startup.live.mjs'))
    assert.ok(files.some((f) => f.startsWith('live/pen-tool-extras/')))
    assert.ok(!files.some((f) => f.startsWith('live/dark-page/')))
  })

  it('maps a shared helper to everything that loads it', () => {
    assert.ok(pick('live/session.mjs').files.includes('live/startup.live.mjs'))
    assert.ok(pick('live/board.mjs').files.length > 5)
    assert.ok(pick('live/board.mjs').files.length < liveFilesIn().length)
  })

  it('maps site/ to the slideshow check, and docs to nothing', () => {
    assert.deepEqual(pick('site/index.html').files, ['live/site-slideshow.live.mjs'])
    assert.deepEqual(pick('docs/research/x.md', 'AGENTS.md').files, [])
    assert.equal(pick('docs/research/x.md', 'AGENTS.md').widenedBy, null)
  })

  it('widens on a path it cannot place', () => {
    assert.equal(pick('package-lock.json').files.length, liveFilesIn().length)
    assert.equal(pick('package-lock.json').widenedBy, 'package-lock.json')
  })
})
