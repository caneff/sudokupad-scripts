// The numbers of the planted-bug harness (#727): per plant, how many of its seeded runs caught it and how long the median run took, for one fuzz configuration or
// more side by side. Pure, so `plants-stats.test.mjs` tests it. Not a check itself.
//
// A run is `{ plant, caught, seconds, other?, replayed? }`: `seconds` is the hunt's time (to the catch, or the whole budget when it caught nothing), `other` a failure that is
// not the plant's (counted as a miss), `replayed` whether the catch's own path failed again (absent when nobody checked).

// The median time to catch over `runs`, a miss counting as slower than every catch: null when the middle of the runs is a miss (more than half missed, or half of an even count).
export function medianSeconds (runs) {
  if (runs.length === 0) return null
  const times = runs.map((r) => (r.caught ? r.seconds : Infinity)).sort((a, b) => a - b)
  const middle = times.length >> 1
  const median = times.length % 2 ? times[middle] : (times[middle - 1] + times[middle]) / 2
  return Number.isFinite(median) ? median : null
}

// One row per plant, in the order the plants first appear in `runs`.
export function plantStats (runs) {
  const byPlant = new Map()
  for (const r of runs) byPlant.set(r.plant, [...(byPlant.get(r.plant) ?? []), r])
  return [...byPlant].map(([plant, own]) => ({
    plant,
    caught: own.filter((r) => r.caught).length,
    total: own.length,
    median: medianSeconds(own),
    other: own.filter((r) => r.other).length,
    replayChecked: own.filter((r) => r.replayed !== undefined).length,
    notReplayed: own.filter((r) => r.replayed === false).length
  }))
}

const secondsText = (median, budget) => (median === null ? `> ${budget} s` : `${Math.round(median * 10) / 10} s`)
const cell = ({ caught, total, median }, budget) => `${caught}/${total} ${secondsText(median, budget)}`
const totalOf = (runs) => ({ caught: runs.filter((r) => r.caught).length, total: runs.length, median: medianSeconds(runs) })

function layout (header, rows) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd()
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)]
}

// The notes under a table: failures of the plants' own paths to replay, and failures that were not the plant's.
function notes (runs) {
  const stats = plantStats(runs)
  const checked = stats.reduce((n, s) => n + s.replayChecked, 0)
  const lines = []
  if (checked > 0) lines.push(`${stats.reduce((n, s) => n + s.notReplayed, 0)} of ${checked} catches did not replay from their path`)
  const other = stats.reduce((n, s) => n + s.other, 0)
  if (other > 0) lines.push(`${other} runs ended on a failure that is not the plant's (counted as a miss)`)
  return lines
}

// `byConfig` is `{ <configuration name>: runs }` over the same plants and seeds, one configuration or more. `kinds` maps a plant id to its kind (`rule` or `crash`); `budget`
// is the seconds of one hunt, which a median that is a miss is shown as exceeding.
export function compareTable (byConfig, { kinds, budget }) {
  const names = Object.keys(byConfig)
  const stats = names.map((name) => plantStats(byConfig[name]))
  const plants = [...new Set(names.flatMap((name) => byConfig[name].map((r) => r.plant)))]
  const rows = plants.map((plant) => [plant, kinds[plant] ?? '', ...stats.map((s) => { const own = s.find((x) => x.plant === plant); return own ? cell(own, budget) : '-' })])
  rows.push(['total', '', ...names.map((name) => cell(totalOf(byConfig[name]), budget))])
  return [...layout(['plant', 'kind', ...names], rows), ...names.flatMap((name) => notes(byConfig[name]).map((l) => `${name}: ${l}`))].join('\n')
}
