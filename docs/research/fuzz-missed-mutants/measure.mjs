// The measurement of #927: why do missed save deletions and boundary flips go uncaught? Research scratch, not a check: run from the repo root, not in `npm test`, not linted.
//   node docs/research/fuzz-missed-mutants/measure.mjs select [--per-group 10] [--sample-seed 927] [--coverage-runs 40] [--config busy-start]   writes sample.json
//   node docs/research/fuzz-missed-mutants/measure.mjs direct   writes sample-direct.json: the reached deletions of a bare `x.setData(...)` statement that sample.json did not draw (the first filter also took statements that only hold a setData)
//   node docs/research/fuzz-missed-mutants/measure.mjs run [--sample sample-direct.json] --budget <seconds> --out <file.jsonl> [--shard i/n] [--seeds 3] [--seed 1000] [--config busy-start] [--only <id> ...]
// `select` fuzzes the shipped scripts for coverage as `mutants-run.mjs` does, then draws, from the mutants in code that hunt ran, every `setData` statement deletion and every `<` `<=` `>` `>=` flip,
// `--per-group` of each, seeded. `run` fuzzes each sampled mutant on each seed for the budget and writes one JSON line per hunt: the verdict, and how many action lists ran the mutated code and how many of
// those had a page load (a reload) after the page that ran it, read from V8 coverage per page load (`createCoverage` of `live/fuzz/coverage.mjs` fed one page at a time).
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { SCRIPT_FILES, scriptSource } from '../../../live/session.mjs'
import { configOptions, DEFAULT_CONFIG } from '../../../live/fuzz/configs.mjs'
import { createCoverage } from '../../../live/fuzz/coverage.mjs'
import { fuzz } from '../../../live/fuzz/fuzz.mjs'
import { mutantById, mutantPlant, mutantReached, mutantsOf, seededRandom } from '../../../live/fuzz/mutants.mjs'

const [command, ...rest] = process.argv.slice(2)
const { values } = parseArgs({ args: rest, options: { 'per-group': { type: 'string' }, 'sample-seed': { type: 'string' }, 'coverage-runs': { type: 'string' }, config: { type: 'string' }, sample: { type: 'string' }, budget: { type: 'string' }, out: { type: 'string' }, shard: { type: 'string' }, seeds: { type: 'string' }, seed: { type: 'string' }, only: { type: 'string', multiple: true } } })
const SAMPLE = new URL(values.sample ?? './sample.json', import.meta.url)
const config = values.config ?? DEFAULT_CONFIG
configOptions(config)

