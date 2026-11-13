// Writes a slide's animated WebP from its pictures in order (a before and an after, or the steps of one action), through slide-animation.py (python3 with Pillow).
import { spawnSync } from 'node:child_process'

const SCRIPT = new URL('./slide-animation.py', import.meta.url).pathname

export const writeAnimation = (...pictures) => {
  const target = pictures.at(-1)
  const result = spawnSync('python3', ['-I', SCRIPT, ...pictures], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`animating ${target} failed: ${result.error ?? result.stderr}`)
  console.log(`wrote ${target}`)
}
