// `fileIssue` and `issueTrailer` (live/issues.mjs) against a fake gh, so nothing is filed.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fileIssue, issueTrailer } from './issues.mjs'

describe('fileIssue', () => {
  it('passes the title and the body on stdin to gh issue create', async () => {
    let seen
    await fileIssue({ title: 'T', body: 'B' }, async (cmd, args, opts) => { seen = { cmd, args, opts }; return { ok: true } })
    assert.equal(seen.cmd, 'gh')
    assert.deepEqual(seen.args.slice(0, 2), ['issue', 'create'])
    assert.equal(seen.args[seen.args.indexOf('--title') + 1], 'T')
    assert.equal(seen.opts.input, 'B')
  })

  it('files the issue as bug and needs-info, so triage diagnoses it before an agent builds it (#805)', async () => {
    let seen
    await fileIssue({ title: 'T', body: 'B' }, async (cmd, args) => { seen = args; return { ok: true } })
    assert.equal(seen[seen.indexOf('--label') + 1], 'bug,needs-info')
  })

  it('throws when gh fails, so the night is red rather than silently unreported', async () => {
    await assert.rejects(fileIssue({ title: 'T', body: 'B' }, async () => ({ ok: false })), /gh issue create failed/)
  })
})

describe('issueTrailer', () => {
  it('names the command and its file, then ends with the Blocked by section', () => {
    assert.equal(issueTrailer('npm run x', 'live/x.mjs'), 'Filed by `npm run x` (`live/x.mjs`).\n\n## Blocked by\n\n- None — can start immediately.')
  })
})

describe('fileIssue once', () => {
  it('files nothing when an open issue already has the title', async () => {
    const seen = []
    await fileIssue({ title: 'T', body: 'B', once: true }, async (cmd, args) => { seen.push(args.slice(0, 2).join(' ')); return { ok: true, output: '4\tother\n7\tT\n' } })
    assert.deepEqual(seen, ['issue list'])
  })

  it('files it when no open issue has the title', async () => {
    const seen = []
    await fileIssue({ title: 'T', body: 'B', once: true }, async (cmd, args) => { seen.push(args.slice(0, 2).join(' ')); return { ok: true, output: '4\tother\n' } })
    assert.deepEqual(seen, ['issue list', 'issue create'])
  })

  it('throws when the list fails, rather than filing a possible duplicate blind', async () => {
    await assert.rejects(fileIssue({ title: 'T', body: 'B', once: true }, async () => ({ ok: false, output: '' })), /gh issue list failed/)
  })
})
