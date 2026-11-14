import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SCRIPTS, SETTINGS_SCRIPTS } from './scripts.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
// Text Anywhere's frozen handover (AGENTS.md): it still copies the module in, has no live check of its own, and is never edited.
const FROZEN = ['draw-tool.user.js']
const copiesSettingsDialog = (file) => readFileSync(ROOT + file, 'utf8').includes('// <lib:settings-dialog>')
const installable = () => readdirSync(ROOT).filter((file) => file.endsWith('.user.js') && !FROZEN.includes(file))

describe('the live settings-dialog records', () => {
  it('every script that copies in lib:settings-dialog has a record', () => {
    const copying = installable().filter(copiesSettingsDialog)
    assert.deepEqual(copying.filter((file) => !SETTINGS_SCRIPTS.some((record) => record.file === file)), [])
  })

  it('every record names a script that exists and copies the module in', () => {
    assert.deepEqual(SETTINGS_SCRIPTS.map((record) => record.file).filter((file) => !installable().includes(file) || !copiesSettingsDialog(file)), [])
  })

  it('every record has what the dialog checks read: its entry, editor, owned-key pattern and typed-out keys', () => {
    for (const record of SETTINGS_SCRIPTS) {
      assert.equal(typeof record.entry, 'string', record.file)
      assert.match(record.editor, /^#/, record.file)
      assert.equal(record.owns instanceof RegExp, true, record.file)
      assert.equal(record.owns.test(record.key) && record.owns.test(record.badKey), true, `${record.file}: its keys are in what it owns`)
      assert.equal(typeof record.open, 'function', record.file)
    }
  })

  it('each record is the script\'s own: its entry is the script\'s name', () => {
    const names = Object.fromEntries(SCRIPTS.map((script) => [script.file, script.name]))
    assert.deepEqual(SETTINGS_SCRIPTS.filter((record) => record.entry !== names[record.file]).map((record) => record.file), [])
  })

  it('UI Tweaks has one', () => {
    assert.equal(SETTINGS_SCRIPTS.some((record) => record.file === 'ui-tweaks.user.js'), true)
  })
})
