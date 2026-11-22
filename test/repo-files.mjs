// Reads the repo's own files as text, for the tests that pin a rule by reading the tree.
import { readdirSync, readFileSync } from 'node:fs'

export const ROOT = new URL('../', import.meta.url)
export const read = (path) => readFileSync(new URL(path, ROOT), 'utf8')
// Every file under `dir` whose name matches `extension`, as a path from the root.
export const filesUnder = (dir, extension) => readdirSync(new URL(`${dir}/`, ROOT), { recursive: true })
  .filter((name) => extension.test(name) && !name.includes('node_modules')).map((name) => `${dir}/${name}`)
