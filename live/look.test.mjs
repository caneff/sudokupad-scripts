import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs, USAGE } from './look.mjs'

const FILES = ['color-by-digit.user.js', 'pen-tool-extras.user.js', 'text-anywhere.user.js']

describe('parseArgs', () => {
  it('takes every script, no settings and the normal tool by default', () => {
    assert.deepEqual(parseArgs(['--screenshot', 'a.png'], FILES), {
      scripts: FILES, settings: [], eval: undefined, screenshot: 'a.png', selector: undefined, tool: 'normal'
    })
  })

  it('names a script with or without .user.js and keeps the order of the repo, not of the command', () => {
    const { scripts } = parseArgs(['--scripts', 'text-anywhere,pen-tool-extras.user.js', '--eval', 's.js'], FILES)
    assert.deepEqual(scripts, ['pen-tool-extras.user.js', 'text-anywhere.user.js'])
  })

  it('refuses a script it does not know, listing the ones it does', () => {
    assert.throws(() => parseArgs(['--scripts', 'nope', '--eval', 's.js'], FILES), /no script nope.*color-by-digit/)
  })

  it('splits a setting at its first =, so the value may hold one', () => {
    const { settings } = parseArgs(['--setting', 'PenColor_thickness=9', '--setting', 'A_b={"x":"y=z"}', '--eval', 's.js'], FILES)
    assert.deepEqual(settings, [['PenColor_thickness', '9'], ['A_b', '{"x":"y=z"}']])
  })

  it('refuses a setting with no =', () => {
    assert.throws(() => parseArgs(['--setting', 'PenColor_thickness', '--eval', 's.js'], FILES), /KEY=VALUE/)
  })

  it('reads the tool, the snippet file and the crop selector', () => {
    const got = parseArgs(['--tool', 'pen', '--eval', 's.js', '--screenshot', 'a.png', '--selector', '.board'], FILES)
    assert.deepEqual([got.tool, got.eval, got.screenshot, got.selector], ['pen', 's.js', 'a.png', '.board'])
  })

  it('refuses a run that does nothing, a selector with no screenshot and an unknown flag, each with the usage', () => {
    for (const argv of [[], ['--selector', '.board', '--eval', 's.js'], ['--bogus', '--eval', 's.js'], ['--eval']]) {
      assert.throws(() => parseArgs(argv, FILES), (e) => e.message.includes(USAGE), argv.join(' '))
    }
  })
})
