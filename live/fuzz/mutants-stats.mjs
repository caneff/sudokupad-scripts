// The verdicts and numbers of the mutant run (#723): per script and operator family, how many sampled mutants the fuzz caught, missed, could not reach or crashed at load, and how long a
// catch took, and the load check that gives a mutant the load-error verdict or finds the harness itself broken. Not a check itself.
//
// A run is `{ caught, seconds, reached? }` as in `plants-stats.mjs`, `reached` whether the mutated code ran in a hunt that caught nothing. An outcome is
// `{ mutant: { file, family }, verdict, runs }`, the verdict being one of `VERDICTS`.
import { layout, medianSeconds, secondsText } from './plants-stats.mjs'
import { crashSignals } from './signals.mjs'

const VERDICTS = ['caught', 'missed', 'unreachable', 'load-error']

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

// `families` is the order of the rows.
export function mutantTables (outcomes, { files, families, budget }) {
  return files.flatMap((file) => {
    const own = outcomes.filter((o) => o.mutant.file === file)
    if (own.length === 0) return [`${file}: no mutants sampled`, '']
    const rows = [...families.filter((f) => own.some((o) => o.mutant.family === f)).map((f) => row(f, own.filter((o) => o.mutant.family === f), budget)), row('total', own, budget)]
    return [file, ...layout(['family', 'mutants', ...VERDICTS, 'seeds caught', 'median'], rows), '']
  })
}

// Why a mutant's page does not load, or null when it does: the first crash signal of its page, or the message of the error that stopped it opening. `openPage(options)`
// opens the page with `openTarget`'s options, here `{ plant }` and then `{}`, so the unmutated control is opened here and not left to the caller. A failure the
// unmutated scripts share (an error opening, or every one of the mutant's crash signals) is the harness's own, so it throws and the table never counts it as a mutant caught at load.
export async function mutantLoadProblem (openPage, plant) {
  let mutated
  try {
    mutated = await openPage({ plant })
  } catch (error) {
    try {
      await (await openPage({})).close()
    } catch (control) {
      throw new Error(`harness failure: the unmutated scripts do not load either (${control.message}); the mutant's own error was: ${error.message}`, { cause: error })
    }
    return error.message
  }
  let signals
  try {
    signals = crashSignals(await mutated.snapshot())
  } finally {
    await mutated.close()
  }
  if (signals.length === 0) return null
  const control = await openPage({})
  let shared
  try {
    shared = new Set(crashSignals(await control.snapshot()))
  } finally {
    await control.close()
  }
  const own = signals.find((s) => !shared.has(s))
  if (own === undefined) throw new Error(`harness failure: the unmutated scripts show the same crash signals on load: ${signals.join('; ')}`)
  return own
}
