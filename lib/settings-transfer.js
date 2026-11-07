/* eslint-disable no-unused-vars */
// A reader returns the value to save, or undefined for one it refuses. Keys of other scripts are ignored, not counted: only a value of the script's own that its reader refuses is skipped. `upgrade` rewrites the parsed object first, for text copied by an older version.
function pastedSettings (text, readers, upgrade = (data) => data) {
  let data
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new Error('the clipboard text is not JSON', { cause: error })
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('the clipboard text is not a settings object')
  data = upgrade(data)
  const values = {}
  let skipped = 0
  for (const [key, read] of Object.entries(readers)) {
    if (!Object.hasOwn(data, key)) continue
    const value = read(data[key])
    if (value === undefined) skipped++
    else values[key] = value
  }
  return { values, skipped }
}

function pasteReport (applied, skipped) {
  if (applied === 0 && skipped === 0) return 'Nothing to paste: the text holds none of this script\'s settings.'
  return `Pasted ${applied} setting${applied === 1 ? '' : 's'}${skipped ? `; skipped ${skipped} that did not check out` : ''}.`
}

// Wires the title row's Copy settings and Paste settings icons: `copied()` is the text to copy, `apply(values)` takes what a paste kept; `readers` and `upgrade` are `pastedSettings`'.
function wireCopyPaste (root, { copied, readers, upgrade }, apply) {
  const say = (message) => { root.querySelector('[data-role="settings-status"]').textContent = message }
  root.addEventListener('click', async (event) => {
    const act = event.target.closest('button[data-act]')?.dataset.act
    if (act !== 'copy-settings' && act !== 'paste-settings') return
    event.preventDefault()
    event.stopPropagation()
    try {
      if (act === 'copy-settings') {
        await navigator.clipboard.writeText(copied())
        say('Settings copied.')
      } else {
        const { values, skipped } = pastedSettings(await navigator.clipboard.readText(), readers, upgrade)
        if (Object.keys(values).length > 0) apply(values)
        say(pasteReport(Object.keys(values).length, skipped))
      }
    } catch (error) {
      say(`Could not ${act === 'copy-settings' ? 'copy' : 'paste'}: ${error.message}`)
    }
  })
}
