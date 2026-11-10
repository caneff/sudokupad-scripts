// Writes a slide's animated WebP from its before and after pictures, through slide-animation.py (python3 with Pillow).
import { spawnSync } from 'node:child_process'

const SCRIPT = new URL('./slide-animation.py', import.meta.url).pathname

export const writeAnimation = (before, after, target) => {
  const result = spawnSync('python3', ['-I', SCRIPT, before, after, target], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`animating ${target} failed: ${result.error ?? result.stderr}`)
  console.log(`wrote ${target}`)
}
