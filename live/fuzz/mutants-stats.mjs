// The numbers of the mutant run (#723): per script and operator family, how many sampled mutants the fuzz caught, missed, could not reach or crashed at load, and how long a
// catch took. Pure, so `mutants-stats.test.mjs` tests it. Not a check itself.
//
// A run is `{ caught, seconds, reached? }` as in `plants-stats.mjs`, `reached` whether the mutated code ran in a hunt that caught nothing. An outcome is
// `{ mutant: { file, family }, verdict, runs }`, the verdict being one of `VERDICTS`.
import { layout, medianSeconds } from './plants-stats.mjs'

export const VERDICTS = ['caught', 'missed', 'unreachable', 'load-error']

// Caught when any seed caught it; unreachable when no seed's hunt ran the mutated code (so the miss says nothing about the rules); else missed. A mutant that crashes the page when
// it loads never gets a hunt and is `load-error` (`loadError` true).
export function mutantVerdict (runs, { loadError = false } = {}) {
  if (loadError) return 'load-error'
  if (runs.some((r) => r.caught)) return 'caught'
  return runs.every((r) => r.reached === false) ? 'unreachable' : 'missed'
}

const secondsText = (median, budget) => (median === null ? `> ${budget} s` : `${Math.round(median * 10) / 10} s`)

// The row of `outcomes`: the count of each verdict, and over the mutants that were fuzzed to a verdict (caught or missed) the seeds that caught them and the median time to catch,
// a miss counting as slower than every catch.
function row (label, outcomes, budget) {
  const count = (verdict) => outcomes.filter((o) => o.verdict === verdict).length
  const judged = outcomes.filter((o) => o.verdict === 'caught' || o.verdict === 'missed').flatMap((o) => o.runs)
  const seeds = judged.length === 0 ? '-' : `${judged.filter((r) => r.caught).length}/${judged.length}`
  return [label, String(outcomes.length), ...VERDICTS.map((v) => String(count(v))), seeds, judged.length === 0 ? '-' : secondsText(medianSeconds(judged), budget)]
}

// One table per script, a row per family and a total. `families` is the order of the rows.
export function mutantTables (outcomes, { families, budget }) {
  const files = [...new Set(outcomes.map((o) => o.mutant.file))]
  return files.flatMap((file) => {
    const own = outcomes.filter((o) => o.mutant.file === file)
    const rows = [...families.filter((f) => own.some((o) => o.mutant.family === f)).map((f) => row(f, own.filter((o) => o.mutant.family === f), budget)), row('total', own, budget)]
    return [file, ...layout(['family', 'mutants', ...VERDICTS, 'seeds caught', 'median'], rows), '']
  })
}
