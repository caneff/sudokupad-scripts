// `--focus` changes the weights and `--config` the shape of a list, so a path replays only under them.
import { scriptName } from './actions.mjs'
import { DEFAULT_CONFIG } from './configs.mjs'

export function replayCommand ({ seed, path, planted = false, plant, focus = [], config = DEFAULT_CONFIG }) {
  const args = ['--seed', seed, '--path', path, ...(planted ? ['--plant-escape-error'] : []), ...(plant ? ['--plant', plant.id] : []), ...focus.flatMap((file) => ['--focus', scriptName(file)]), ...(config === DEFAULT_CONFIG ? [] : ['--config', config])]
  return `npm run test:fuzz -- ${args.join(' ')}`
}
