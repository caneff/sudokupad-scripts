import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { CONFIGS, configNames, configOptions } from './configs.mjs'

// A browser path with no browser in it: a command that got as far as starting Chromium fails on that, not on the name it was given.
const NO_BROWSER = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '/nonexistent-playwright-browsers' }
const runCommand = (file, args) => spawnSync(process.execPath, [new URL(file, import.meta.url).pathname, ...args], { encoding: 'utf8', timeout: 20000, env: NO_BROWSER })

describe('the configurations (#725, #726, #727, #728, #730)', () => {
  it('a name that is no configuration is refused, naming the known ones', () => {
    assert.throws(() => configOptions('varied-wiat'), /no configuration "varied-wiat"; known: current, varied-wait/)
  })

  it('the swarm and long-list configurations name the options of the generator', () => {
    assert.deepEqual(CONFIGS.swarm, { swarm: true })
    assert.deepEqual(CONFIGS['long-40'], { maxCommands: 40, nonEmpty: true })
    assert.deepEqual(CONFIGS['long-50'], { maxCommands: 50, nonEmpty: true })
  })

  it('a configuration named twice is refused', () => {
    assert.deepEqual(configNames(['current', 'varied-wait']), ['current', 'varied-wait'])
    assert.throws(() => configNames(['current', 'varied-wait', 'current']), /--config current is named twice/)
  })

  for (const file of ['./run.mjs', './plants-run.mjs']) {
    it(`${file.slice(2)} refuses a name that is no configuration before it starts a browser`, () => {
      const r = runCommand(file, ['--config', 'varied-wiat'])
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /no configuration "varied-wiat"/)
    })
  }
})
