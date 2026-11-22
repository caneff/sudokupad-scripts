// What the pull-request fuzz workflow (`.github/workflows/fuzz-pr.yml`, #1030) makes of a run, and the comment it leaves when the run is red.
//   node live/fuzz/pr-verdict.mjs <fuzz output file> <comment file> <fuzz step outcome> <head sha> <run url> [<smoke step outcome>]
// Always writes the comment: exits 0 with a short "passed" one for a pass, which the workflow uses only to replace a red comment an earlier push left, and
// exits 1 with the failure for anything else: a failure the fuzz found, and also a run that never reached a verdict (it crashed before fuzzing, or ran zero action lists, which `parseFuzzOutput` reads as no verdict), so neither
// reads as a pass. A pass counts only when the fuzz step itself succeeded too, and when the harness smoke test, if it ran, did not fail.
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseFuzzOutput } from './fuzz-report.mjs'

// The workflow finds its one comment by this first line, and edits it on a later push instead of adding another.
export const COMMENT_MARKER = '<!-- fuzz-pr -->'
// GitHub refuses a comment over 65536 characters; the end of an output is where the failure is. Longer than the nightly's 15 lines (`nightly.mjs`): this comment
// is all a pull request shows of a run that crashed before fuzzing. A fence inside the output would end ours, so it is escaped.
const TAIL_CHARS = 20000

const fence = (text) => '```\n' + text.replace(/```/g, "'''") + '\n```'
const tail = (output) => output.length > TAIL_CHARS ? '... (cut)\n' + output.slice(-TAIL_CHARS) : output

export function prVerdict ({ output, outcome, sha, runUrl, smokeOutcome = '' }) {
  const verdict = output ? parseFuzzOutput(output) : null
  const head = [COMMENT_MARKER, `The pull-request fuzz is red on \`${sha}\`. It is advisory: read it, it does not block the merge. Run: ${runUrl}`, '']
  if (verdict?.passed && outcome === 'success') {
    if (smokeOutcome !== 'failure') return { ok: true, body: `${COMMENT_MARKER}\nThe pull-request fuzz passed on \`${sha}\`. Run: ${runUrl}` }
    return { ok: false, body: [...head, 'The fuzz passed, but the **harness smoke test failed** (`npm run test:fuzz:smoke`): the harness may no longer catch a planted bug. Its output is in the run.'].join('\n') }
  }
  if (verdict?.failed) {
    return {
      ok: false,
      body: [
        ...head,
        `**Seed ${verdict.seed}**, on the ${verdict.puzzle} puzzle.`,
        '',
        '**Failure:**',
        fence(verdict.error),
        '',
        `**Shrunk to ${verdict.steps.length} ${verdict.steps.length === 1 ? 'step' : 'steps'}:**`,
        fence(verdict.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')),
        '',
        '**Replay:**',
        fence(verdict.replay),
        '',
        'A failure may not be this pull request\'s: the fuzz is random, and a bug already on `main` can fail it. Replay it on `main` before blaming the change.'
      ].join('\n')
    }
  }
  return {
    ok: false,
    body: [
      ...head,
      'It reached **no verdict**: it crashed before fuzzing, or ran no action list. Nothing was checked.',
      '',
      '**End of its output:**',
      fence(output ? tail(output.trimEnd()) : '(no output)')
    ].join('\n')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [outputFile, commentFile, outcome, sha, runUrl, smokeOutcome] = process.argv.slice(2)
  let output = null
  try { output = readFileSync(outputFile, 'utf8') } catch (e) { if (e.code !== 'ENOENT') throw e }
  const { ok, body } = prVerdict({ output, outcome, sha, runUrl, smokeOutcome })
  writeFileSync(commentFile, body)
  process.exitCode = ok ? 0 : 1
}
