'use strict'

// Starts a userscript file in this process with `globals` (document, window, Framework) set, then puts back what was there. A global given
// as undefined is absent while the script runs.
function enter (file, globals) {
  const path = require.resolve(file)
  const cached = require.cache[path]
  const prior = Object.keys(globals).map((name) => [name, name in global, global[name]])
  for (const [name, value] of Object.entries(globals)) {
    if (value === undefined) delete global[name]
    else global[name] = value
  }
  const warnings = []
  const warn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  delete require.cache[path]
  const leave = () => {
    console.warn = warn
    for (const [name, had, value] of prior) {
      if (had) global[name] = value
      else delete global[name]
    }
    delete require.cache[path]
    if (cached) require.cache[path] = cached
  }
  return { path, warnings, leave }
}

// Requires the script once and returns what it warned.
function startScript (file, globals) {
  const { path, warnings, leave } = enter(file, globals)
  try {
    require(path)
  } finally {
    leave()
  }
  return { warnings }
}

// Requires the script, then keeps the globals up while `during` runs, for a script that finishes starting after its first tick.
async function withScript (file, globals, during) {
  const { path, warnings, leave } = enter(file, globals)
  try {
    require(path)
    return await during({ warnings })
  } finally {
    leave()
  }
}

// Deletes a dotted SudokuPad path such as `Framework.app.resize` from a stand-in for SudokuPad's globals, and returns it.
function withoutPath (roots, internal) {
  const [root, ...keys] = internal.split('.')
  const last = keys.pop()
  delete keys.reduce((owner, key) => owner[key], roots[root])[last]
  return roots
}

module.exports = { startScript, withScript, withoutPath }
