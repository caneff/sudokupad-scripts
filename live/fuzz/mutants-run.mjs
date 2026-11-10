// How well the fuzz catches bugs nobody chose (#723): `npm run fuzz:mutants` fuzzes the scripts once for coverage, samples mutants (`mutants.mjs`) of the code that run reached, and fuzzes each
// mutant in place of its script on K seeds with a short budget, like `fuzz:plants`. A mutant that crashes the page when it loads, or whose changed code no hunt ran, is reported as that and not
// counted as a miss. Prints a table per script (`mutants-stats.mjs`). The shipped `*.user.js` are only read. Not in `npm test`: it runs for (scripts x mutants x seeds x budget).
//   npm run fuzz:mutants -- [--per-script <n>] [--seeds <k>] [--budget <seconds per hunt>] [--seed <first seed>] [--sample-seed <n>] [--coverage-minutes <m>] [--shrink-minutes <m>] [--file <script> ...] [--config <name>]
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { SCRIPT_FILES, scriptSource } from '../session.mjs'
import { numberOption } from './cli-number.mjs'
import { configOptions, DEFAULT_CONFIG } from './configs.mjs'
import { createCoverage, neverRunReport } from './coverage.mjs'
import { fuzz, openTarget } from './fuzz.mjs'
import { FAMILIES, mutantPlant, mutantsOf, sampleMutants } from './mutants.mjs'
import { mutantTables, mutantVerdict } from './mutants-stats.mjs'
import { FUZZ_PUZZLES } from './puzzle-set.mjs'
import { seedList, sweep } from './plants-sweep.mjs'
import { crashSignals } from './signals.mjs'

const DEFAULT_PER_SCRIPT = 30
const DEFAULT_SEEDS = 2
const DEFAULT_BUDGET_SECONDS = 30
const DEFAULT_COVERAGE_MINUTES = 4
const DEFAULT_SAMPLE_SEED = 723
const DEFAULT_SHRINK_MINUTES = 0.1

const { values } = parseArgs({ options: { 'per-script': { type: 'string' }, seeds: { type: 'string' }, budget: { type: 'string' }, seed: { type: 'string' }, 'sample-seed': { type: 'string' }, 'coverage-minutes': { type: 'string' }, 'shrink-minutes': { type: 'string' }, file: { type: 'string', multiple: true }, config: { type: 'string' } } })
const number = (name, fallback, options) => numberOption(values, name, fallback, options)
const perScript = number('per-script', DEFAULT_PER_SCRIPT, { positive: true, integer: true })
const seeds = seedList({ base: number('seed', Math.floor(Math.random() * 2 ** 30), { integer: true }), count: number('seeds', DEFAULT_SEEDS, { positive: true, integer: true }) })
const budget = number('budget', DEFAULT_BUDGET_SECONDS, { positive: true })
const coverageMinutes = number('coverage-minutes', DEFAULT_COVERAGE_MINUTES, { positive: true })
const shrinkMinutes = number('shrink-minutes', DEFAULT_SHRINK_MINUTES, { positive: true })
const sampleSeed = number('sample-seed', DEFAULT_SAMPLE_SEED, { integer: true })
const config = values.config ?? DEFAULT_CONFIG
configOptions(config)
const files = values.file ?? SCRIPT_FILES
for (const file of files) if (!SCRIPT_FILES.includes(file)) throw new Error(`no script ${file}; known: ${SCRIPT_FILES.join(', ')}`)

// The mutated code ran in a hunt that caught nothing, by mutant id and seed.
const reached = new Map()
const browser = await chromium.launch()
try {
  console.log(`coverage hunt: ${coverageMinutes} min on the shipped scripts (config ${config})`)
  const baseline = createCoverage(SCRIPT_FILES)
  const first = await fuzz({ browser, seed: sampleSeed, minutes: coverageMinutes, shrinkMinutes, config, coverage: baseline })
  if (first.failed) console.log(`the shipped scripts failed the coverage hunt (${first.error}); its coverage still counts`)
  neverRunReport(baseline.neverRun()).filter((line) => !line.startsWith('  ')).forEach((line) => console.log(line))

  const outcomes = []
  for (const file of files) {
    const code = scriptSource(file)
    const candidates = mutantsOf(file, code)
    const ran = candidates.filter((m) => baseline.ranAt(file, m.start))
    const sample = sampleMutants(ran, perScript, sampleSeed)
    console.log(`${file}: ${candidates.length} mutants, ${ran.length} in code the coverage hunt ran, ${sample.length} sampled`)
    const loadable = []
    for (const mutant of sample) {
      const problem = await loadProblem(mutant)
      if (problem) {
        console.log(`${mutant.id}: load error: ${problem}`)
        outcomes.push({ mutant, verdict: mutantVerdict([], { loadError: true }), runs: [] })
      } else {
        loadable.push(mutant)
      }
    }
    const byConfig = await sweep({
      fuzz: async (options) => {
        const coverage = createCoverage(SCRIPT_FILES)
        const result = await fuzz({ browser, ...options, coverage })
        if (!result.failed) reached.set(`${options.plant.id}@${options.seed}`, coverage.ranAt(options.plant.file, options.plant.mutant.start))
        return result
      },
      plants: loadable.map(mutantPlant),
      configs: [config],
      seeds,
      budgetSeconds: budget,
      shrinkMinutes,
      checkReplay: false,
      onRun: (r) => console.log(`${r.plant} seed ${r.seed}: ${r.caught ? `caught in ${r.seconds} s` : `not caught${reached.get(`${r.plant}@${r.seed}`) === false ? ', its code never ran' : ''}`}`)
    })
    for (const mutant of loadable) {
      const runs = byConfig[config].filter((r) => r.plant === mutant.id).map((r) => ({ ...r, reached: reached.get(`${r.plant}@${r.seed}`) }))
      outcomes.push({ mutant, verdict: mutantVerdict(runs), runs })
    }
  }
  console.log(`\n${mutantTables(outcomes, { families: FAMILIES, budget }).join('\n')}`)
} finally {
  await browser.close()
}

// Why a mutant does not load: the crash signals of a page opened with it, or the error that kept the page from opening. Null when it loads clean.
async function loadProblem (mutant) {
  let target
  try {
    target = await openTarget(browser, FUZZ_PUZZLES[0], { plant: mutantPlant(mutant) })
    const signals = crashSignals(await target.snapshot())
    return signals.length ? signals[0] : null
  } catch (error) {
    return error.message
  } finally {
    await target?.close()
  }
}
