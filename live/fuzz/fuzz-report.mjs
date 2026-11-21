// The fuzz run's report: the lines a run prints for its verdict, and the verdict read back from them. The format is written here and parsed here, so a
// reword cannot break a reader without `fuzz-report.test.mjs` (a round trip) failing.

// The lines of a verdict, from `fuzz()`'s result and the seconds the run took.
export function formatFuzzReport (r, seconds) {
  if (!r.failed) {
    return [
      `fuzz passed: ${r.runs} action lists over ${Object.keys(r.puzzleRuns).length} puzzles in ${seconds} s (seed ${r.seed})`,
      `lists per puzzle: ${Object.entries(r.puzzleRuns).map(([name, count]) => `${name} ${count}`).join(', ')}`
    ]
  }
  return [
    `fuzz FAILED on the ${r.puzzle} puzzle (seed ${r.seed}) after ${seconds} s`,
    `error: ${r.error}`,
    `shrunk to ${r.sequence.length} ${r.sequence.length === 1 ? 'step' : 'steps'}:`,
    ...r.sequence.map((step, i) => `  ${i + 1}. ${step}`),
    `replay: ${r.replayCommand}`,
    ...(r.errorLog.length ? ['shared error log, newest first:', ...r.errorLog.map((line) => `  ${line}`)] : ['shared error log: empty'])
  ]
}

// The verdict in a run's output, or null when there is none. A pass that ran no action list (the time limit fired before the first) is no verdict.
export function parseFuzzOutput (output) {
  const passed = /^fuzz passed: (\d+) action lists/m.exec(output)
  if (passed) return Number(passed[1]) > 0 ? { passed: true } : null
  const head = /^fuzz FAILED on the (.+) puzzle \(seed (\d+)\)/m.exec(output)
  const error = /^error: (.*(?:\n(?!shrunk to ).*)*)$/m.exec(output)?.[1]
  const replay = /^replay: (.*)$/m.exec(output)?.[1]
  if (!head || error == null || !replay) return null
  const steps = /^shrunk to \d+ steps?:\n((?: {2}\d+\. .*\n?)*)/m.exec(output)?.[1].trimEnd().split('\n').map((l) => l.replace(/^ {2}\d+\. /, '')) ?? []
  const log = /^shared error log.*\n?((?: {2}.*\n?)*)/m.exec(output)?.[1].trimEnd().split('\n').map((l) => l.trim()).filter(Boolean) ?? []
  return { failed: true, puzzle: head[1], seed: Number(head[2]), error: error.trim(), steps, replay, log }
}