const GROUPS = {
  'save-deletion': (m) => m.family === 'deletion' && /\.setData\(/.test(m.original),
  'boundary-flip': (m) => m.family === 'relational' && ['<', '<=', '>', '>='].includes(m.original)
}

function shuffled (list, seed) {
  const random = seededRandom(seed)
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

const browser = await chromium.launch()
try {
  if (command === 'select') await select()
  else if (command === 'run') await run()
  else if (command === 'direct') await direct()
  else throw new Error('usage: measure.mjs select|run')
} finally {
  await browser.close()
}

async function direct () {
  const { sample: first, coverageRuns, config: cfg } = JSON.parse(readFileSync(new URL('./sample.json', import.meta.url), 'utf8'))
  const baseline = createCoverage(SCRIPT_FILES)
  await fuzz({ browser, seed: 723, runs: coverageRuns, shrinkMinutes: 0.1, config: cfg, coverage: baseline })
  const all = SCRIPT_FILES.flatMap((file) => mutantsOf(file, scriptSource(file))).filter((m) => m.family === 'deletion' && /^[\w$.]+\.setData\(/.test(m.original))
  const reached = all.filter((m) => mutantReached(baseline, m))
  const extra = reached.filter((m) => !first.some((f) => f.id === m.id))
  writeFileSync(new URL('./sample-direct.json', import.meta.url), `${JSON.stringify({ direct: { candidates: all.length, reached: reached.length, alreadySampled: reached.length - extra.length }, sample: extra.map((m) => ({ group: 'save-deletion', id: m.id, file: m.file, line: m.line, description: m.description })) }, null, 2)}\n`)
  console.log(`${all.length} direct setData deletions, ${reached.length} reached, ${extra.length} not in sample.json`)
}

async function select () {
  const perGroup = Number(values['per-group'] ?? 10)
  const sampleSeed = Number(values['sample-seed'] ?? 927)
  const coverageRuns = Number(values['coverage-runs'] ?? 40)
  const baseline = createCoverage(SCRIPT_FILES)
  const first = await fuzz({ browser, seed: 723, runs: coverageRuns, shrinkMinutes: 0.1, config, coverage: baseline })
  if (first.failed) console.log(`the shipped scripts failed the coverage hunt (${first.error}); its coverage still counts`)
  const counts = {}
  const sample = []
  for (const [group, pick] of Object.entries(GROUPS)) {
    const all = SCRIPT_FILES.flatMap((file) => mutantsOf(file, scriptSource(file))).filter(pick)
    const reached = all.filter((m) => mutantReached(baseline, m))
    counts[group] = { candidates: all.length, reached: reached.length }
    for (const m of shuffled(reached, sampleSeed).slice(0, perGroup)) sample.push({ group, id: m.id, file: m.file, line: m.line, description: m.description })
  }
  writeFileSync(SAMPLE, `${JSON.stringify({ counts, coverageRuns, config, sampleSeed, sample }, null, 2)}\n`)
  console.log(JSON.stringify(counts), `${sample.length} sampled`)
}

// The browser handed to `fuzz`, counting the contexts opened: one context is one action list.
function countingBrowser (state) {
  return new Proxy(browser, {
    get (target, key) {
      if (key === 'newContext') return (...args) => { state.list++; return target.newContext(...args) }
      const value = target[key]
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}

// A coverage that keeps, per page load, only whether the mutant's code ran on it, with the list the page belonged to.
function segmentCoverage (mutant, state, segments) {
  return {
    add (entries) {
      const one = createCoverage(SCRIPT_FILES)
      one.add(entries)
      segments.push({ list: state.list, ran: mutantReached(one, mutant) === true })
    },
    ranAt: () => null,
    neverRun: () => ({})
  }
}

function readOf (segments, listsLimit) {
  const lists = new Map()
  for (const s of segments.filter((x) => x.list <= listsLimit)) lists.set(s.list, [...(lists.get(s.list) ?? []), s.ran])
  let reaching = 0
  let reloadAfter = 0
  let withReload = 0
  for (const ran of lists.values()) {
    if (ran.length > 1) withReload++
    if (ran.some(Boolean)) reaching++
    if (ran.slice(0, -1).some(Boolean)) reloadAfter++
  }
  return { lists: lists.size, listsWithReload: withReload, listsReaching: reaching, listsReachingThenReload: reloadAfter }
}

async function run () {
  const budget = Number(values.budget)
  const seedsCount = Number(values.seeds ?? 3)
  const base = Number(values.seed ?? 1000)
  const [index, total] = (values.shard ?? '0/1').split('/').map(Number)
  const { sample } = JSON.parse(readFileSync(SAMPLE, 'utf8'))
  const mine = sample.filter((s, i) => i % total === index && (!values.only || values.only.includes(s.id)))
  for (const item of mine) {
    const mutant = mutantById(item.id)
    for (let seed = base; seed < base + seedsCount; seed++) {
      const state = { list: 0 }
      const segments = []
      const result = await fuzz({ browser: countingBrowser(state), seed, minutes: budget / 60, shrinkMinutes: 0.1, plant: mutantPlant(mutant), config, coverage: segmentCoverage(mutant, state, segments) })
      const line = { id: item.id, group: item.group, line: item.line, budget, seed, caught: result.failed, seconds: result.failed ? Math.round(result.huntMs / 100) / 10 : budget, error: result.failed ? String(result.error).slice(0, 300) : undefined, ...readOf(segments, result.failed ? result.runs : Infinity) }
      console.log(JSON.stringify(line))
      if (values.out) appendFileSync(values.out, `${JSON.stringify(line)}\n`)
    }
  }
}
