// The named configurations of the fuzz's generator (#725, #726, #727), which `--config` names. Each is the options `runFuzz` passes to `actionList`; a path replays only
// under the configuration it was found with, so a replay command names it. Not a check itself.
import { ACTION_SETTLE_MS } from './engine.mjs'

// The waits after an action a varied-wait list draws from, the fixed wait first (so a shrink that does not need the timing ends there).
export const WAITS = [ACTION_SETTLE_MS, 0, 300]

export const CONFIGS = {
  current: {},
  'varied-wait': { waits: WAITS },
  'busy-start': { busyStart: true },
  'varied-wait+busy-start': { waits: WAITS, busyStart: true }
}

// The configuration of a run that names none.
export const DEFAULT_CONFIG = 'current'

export function configOptions (name) {
  const options = CONFIGS[name]
  if (!options) throw new Error(`no configuration "${name}"; known: ${Object.keys(CONFIGS).join(', ')}`)
  return options
}
