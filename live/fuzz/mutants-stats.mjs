// The numbers of the mutant run (#723): per script and operator family, how many sampled mutants the fuzz caught, missed, could not reach or crashed at load, and how long a
// catch took. Pure, so `mutants-stats.test.mjs` tests it. Not a check itself.
//
// A run is `{ caught, seconds, reached? }` as in `plants-stats.mjs`, `reached` whether the mutated code ran in a hunt that caught nothing. An outcome is
// `{ mutant: { file, family }, verdict, runs }`, the verdict being one of `VERDICTS`.
import { layout, medianSeconds, secondsText } from './plants-stats.mjs'

export const VERDICTS = ['caught', 'missed', 'unreachable', 'load-error']

// `unreachable` is what the hunts showed, not a proof: no seed's hunt ran the mutated code, so the miss says nothing about the rules. `loadError`: the page crashed when it loaded, so no hunt ran.
export function mutantVerdict (runs, { loadError = false } = {}) {
  if (loadError) return 'load-error'
  if (runs.some((r) => r.caught)) return 'caught'
  return runs.every((r) => r.reached === false) ? 'unreachable' : 'missed'
}

// The seeds and the median count only the mutants fuzzed to a verdict (caught or missed), the median with a miss slower than every catch.
function row (label, outcomes, budget) {
  const count = (verdict) => outcomes.filter((o) => o.verdict === verdict).length
  const judged = outcomes.filter((o) => o.verdict === 'caught' || o.verdict === 'missed').flatMap((o) => o.runs)
  const seeds = judged.length === 0 ? '-' : `${judged.filter((r) => r.caught).length}/${judged.length}`
  return [label, String(outcomes.length), ...VERDICTS.map((v) => String(count(v))), seeds, judged.length === 0 ? '-' : secondsText(medianSeconds(judged), budget)]
}

// One table per script of `files`, a row per family and a total; a script with no mutant sampled says so. `families` is the order of the rows.
export function mutantTables (outcomes, { files, families, budget }) {
  return files.flatMap((file) => {
    const own = outcomes.filter((o) => o.mutant.file === file)
    if (own.length === 0) return [`${file}: no mutants sampled`, '']
    const rows = [...families.filter((f) => own.some((o) => o.mutant.family === f)).map((f) => row(f, own.filter((o) => o.mutant.family === f), budget)), row('total', own, budget)]
    return [file, ...layout(['family', 'mutants', ...VERDICTS, 'seeds caught', 'median'], rows), '']
  })
}
