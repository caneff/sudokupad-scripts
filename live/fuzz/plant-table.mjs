// The table `npm run fuzz:plants` prints (#678): one row per planted bug, and under it the shrunk steps and replay command of a catch. Pure, so `plants.test.mjs` tests it. Not a check itself.

// A failure message is long (a rule line carries whole snapshots), so the table shows its first line cut to this many characters.
const ERROR_SHOWN_CHARS = 200
const shown = (error) => error.split('\n')[0].slice(0, ERROR_SHOWN_CHARS)

// `outcomes` is `[{ plant, caught, puzzle, seconds, runs, error, sequence, replayCommand, other }]`: `caught` is a failure that matches the plant, `other` a failure that does not (a bug the real scripts have).
export function plantTable (outcomes) {
  const rows = outcomes.map(({ plant, caught, other, puzzle, seconds, runs }) => [
    plant.id,
    plant.kind,
    caught ? 'CAUGHT' : other ? 'other failure' : 'missed',
    caught ? puzzle : '-',
    caught ? `${seconds} s` : `${seconds} s, ${runs} lists`
  ])
  const header = ['plant', 'kind', 'result', 'puzzle', 'time']
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd()
  const lines = [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)]
  const steps = outcomes.filter((o) => o.caught).flatMap(({ plant, sequence, error, replayCommand }) => [
    '',
    `${plant.id}: shrunk to ${sequence.length} ${sequence.length === 1 ? 'step' : 'steps'}`,
    ...sequence.map((s, i) => `  ${i + 1}. ${s}`),
    `  ${shown(error)}`,
    `  replay: ${replayCommand}`
  ])
  const others = outcomes.filter((o) => o.other).flatMap(({ plant, error }) => ['', `${plant.id}: a failure that is not the plant's: ${shown(error)}`])
  const caught = outcomes.filter((o) => o.caught).length
  return [...lines, ...steps, ...others, '', `${caught} of ${outcomes.length} planted bugs caught`].join('\n')
}
