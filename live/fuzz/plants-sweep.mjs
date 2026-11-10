// The loop of `npm run fuzz:plants` (#727): every plant on every seed under every configuration, each hunt for a fixed budget, each catch replayed from its own path.
// `fuzz` is `fuzz.mjs`'s, passed in so the unit test needs no browser. Not a check itself.

// K consecutive seeds from `base`, or the explicit `list`.
export const seedList = ({ base, count, list }) => list ?? Array.from({ length: count }, (_, i) => base + i)

const round1 = (ms) => Math.round(ms / 100) / 10

// Resolves to `{ <configuration>: runs }`, a run being `{ plant, config, seed, caught, other, seconds, path?, replayed? }` (`path` is the catch's replay path) (`plants-stats.mjs`). `onRun` hears each as it finishes.
// A hunt that finds nothing in the budget is a miss costing the whole budget; a failure that is not the plant's ends the hunt and is a miss too (`other`).
export async function sweep ({ fuzz, plants, configs, seeds, budgetSeconds, shrinkMinutes, checkReplay = true, onRun = () => {} }) {
  const byConfig = Object.fromEntries(configs.map((name) => [name, []]))
  for (const plant of plants) {
    for (const seed of seeds) {
      for (const config of configs) {
        const result = await fuzz({ seed, minutes: budgetSeconds / 60, shrinkMinutes, plant, config })
        const caught = result.failed && plant.expect.test(result.error)
        const run = { plant: plant.id, config, seed, caught, other: result.failed && !caught, seconds: result.failed ? round1(result.huntMs) : budgetSeconds, path: caught ? result.path : undefined }
        // The catch's own path, run alone: a failure that depends on timing may not fail again.
        if (caught && checkReplay) {
          const again = await fuzz({ seed, path: result.path, plant, config })
          run.replayed = again.failed && plant.expect.test(again.error)
        }
        byConfig[config].push(run)
        onRun(run)
      }
    }
  }
  return byConfig
}
