// The table `npm run fuzz:plants` prints (#678): one row per planted bug, and under it the shrunk steps of a catch. Pure, so `plants.test.mjs` tests it. Not a check itself.

// Whether a failure message is the one the plant is meant to cause (`expect` of `plants.mjs`).
export const isCatch = (plant, error) => plant.expect.test(error)

// `outcomes` is `[{ plant, caught, puzzle, seconds, runs, error, sequence, other }]`: `caught` is a failure that matches the plant, `other` a failure that does not (a bug the real scripts have).
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
  const steps = outcomes.filter((o) => o.caught).flatMap(({ plant, sequence, error }) => [
    '',
    `${plant.id}: shrunk to ${sequence.length} ${sequence.length === 1 ? 'step' : 'steps'}`,
    ...sequence.map((s, i) => `  ${i + 1}. ${s}`),
    `  ${error.split('\n')[0].slice(0, 200)}`
  ])
  const others = outcomes.filter((o) => o.other).flatMap(({ plant, error }) => ['', `${plant.id}: a failure that is not the plant's: ${error.split('\n')[0].slice(0, 200)}`])
  const caught = outcomes.filter((o) => o.caught).length
  return [...lines, ...steps, ...others, '', `${caught} of ${outcomes.length} planted bugs caught`].join('\n')
}
