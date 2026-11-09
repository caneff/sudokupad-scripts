// How well the fuzz catches bugs (#678): `npm run fuzz:plants` injects each planted bug of `plants.mjs` in place of the real script, fuzzes it on both puzzles for a
// fixed budget, and prints which were caught, how fast and the shrunk steps. The shipped `*.user.js` are only read. Not in `npm test`: it runs for minutes per plant.
//   npm run fuzz:plants -- [--minutes <m per plant, split over the two puzzles>] [--shrink-minutes <m>] [--seed <n>] [--plant <id> ...]
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { fuzz, PUZZLES } from './fuzz.mjs'
import { isCatch, plantTable } from './plant-table.mjs'
import { applyPlant, PLANTS, plantById } from './plants.mjs'

const DEFAULT_MINUTES = 4
const DEFAULT_SHRINK_MINUTES = 2

const { values } = parseArgs({ options: { minutes: { type: 'string' }, 'shrink-minutes': { type: 'string' }, seed: { type: 'string' }, plant: { type: 'string', multiple: true } } })
const number = (name, fallback) => {
  if (values[name] == null) return fallback
  const n = Number(values[name])
  if (Number.isNaN(n) || n <= 0) throw new Error(`--${name} needs a positive number, got "${values[name]}"`)
  return n
}
const minutes = number('minutes', DEFAULT_MINUTES)
const shrinkMinutes = number('shrink-minutes', DEFAULT_SHRINK_MINUTES)
const base = number('seed', Math.floor(Math.random() * 2 ** 30))
const plants = values.plant ? values.plant.map(plantById) : PLANTS

// A plant whose find text no longer matches stops the run before any page opens.
for (const plant of plants) applyPlant(plant, readFileSync(new URL(`../../${plant.file}`, import.meta.url), 'utf8'))

// The seed picks the puzzle by its parity (`puzzleFor`), so these two seeds are the same list stream on each puzzle.
const seeds = PUZZLES.map((_, i) => base * PUZZLES.length + i)
console.log(`planting ${plants.length} bugs, ${minutes} min each over ${PUZZLES.length} puzzles (seed ${base}), shrinks up to ${shrinkMinutes} min`)

const outcomes = []
const browser = await chromium.launch()
try {
  for (const plant of plants) {
    const outcome = { plant, caught: false, other: false, seconds: 0, runs: 0 }
    for (const seed of seeds) {
      const result = await fuzz({ browser, seed, minutes: minutes / PUZZLES.length, shrinkMinutes, plant })
      outcome.runs += result.runs
      outcome.seconds += Math.round(result.huntMs / 1000)
      outcome.puzzle = result.puzzle
      if (!result.failed) continue
      outcome.error = result.error
      outcome.sequence = result.sequence
      outcome.replayCommand = result.replayCommand
      if (isCatch(plant, result.error)) {
        outcome.caught = true
        outcome.other = false
        break
      }
      outcome.other = true
    }
    outcomes.push(outcome)
    console.log(`${plant.id}: ${outcome.caught ? `caught on the ${outcome.puzzle} puzzle` : outcome.other ? 'only a failure that is not the plant\'s' : 'missed'}`)
  }
} finally {
  await browser.close()
}
console.log(`\n${plantTable(outcomes)}`)
