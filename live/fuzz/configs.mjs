// The named configurations of the fuzz's generator (#725, #726, #727, #728, #730), which `--config` names. Each is the options `runFuzz` passes to `actionList`; a path replays only
// under the configuration it was found with, so a replay command names it. Not a check itself.
import { ACTION_SETTLE_MS } from './engine.mjs'

// The waits after an action a varied-wait list draws from, the fixed wait first (so a shrink that does not need the timing ends there).
export const WAITS = [ACTION_SETTLE_MS, 0, 300]

export const CONFIGS = {
  current: {},
  'varied-wait': { waits: WAITS },
  'busy-start': { busyStart: true },
  'varied-wait+busy-start': { waits: WAITS, busyStart: true },
  swarm: { swarm: true },
  'long-40': { maxCommands: 40, nonEmpty: true },
  'long-50': { maxCommands: 50, nonEmpty: true },
  'busy-start+long-40': { busyStart: true, maxCommands: 40, nonEmpty: true }
}

// The configuration of a run that names none.
export const DEFAULT_CONFIG = 'current'

export function configOptions (name) {
  const options = CONFIGS[name]
  if (!options) throw new Error(`no configuration "${name}"; known: ${Object.keys(CONFIGS).join(', ')}`)
  return options
}

// The configurations a run names, each a known one and named once: a repeat would put its runs twice into one column of the table.
export function configNames (names) {
  names.forEach(configOptions)
  const repeated = names.find((name, i) => names.indexOf(name) !== i)
  if (repeated) throw new Error(`--config ${repeated} is named twice`)
  return names
}
