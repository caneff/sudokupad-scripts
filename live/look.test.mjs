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
    assert.throws(() => parseArgs(['--scripts', 'nope', '--eval', 's.js'], FILES), /no script "nope".*color-by-digit/)
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

  for (const [why, argv, message] of [
    ['a run that does nothing', [], /nothing to do/],
    ['a selector with no screenshot', ['--selector', '.board', '--eval', 's.js'], /--selector crops a --screenshot/],
    ['an unknown flag', ['--bogus', '--eval', 's.js'], /unknown flag --bogus/],
    ['a flag with no value', ['--eval'], /--eval needs a value/],
    ['a setting with no key', ['--setting', '=9', '--eval', 's.js'], /KEY=VALUE/],
    ['an empty script list', ['--scripts', '', '--eval', 's.js'], /no script ""/],
    ['the pen tool without Pen Tool Extras', ['--scripts', 'text-anywhere', '--tool', 'pen', '--eval', 's.js'], /--tool pen needs pen-tool-extras\.user\.js/]
  ]) {
    it(`refuses ${why}, ending with the usage`, () => {
      assert.throws(() => parseArgs(argv, FILES), (e) => message.test(e.message) && e.message.endsWith(USAGE))
    })
  }

  it('lets the pen tool through when Pen Tool Extras is among the scripts', () => {
    assert.equal(parseArgs(['--tool', 'pen', '--eval', 's.js'], FILES).tool, 'pen')
  })
})
