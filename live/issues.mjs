// Shared by the watch (`live/watch.mjs`) and the nightly fuzz (`live/fuzz/nightly.mjs`): files an issue on this repo through gh, or comments on the
// open one with the same title, and builds the trailer every filed issue ends with. `run` is the process runner gh goes through, and the watch's suite run too.
// Not a check, so `live/**/*.live.mjs` skips it.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const REPO = 'caneff/sudokupad-scripts'
const ROOT = fileURLToPath(new URL('..', import.meta.url))

// The end of an issue body a check files: the command and file that filed it, then the Blocked by section that drain and triage read
// (a finding is never blocked by another ticket). One builder, so every filer's issues end alike.
export const issueTrailer = (command, file) => `Filed by \`${command}\` (\`${file}\`).\n\n## Blocked by\n\n- None — can start immediately.`

// `mergeStderr` also captures stderr into the output (a crash before any verdict prints only there); `timeout` kills a child still running after that many ms.
export const run = (command, args, { env = process.env, input, mergeStderr = false, timeout } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: ROOT, env, timeout, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', mergeStderr ? 'pipe' : 'inherit'] })
  let output = ''
  child.stdout.on('data', (d) => { output += d; process.stdout.write(d) })
  child.stderr?.on('data', (d) => { output += d; process.stderr.write(d) })
  child.on('error', reject)
  child.on('close', (code) => resolve({ ok: code === 0, output }))
  if (input !== undefined) child.stdin.end(input)
})

// `comment`, with `once`: the text to comment on the open issue that has the title, instead of doing nothing.
export async function fileIssue ({ title, body, once, comment }, runGh = run) {
  if (once) {
    const list = await runGh('gh', ['issue', 'list', '--repo', REPO, '--state', 'open', '--limit', '200', '--json', 'number,title', '--jq', '.[] | "\\(.number)\t\\(.title)"'])
    if (!list.ok) throw new Error('gh issue list failed')
    const open = list.output.split('\n').map((l) => l.split('\t')).find(([, t]) => t === title)
    if (open) {
      if (!comment) return
      const { ok } = await runGh('gh', ['issue', 'comment', open[0], '--repo', REPO, '--body-file', '-'], { input: comment })
      if (!ok) throw new Error('gh issue comment failed')
      return
    }
  }
  const { ok } = await runGh('gh', ['issue', 'create', '--repo', REPO, '--label', 'bug,needs-info', '--title', title, '--body-file', '-'], { input: body })
  if (!ok) throw new Error('gh issue create failed')
}
