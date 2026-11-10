// The named configurations of the fuzz's generator (#725, #726, #727): what `--config` takes on `npm run test:fuzz` and what `npm run fuzz:plants` compares side by side. Each is the
// options `runFuzz` passes to `actionList`; a path replays only under the configuration it was found with, so a replay command names it. Not a check itself.

// The waits after an action a varied-wait list draws from, the fixed wait of before first (so a shrink that does not need the timing ends there).
export const WAITS = [40, 0, 300]

export const CONFIGS = {
  current: {},
  'varied-wait': { waits: WAITS },
  'busy-start': { busyStart: true },
  'varied-wait+busy-start': { waits: WAITS, busyStart: true }
}

// The configuration of a run that names none.
export const DEFAULT_CONFIG = 'current'

export function configOptions (name = DEFAULT_CONFIG) {
  const options = CONFIGS[name]
  if (!options) throw new Error(`no configuration "${name}"; known: ${Object.keys(CONFIGS).join(', ')}`)
  return options
}
