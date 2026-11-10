import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { replayCommand } from './replay-command.mjs'

describe('the replay command (#724)', () => {
  it('carries the seed and the path, and the focus a path was found under, by short name', () => {
    assert.equal(replayCommand({ seed: 5, path: '3:1@2' }), 'npm run test:fuzz -- --seed 5 --path 3:1@2')
    assert.equal(
      replayCommand({ seed: 5, path: '3:1@2', focus: ['pen-tool-extras.user.js', 'text-anywhere.user.js'] }),
      'npm run test:fuzz -- --seed 5 --path 3:1@2 --focus pen-tool-extras --focus text-anywhere')
  })

  it('still carries the plant options', () => {
    assert.equal(replayCommand({ seed: 1, path: 'p', planted: true, plant: { id: 'x' } }), 'npm run test:fuzz -- --seed 1 --path p --plant-escape-error --plant x')
  })
})

describe('run.mjs --focus (#724)', () => {
  it('refuses a name that is no script before it starts a browser, naming the scripts', () => {
    const r = spawnSync(process.execPath, [new URL('./run.mjs', import.meta.url).pathname, '--focus', 'pen-tool', '--runs', '1'], { encoding: 'utf8', timeout: 20000 })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /--focus pen-tool is no script; the scripts are .*pen-tool-extras/)
  })
})
