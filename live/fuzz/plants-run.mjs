// How well the fuzz catches bugs (#678, #727): `npm run fuzz:plants` injects each planted bug of `plants.mjs` in place of the real script and fuzzes it over the whole puzzle set,
// on K seeds with a short budget each, and prints per plant the fraction of seeds that caught it and the median time to catch, with a total. Two or more configurations
// (`configs.mjs`) run on the same seeds and print side by side. Each catch is replayed from its own path and the ones that fail to repeat are counted. The shipped
// `*.user.js` are only read. Not in `npm test`: it runs for (plants x seeds x configurations x budget).
//   npm run fuzz:plants -- [--seeds <k>] [--budget <seconds per hunt>] [--seed <first seed>] [--shrink-minutes <m>] [--plant <id> ...] [--config <name> ...] [--no-replay-check]
// `--config` twice or more compares them (the first is the baseline); with none the run is the default configuration. The seeds are `--seed` and the K-1 after it, the same for every plant and configuration.
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { configNames, DEFAULT_CONFIG } from './configs.mjs'
import { fuzz } from './fuzz.mjs'
import { FUZZ_PUZZLES } from './puzzle-set.mjs'
import { numberOption } from './cli-number.mjs'
import { applyPlant, PLANTS, plantById } from './plants.mjs'
import { compareTable } from './plants-stats.mjs'
import { seedList, sweep } from './plants-sweep.mjs'

const DEFAULT_SEEDS = 5
const DEFAULT_BUDGET_SECONDS = 60
// A catch is shrunk only for the replay check, which needs a path, not a short list.
const DEFAULT_SHRINK_MINUTES = 0.5

const { values } = parseArgs({ options: { seeds: { type: 'string' }, budget: { type: 'string' }, seed: { type: 'string' }, 'shrink-minutes': { type: 'string' }, plant: { type: 'string', multiple: true }, config: { type: 'string', multiple: true }, 'no-replay-check': { type: 'boolean' } } })
const number = (name, fallback, options) => numberOption(values, name, fallback, options)
const count = number('seeds', DEFAULT_SEEDS, { positive: true, integer: true })
const budget = number('budget', DEFAULT_BUDGET_SECONDS, { positive: true })
const shrinkMinutes = number('shrink-minutes', DEFAULT_SHRINK_MINUTES, { positive: true })
const base = number('seed', Math.floor(Math.random() * 2 ** 30), { integer: true })
const seeds = seedList({ base, count })
const plants = values.plant ? values.plant.map(plantById) : PLANTS
// A name that is no configuration or is named twice, and a plant whose find text no longer matches, stop the run before the browser starts.
const configs = configNames(values.config ?? [DEFAULT_CONFIG])
for (const plant of plants) applyPlant(plant, readFileSync(new URL(`../../${plant.file}`, import.meta.url), 'utf8'))

console.log(`planting ${plants.length} bugs on ${seeds.length} seeds (${seeds.join(', ')}) under ${configs.join(', ')}: ${budget} s per hunt over ${FUZZ_PUZZLES.length} puzzles, at most ${plants.length * seeds.length * configs.length * budget / 60} min of hunting`)

const kinds = Object.fromEntries(plants.map((p) => [p.id, p.kind]))
let runs = {}
const browser = await chromium.launch()
try {
  runs = await sweep({
    fuzz: (options) => fuzz({ browser, ...options }),
    plants,
    configs,
    seeds,
    budgetSeconds: budget,
    shrinkMinutes,
    checkReplay: !values['no-replay-check'],
    // One line per run, in the order they finish, so a status check or a killed run still has what was found.
    // A failure that is not the plant's is a bug of the shipped scripts, so its error and replay command print in full.
    onRun: (r) => console.log(`${r.plant} ${r.config} seed ${r.seed}: ${r.caught ? `caught in ${r.seconds} s${r.replayed === undefined ? '' : r.replayed ? ', replays' : ', DID NOT REPLAY'}` : r.other ? `a failure that is not the plant's after ${r.seconds} s: ${r.error}` : 'missed'}${r.replayCommand ? `\n  replay: ${r.replayCommand}` : ''}`)
  })
} finally {
  await browser.close()
}
console.log(`\n${compareTable(runs, { kinds, budget })}`)
