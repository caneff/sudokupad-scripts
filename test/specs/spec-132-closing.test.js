'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const ROOT = join(__dirname, '..', '..')

const read = (file) => readFileSync(join(ROOT, file), 'utf8')

// Spec 132's acceptance as one pass over the docs it changed, at `npm test`. This seam reads the words only: it is
// blind to whether a `gh` command in them still runs, and to real SudokuPad, whose recording `live/README.md` describes.
test('the agent docs hold spec 132 together', () => {
  const agents = read('AGENTS.md')
  const intro = agents.slice(0, agents.indexOf('## Agent skills'))
  for (const start of ['- **Pages**', '- **Netlify**', '- **`docs/research/`**', '- **`GLOSSARY.md`**']) assert.ok(intro.includes(start), start)
  assert.ok(agents.includes('`live/**/*.test.mjs`'))
  assert.equal(agents.split('read `live/README.md`').length - 1, 1)
  assert.match(agents, /`npm run lint`[^]*Run it before you hand off a change/)
  for (const moved of ['LIVE_OFFLINE', 'LIVE_REFRESH', 'DOMContentLoaded']) assert.ok(!agents.includes(moved), moved)

  const live = read('live/README.md')
  for (const passage of ['DOMContentLoaded', 'live/cache.mjs', 'LIVE_REFRESH=1', 'LIVE_OFFLINE=1', 're-recorded only when the version changed', 'With no recording, a run records one']) {
    assert.ok(live.includes(passage), passage)
  }

  const tracker = read('docs/agents/issue-tracker.md')
  assert.ok(tracker.includes('gh issue view <number> --json title,body,labels,comments'))
  assert.ok(!/gh issue view <number> --comments/.test(tracker))
  assert.ok(tracker.includes('select(.state == "OPEN")'))
  assert.equal(tracker.split('--remove-parent').length - 1, 1)
  assert.ok(tracker.includes('gh issue edit <child> --add-blocked-by <blocker>'))
  assert.ok(!tracker.includes('dependencies/blocked_by'))

  const domain = read('docs/agents/domain.md')
  assert.ok(!domain.includes('GLOSSARY-MAP') && !domain.includes('src/'))
  for (const path of ['GLOSSARY.md', 'docs/adr/0001-live-tests-type-storage-keys.md']) {
    assert.ok(domain.includes(path.split('/').pop()), path)
    assert.ok(existsSync(join(ROOT, path)), path)
  }

  assert.match(read('CODING_STANDARDS.md'), /13\. \*\*A diff that changes what a `\*\.user\.js` does raises its `@version`/)
})
