'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text.
const NAMES = ['pastedSettings', 'pasteReport', 'wireCopyPaste']
const { pastedSettings, pasteReport, wireCopyPaste } =
  new Function(`${fs.readFileSync(path.join(__dirname, 'settings-transfer.js'), 'utf8')}\nreturn { ${NAMES.join(', ')} }`)() // eslint-disable-line no-new-func

const READERS = { A_n: (data) => (Number.isInteger(data) ? data : undefined), A_s: (data) => (typeof data === 'string' ? data : undefined) }

test('pastedSettings: a value its reader keeps is returned, one it refuses is skipped and counted, other keys are ignored', () => {
  assert.deepEqual(pastedSettings(JSON.stringify({ A_n: 3, A_s: 'x', Other_key: 1 }), READERS), { values: { A_n: 3, A_s: 'x' }, skipped: 0 })
  assert.deepEqual(pastedSettings(JSON.stringify({ A_n: 'three', A_s: 'x' }), READERS), { values: { A_s: 'x' }, skipped: 1 })
  assert.deepEqual(pastedSettings('{}', READERS), { values: {}, skipped: 0 })
})

test('pastedSettings: throws on text that is not a JSON object', () => {
  assert.throws(() => pastedSettings('hello', READERS), /not JSON/)
  assert.throws(() => pastedSettings('[1]', READERS), /not a settings object/)
  assert.throws(() => pastedSettings('null', READERS), /not a settings object/)
})

test('pastedSettings: the upgrade step rewrites the parsed object before the readers see it', () => {
  const upgrade = (data) => (Object.hasOwn(data, 'old') ? { A_n: data.old } : data)
  assert.deepEqual(pastedSettings('{"old":7}', READERS, upgrade), { values: { A_n: 7 }, skipped: 0 })
})

test('pasteReport: says how many were pasted and how many skipped, and when the text held nothing', () => {
  assert.equal(pasteReport(2, 0), 'Pasted 2 settings.')
  assert.equal(pasteReport(1, 3), 'Pasted 1 setting; skipped 3 that did not check out.')
  assert.equal(pasteReport(0, 1), 'Pasted 0 settings; skipped 1 that did not check out.')
  assert.equal(pasteReport(0, 0), 'Nothing to paste: the text holds none of this script\'s settings.')
})

// A root that holds the status element and one click listener, as the dialog does.
const fakeRoot = () => {
  const status = { textContent: '' }
  let listener
  return {
    status,
    querySelector: (selector) => (selector === '[data-role="settings-status"]' ? status : null),
    addEventListener: (type, fn) => { if (type === 'click') listener = fn },
    click: async (act) => {
      const event = { target: { closest: () => ({ dataset: { act } }) }, preventDefault () {}, stopPropagation () {} }
      await listener(event)
    }
  }
}

const withClipboard = async (clipboard, run) => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard }, configurable: true })
  try { await run() } finally { if (saved) Object.defineProperty(globalThis, 'navigator', saved); else delete globalThis.navigator }
}

test('wireCopyPaste: Copy writes the copied text to the clipboard and says so', async () => {
  let written
  await withClipboard({ writeText: async (text) => { written = text } }, async () => {
    const root = fakeRoot()
    wireCopyPaste(root, { copied: () => '{"A_n":1}', readers: READERS }, () => assert.fail('copy applies nothing'))
    await root.click('copy-settings')
    assert.equal(written, '{"A_n":1}')
    assert.equal(root.status.textContent, 'Settings copied.')
  })
})

test('wireCopyPaste: Paste applies the values the readers keep and reports the count', async () => {
  let applied
  await withClipboard({ readText: async () => '{"A_n":4,"A_s":9}' }, async () => {
    const root = fakeRoot()
    wireCopyPaste(root, { copied: () => '', readers: READERS }, (values) => { applied = values })
    await root.click('paste-settings')
    assert.deepEqual(applied, { A_n: 4 })
    assert.equal(root.status.textContent, 'Pasted 1 setting; skipped 1 that did not check out.')
  })
})

test('wireCopyPaste: a paste of non-settings text applies nothing and says why', async () => {
  await withClipboard({ readText: async () => 'hello' }, async () => {
    const root = fakeRoot()
    wireCopyPaste(root, { copied: () => '', readers: READERS }, () => assert.fail('nothing to apply'))
    await root.click('paste-settings')
    assert.match(root.status.textContent, /^Could not paste: the clipboard text is not JSON/)
  })
})
