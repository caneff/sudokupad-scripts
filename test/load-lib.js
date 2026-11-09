'use strict'
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so a test evaluates the text. `modules` are lib/ file names without `.js`, in the order the
// scripts copy them (a module reads the names of the ones before it). `names` are the top-level names to hand back. `params` are names the text reads from outside
// (a fake `document`, say); they are the function's parameters.
function loadLib (modules, names, params = {}) {
  const text = modules.map((name) => fs.readFileSync(path.join(__dirname, '..', 'lib', `${name}.js`), 'utf8')).join('\n')
  return new Function(...Object.keys(params), `${text}\nreturn { ${names.join(', ')} }`)(...Object.values(params)) // eslint-disable-line no-new-func
}

module.exports = { loadLib }
