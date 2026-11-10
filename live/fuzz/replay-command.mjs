// The command that replays one failure: the seed, the printed path, and every option that changes the lists or the page the path was found with
// (`--focus` changes the weights, so a path replays only under it).
import { scriptName } from './actions.mjs'

export function replayCommand ({ seed, path, planted = false, plant, focus = [] }) {
  const args = ['--seed', seed, '--path', path, ...(planted ? ['--plant-escape-error'] : []), ...(plant ? ['--plant', plant.id] : []), ...focus.flatMap((file) => ['--focus', scriptName(file)])]
  return `npm run test:fuzz -- ${args.join(' ')}`
}
